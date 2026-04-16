import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  randomUUID,
  sign,
  verify
} from "node:crypto";

function toBase64(buffer) {
  return Buffer.from(buffer).toString("base64");
}

function fromBase64(value) {
  return Buffer.from(value, "base64");
}

function normalizeAad(aad) {
  return Buffer.from(JSON.stringify(aad ?? {}), "utf8");
}

function deriveAesKey(inputKeyMaterial, info) {
  return hkdfSync("sha256", inputKeyMaterial, Buffer.alloc(0), Buffer.from(info, "utf8"), 32);
}

export function randomId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function generateDeviceIdentity(deviceName = "Desktop") {
  const encryptionKeys = generateKeyPairSync("x25519");
  const signingKeys = generateKeyPairSync("ed25519");
  const deviceId = randomId("device");

  return {
    deviceId,
    deviceName,
    algorithm: "x25519-aes-256-gcm",
    signingAlgorithm: "ed25519",
    encryptionPublicKey: encryptionKeys.publicKey.export({ type: "spki", format: "pem" }),
    encryptionPrivateKey: encryptionKeys.privateKey.export({ type: "pkcs8", format: "pem" }),
    signingPublicKey: signingKeys.publicKey.export({ type: "spki", format: "pem" }),
    signingPrivateKey: signingKeys.privateKey.export({ type: "pkcs8", format: "pem" }),
    createdAt: new Date().toISOString()
  };
}

export function createConversationKey() {
  return toBase64(randomBytes(32));
}

export function wrapConversationKeyForRecipient({ conversationKey, recipientPublicKey }) {
  const ephemeral = generateKeyPairSync("x25519");
  const sharedSecret = diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: createPublicKey(recipientPublicKey)
  });
  const aesKey = deriveAesKey(sharedSecret, "chatapp/dm/wrap/v1");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(fromBase64(conversationKey)),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    algorithm: "x25519-aes-256-gcm",
    ephemeralPublicKey: ephemeral.publicKey.export({ type: "spki", format: "pem" }),
    iv: toBase64(iv),
    tag: toBase64(tag),
    ciphertext: toBase64(ciphertext)
  };
}

export function unwrapConversationKeyForDevice({ wrappedKey, recipientPrivateKey }) {
  const sharedSecret = diffieHellman({
    privateKey: createPrivateKey(recipientPrivateKey),
    publicKey: createPublicKey(wrappedKey.ephemeralPublicKey)
  });
  const aesKey = deriveAesKey(sharedSecret, "chatapp/dm/wrap/v1");
  const decipher = createDecipheriv("aes-256-gcm", aesKey, fromBase64(wrappedKey.iv));
  decipher.setAuthTag(fromBase64(wrappedKey.tag));
  const plaintext = Buffer.concat([
    decipher.update(fromBase64(wrappedKey.ciphertext)),
    decipher.final()
  ]);

  return toBase64(plaintext);
}

export function encryptPayload({ conversationKey, plaintext, aad }) {
  const messageKey = fromBase64(conversationKey);
  const iv = randomBytes(12);
  const aadBuffer = normalizeAad(aad);
  const cipher = createCipheriv("aes-256-gcm", messageKey, iv);
  cipher.setAAD(aadBuffer);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(plaintext), "utf8")),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    algorithm: "aes-256-gcm",
    nonce: toBase64(iv),
    aad: toBase64(aadBuffer),
    ciphertext: toBase64(ciphertext),
    tag: toBase64(tag)
  };
}

export function decryptPayload({ conversationKey, ciphertext, nonce, aad, tag }) {
  const messageKey = fromBase64(conversationKey);
  const decipher = createDecipheriv("aes-256-gcm", messageKey, fromBase64(nonce));
  decipher.setAAD(fromBase64(aad));
  decipher.setAuthTag(fromBase64(tag));
  const plaintext = Buffer.concat([
    decipher.update(fromBase64(ciphertext)),
    decipher.final()
  ]);

  return JSON.parse(plaintext.toString("utf8"));
}

export function hashPublicKey(publicKey) {
  return createHash("sha256").update(publicKey).digest("base64");
}

export function fingerprintPublicKey(publicKey) {
  return createHash("sha256").update(publicKey).digest("hex");
}

export function formatFingerprint(value) {
  const normalized = String(value || "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  return normalized.match(/.{1,4}/g)?.join(" ") || "";
}

export function buildSafetyNumber({ conversationId, participantUserIds, devices }) {
  const fingerprintMaterial = (Array.isArray(devices) ? devices : [])
    .map((device) => [
      String(device?.userId || ""),
      String(device?.deviceId || ""),
      String(device?.encryptionPublicKey || ""),
      String(device?.signingPublicKey || "")
    ].join(":"))
    .sort()
    .join("|");
  const participantMaterial = (Array.isArray(participantUserIds) ? participantUserIds : [])
    .map((entry) => String(entry))
    .sort()
    .join("|");
  const digest = createHash("sha256")
    .update(`${String(conversationId || "")}|${participantMaterial}|${fingerprintMaterial}`)
    .digest("hex");
  const digitString = BigInt(`0x${digest}`).toString(10).padStart(60, "0").slice(0, 60);

  return digitString.match(/.{1,5}/g)?.join(" ") || digitString;
}

function buildDeviceBundlePayload(bundle) {
  return Buffer.from(JSON.stringify({
    userId: Number(bundle?.userId),
    deviceId: String(bundle?.deviceId || ""),
    deviceName: String(bundle?.deviceName || ""),
    algorithm: String(bundle?.algorithm || ""),
    signingAlgorithm: String(bundle?.signingAlgorithm || ""),
    keyVersion: Math.max(1, Number(bundle?.keyVersion) || 1),
    encryptionPublicKey: String(bundle?.encryptionPublicKey || ""),
    signingPublicKey: String(bundle?.signingPublicKey || "")
  }), "utf8");
}

function canonicalizeEnvelope(envelope) {
  return Buffer.from(JSON.stringify({
    conversationId: String(envelope?.conversationId || ""),
    messageId: String(envelope?.messageId || ""),
    senderUserId: Number(envelope?.senderUserId || 0),
    senderDeviceId: String(envelope?.senderDeviceId || ""),
    ciphertext: String(envelope?.ciphertext || ""),
    nonce: String(envelope?.nonce || ""),
    aad: String(envelope?.aad || ""),
    tag: String(envelope?.tag || "")
  }), "utf8");
}

export function signDeviceBundle(bundle, signingPrivateKey) {
  return sign(null, buildDeviceBundlePayload(bundle), createPrivateKey(signingPrivateKey)).toString("base64");
}

export function verifyDeviceBundleSignature(bundle) {
  const signature = String(bundle?.bundleSignature || "");
  const signingPublicKey = String(bundle?.signingPublicKey || "");

  if (!signature || !signingPublicKey) {
    return false;
  }

  try {
    return verify(
      null,
      buildDeviceBundlePayload(bundle),
      createPublicKey(signingPublicKey),
      Buffer.from(signature, "base64")
    );
  } catch {
    return false;
  }
}

// Device Transfer Encryption

/**
 * Encrypt an arbitrary payload (Buffer or string) for a specific X25519 recipient
 * device public key using the same X25519-ECDH + HKDF-SHA256 + AES-256-GCM scheme
 * as conversation-key wrapping, but for larger payloads such as device transfer packages.
 *
 * The info string `chatapp/device-transfer/v1` domain-separates this from key wrapping
 * so a ciphertext from one context cannot be replayed into the other.
 */
export function encryptForRecipientDevice({ payload, recipientPublicKey }) {
  const payloadBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), "utf8");
  const ephemeral = generateKeyPairSync("x25519");
  const sharedSecret = diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: createPublicKey(recipientPublicKey)
  });
  const aesKey = deriveAesKey(sharedSecret, "chatapp/device-transfer/v1");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(payloadBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    algorithm: "x25519-aes-256-gcm",
    ephemeralPublicKey: ephemeral.publicKey.export({ type: "spki", format: "pem" }),
    iv: toBase64(iv),
    tag: toBase64(tag),
    ciphertext: toBase64(ciphertext)
  };
}

/**
 * Decrypt a payload produced by `encryptForRecipientDevice` using the recipient
 * device's X25519 private key. Returns the raw decrypted Buffer.
 */
export function decryptFromSenderDevice({ encryptedPayload, recipientPrivateKey }) {
  const sharedSecret = diffieHellman({
    privateKey: createPrivateKey(recipientPrivateKey),
    publicKey: createPublicKey(encryptedPayload.ephemeralPublicKey)
  });
  const aesKey = deriveAesKey(sharedSecret, "chatapp/device-transfer/v1");
  const decipher = createDecipheriv("aes-256-gcm", aesKey, fromBase64(encryptedPayload.iv));
  decipher.setAuthTag(fromBase64(encryptedPayload.tag));

  return Buffer.concat([
    decipher.update(fromBase64(encryptedPayload.ciphertext)),
    decipher.final()
  ]);
}

/**
 * Sign a JSON-serialisable value with an Ed25519 device signing key.
 * Canonical form: `JSON.stringify(payload)` - callers must not mutate the object
 * between sign and verify calls or the signature will not match.
 */
export function signJsonPayload(payload, signingPrivateKey) {
  return sign(
    null,
    Buffer.from(JSON.stringify(payload), "utf8"),
    createPrivateKey(signingPrivateKey)
  ).toString("base64");
}

/**
 * Verify a signature produced by `signJsonPayload`. Returns `false` on any
 * verification failure rather than throwing, so callers can decide how to handle it.
 */
export function verifyJsonPayload(payload, signingPublicKey, signature) {
  if (!signingPublicKey || !signature) {
    return false;
  }

  try {
    return verify(
      null,
      Buffer.from(JSON.stringify(payload), "utf8"),
      createPublicKey(signingPublicKey),
      Buffer.from(signature, "base64")
    );
  } catch {
    return false;
  }
}

// Symmetric Ratchet (KDF Chain)

/**
 * Maximum number of out-of-order message keys to store per sender chain.
 * Matches Signal's default. Prevents unbounded memory growth from pathological gaps.
 */
export const MAX_RATCHET_SKIP = 2000;

/**
 * Derive a short chain-epoch identifier from the conversation key and sender device ID.
 *
 * The epoch ID changes whenever the conversation key rotates, which lets receivers
 * automatically discover that a fresh receiving chain must be initialised from the
 * new key - without any extra signalling from the sender.
 */
export function deriveChainId(conversationKey, senderDeviceId) {
  return createHash("sha256")
    .update(`${String(conversationKey)}:${String(senderDeviceId)}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Derive the seed (first chain key) for a sender's KDF chain.
 *
 * Each sender device gets a unique chain from the same conversation key, preventing
 * cross-device chain confusion in multi-device and group scenarios.
 */
export function deriveInitialChainKey(conversationKey, senderDeviceId) {
  return toBase64(deriveAesKey(
    fromBase64(conversationKey),
    `chatapp/ratchet/chain-init/v1:${String(senderDeviceId)}`
  ));
}

/**
 * Advance the KDF chain one step and return a single-use message key.
 *
 * Security contract for callers:
 *   1. Replace the stored chain key with `nextChainKey` immediately after this call.
 *   2. Use `messageKey` only for the single encrypt or decrypt operation.
 *   3. Do NOT persist `messageKey` anywhere after the operation.
 *
 * The one-way HKDF means knowledge of `nextChainKey` reveals nothing about
 * `messageKey`, and knowledge of any message key reveals nothing about earlier keys.
 * Combined with manual conversation-key rotation, this gives both forward secrecy
 * (old keys are gone) and post-compromise recovery (rotation resets all chains).
 */
export function advanceChainStep(chainKey) {
  const ck = fromBase64(chainKey);
  return {
    nextChainKey: toBase64(deriveAesKey(ck, "chatapp/ratchet/chain-step/v1")),
    messageKey:   toBase64(deriveAesKey(ck, "chatapp/ratchet/msg-step/v1"))
  };
}

export function signMessageEnvelope(envelope, signingPrivateKey) {
  return sign(null, canonicalizeEnvelope(envelope), createPrivateKey(signingPrivateKey)).toString("base64");
}

export function verifyMessageEnvelopeSignature(envelope, signingPublicKey, signature) {
  if (!signingPublicKey || !signature) {
    return false;
  }

  try {
    return verify(
      null,
      canonicalizeEnvelope(envelope),
      createPublicKey(signingPublicKey),
      Buffer.from(signature, "base64")
    );
  } catch {
    return false;
  }
}
