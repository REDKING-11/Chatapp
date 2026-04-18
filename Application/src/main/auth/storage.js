import { app, safeStorage } from "electron";
import fs from "node:fs";
import { resolveStoragePaths } from "../storagePaths.js";

function getAuthStorePaths() {
  const { storeDir, filePaths } = resolveStoragePaths("secure-auth", ["auth-token.bin"]);

  return {
    storeDir,
    tokenPath: filePaths[0]
  };
}

function ensureDir() {
  fs.mkdirSync(getAuthStorePaths().storeDir, { recursive: true });
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

function removeFileIfPresent(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  try {
    fs.unlinkSync(filePath);
  } catch {
    // Best-effort cleanup only.
  }
}

export function readStoredAuthToken() {
  const { tokenPath } = getAuthStorePaths();
  ensureDir();

  if (!fs.existsSync(tokenPath)) {
    return null;
  }

  assertSecureStorageAvailable();

  try {
    const storedValue = fs.readFileSync(tokenPath);
    const token = safeStorage.decryptString(storedValue);
    const normalizedToken = String(token || "").trim();

    if (!normalizedToken) {
      removeFileIfPresent(tokenPath);
      return null;
    }

    return normalizedToken;
  } catch (error) {
    console.warn("Clearing unreadable stored auth token.", error);
    removeFileIfPresent(tokenPath);
    return null;
  }
}

export function writeStoredAuthToken(token) {
  const normalizedToken = String(token || "").trim();
  const { tokenPath } = getAuthStorePaths();

  if (!normalizedToken) {
    clearStoredAuthToken();
    return { ok: true, hasToken: false };
  }

  ensureDir();
  assertSecureStorageAvailable();
  writeFileAtomic(tokenPath, safeStorage.encryptString(normalizedToken));

  return { ok: true, hasToken: true };
}

export function clearStoredAuthToken() {
  const { tokenPath } = getAuthStorePaths();
  ensureDir();
  removeFileIfPresent(tokenPath);

  return { ok: true, hasToken: false };
}
