import assert from "node:assert/strict";

import {
  createConversationKey,
  decryptFromSenderDevice,
  decryptPayload,
  encryptForRecipientDevice,
  encryptPayload,
  generateDeviceIdentity,
  signDeviceBundle,
  signMessageEnvelope,
  unwrapConversationKeyForDevice,
  verifyDeviceBundleSignature,
  verifyMessageEnvelopeSignature,
  wrapConversationKeyForRecipient
} from "../src/main/dm/crypto.js";
import { tamperBase64 } from "./dm-test-helpers.mjs";

const alice = generateDeviceIdentity("Alice");
const bob = generateDeviceIdentity("Bob");
const conversationKey = createConversationKey();

const wrappedKey = wrapConversationKeyForRecipient({
  conversationKey,
  recipientPublicKey: bob.encryptionPublicKey
});

assert.equal(
  unwrapConversationKeyForDevice({
    wrappedKey,
    recipientPrivateKey: bob.encryptionPrivateKey
  }),
  conversationKey
);

for (const tamperedWrappedKey of [
  { ...wrappedKey, ciphertext: tamperBase64(wrappedKey.ciphertext) },
  { ...wrappedKey, iv: tamperBase64(wrappedKey.iv) },
  { ...wrappedKey, tag: tamperBase64(wrappedKey.tag) },
  { ...wrappedKey, ephemeralPublicKey: alice.encryptionPublicKey }
]) {
  assert.throws(
    () => unwrapConversationKeyForDevice({
      wrappedKey: tamperedWrappedKey,
      recipientPrivateKey: bob.encryptionPrivateKey
    })
  );
}

const plaintext = {
  body: "hello secure world",
  attachments: []
};
const aad = {
  version: 1,
  conversationId: "dm_1"
};
const encryptedPayload = encryptPayload({
  conversationKey,
  plaintext,
  aad
});

assert.deepEqual(
  decryptPayload({
    conversationKey,
    ciphertext: encryptedPayload.ciphertext,
    nonce: encryptedPayload.nonce,
    aad: encryptedPayload.aad,
    tag: encryptedPayload.tag
  }),
  plaintext
);

for (const tamperedEnvelope of [
  { ...encryptedPayload, ciphertext: tamperBase64(encryptedPayload.ciphertext) },
  { ...encryptedPayload, nonce: tamperBase64(encryptedPayload.nonce) },
  { ...encryptedPayload, aad: tamperBase64(encryptedPayload.aad) },
  { ...encryptedPayload, tag: tamperBase64(encryptedPayload.tag) }
]) {
  assert.throws(
    () => decryptPayload({
      conversationKey,
      ciphertext: tamperedEnvelope.ciphertext,
      nonce: tamperedEnvelope.nonce,
      aad: tamperedEnvelope.aad,
      tag: tamperedEnvelope.tag
    })
  );
}

const bundle = {
  userId: 1,
  deviceId: alice.deviceId,
  deviceName: alice.deviceName,
  algorithm: alice.algorithm,
  signingAlgorithm: alice.signingAlgorithm,
  keyVersion: 1,
  encryptionPublicKey: alice.encryptionPublicKey,
  signingPublicKey: alice.signingPublicKey
};
const signedBundle = {
  ...bundle,
  bundleSignature: signDeviceBundle(bundle, alice.signingPrivateKey)
};

assert.equal(verifyDeviceBundleSignature(signedBundle), true);
assert.equal(
  verifyDeviceBundleSignature({
    ...signedBundle,
    deviceName: "Mallory"
  }),
  false
);

const envelope = {
  conversationId: "dm_1",
  messageId: "msg_1",
  senderUserId: 1,
  senderDeviceId: alice.deviceId,
  ciphertext: encryptedPayload.ciphertext,
  nonce: encryptedPayload.nonce,
  aad: encryptedPayload.aad,
  tag: encryptedPayload.tag
};
const envelopeSignature = signMessageEnvelope(envelope, alice.signingPrivateKey);

assert.equal(
  verifyMessageEnvelopeSignature(envelope, alice.signingPublicKey, envelopeSignature),
  true
);
assert.equal(
  verifyMessageEnvelopeSignature(
    {
      ...envelope,
      messageId: "msg_2"
    },
    alice.signingPublicKey,
    envelopeSignature
  ),
  false
);

const transferredPayload = encryptForRecipientDevice({
  payload: Buffer.from("device transfer payload", "utf8"),
  recipientPublicKey: bob.encryptionPublicKey
});

assert.equal(
  decryptFromSenderDevice({
    encryptedPayload: transferredPayload,
    recipientPrivateKey: bob.encryptionPrivateKey
  }).toString("utf8"),
  "device transfer payload"
);

for (const tamperedTransfer of [
  { ...transferredPayload, ciphertext: tamperBase64(transferredPayload.ciphertext) },
  { ...transferredPayload, iv: tamperBase64(transferredPayload.iv) },
  { ...transferredPayload, tag: tamperBase64(transferredPayload.tag) },
  { ...transferredPayload, ephemeralPublicKey: alice.encryptionPublicKey }
]) {
  assert.throws(
    () => decryptFromSenderDevice({
      encryptedPayload: tamperedTransfer,
      recipientPrivateKey: bob.encryptionPrivateKey
    })
  );
}

console.log("dm-crypto-security.test.mjs: ok");
