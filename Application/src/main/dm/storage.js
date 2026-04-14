import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// DM secrets are only allowed to persist inside this encrypted store.
// Do not duplicate DM key material or decrypted conversation data into logs,
// localStorage, plain JSON files, exports, or any other weaker storage path.
const STORE_DIR = path.join(app.getPath("userData"), "secure-dm");
const MASTER_KEY_PATH = path.join(STORE_DIR, "master-key.bin");
const STORE_PATH = path.join(STORE_DIR, "store.json.enc");

function ensureDir() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
}

function encryptJson(payload, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

function decryptJson(payload, key) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final()
  ]);

  return JSON.parse(plaintext.toString("utf8"));
}

function getMasterKey() {
  ensureDir();

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS-backed secure storage is not available for local DM encryption");
  }

  if (fs.existsSync(MASTER_KEY_PATH)) {
    return safeStorage.decryptString(fs.readFileSync(MASTER_KEY_PATH));
  }

  const key = randomBytes(32).toString("base64");
  fs.writeFileSync(MASTER_KEY_PATH, safeStorage.encryptString(key));
  return key;
}

function writeEncryptedStoreFile(store, masterKey) {
  const encryptedPayload = JSON.stringify(encryptJson(store, masterKey), null, 2);
  const tempPath = `${STORE_PATH}.tmp`;

  fs.writeFileSync(tempPath, encryptedPayload, "utf8");
  fs.renameSync(tempPath, STORE_PATH);
}

export function readSecureDmStore() {
  ensureDir();
  const masterKey = Buffer.from(getMasterKey(), "base64");

  if (!fs.existsSync(STORE_PATH)) {
    return {
      version: 1,
      users: {}
    };
  }

  return decryptJson(JSON.parse(fs.readFileSync(STORE_PATH, "utf8")), masterKey);
}

export function writeSecureDmStore(store) {
  ensureDir();
  const masterKey = Buffer.from(getMasterKey(), "base64");
  writeEncryptedStoreFile(store, masterKey);
}
