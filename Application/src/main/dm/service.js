import {
  buildSafetyNumber,
  createConversationKey,
  decryptFromSenderDevice,
  decryptPayload,
  encryptForRecipientDevice,
  encryptPayload,
  fingerprintPublicKey,
  formatFingerprint,
  generateDeviceIdentity,
  hashPublicKey,
  randomId,
  signDeviceBundle,
  signJsonPayload,
  signMessageEnvelope,
  unwrapConversationKeyForDevice,
  verifyDeviceBundleSignature,
  verifyJsonPayload,
  verifyMessageEnvelopeSignature,
  wrapConversationKeyForRecipient
} from "./crypto";
import { readSecureDmStore, writeSecureDmStore } from "./storage";
import {
  buildOutgoingAttachmentPayload,
  registerIncomingAttachmentPayload
} from "../transfers/service";

const FORBIDDEN_DM_EXPORT_KEYS = new Set([
  "body",
  "plaintext",
  "replyTo",
  "attachments",
  "conversationKey",
  "encryptionPrivateKey",
  "signingPrivateKey",
  "masterKey",
  "wrappedMasterKey",
  "privateKey"
]);
const pendingDeviceRotations = new Map();

function getUserState(store, userId) {
  const key = String(userId);

  if (!store.users[key]) {
    store.users[key] = {
      device: null,
      conversations: {}
    };
  }

  return store.users[key];
}

function ensureDevice(userId, username, deviceName = "Desktop") {
  const store = readSecureDmStore();
  const userState = getUserState(store, userId);
  let didChangeDevice = false;

  if (!userState.device) {
    userState.device = {
      ...generateDeviceIdentity(deviceName),
      userId: Number(userId),
      username,
      keyVersion: 1
    };
    didChangeDevice = true;
  }

  if (!hasUsablePublishedBundle(userState.device)) {
    userState.device = repairLegacyDeviceState(userState.device, userId, username, deviceName);
    didChangeDevice = true;
  }

  if (didChangeDevice) {
    writeSecureDmStore(store);
  }

  return {
    store,
    userState
  };
}

function getConversationOrThrow(userState, conversationId) {
  const conversation = userState.conversations[String(conversationId)];

  if (!conversation) {
    throw new Error(`Unknown DM conversation: ${conversationId}`);
  }

  return conversation;
}

function normalizePlaintextBody(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    return normalizePlaintextBody(value.body);
  }

  return value == null ? "" : String(value);
}

function normalizeReplyTo(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    ...value,
    body: normalizePlaintextBody(value.body)
  };
}

function ensureLegacyConversationKeys(conversation) {
  if (!Array.isArray(conversation.legacyConversationKeys)) {
    conversation.legacyConversationKeys = [];
  }

  return conversation.legacyConversationKeys;
}

function rememberLegacyConversationKey(conversation, conversationKey) {
  const key = String(conversationKey || "");

  if (!key) {
    return;
  }

  const legacyKeys = ensureLegacyConversationKeys(conversation);
  if (!legacyKeys.includes(key) && key !== String(conversation.conversationKey || "")) {
    legacyKeys.unshift(key);
  }
}

function getConversationKeysForRead(conversation) {
  const currentKey = String(conversation?.conversationKey || "");
  const legacyKeys = Array.isArray(conversation?.legacyConversationKeys) ? conversation.legacyConversationKeys : [];

  return [currentKey, ...legacyKeys]
    .map((entry) => String(entry || ""))
    .filter((entry, index, collection) => entry && collection.indexOf(entry) === index);
}

function decryptConversationEnvelope(conversation, envelope) {
  let lastError = null;

  for (const conversationKey of getConversationKeysForRead(conversation)) {
    try {
      return decryptPayload({
        conversationKey,
        ciphertext: envelope.ciphertext,
        nonce: envelope.nonce,
        aad: envelope.aad,
        tag: envelope.tag
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to decrypt DM message with known conversation keys");
}

function ensureConversationTrustState(conversation) {
  if (!conversation.deviceTrust || typeof conversation.deviceTrust !== "object" || Array.isArray(conversation.deviceTrust)) {
    conversation.deviceTrust = {
      verifiedDeviceIds: {}
    };
  }

  if (!conversation.deviceTrust.verifiedDeviceIds || typeof conversation.deviceTrust.verifiedDeviceIds !== "object" || Array.isArray(conversation.deviceTrust.verifiedDeviceIds)) {
    conversation.deviceTrust.verifiedDeviceIds = {};
  }

  return conversation.deviceTrust;
}

function ensureConversationReplayState(conversation) {
  if (!conversation.replayProtection || typeof conversation.replayProtection !== "object" || Array.isArray(conversation.replayProtection)) {
    conversation.replayProtection = {
      seenMessageIds: {},
      seenRemoteMessageIds: {},
      seenEnvelopeSignatures: {}
    };
  }

  if (!conversation.replayProtection.seenMessageIds || typeof conversation.replayProtection.seenMessageIds !== "object" || Array.isArray(conversation.replayProtection.seenMessageIds)) {
    conversation.replayProtection.seenMessageIds = {};
  }

  if (!conversation.replayProtection.seenRemoteMessageIds || typeof conversation.replayProtection.seenRemoteMessageIds !== "object" || Array.isArray(conversation.replayProtection.seenRemoteMessageIds)) {
    conversation.replayProtection.seenRemoteMessageIds = {};
  }

  if (!conversation.replayProtection.seenEnvelopeSignatures || typeof conversation.replayProtection.seenEnvelopeSignatures !== "object" || Array.isArray(conversation.replayProtection.seenEnvelopeSignatures)) {
    conversation.replayProtection.seenEnvelopeSignatures = {};
  }

  return conversation.replayProtection;
}

function recordReplayProofs(conversation, message) {
  const replayState = ensureConversationReplayState(conversation);
  const now = new Date().toISOString();

  if (message?.messageId != null && String(message.messageId)) {
    replayState.seenMessageIds[String(message.messageId)] = message.createdAt || now;
  }

  if (message?.remoteMessageId != null && String(message.remoteMessageId)) {
    replayState.seenRemoteMessageIds[String(message.remoteMessageId)] = message.createdAt || now;
  }

  if (message?.signature != null && String(message.signature)) {
    replayState.seenEnvelopeSignatures[String(message.signature)] = message.createdAt || now;
  }
}

function rebuildReplayProtection(conversation) {
  conversation.replayProtection = {
    seenMessageIds: {},
    seenRemoteMessageIds: {},
    seenEnvelopeSignatures: {}
  };

  (Array.isArray(conversation.messages) ? conversation.messages : []).forEach((message) => {
    recordReplayProofs(conversation, message);
  });

  return conversation.replayProtection;
}

function detectReplay(conversation, relayItem) {
  const replayState = ensureConversationReplayState(conversation);

  if (relayItem?.signature && replayState.seenEnvelopeSignatures[String(relayItem.signature)]) {
    return "signature";
  }

  if (relayItem?.messageId && replayState.seenRemoteMessageIds[String(relayItem.messageId)]) {
    return "remoteMessageId";
  }

  return null;
}

function buildPublishedDeviceBundle(device) {
  const bundle = {
    userId: Number(device.userId),
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    algorithm: device.algorithm,
    signingAlgorithm: device.signingAlgorithm,
    keyVersion: Math.max(1, Number(device.keyVersion) || 1),
    encryptionPublicKey: device.encryptionPublicKey,
    signingPublicKey: device.signingPublicKey
  };

  return {
    ...bundle,
    publicKeyFingerprint: hashPublicKey(device.encryptionPublicKey),
    bundleSignature: signDeviceBundle(bundle, device.signingPrivateKey)
  };
}

function hasUsablePublishedBundle(device) {
  try {
    return verifyDeviceBundleSignature(buildPublishedDeviceBundle(device));
  } catch {
    return false;
  }
}

function repairLegacyDeviceState(device, userId, username, deviceName = "Desktop") {
  const nextIdentity = generateDeviceIdentity(deviceName || device?.deviceName || "Desktop");
  const nextKeyVersion = Math.max(1, Number(device?.keyVersion) || 0) + 1;
  const hasExistingEncryptionIdentity = (
    typeof device?.encryptionPublicKey === "string"
    && device.encryptionPublicKey.trim() !== ""
    && typeof device?.encryptionPrivateKey === "string"
    && device.encryptionPrivateKey.trim() !== ""
  );

  if (hasExistingEncryptionIdentity) {
    return {
      ...device,
      userId: Number(userId),
      username,
      deviceName: deviceName || device?.deviceName || nextIdentity.deviceName,
      signingAlgorithm: nextIdentity.signingAlgorithm,
      signingPublicKey: nextIdentity.signingPublicKey,
      signingPrivateKey: nextIdentity.signingPrivateKey,
      keyVersion: nextKeyVersion
    };
  }

  return {
    ...nextIdentity,
    deviceId: device?.deviceId || nextIdentity.deviceId,
    userId: Number(userId),
    username,
    deviceName: deviceName || device?.deviceName || nextIdentity.deviceName,
    createdAt: device?.createdAt || nextIdentity.createdAt,
    keyVersion: nextKeyVersion
  };
}

function normalizeAttachments(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      return {
        transferId: entry.transferId ? String(entry.transferId) : "",
        fileName: entry.fileName ? String(entry.fileName) : "file",
        mimeType: entry.mimeType ? String(entry.mimeType) : "application/octet-stream",
        fileSize: Math.max(0, Number(entry.fileSize) || 0),
        algorithm: entry.encryption?.algorithm ? String(entry.encryption.algorithm) : undefined
      };
    })
    .filter((entry) => entry && entry.transferId);
}

function materializeEncryptedAttachments(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || !entry.transferId) {
      return null;
    }

    return buildOutgoingAttachmentPayload({
      transferId: entry.transferId
    });
  }).filter(Boolean);
}

function normalizeDisappearingSeconds(value) {
  const seconds = Math.max(0, Number(value) || 0);
  return Number.isFinite(seconds) ? seconds : 0;
}

function syncConversationRecord(existingConversation, conversation) {
  if (!conversation || typeof conversation !== "object") {
    return existingConversation || null;
  }

  return {
    ...(existingConversation || {}),
    conversationId: conversation.id ?? conversation.conversationId ?? existingConversation?.conversationId,
    title: conversation.title ?? existingConversation?.title ?? "Direct Message",
    participantUserIds: Array.isArray(conversation.participants)
      ? conversation.participants.map((participant) => Number(participant.userId))
      : Array.isArray(conversation.participantUserIds)
        ? conversation.participantUserIds.map(Number)
        : existingConversation?.participantUserIds || [],
    wrappedKeys: Array.isArray(conversation.wrappedKeys)
      ? conversation.wrappedKeys
      : existingConversation?.wrappedKeys || [],
    createdAt: conversation.createdAt ?? existingConversation?.createdAt ?? new Date().toISOString(),
    updatedAt: conversation.updatedAt ?? existingConversation?.updatedAt ?? conversation.createdAt ?? existingConversation?.createdAt ?? new Date().toISOString(),
    disappearingMessageSeconds: normalizeDisappearingSeconds(
      conversation.disappearingPolicy?.currentSeconds ?? conversation.messageTtlSeconds ?? existingConversation?.disappearingMessageSeconds ?? 0
    )
  };
}

function mergeStoredMessages(existingMessages, incomingMessages) {
  const merged = new Map();

  [...(Array.isArray(existingMessages) ? existingMessages : []), ...(Array.isArray(incomingMessages) ? incomingMessages : [])]
    .forEach((message) => {
      if (!message || typeof message !== "object") {
        return;
      }

      const messageId = message.messageId != null ? String(message.messageId) : "";
      const remoteMessageId = message.remoteMessageId != null ? String(message.remoteMessageId) : "";
      const fallbackKey = messageId || (remoteMessageId ? `remote:${remoteMessageId}` : "");

      if (!fallbackKey) {
        return;
      }

      const existing = merged.get(fallbackKey);

      if (!existing) {
        merged.set(fallbackKey, message);
        return;
      }

      // Prefer entries that have remote ids/control metadata, but keep any local-only data too.
      merged.set(fallbackKey, {
        ...existing,
        ...message,
        remoteMessageId: message.remoteMessageId ?? existing.remoteMessageId ?? null,
        control: message.control ?? existing.control ?? null
      });
    });

  return Array.from(merged.values()).sort((left, right) => {
    const leftTime = new Date(left?.createdAt || 0).getTime();
    const rightTime = new Date(right?.createdAt || 0).getTime();

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return String(left?.messageId || "").localeCompare(String(right?.messageId || ""));
  });
}

function createEmptyReactions() {
  return {};
}

function normalizeReactions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyReactions();
  }

  return Object.entries(value).reduce((acc, [emoji, userIds]) => {
    if (!emoji) {
      return acc;
    }

    acc[String(emoji)] = Array.from(new Set((Array.isArray(userIds) ? userIds : []).map(String)));
    return acc;
  }, {});
}

function toggleReactionOnMessage(targetMessage, senderUserId, emoji) {
  if (!targetMessage || !emoji) {
    return;
  }

  const reactionKey = String(emoji);
  const userKey = String(senderUserId);
  const existingUsers = Array.isArray(targetMessage.reactions?.[reactionKey])
    ? targetMessage.reactions[reactionKey].map(String)
    : [];

  const hasReaction = existingUsers.includes(userKey);
  const nextUsers = hasReaction
    ? existingUsers.filter((entry) => entry !== userKey)
    : [...existingUsers, userKey];

  targetMessage.reactions = {
    ...(targetMessage.reactions || {}),
    [reactionKey]: nextUsers
  };

  if (nextUsers.length === 0) {
    delete targetMessage.reactions[reactionKey];
  }
}

function inferMessageKind(payload) {
  if (!payload || typeof payload !== "object") {
    return "message";
  }

  if (payload.kind) {
    return String(payload.kind);
  }

  if (payload.emoji && payload.targetMessageId) {
    return "reaction";
  }

  if (payload.messageTtlSeconds != null && String(payload.kind || "").startsWith("disappearing")) {
    return String(payload.kind);
  }

  return "message";
}

function buildControlMetadata(payload) {
  const kind = inferMessageKind(payload);

  if (kind === "message") {
    return null;
  }

  return {
    kind,
    targetMessageId: payload?.targetMessageId ? String(payload.targetMessageId) : null,
    emoji: payload?.emoji ? String(payload.emoji) : null,
    messageTtlSeconds: payload?.messageTtlSeconds != null ? normalizeDisappearingSeconds(payload.messageTtlSeconds) : null,
    mode: payload?.mode ? String(payload.mode) : null
  };
}

function pruneExpiredMessagesInConversation(conversation) {
  if (!conversation || !Array.isArray(conversation.messages)) {
    return false;
  }

  const ttlSeconds = normalizeDisappearingSeconds(conversation.disappearingMessageSeconds);

  if (ttlSeconds <= 0) {
    return false;
  }

  const cutoffTimestamp = Date.now() - ttlSeconds * 1000;
  const originalLength = conversation.messages.length;
  conversation.messages = conversation.messages.filter((message) => {
    const createdAt = new Date(message?.createdAt || 0).getTime();

    if (!Number.isFinite(createdAt) || createdAt <= 0) {
      return true;
    }

    return createdAt >= cutoffTimestamp;
  });

  return conversation.messages.length !== originalLength;
}

function assertCiphertextOnlyDmExport(value, path = "conversationExport") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertCiphertextOnlyDmExport(entry, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  Object.entries(value).forEach(([key, entryValue]) => {
    if (FORBIDDEN_DM_EXPORT_KEYS.has(String(key))) {
      throw new Error(`DM export attempted to include sensitive plaintext or key material at ${path}.${key}`);
    }

    assertCiphertextOnlyDmExport(entryValue, `${path}.${key}`);
  });
}

export function initializeDevice({ userId, username, deviceName }) {
  const { userState } = ensureDevice(userId, username, deviceName);

  return buildPublishedDeviceBundle(userState.device);
}

export const getDeviceBundle = initializeDevice;

export function beginDeviceIdentityRotation({ userId, username, deviceName }) {
  const { store, userState } = ensureDevice(userId, username, deviceName);
  const existingDevice = userState.device;
  const rotatedIdentity = generateDeviceIdentity(deviceName || existingDevice?.deviceName || "Desktop");
  const rotationKey = String(userId);

  pendingDeviceRotations.set(rotationKey, JSON.parse(JSON.stringify(existingDevice)));

  userState.device = {
    ...rotatedIdentity,
    deviceId: existingDevice?.deviceId || rotatedIdentity.deviceId,
    userId: Number(userId),
    username,
    deviceName: deviceName || existingDevice?.deviceName || rotatedIdentity.deviceName,
    createdAt: existingDevice?.createdAt || rotatedIdentity.createdAt,
    rotatedAt: new Date().toISOString(),
    keyVersion: Math.max(1, Number(existingDevice?.keyVersion) || 1) + 1
  };

  writeSecureDmStore(store);
  return buildPublishedDeviceBundle(userState.device);
}

export function commitDeviceIdentityRotation({ userId }) {
  pendingDeviceRotations.delete(String(userId));
  return { ok: true };
}

export function rollbackDeviceIdentityRotation({ userId, username, deviceName }) {
  const rotationKey = String(userId);
  const previousDevice = pendingDeviceRotations.get(rotationKey);

  if (!previousDevice) {
    return getDeviceBundle({ userId, username, deviceName });
  }

  const { store, userState } = ensureDevice(userId, username, deviceName);
  userState.device = previousDevice;
  writeSecureDmStore(store);
  pendingDeviceRotations.delete(rotationKey);

  return buildPublishedDeviceBundle(userState.device);
}

export const rotateDeviceIdentity = beginDeviceIdentityRotation;

export function verifyDeviceBundles({ expectedUserId, devices }) {
  const verifiedDevices = (Array.isArray(devices) ? devices : []).map((device) => {
    const normalizedDevice = {
      ...device,
      userId: Number(device?.userId)
    };

    if (normalizedDevice.userId !== Number(expectedUserId)) {
      throw new Error(`Device bundle user mismatch for ${normalizedDevice.deviceId || "unknown-device"}`);
    }

    if (!verifyDeviceBundleSignature(normalizedDevice)) {
      throw new Error(`Device bundle signature verification failed for ${normalizedDevice.deviceId || "unknown-device"}`);
    }

    return normalizedDevice;
  });

  return {
    ok: true,
    devices: verifiedDevices
  };
}

export function createConversation({ userId, username, title, participants, recipientDevices }) {
  const { store, userState } = ensureDevice(userId, username);
  const conversationId = randomId("dm");
  const conversationKey = createConversationKey();
  const allRecipientDevices = [
    {
      userId: Number(userId),
      deviceId: userState.device.deviceId,
      encryptionPublicKey: userState.device.encryptionPublicKey
    },
    ...(Array.isArray(recipientDevices) ? recipientDevices : [])
  ];

  const wrappedKeys = allRecipientDevices.map((recipient) => ({
    recipientUserId: Number(recipient.userId),
    deviceId: recipient.deviceId,
    algorithm: "x25519-aes-256-gcm",
    keyVersion: 1,
    wrappedConversationKey: JSON.stringify(
      wrapConversationKeyForRecipient({
        conversationKey,
        recipientPublicKey: recipient.encryptionPublicKey
      })
    )
  }));

  userState.conversations[String(conversationId)] = {
    conversationId,
    title: title ?? "Direct Message",
    participantUserIds: Array.from(
      new Set([Number(userId), ...(Array.isArray(participants) ? participants : []).map(Number)])
    ),
    conversationKey,
    legacyConversationKeys: [],
    wrappedKeys,
    messages: [],
    deviceTrust: {
      verifiedDeviceIds: {}
    },
    replayProtection: {
      seenMessageIds: {},
      seenRemoteMessageIds: {},
      seenEnvelopeSignatures: {}
    },
    disappearingMessageSeconds: 0,
    createdAt: new Date().toISOString()
  };

  writeSecureDmStore(store);

  return {
    conversationId,
    deviceId: userState.device.deviceId,
    wrappedKeys,
    participantUserIds: userState.conversations[String(conversationId)].participantUserIds
  };
}

export function adoptConversationId({ userId, username, fromConversationId, toConversationId, title }) {
  const { store, userState } = ensureDevice(userId, username);
  const existing = getConversationOrThrow(userState, fromConversationId);

  userState.conversations[String(toConversationId)] = {
    ...existing,
    conversationId: toConversationId,
    title: title ?? existing.title
  };

  if (String(fromConversationId) !== String(toConversationId)) {
    delete userState.conversations[String(fromConversationId)];
  }

  writeSecureDmStore(store);

  return {
    conversationId: toConversationId,
    title: userState.conversations[String(toConversationId)].title
  };
}

export function importConversation({ userId, username, conversation }) {
  const { store, userState } = ensureDevice(userId, username);
  const existingConversation = userState.conversations[String(conversation.id)] || null;
  const wrappedKey = (conversation.wrappedKeys || []).find(
    (entry) => entry.deviceId === userState.device.deviceId
  );

  if (!wrappedKey) {
    // Use a stable code so callers can detect this specific failure without
    // fragile message-string matching across the IPC boundary.
    const err = new Error("No wrapped conversation key exists for this device");
    err.code = "dm_missing_conversation_key";
    throw err;
  }

  const conversationKey = unwrapConversationKeyForDevice({
    wrappedKey: JSON.parse(wrappedKey.wrappedConversationKey),
    recipientPrivateKey: userState.device.encryptionPrivateKey
  });

  userState.conversations[String(conversation.id)] = {
    ...syncConversationRecord(existingConversation, conversation),
    conversationKey: existingConversation?.conversationKey || conversationKey,
    legacyConversationKeys: existingConversation?.legacyConversationKeys || [],
    deviceTrust: existingConversation?.deviceTrust || { verifiedDeviceIds: {} },
    replayProtection: existingConversation?.replayProtection || {
      seenMessageIds: {},
      seenRemoteMessageIds: {},
      seenEnvelopeSignatures: {}
    },
    messages: Array.isArray(conversation.messages)
      ? mergeStoredMessages(existingConversation?.messages || [], conversation.messages.map((message) => {
          let plaintext = null;
          let control = null;

          try {
            plaintext = decryptPayload({
              conversationKey,
              ciphertext: message.ciphertext,
              nonce: message.nonce,
              aad: message.aad,
              tag: message.tag
            });
            control = buildControlMetadata(plaintext);
          } catch {
            control = null;
          }

          return {
            messageId: plaintext?.id || message.id,
            remoteMessageId: message.id,
            senderUserId: message.senderUserId,
            senderDeviceId: message.senderDeviceId,
            ciphertext: message.ciphertext,
            nonce: message.nonce,
            aad: message.aad,
            tag: message.tag,
            signature: message.signature ?? null,
            createdAt: message.createdAt,
            direction: Number(message.senderUserId) === Number(userId) ? "outgoing" : "incoming",
            control
          };
        }))
      : existingConversation?.messages || []
  };

  if (existingConversation?.conversationKey && existingConversation.conversationKey !== conversationKey) {
    rememberLegacyConversationKey(userState.conversations[String(conversation.id)], existingConversation.conversationKey);
    userState.conversations[String(conversation.id)].conversationKey = conversationKey;
  }

  rebuildReplayProtection(userState.conversations[String(conversation.id)]);

  pruneExpiredMessagesInConversation(userState.conversations[String(conversation.id)]);

  writeSecureDmStore(store);
  return listMessages({ userId, conversationId: conversation.id });
}

export function createEncryptedMessage({ userId, username, conversationId, senderUserId, plaintext }) {
  const { store, userState } = ensureDevice(userId, username);
  const conversation = getConversationOrThrow(userState, conversationId);
  const messageId = randomId("dmmsg");
  const createdAt = new Date().toISOString();
  const plaintextPayload = typeof plaintext === "object" && plaintext !== null
    ? {
        ...plaintext,
        id: messageId,
        body: plaintext.body ?? "",
        kind: inferMessageKind(plaintext),
        attachments: materializeEncryptedAttachments(plaintext.attachments),
        createdAt
      }
    : {
        id: messageId,
        body: plaintext,
        kind: "message",
        createdAt
      };
  const envelope = encryptPayload({
    conversationKey: conversation.conversationKey,
    plaintext: plaintextPayload,
    aad: {
      version: 1,
      conversationId,
      messageId,
      senderUserId: Number(senderUserId),
      senderDeviceId: userState.device.deviceId
    }
  });
  const control = buildControlMetadata(plaintextPayload);
  const signature = signMessageEnvelope({
    conversationId,
    messageId,
    senderUserId: Number(senderUserId),
    senderDeviceId: userState.device.deviceId,
    ciphertext: envelope.ciphertext,
    nonce: envelope.nonce,
    aad: envelope.aad,
    tag: envelope.tag
  }, userState.device.signingPrivateKey);

  const storedMessage = {
    messageId,
    remoteMessageId: null,
    senderUserId: Number(senderUserId),
    senderDeviceId: userState.device.deviceId,
    ciphertext: envelope.ciphertext,
    nonce: envelope.nonce,
    aad: envelope.aad,
    tag: envelope.tag,
    signature,
    createdAt,
    direction: "outgoing",
    control
  };

  conversation.messages.push(storedMessage);
  recordReplayProofs(conversation, storedMessage);
  writeSecureDmStore(store);

  return {
    conversationId,
    messageId,
    senderDeviceId: userState.device.deviceId,
    recipientDeviceIds: conversation.wrappedKeys
      .filter((entry) => entry.deviceId !== userState.device.deviceId)
      .map((entry) => entry.deviceId),
    ciphertext: envelope.ciphertext,
    nonce: envelope.nonce,
    aad: envelope.aad,
    tag: envelope.tag,
    signature
  };
}

export function rotateConversationKey({ userId, username, conversationId, recipientDevices }) {
  const { store, userState } = ensureDevice(userId, username);
  const conversation = getConversationOrThrow(userState, conversationId);
  const previousConversationKey = conversation.conversationKey;
  const nextConversationKey = createConversationKey();
  const wrappedKeys = (Array.isArray(recipientDevices) ? recipientDevices : []).map((recipient) => ({
    recipientUserId: Number(recipient.userId),
    deviceId: recipient.deviceId,
    algorithm: "x25519-aes-256-gcm",
    keyVersion: 1,
    wrappedConversationKey: JSON.stringify(
      wrapConversationKeyForRecipient({
        conversationKey: nextConversationKey,
        recipientPublicKey: recipient.encryptionPublicKey
      })
    )
  }));

  if (previousConversationKey && previousConversationKey !== nextConversationKey) {
    rememberLegacyConversationKey(conversation, previousConversationKey);
  }

  conversation.conversationKey = nextConversationKey;
  conversation.wrappedKeys = wrappedKeys;
  conversation.updatedAt = new Date().toISOString();
  writeSecureDmStore(store);

  return {
    conversationId,
    wrappedKeys,
    rotatedAt: conversation.updatedAt
  };
}

export function receiveEncryptedMessage({ userId, username, conversationId, relayItem, senderDevice }) {
  const { store, userState } = ensureDevice(userId, username);
  const conversation = getConversationOrThrow(userState, conversationId);
  const prunedBeforeReceive = pruneExpiredMessagesInConversation(conversation);
  const replayReason = detectReplay(conversation, relayItem);

  if (replayReason) {
    if (prunedBeforeReceive) {
      writeSecureDmStore(store);
    }

    return {
      id: relayItem.messageId || null,
      messageId: relayItem.messageId || null,
      direction: "incoming",
      imported: false,
      replayDetected: true,
      replayReason
    };
  }

  if (!senderDevice || String(senderDevice.deviceId || "") !== String(relayItem.senderDeviceId || "")) {
    throw new Error("Missing verified sender device bundle for DM message");
  }

  if (Number(senderDevice.userId || 0) !== Number(relayItem.senderUserId || 0)) {
    throw new Error("Sender device bundle user mismatch");
  }

  const senderBundleVerified = verifyDeviceBundleSignature(senderDevice);

  if (!verifyMessageEnvelopeSignature({
    conversationId,
    messageId: relayItem.messageId,
    senderUserId: relayItem.senderUserId,
      senderDeviceId: relayItem.senderDeviceId,
      ciphertext: relayItem.ciphertext,
      nonce: relayItem.nonce,
      aad: relayItem.aad,
      tag: relayItem.tag
  }, senderDevice.signingPublicKey, relayItem.signature)) {
    throw new Error(`DM message signature verification failed for ${relayItem.messageId || "unknown-message"}`);
  }

  const plaintext = decryptConversationEnvelope(conversation, relayItem);
  const control = buildControlMetadata(plaintext);
  const replayState = ensureConversationReplayState(conversation);

  if (plaintext?.id && replayState.seenMessageIds[String(plaintext.id)]) {
    if (prunedBeforeReceive) {
      writeSecureDmStore(store);
    }

    return {
      id: plaintext.id,
      messageId: plaintext.id,
      direction: "incoming",
      imported: false,
      replayDetected: true,
      replayReason: "messageId"
    };
  }

  (Array.isArray(plaintext.attachments) ? plaintext.attachments : []).forEach((attachment) => {
    registerIncomingAttachmentPayload(attachment);
  });

  const alreadyExists = conversation.messages.find((message) => (
    message.messageId === plaintext.id
    || message.remoteMessageId === plaintext.id
    || message.id === plaintext.id
  ));

  if (!alreadyExists) {
    conversation.messages.push({
      messageId: plaintext.id,
      remoteMessageId: relayItem.messageId ?? null,
      senderUserId: relayItem.senderUserId ?? null,
      senderDeviceId: relayItem.senderDeviceId,
      ciphertext: relayItem.ciphertext,
      nonce: relayItem.nonce,
      aad: relayItem.aad,
      tag: relayItem.tag,
      signature: relayItem.signature,
      senderBundleVerified,
      createdAt: plaintext.createdAt,
      direction: "incoming",
      control
    });
    recordReplayProofs(conversation, conversation.messages[conversation.messages.length - 1]);
    writeSecureDmStore(store);
  } else if (prunedBeforeReceive) {
    writeSecureDmStore(store);
  }

  return {
    id: plaintext.id,
    messageId: plaintext.id,
    body: normalizePlaintextBody(plaintext.body),
    replyTo: normalizeReplyTo(plaintext.replyTo),
    attachments: normalizeAttachments(plaintext.attachments),
    reactions: normalizeReactions(plaintext.reactions),
    editedAt: plaintext.editedAt || null,
    deletedAt: plaintext.deletedAt || null,
    isDeleted: Boolean(plaintext.deletedAt),
    kind: inferMessageKind(plaintext),
    createdAt: plaintext.createdAt,
    senderUserId: relayItem.senderUserId ?? null,
    senderDeviceId: relayItem.senderDeviceId ?? null,
    direction: "incoming",
    imported: !alreadyExists
  };
}

function buildVisibleMessages({ conversation, userId }) {
  const visibleMessages = [];
  const visibleMessageMap = new Map();

  conversation.messages.forEach((message) => {
    const plaintext = decryptConversationEnvelope(conversation, message);
    const control = message.control || buildControlMetadata(plaintext);
    const visibleMessageId = plaintext.id || message.messageId;
    const storageMessageId = message.messageId;
    const remoteMessageId = message.remoteMessageId ?? null;
    const kind = control?.kind || inferMessageKind(plaintext);
    const senderUserId = message.senderUserId;
    const targetMessageId = control?.targetMessageId ?? plaintext.targetMessageId;
    const hasControlTarget = Boolean(targetMessageId);
    const normalizedBody = normalizePlaintextBody(plaintext.body);
    (Array.isArray(plaintext.attachments) ? plaintext.attachments : []).forEach((attachment) => {
      registerIncomingAttachmentPayload(attachment);
    });
    const isBlankArtifact = (
      normalizedBody.trim() === ""
      && !plaintext.replyTo
      && !plaintext.editedAt
      && !plaintext.deletedAt
      && !plaintext.reactions
      && normalizeAttachments(plaintext.attachments).length === 0
    );

    if (control || hasControlTarget || kind === "edit" || kind === "delete" || kind === "reaction" || kind.startsWith("disappearing")) {
      if (kind.startsWith("disappearing")) {
        return;
      }

      const targetKey = targetMessageId ? String(targetMessageId) : "";
      const targetMessage = targetKey
        ? (
          visibleMessageMap.get(targetKey)
          || visibleMessageMap.get(`storage:${targetKey}`)
          || visibleMessageMap.get(`remote:${targetKey}`)
        )
        : null;

      if (!targetMessage) {
        return;
      }

      if (control?.emoji || plaintext.emoji || kind === "reaction") {
        toggleReactionOnMessage(targetMessage, senderUserId, control?.emoji ?? plaintext.emoji);
        return;
      }

      if (String(targetMessage.senderUserId) !== String(senderUserId)) {
        return;
      }

      if (kind === "edit") {
        targetMessage.body = normalizePlaintextBody(plaintext.body || targetMessage.body);
        targetMessage.editedAt = plaintext.createdAt || message.createdAt;
      } else {
        targetMessage.body = "Message deleted";
        targetMessage.deletedAt = plaintext.createdAt || message.createdAt;
        targetMessage.isDeleted = true;
      }

      return;
    }

    if (isBlankArtifact) {
      return;
    }

    const visibleMessage = {
      messageId: visibleMessageId,
      storageMessageId,
      remoteMessageId,
      senderUserId: message.senderUserId,
      senderDeviceId: message.senderDeviceId,
      direction: message.direction,
      body: normalizedBody,
      createdAt: plaintext.createdAt,
      replyTo: normalizeReplyTo(plaintext.replyTo),
      attachments: normalizeAttachments(plaintext.attachments),
      reactions: normalizeReactions(plaintext.reactions),
      editedAt: plaintext.editedAt || null,
      isDeleted: false
    };

    visibleMessages.push(visibleMessage);
    visibleMessageMap.set(String(visibleMessage.messageId), visibleMessage);
    visibleMessageMap.set(`storage:${String(storageMessageId)}`, visibleMessage);
    if (remoteMessageId != null) {
      visibleMessageMap.set(`remote:${String(remoteMessageId)}`, visibleMessage);
    }
  });

  return visibleMessages;
}

export function listConversations({ userId, username }) {
  const { store, userState } = ensureDevice(userId, username);
  let didPrune = false;

  Object.values(userState.conversations).forEach((conversation) => {
    if (pruneExpiredMessagesInConversation(conversation)) {
      didPrune = true;
    }
  });

  if (didPrune) {
    writeSecureDmStore(store);
  }

  return Object.values(userState.conversations).map((conversation) => ({
    conversationId: conversation.conversationId,
    title: conversation.title,
    participantUserIds: conversation.participantUserIds,
    lastMessageAt: conversation.messages.length
      ? conversation.messages[conversation.messages.length - 1].createdAt
      : conversation.createdAt
  }));
}

export function listMessages({ userId, conversationId }) {
  const store = readSecureDmStore();
  const userState = getUserState(store, userId);
  const conversation = getConversationOrThrow(userState, conversationId);
  const didPrune = pruneExpiredMessagesInConversation(conversation);

  if (didPrune) {
    writeSecureDmStore(store);
  }

  return buildVisibleMessages({ conversation, userId });
}

export function getConversationVerification({ userId, username, conversationId, remoteDevices, remoteUsername }) {
  const { store, userState } = ensureDevice(userId, username);
  const conversation = getConversationOrThrow(userState, conversationId);
  const trustState = ensureConversationTrustState(conversation);
  const localBundle = buildPublishedDeviceBundle(userState.device);
  const normalizedRemoteDevices = (Array.isArray(remoteDevices) ? remoteDevices : []).map((device) => {
    const fingerprintHex = fingerprintPublicKey(device?.encryptionPublicKey || "");
    const fingerprint = formatFingerprint(fingerprintHex);
    const verifiedRecord = trustState.verifiedDeviceIds?.[String(device?.deviceId)] || null;

    return {
      userId: Number(device?.userId),
      username: remoteUsername || null,
      deviceId: String(device?.deviceId || ""),
      deviceName: String(device?.deviceName || "Device"),
      createdAt: device?.createdAt || null,
      fingerprint,
      shortFingerprint: fingerprint.split(" ").slice(0, 4).join(" "),
      publicKeyFingerprint: device?.publicKeyFingerprint || hashPublicKey(device?.encryptionPublicKey || ""),
      isVerified: Boolean(verifiedRecord?.verifiedAt),
      verifiedAt: verifiedRecord?.verifiedAt || null
    };
  });
  const localFingerprintHex = fingerprintPublicKey(localBundle.encryptionPublicKey);

  writeSecureDmStore(store);

  return {
    conversationId: conversation.conversationId,
    safetyNumber: buildSafetyNumber({
      conversationId: conversation.conversationId,
      participantUserIds: conversation.participantUserIds,
      devices: [localBundle, ...normalizedRemoteDevices.map((device, index) => ({
        ...remoteDevices[index]
      }))]
    }),
    localDevice: {
      userId: Number(userId),
      username,
      deviceId: localBundle.deviceId,
      deviceName: localBundle.deviceName,
      fingerprint: formatFingerprint(localFingerprintHex),
      shortFingerprint: formatFingerprint(localFingerprintHex).split(" ").slice(0, 4).join(" ")
    },
    remoteDevices: normalizedRemoteDevices
  };
}

export function setConversationDeviceVerified({ userId, username, conversationId, deviceId, verified }) {
  const { store, userState } = ensureDevice(userId, username);
  const conversation = getConversationOrThrow(userState, conversationId);
  const trustState = ensureConversationTrustState(conversation);
  const key = String(deviceId || "");

  if (!key) {
    throw new Error("deviceId is required");
  }

  if (verified) {
    trustState.verifiedDeviceIds[key] = {
      verifiedAt: new Date().toISOString()
    };
  } else {
    delete trustState.verifiedDeviceIds[key];
  }

  writeSecureDmStore(store);

  return {
    ok: true,
    conversationId,
    deviceId: key,
    verified: Boolean(verified),
    verifiedAt: trustState.verifiedDeviceIds[key]?.verifiedAt || null
  };
}

export function exportConversationPackage({ userId, username, conversationId }) {
  const { userState } = ensureDevice(userId, username);
  const conversation = getConversationOrThrow(userState, conversationId);

  const exportedConversation = {
    conversationId: conversation.conversationId,
    title: conversation.title,
    participantUserIds: conversation.participantUserIds,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt ?? conversation.createdAt,
    messages: conversation.messages.map((message) => ({
      id: message.messageId,
      senderUserId: message.senderUserId,
      senderDeviceId: message.senderDeviceId,
      ciphertext: message.ciphertext,
      nonce: message.nonce,
      aad: message.aad,
      tag: message.tag,
      signature: message.signature ?? null,
      createdAt: message.createdAt
    }))
  };

  // History exports are allowed only as ciphertext bundles plus safe metadata.
  assertCiphertextOnlyDmExport(exportedConversation);

  return exportedConversation;
}

export function createWrappedKeyForConversation({
  userId,
  username,
  conversationId,
  recipientUserId,
  recipientDeviceId,
  recipientPublicKey
}) {
  const { store, userState } = ensureDevice(userId, username);
  const conversation = getConversationOrThrow(userState, conversationId);

  const wrappedKey = {
    recipientUserId: Number(recipientUserId),
    deviceId: recipientDeviceId,
    algorithm: "x25519-aes-256-gcm",
    keyVersion: 1,
    wrappedConversationKey: JSON.stringify(
      wrapConversationKeyForRecipient({
        conversationKey: conversation.conversationKey,
        recipientPublicKey
      })
    )
  };

  const withoutExisting = conversation.wrappedKeys.filter(
    (entry) => entry.deviceId !== recipientDeviceId
  );
  conversation.wrappedKeys = [...withoutExisting, wrappedKey];
  writeSecureDmStore(store);

  return wrappedKey;
}

export function importConversationPackage({ userId, username, conversation, wrappedKey }) {
  const { store, userState } = ensureDevice(userId, username);
  const existingConversation = userState.conversations[String(conversation.conversationId)] || null;
  const conversationKey = unwrapConversationKeyForDevice({
    wrappedKey: JSON.parse(wrappedKey.wrappedConversationKey),
    recipientPrivateKey: userState.device.encryptionPrivateKey
  });

  userState.conversations[String(conversation.conversationId)] = {
    ...syncConversationRecord(existingConversation, conversation),
    conversationKey: existingConversation?.conversationKey || conversationKey,
    legacyConversationKeys: existingConversation?.legacyConversationKeys || [],
    wrappedKeys: [
      ...(existingConversation?.wrappedKeys || []).filter((entry) => entry.deviceId !== wrappedKey.deviceId),
      wrappedKey
    ],
    replayProtection: existingConversation?.replayProtection || {
      seenMessageIds: {},
      seenRemoteMessageIds: {},
      seenEnvelopeSignatures: {}
    },
    messages: Array.isArray(conversation.messages)
      ? mergeStoredMessages(existingConversation?.messages || [], conversation.messages.map((message) => {
          let plaintext = null;
          let control = null;

          try {
            plaintext = decryptPayload({
              conversationKey,
              ciphertext: message.ciphertext,
              nonce: message.nonce,
              aad: message.aad,
              tag: message.tag
            });
            control = buildControlMetadata(plaintext);
          } catch {
            control = null;
          }

          return {
            messageId: plaintext?.id || message.id,
            remoteMessageId: message.id,
            senderUserId: message.senderUserId,
            senderDeviceId: message.senderDeviceId,
            ciphertext: message.ciphertext,
            nonce: message.nonce,
            aad: message.aad,
            tag: message.tag,
            signature: message.signature ?? null,
            createdAt: message.createdAt,
            direction: Number(message.senderUserId) === Number(userId) ? "outgoing" : "incoming",
            control
          };
        }))
      : existingConversation?.messages || []
  };

  if (existingConversation?.conversationKey && existingConversation.conversationKey !== conversationKey) {
    rememberLegacyConversationKey(userState.conversations[String(conversation.conversationId)], existingConversation.conversationKey);
    userState.conversations[String(conversation.conversationId)].conversationKey = conversationKey;
  }

  rebuildReplayProtection(userState.conversations[String(conversation.conversationId)]);

  pruneExpiredMessagesInConversation(userState.conversations[String(conversation.conversationId)]);

  writeSecureDmStore(store);
  return listMessages({ userId, conversationId: conversation.conversationId });
}

export function syncConversationMetadata({ userId, username, conversation }) {
  const { store, userState } = ensureDevice(userId, username);
  const conversationId = conversation?.id ?? conversation?.conversationId;

  if (!conversationId) {
    return { ok: false };
  }

  const existingConversation = userState.conversations[String(conversationId)];

  if (!existingConversation) {
    return { ok: false, missing: true };
  }

  userState.conversations[String(conversationId)] = {
    ...syncConversationRecord(existingConversation, conversation),
    conversationKey: existingConversation.conversationKey,
    legacyConversationKeys: existingConversation.legacyConversationKeys || [],
    messages: existingConversation.messages || []
  };

  const currentWrappedKey = (conversation?.wrappedKeys || []).find(
    (entry) => entry.deviceId === userState.device.deviceId
  );

  if (currentWrappedKey) {
    const nextConversationKey = unwrapConversationKeyForDevice({
      wrappedKey: JSON.parse(currentWrappedKey.wrappedConversationKey),
      recipientPrivateKey: userState.device.encryptionPrivateKey
    });

    if (nextConversationKey && nextConversationKey !== existingConversation.conversationKey) {
      rememberLegacyConversationKey(userState.conversations[String(conversationId)], existingConversation.conversationKey);
      userState.conversations[String(conversationId)].conversationKey = nextConversationKey;
    }
  }

  pruneExpiredMessagesInConversation(userState.conversations[String(conversationId)]);
  writeSecureDmStore(store);

  return {
    ok: true,
    conversationId,
    disappearingMessageSeconds: userState.conversations[String(conversationId)].disappearingMessageSeconds
  };
}

export function deleteConversation({ userId, conversationId }) {
  const store = readSecureDmStore();
  const userState = getUserState(store, userId);

  delete userState.conversations[String(conversationId)];
  writeSecureDmStore(store);

  return {
    ok: true,
    conversationId
  };
}

// ─── Device Transfer & Recovery ───────────────────────────────────────────────

/**
 * Scan the local store and return every conversation where this device is
 * missing a wrapped key or has no usable conversation key. The result gives
 * the UI enough information to surface targeted recovery options without
 * exposing any raw key material.
 */
export function diagnoseMissingConversationKeys({ userId, username }) {
  const { userState } = ensureDevice(userId, username);
  const deviceId = userState.device.deviceId;
  const missing = [];

  for (const [conversationId, conversation] of Object.entries(userState.conversations)) {
    const hasConversationKey = Boolean(conversation.conversationKey);
    const hasWrappedKey = (conversation.wrappedKeys || []).some(
      (entry) => entry.deviceId === deviceId
    );

    if (!hasConversationKey || !hasWrappedKey) {
      missing.push({
        conversationId,
        title: conversation.title || null,
        participantUserIds: conversation.participantUserIds || [],
        hasConversationKey,
        hasWrappedKey,
        messageCount: (conversation.messages || []).length
      });
    }
  }

  return { missing, deviceId };
}

/**
 * Build an encrypted + Ed25519-signed device transfer package containing all
 * conversation keys and message histories for this user. The payload is
 * encrypted with X25519-ECDH so only the intended recipient device can open
 * it, and the signature lets the recipient verify authenticity before
 * installing any data.
 *
 * The plaintext header is intentionally minimal — the signed, encrypted
 * payload carries the tamper-evident guarantee.
 */
export function exportDeviceTransferPackage({ userId, username, recipientDeviceId, recipientPublicKey }) {
  const { userState } = ensureDevice(userId, username);
  const device = userState.device;
  const exportedAt = new Date().toISOString();

  const conversations = {};
  for (const [conversationId, conversation] of Object.entries(userState.conversations)) {
    conversations[conversationId] = {
      conversationId,
      title: conversation.title || null,
      participantUserIds: conversation.participantUserIds || [],
      createdAt: conversation.createdAt || null,
      conversationKey: conversation.conversationKey || null,
      legacyConversationKeys: conversation.legacyConversationKeys || [],
      messages: (conversation.messages || []).map((message) => ({
        messageId: message.messageId,
        remoteMessageId: message.remoteMessageId ?? null,
        senderUserId: message.senderUserId,
        senderDeviceId: message.senderDeviceId,
        ciphertext: message.ciphertext,
        nonce: message.nonce,
        aad: message.aad,
        tag: message.tag,
        signature: message.signature ?? null,
        createdAt: message.createdAt,
        direction: message.direction,
        control: message.control ?? null
      }))
    };
  }

  const transferPayload = {
    version: 1,
    sourceDeviceId: device.deviceId,
    sourceUserId: Number(userId),
    recipientDeviceId: String(recipientDeviceId),
    exportedAt,
    conversations
  };

  // Sign before encrypting so the recipient can verify after decrypting.
  const payloadSignature = signJsonPayload(transferPayload, device.signingPrivateKey);

  const header = {
    version: 1,
    sourceDeviceId: device.deviceId,
    sourceUserId: Number(userId),
    recipientDeviceId: String(recipientDeviceId),
    exportedAt,
    signingPublicKey: device.signingPublicKey,
    payloadSignature
  };

  const encryptedPayload = encryptForRecipientDevice({
    payload: Buffer.from(JSON.stringify(transferPayload), "utf8"),
    recipientPublicKey: String(recipientPublicKey)
  });

  return { header, encryptedPayload };
}

/**
 * Receive a transfer package produced by `exportDeviceTransferPackage`,
 * verify its Ed25519 signature, decrypt it with this device's X25519 private
 * key, and merge the conversation data into the local store.
 *
 * Returns a safe summary — no raw key material crosses the IPC boundary.
 */
export function importDeviceTransferPackage({ userId, username, transferPackage }) {
  const { store, userState } = ensureDevice(userId, username);
  const { header, encryptedPayload } = transferPackage || {};

  if (!header || !encryptedPayload) {
    throw new Error("Invalid transfer package: missing header or encryptedPayload");
  }

  if (String(header.recipientDeviceId) !== String(userState.device.deviceId)) {
    throw new Error("Transfer package is not addressed to this device");
  }

  let payloadBuffer;
  try {
    payloadBuffer = decryptFromSenderDevice({
      encryptedPayload,
      recipientPrivateKey: userState.device.encryptionPrivateKey
    });
  } catch {
    throw new Error("Failed to decrypt transfer package — wrong device or corrupted data");
  }

  let transferPayload;
  try {
    transferPayload = JSON.parse(payloadBuffer.toString("utf8"));
  } catch {
    throw new Error("Transfer package payload is not valid JSON");
  }

  const signatureValid = verifyJsonPayload(
    transferPayload,
    String(header.signingPublicKey || ""),
    String(header.payloadSignature || "")
  );
  if (!signatureValid) {
    throw new Error("Transfer package signature verification failed — data may be tampered");
  }

  if (
    String(transferPayload.sourceDeviceId) !== String(header.sourceDeviceId) ||
    Number(transferPayload.sourceUserId) !== Number(header.sourceUserId)
  ) {
    throw new Error("Transfer package header does not match payload — data may be tampered");
  }

  const installedConversationIds = [];

  for (const [conversationId, convData] of Object.entries(transferPayload.conversations || {})) {
    const existing = userState.conversations[conversationId] || null;

    // Prefer a key this device already resolved; otherwise take the transferred one.
    const resolvedConversationKey = existing?.conversationKey || convData.conversationKey || null;

    // Merge legacy keys from both sides, demoting the transferred current key if
    // this device already has a newer one installed.
    const allLegacyKeys = Array.from(new Set([
      ...(existing?.legacyConversationKeys || []),
      ...(convData.legacyConversationKeys || []),
      ...(convData.conversationKey && resolvedConversationKey !== convData.conversationKey
        ? [convData.conversationKey]
        : [])
    ])).filter(Boolean);

    userState.conversations[conversationId] = {
      ...(existing || {}),
      conversationId,
      title: convData.title || existing?.title || null,
      participantUserIds: convData.participantUserIds || existing?.participantUserIds || [],
      createdAt: convData.createdAt || existing?.createdAt || new Date().toISOString(),
      conversationKey: resolvedConversationKey,
      legacyConversationKeys: allLegacyKeys,
      wrappedKeys: existing?.wrappedKeys || [],
      deviceTrust: existing?.deviceTrust || { verifiedDeviceIds: {} },
      replayProtection: existing?.replayProtection || {
        seenMessageIds: {},
        seenRemoteMessageIds: {},
        seenEnvelopeSignatures: {}
      },
      messages: mergeStoredMessages(
        existing?.messages || [],
        (convData.messages || []).map((message) => ({
          messageId: message.messageId,
          remoteMessageId: message.remoteMessageId ?? null,
          senderUserId: message.senderUserId,
          senderDeviceId: message.senderDeviceId,
          ciphertext: message.ciphertext,
          nonce: message.nonce,
          aad: message.aad,
          tag: message.tag,
          signature: message.signature ?? null,
          createdAt: message.createdAt,
          direction: message.direction,
          control: message.control ?? null
        }))
      )
    };

    installedConversationIds.push(conversationId);
  }

  writeSecureDmStore(store);

  return {
    ok: true,
    sourceDeviceId: header.sourceDeviceId,
    installedConversationCount: installedConversationIds.length,
    installedConversationIds
  };
}
