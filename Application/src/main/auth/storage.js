import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

const STORE_DIR = path.join(app.getPath("userData"), "secure-auth");
const TOKEN_PATH = path.join(STORE_DIR, "auth-token.bin");

function ensureDir() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
}

function assertSecureStorageAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS-backed secure storage is not available for auth token storage");
  }
}

function writeFileAtomic(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, data);
  fs.renameSync(tempPath, filePath);
}

export function readStoredAuthToken() {
  ensureDir();

  if (!fs.existsSync(TOKEN_PATH)) {
    return null;
  }

  assertSecureStorageAvailable();
  return safeStorage.decryptString(fs.readFileSync(TOKEN_PATH));
}

export function writeStoredAuthToken(token) {
  const normalizedToken = String(token || "").trim();

  if (!normalizedToken) {
    clearStoredAuthToken();
    return { ok: true, hasToken: false };
  }

  ensureDir();
  assertSecureStorageAvailable();
  writeFileAtomic(TOKEN_PATH, safeStorage.encryptString(normalizedToken));

  return { ok: true, hasToken: true };
}

export function clearStoredAuthToken() {
  ensureDir();

  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }

  return { ok: true, hasToken: false };
}
