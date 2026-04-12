import {
  createConversationKey,
  decryptPayload,
  encryptPayload,
  generateDeviceIdentity,
  hashPublicKey,
  randomId,
  unwrapConversationKeyForDevice,
  wrapConversationKeyForRecipient
} from "./crypto";
import { readSecureDmStore, writeSecureDmStore } from "./storage";

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

  if (!userState.device) {
    userState.device = {
      ...generateDeviceIdentity(deviceName),
      userId: Number(userId),
      username
    };
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
        fileSize: Math.max(0, Number(entry.fileSize) || 0)
      };
    })
    .filter((entry) => entry && entry.transferId);
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
    emoji: payload?.emoji ? String(payload.emoji) : null
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

export function initializeDevice({ userId, username, deviceName }) {
  const { userState } = ensureDevice(userId, username, deviceName);

  return {
    deviceId: userState.device.deviceId,
    deviceName: userState.device.deviceName,
    algorithm: userState.device.algorithm,
    signingAlgorithm: userState.device.signingAlgorithm,
    keyVersion: 1,
    encryptionPublicKey: userState.device.encryptionPublicKey,
    signingPublicKey: userState.device.signingPublicKey,
    publicKeyFingerprint: hashPublicKey(userState.device.encryptionPublicKey)
  };
}

export const getDeviceBundle = initializeDevice;

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
    wrappedKeys,
    messages: [],
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
    throw new Error("No wrapped conversation key exists for this device");
  }

  const conversationKey = unwrapConversationKeyForDevice({
    wrappedKey: JSON.parse(wrappedKey.wrappedConversationKey),
    recipientPrivateKey: userState.device.encryptionPrivateKey
  });

  userState.conversations[String(conversation.id)] = {
    ...syncConversationRecord(existingConversation, conversation),
    conversationKey,
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
            createdAt: message.createdAt,
            direction: Number(message.senderUserId) === Number(userId) ? "outgoing" : "incoming",
            control
          };
        }))
      : existingConversation?.messages || []
  };

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

  const storedMessage = {
    messageId,
    remoteMessageId: null,
    senderUserId: Number(senderUserId),
    senderDeviceId: userState.device.deviceId,
    ciphertext: envelope.ciphertext,
    nonce: envelope.nonce,
    aad: envelope.aad,
    tag: envelope.tag,
    createdAt,
    direction: "outgoing",
    control
  };

  conversation.messages.push(storedMessage);
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
    tag: envelope.tag
  };
}

export function receiveEncryptedMessage({ userId, username, conversationId, relayItem }) {
  const { store, userState } = ensureDevice(userId, username);
  const conversation = getConversationOrThrow(userState, conversationId);
  const prunedBeforeReceive = pruneExpiredMessagesInConversation(conversation);
  const plaintext = decryptPayload({
    conversationKey: conversation.conversationKey,
    ciphertext: relayItem.ciphertext,
    nonce: relayItem.nonce,
    aad: relayItem.aad,
    tag: relayItem.tag
  });
  const control = buildControlMetadata(plaintext);

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
      createdAt: plaintext.createdAt,
      direction: "incoming",
      control
    });
    writeSecureDmStore(store);
  } else if (prunedBeforeReceive) {
    writeSecureDmStore(store);
  }

  return {
    ...plaintext,
    direction: "incoming",
    imported: !alreadyExists
  };
}

function buildVisibleMessages({ conversation, userId }) {
  const visibleMessages = [];
  const visibleMessageMap = new Map();

  conversation.messages.forEach((message) => {
    const plaintext = decryptPayload({
      conversationKey: conversation.conversationKey,
      ciphertext: message.ciphertext,
      nonce: message.nonce,
      aad: message.aad,
      tag: message.tag
    });
    const control = message.control || buildControlMetadata(plaintext);
    const visibleMessageId = plaintext.id || message.messageId;
    const storageMessageId = message.messageId;
    const remoteMessageId = message.remoteMessageId ?? null;
    const kind = control?.kind || inferMessageKind(plaintext);
    const senderUserId = message.senderUserId;
    const targetMessageId = control?.targetMessageId ?? plaintext.targetMessageId;
    const hasControlTarget = Boolean(targetMessageId);
    const normalizedBody = normalizePlaintextBody(plaintext.body);
    const isBlankArtifact = (
      normalizedBody.trim() === ""
      && !plaintext.replyTo
      && !plaintext.editedAt
      && !plaintext.deletedAt
      && !plaintext.reactions
      && normalizeAttachments(plaintext.attachments).length === 0
    );

    if (control || hasControlTarget || kind === "edit" || kind === "delete" || kind === "reaction") {
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

export function exportConversationPackage({ userId, username, conversationId }) {
  const { userState } = ensureDevice(userId, username);
  const conversation = getConversationOrThrow(userState, conversationId);

  return {
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
      createdAt: message.createdAt
    }))
  };
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
    conversationKey,
    wrappedKeys: [
      ...(existingConversation?.wrappedKeys || []).filter((entry) => entry.deviceId !== wrappedKey.deviceId),
      wrappedKey
    ],
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
            createdAt: message.createdAt,
            direction: Number(message.senderUserId) === Number(userId) ? "outgoing" : "incoming",
            control
          };
        }))
      : existingConversation?.messages || []
  };

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
    messages: existingConversation.messages || []
  };

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
