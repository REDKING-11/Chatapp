import fs from "node:fs";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import electron from "electron";
import { copyStorageFiles, listStoragePathCandidates } from "../storagePaths.js";

const SECURE_DM_FILE_NAMES = Object.freeze([
  "master-key.bin",
  "store.json.enc"
]);
const { safeStorage } = electron || {};
let secureDmStorageDependencies = null;

function createDefaultSecureDmStorageDependencies() {
  function getSafeStorage() {
    if (!safeStorage) {
      throw new Error("Electron safeStorage is not available for secure DM storage");
    }

    return safeStorage;
  }

  return {
    safeStorage: {
      isEncryptionAvailable() {
        return getSafeStorage().isEncryptionAvailable();
      },
      encryptString(value) {
        return getSafeStorage().encryptString(value);
      },
      decryptString(value) {
        return getSafeStorage().decryptString(value);
      }
    }
  };
}

function getSecureDmStorageDependencies() {
  return secureDmStorageDependencies || (secureDmStorageDependencies = createDefaultSecureDmStorageDependencies());
}

function getDmStoreCandidates() {
  return listStoragePathCandidates("secure-dm", SECURE_DM_FILE_NAMES);
}

function getStableDmStoreCandidate() {
  return getDmStoreCandidates()[0];
}

function ensureDir(dirPath = getStableDmStoreCandidate().storeDir) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function hasExistingFiles(filePaths) {
  return filePaths.some((filePath) => fs.existsSync(filePath));
}

function quarantineStoreFiles(filePaths) {
  const suffix = `.corrupt-${Date.now()}`;

  filePaths.forEach((filePath) => {
    if (!fs.existsSync(filePath)) {
      return;
    }

    try {
      fs.renameSync(filePath, `${filePath}${suffix}`);
    } catch {
      // Best-effort quarantine only.
    }
  });
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

function assertSecureStorageAvailable() {
  if (!getSecureDmStorageDependencies().safeStorage.isEncryptionAvailable()) {
    throw new Error("OS-backed secure storage is not available for local DM encryption");
  }
}

function readStoredMasterKey(masterKeyPath) {
  const key = getSecureDmStorageDependencies().safeStorage.decryptString(fs.readFileSync(masterKeyPath));
  const normalizedKey = String(key || "").trim();

  if (!normalizedKey) {
    throw new Error("Stored secure DM master key is empty.");
  }

  return normalizedKey;
}

function validateDmStoreCandidate(candidate) {
  const [masterKeyPath, storePath] = candidate.filePaths;

  if (!hasExistingFiles(candidate.filePaths)) {
    return false;
  }

  assertSecureStorageAvailable();

  if (!fs.existsSync(masterKeyPath)) {
    throw new Error("Secure DM master key is missing.");
  }

  const masterKey = readStoredMasterKey(masterKeyPath);

  if (fs.existsSync(storePath)) {
    decryptJson(JSON.parse(fs.readFileSync(storePath, "utf8")), Buffer.from(masterKey, "base64"));
  }

  return true;
}

function getDmStorePaths() {
  const [stableCandidate, ...legacyCandidates] = getDmStoreCandidates();
  ensureDir(stableCandidate.storeDir);
  let stableError = null;

  try {
    if (validateDmStoreCandidate(stableCandidate)) {
      return {
        storeDir: stableCandidate.storeDir,
        masterKeyPath: stableCandidate.filePaths[0],
        storePath: stableCandidate.filePaths[1]
      };
    }
  } catch (error) {
    stableError = error;
  }

  for (const legacyCandidate of legacyCandidates) {
    try {
      if (!validateDmStoreCandidate(legacyCandidate)) {
        continue;
      }

      copyStorageFiles(legacyCandidate.filePaths, stableCandidate.filePaths, {
        overwrite: true
      });

      return {
        storeDir: stableCandidate.storeDir,
        masterKeyPath: stableCandidate.filePaths[0],
        storePath: stableCandidate.filePaths[1]
      };
    } catch {
      // Keep looking for the first readable legacy candidate.
    }
  }

  if (stableError) {
    console.warn("Secure DM store is unreadable. Quarantining the local secure DM files.", stableError);
    quarantineStoreFiles(stableCandidate.filePaths);
  }

  return {
    storeDir: stableCandidate.storeDir,
    masterKeyPath: stableCandidate.filePaths[0],
    storePath: stableCandidate.filePaths[1]
  };
}

function getMasterKey() {
  const { masterKeyPath, storePath, storeDir } = getDmStorePaths();
  ensureDir(storeDir);
  assertSecureStorageAvailable();

  if (fs.existsSync(masterKeyPath)) {
    try {
      return readStoredMasterKey(masterKeyPath);
    } catch (error) {
      console.warn("Stored secure DM master key could not be decrypted. Quarantining the local secure DM files.", error);
      quarantineStoreFiles([masterKeyPath, storePath]);
    }
  }

  const key = randomBytes(32).toString("base64");
  fs.writeFileSync(masterKeyPath, getSecureDmStorageDependencies().safeStorage.encryptString(key));
  return key;
}

function writeEncryptedStoreFile(store, masterKey) {
  const { storePath } = getDmStorePaths();
  const encryptedPayload = JSON.stringify(encryptJson(store, masterKey), null, 2);
  const tempPath = `${storePath}.tmp`;

  fs.writeFileSync(tempPath, encryptedPayload, "utf8");
  fs.renameSync(tempPath, storePath);
}

function createEmptySecureDmStore() {
  return {
    version: 1,
    users: {}
  };
}

export function readSecureDmStore() {
  const { storeDir, storePath } = getDmStorePaths();
  ensureDir(storeDir);
  const masterKey = Buffer.from(getMasterKey(), "base64");

  if (!fs.existsSync(storePath)) {
    return createEmptySecureDmStore();
  }

  try {
    return decryptJson(JSON.parse(fs.readFileSync(storePath, "utf8")), masterKey);
  } catch (error) {
    console.warn("Secure DM store payload is unreadable. Quarantining the local secure DM store file.", error);
    quarantineStoreFiles([storePath]);
    return createEmptySecureDmStore();
  }
}

export function writeSecureDmStore(store) {
  const { storeDir } = getDmStorePaths();
  ensureDir(storeDir);
  const masterKey = Buffer.from(getMasterKey(), "base64");
  writeEncryptedStoreFile(store, masterKey);
}

export function __setSecureDmStorageTestDependencies(dependencies = null) {
  secureDmStorageDependencies = dependencies
    ? {
        safeStorage: {
          isEncryptionAvailable: dependencies.safeStorage?.isEncryptionAvailable || (() => true),
          encryptString: dependencies.safeStorage?.encryptString || ((value) => Buffer.from(String(value), "utf8")),
          decryptString: dependencies.safeStorage?.decryptString || ((value) => Buffer.from(value).toString("utf8"))
        }
      }
    : null;
}
