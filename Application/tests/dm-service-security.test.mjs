import assert from "node:assert/strict";

import {
  encryptPayload,
  signMessageEnvelope
} from "../src/main/dm/crypto.js";
import { readSecureDmStore } from "../src/main/dm/storage.js";
import {
  createConversation,
  createEncryptedMessage,
  exportConversationPackage,
  importConversationPackage,
  initializeDevice,
  listMessages,
  receiveEncryptedMessage,
  rotateConversationKey,
  syncConversationMetadata
} from "../src/main/dm/service.js";
import {
  activateDmTestEnvironment,
  cleanupDmTestEnvironments,
  createDmTestEnvironment,
  tamperBase64
} from "./dm-test-helpers.mjs";

const senderEnv = createDmTestEnvironment("dm-service-sender");
const recipientEnv = createDmTestEnvironment("dm-service-recipient");
const wrongRecipientEnv = createDmTestEnvironment("dm-service-wrong-recipient");

try {
  activateDmTestEnvironment(recipientEnv);
  const recipientBundle = initializeDevice({
    userId: 2,
    username: "bob",
    deviceName: "Bob laptop"
  });

  activateDmTestEnvironment(senderEnv);
  const senderBundle = initializeDevice({
    userId: 1,
    username: "alice",
    deviceName: "Alice desktop"
  });
  const conversation = createConversation({
    userId: 1,
    username: "alice",
    title: "Direct Message",
    participants: [2],
    recipientDevices: [{
      userId: 2,
      deviceId: recipientBundle.deviceId,
      encryptionPublicKey: recipientBundle.encryptionPublicKey
    }]
  });
  const recipientWrappedKey = conversation.wrappedKeys.find(
    (entry) => String(entry.deviceId) === String(recipientBundle.deviceId)
  );
  const emptyConversationPackage = exportConversationPackage({
    userId: 1,
    username: "alice",
    conversationId: conversation.conversationId
  });

  activateDmTestEnvironment(recipientEnv);
  importConversationPackage({
    userId: 2,
    username: "bob",
    conversation: emptyConversationPackage,
    wrappedKey: recipientWrappedKey
  });

  activateDmTestEnvironment(senderEnv);
  const firstRelay = createEncryptedMessage({
    userId: 1,
    username: "alice",
    conversationId: conversation.conversationId,
    senderUserId: 1,
    plaintext: {
      body: "hello bob"
    }
  });

  activateDmTestEnvironment(recipientEnv);
  const firstReceive = receiveEncryptedMessage({
    userId: 2,
    username: "bob",
    conversationId: conversation.conversationId,
    relayItem: {
      messageId: firstRelay.messageId,
      senderUserId: 1,
      senderDeviceId: firstRelay.senderDeviceId,
      ciphertext: firstRelay.ciphertext,
      nonce: firstRelay.nonce,
      aad: firstRelay.aad,
      tag: firstRelay.tag,
      signature: firstRelay.signature
    },
    senderDevice: senderBundle
  });

  assert.equal(firstReceive.body, "hello bob");
  assert.equal(firstReceive.imported, true);
  assert.equal(listMessages({
    userId: 2,
    conversationId: conversation.conversationId
  }).length, 1);

  const replayBySignature = receiveEncryptedMessage({
    userId: 2,
    username: "bob",
    conversationId: conversation.conversationId,
    relayItem: {
      messageId: firstRelay.messageId,
      senderUserId: 1,
      senderDeviceId: firstRelay.senderDeviceId,
      ciphertext: firstRelay.ciphertext,
      nonce: firstRelay.nonce,
      aad: firstRelay.aad,
      tag: firstRelay.tag,
      signature: firstRelay.signature
    },
    senderDevice: senderBundle
  });

  assert.equal(replayBySignature.replayDetected, true);
  assert.equal(replayBySignature.replayReason, "signature");

  activateDmTestEnvironment(senderEnv);
  const senderStore = readSecureDmStore();
  const senderDeviceState = senderStore.users["1"].device;
  activateDmTestEnvironment(recipientEnv);
  assert.throws(
    () => receiveEncryptedMessage({
      userId: 2,
      username: "bob",
      conversationId: conversation.conversationId,
      relayItem: {
        messageId: "relay-bad-signature",
        senderUserId: 1,
        senderDeviceId: firstRelay.senderDeviceId,
        ciphertext: firstRelay.ciphertext,
        nonce: firstRelay.nonce,
        aad: firstRelay.aad,
        tag: firstRelay.tag,
        signature: tamperBase64(firstRelay.signature)
      },
      senderDevice: senderBundle
    }),
    (error) => error?.code === "DM_RECEIVE_SIGNATURE_INVALID"
      && error?.source === "dm"
      && error?.operation === "message.receive"
  );

  activateDmTestEnvironment(senderEnv);
  const senderConversationKey = readSecureDmStore().users["1"].conversations[String(conversation.conversationId)].conversationKey;
  const legacyPlaintext = {
    id: firstRelay.messageId,
    body: "legacy hello",
    createdAt: new Date().toISOString()
  };
  const legacyEnvelope = encryptPayload({
    conversationKey: senderConversationKey,
    plaintext: legacyPlaintext,
    aad: {
      version: 1,
      conversationId: conversation.conversationId,
      messageId: "relay-legacy-1",
      senderUserId: 1,
      senderDeviceId: senderBundle.deviceId
    }
  });
  const legacySignature = signMessageEnvelope({
    conversationId: conversation.conversationId,
    messageId: "relay-legacy-1",
    senderUserId: 1,
    senderDeviceId: senderBundle.deviceId,
    ciphertext: legacyEnvelope.ciphertext,
    nonce: legacyEnvelope.nonce,
    aad: legacyEnvelope.aad,
    tag: legacyEnvelope.tag
  }, senderDeviceState.signingPrivateKey);
  const tamperedLegacyCiphertext = tamperBase64(legacyEnvelope.ciphertext);
  const tamperedLegacySignature = signMessageEnvelope({
    conversationId: conversation.conversationId,
    messageId: "relay-legacy-1",
    senderUserId: 1,
    senderDeviceId: senderBundle.deviceId,
    ciphertext: tamperedLegacyCiphertext,
    nonce: legacyEnvelope.nonce,
    aad: legacyEnvelope.aad,
    tag: legacyEnvelope.tag
  }, senderDeviceState.signingPrivateKey);

  activateDmTestEnvironment(recipientEnv);
  const replayByMessageId = receiveEncryptedMessage({
    userId: 2,
    username: "bob",
    conversationId: conversation.conversationId,
    relayItem: {
      messageId: "relay-legacy-1",
      senderUserId: 1,
      senderDeviceId: senderBundle.deviceId,
      ciphertext: legacyEnvelope.ciphertext,
      nonce: legacyEnvelope.nonce,
      aad: legacyEnvelope.aad,
      tag: legacyEnvelope.tag,
      signature: legacySignature
    },
    senderDevice: senderBundle
  });

  assert.equal(replayByMessageId.replayDetected, true);
  assert.equal(replayByMessageId.replayReason, "messageId");

  assert.throws(
    () => receiveEncryptedMessage({
      userId: 2,
      username: "bob",
      conversationId: conversation.conversationId,
      relayItem: {
        messageId: "relay-legacy-1",
        senderUserId: 1,
        senderDeviceId: senderBundle.deviceId,
        ciphertext: tamperedLegacyCiphertext,
        nonce: legacyEnvelope.nonce,
        aad: legacyEnvelope.aad,
        tag: legacyEnvelope.tag,
        signature: tamperedLegacySignature
      },
      senderDevice: senderBundle
    }),
    (error) => error?.code === "DM_RECEIVE_DECRYPT_FAILED"
      && error?.source === "dm"
      && error?.operation === "message.receive"
  );

  activateDmTestEnvironment(wrongRecipientEnv);
  initializeDevice({
    userId: 3,
    username: "mallory",
    deviceName: "Mallory tablet"
  });
  assert.throws(
    () => importConversationPackage({
      userId: 3,
      username: "mallory",
      conversation: emptyConversationPackage,
      wrappedKey: recipientWrappedKey
    })
  );

  activateDmTestEnvironment(recipientEnv);
  assert.throws(
    () => receiveEncryptedMessage({
      userId: 2,
      username: "bob",
      conversationId: conversation.conversationId,
      relayItem: {
        messageId: "relay-missing-bundle",
        senderUserId: 1,
        senderDeviceId: firstRelay.senderDeviceId,
        ciphertext: firstRelay.ciphertext,
        nonce: firstRelay.nonce,
        aad: firstRelay.aad,
        tag: firstRelay.tag,
        signature: `${firstRelay.signature}missing`
      },
      senderDevice: null
    }),
    (error) => error?.code === "DM_RECEIVE_SENDER_DEVICE_MISSING"
  );
  assert.throws(
    () => receiveEncryptedMessage({
      userId: 2,
      username: "bob",
      conversationId: conversation.conversationId,
      relayItem: {
        messageId: "relay-mismatch-bundle",
        senderUserId: 1,
        senderDeviceId: firstRelay.senderDeviceId,
        ciphertext: firstRelay.ciphertext,
        nonce: firstRelay.nonce,
        aad: firstRelay.aad,
        tag: firstRelay.tag,
        signature: `${firstRelay.signature}mismatch`
      },
      senderDevice: {
        ...senderBundle,
        userId: 999
      }
    }),
    (error) => error?.code === "DM_RECEIVE_SENDER_DEVICE_MISMATCH"
  );

  activateDmTestEnvironment(senderEnv);
  const rotation = rotateConversationKey({
    userId: 1,
    username: "alice",
    conversationId: conversation.conversationId,
    recipientDevices: [
      {
        userId: 1,
        deviceId: senderBundle.deviceId,
        encryptionPublicKey: senderBundle.encryptionPublicKey
      },
      {
        userId: 2,
        deviceId: recipientBundle.deviceId,
        encryptionPublicKey: recipientBundle.encryptionPublicKey
      }
    ]
  });
  const secondRelay = createEncryptedMessage({
    userId: 1,
    username: "alice",
    conversationId: conversation.conversationId,
    senderUserId: 1,
    plaintext: {
      body: "after rotation"
    }
  });

  activateDmTestEnvironment(recipientEnv);
  assert.throws(
    () => receiveEncryptedMessage({
      userId: 2,
      username: "bob",
      conversationId: conversation.conversationId,
      relayItem: {
        messageId: secondRelay.messageId,
        senderUserId: 1,
        senderDeviceId: secondRelay.senderDeviceId,
        ciphertext: secondRelay.ciphertext,
        nonce: secondRelay.nonce,
        aad: secondRelay.aad,
        tag: secondRelay.tag,
        signature: secondRelay.signature
      },
      senderDevice: senderBundle
    }),
    (error) => error?.code === "DM_RECEIVE_UNKNOWN_CHAIN_EPOCH"
  );

  syncConversationMetadata({
    userId: 2,
    username: "bob",
    conversation: {
      conversationId: conversation.conversationId,
      title: "Direct Message",
      participantUserIds: [1, 2],
      wrappedKeys: rotation.wrappedKeys,
      messages: []
    }
  });

  const receiveAfterRotation = receiveEncryptedMessage({
    userId: 2,
    username: "bob",
    conversationId: conversation.conversationId,
    relayItem: {
      messageId: secondRelay.messageId,
      senderUserId: 1,
      senderDeviceId: secondRelay.senderDeviceId,
      ciphertext: secondRelay.ciphertext,
      nonce: secondRelay.nonce,
      aad: secondRelay.aad,
      tag: secondRelay.tag,
      signature: secondRelay.signature
    },
    senderDevice: senderBundle
  });

  assert.equal(receiveAfterRotation.body, "after rotation");
} finally {
  cleanupDmTestEnvironments(senderEnv, recipientEnv, wrongRecipientEnv);
}

console.log("dm-service-security.test.mjs: ok");
