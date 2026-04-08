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
    conversationId: conversation.id,
    title: conversation.title ?? "Direct Message",
    participantUserIds: (conversation.participants || []).map((participant) => Number(participant.userId)),
    conversationKey,
    wrappedKeys: conversation.wrappedKeys || [],
    messages: Array.isArray(conversation.messages)
      ? conversation.messages.map((message) => ({
          messageId: message.id,
          senderUserId: message.senderUserId,
          senderDeviceId: message.senderDeviceId,
          ciphertext: message.ciphertext,
          nonce: message.nonce,
          aad: message.aad,
          tag: message.tag,
          createdAt: message.createdAt,
          direction: Number(message.senderUserId) === Number(userId) ? "outgoing" : "incoming"
        }))
      : existingConversation?.messages || [],
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt ?? existingConversation?.updatedAt ?? conversation.createdAt
  };

  writeSecureDmStore(store);
  return listMessages({ userId, conversationId: conversation.id });
}

export function createEncryptedMessage({ userId, username, conversationId, senderUserId, plaintext }) {
  const { store, userState } = ensureDevice(userId, username);
  const conversation = getConversationOrThrow(userState, conversationId);
  const messageId = randomId("dmmsg");
  const envelope = encryptPayload({
    conversationKey: conversation.conversationKey,
    plaintext: {
      id: messageId,
      body: plaintext,
      createdAt: new Date().toISOString()
    },
    aad: {
      version: 1,
      conversationId,
      messageId,
      senderUserId: Number(senderUserId),
      senderDeviceId: userState.device.deviceId
    }
  });

  const storedMessage = {
    messageId,
    senderUserId: Number(senderUserId),
    senderDeviceId: userState.device.deviceId,
    ciphertext: envelope.ciphertext,
    nonce: envelope.nonce,
    aad: envelope.aad,
    tag: envelope.tag,
    createdAt: new Date().toISOString(),
    direction: "outgoing"
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
  const plaintext = decryptPayload({
    conversationKey: conversation.conversationKey,
    ciphertext: relayItem.ciphertext,
    nonce: relayItem.nonce,
    aad: relayItem.aad,
    tag: relayItem.tag
  });

  if (!conversation.messages.find((message) => message.messageId === plaintext.id)) {
    conversation.messages.push({
      messageId: plaintext.id,
      senderUserId: relayItem.senderUserId ?? null,
      senderDeviceId: relayItem.senderDeviceId,
      ciphertext: relayItem.ciphertext,
      nonce: relayItem.nonce,
      aad: relayItem.aad,
      tag: relayItem.tag,
      createdAt: plaintext.createdAt,
      direction: "incoming"
    });
    writeSecureDmStore(store);
  }

  return {
    ...plaintext,
    direction: "incoming"
  };
}

export function listConversations({ userId, username }) {
  const { userState } = ensureDevice(userId, username);

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

  return conversation.messages.map((message) => {
    const plaintext = decryptPayload({
      conversationKey: conversation.conversationKey,
      ciphertext: message.ciphertext,
      nonce: message.nonce,
      aad: message.aad,
      tag: message.tag
    });

    return {
      messageId: message.messageId,
      senderUserId: message.senderUserId,
      senderDeviceId: message.senderDeviceId,
      direction: message.direction,
      body: plaintext.body,
      createdAt: plaintext.createdAt
    };
  });
}
