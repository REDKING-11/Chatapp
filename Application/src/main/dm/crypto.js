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
  randomUUID
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
