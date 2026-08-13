import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { __setStoragePathTestDependencies } from "../src/main/storagePaths.js";
import { __setSecureDmStorageTestDependencies } from "../src/main/dm/storage.js";
import {
  __resetTransferServiceTestState,
  __setTransferServiceTestDependencies
} from "../src/main/transfers/service.js";
import { __resetSecureDmServiceTestState } from "../src/main/dm/service.js";

const fakeSafeStorage = {
  isEncryptionAvailable() {
    return true;
  },
  encryptString(value) {
    return Buffer.from(`enc:${String(value)}`, "utf8");
  },
  decryptString(value) {
    const normalized = Buffer.from(value).toString("utf8");

    if (!normalized.startsWith("enc:")) {
      throw new Error("Unable to decrypt test secure storage payload");
    }

    return normalized.slice(4);
  }
};

export function createDmTestEnvironment(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `chatapp-${label}-`));

  return {
    root,
    appDataRoot: path.join(root, "app-data"),
    userDataRoot: path.join(root, "user-data"),
    downloadsRoot: path.join(root, "downloads")
  };
}

export function activateDmTestEnvironment(environment) {
  fs.mkdirSync(environment.appDataRoot, { recursive: true });
  fs.mkdirSync(environment.userDataRoot, { recursive: true });
  fs.mkdirSync(environment.downloadsRoot, { recursive: true });

  __setStoragePathTestDependencies({
    appDataRoot: environment.appDataRoot,
    userDataRoot: environment.userDataRoot
  });
  __setSecureDmStorageTestDependencies({
    safeStorage: fakeSafeStorage
  });
  __setTransferServiceTestDependencies({
    userDataRoot: environment.userDataRoot,
    downloadsRoot: environment.downloadsRoot
  });
  __resetTransferServiceTestState();
  __resetSecureDmServiceTestState();
}

export function cleanupDmTestEnvironments(...environments) {
  __setTransferServiceTestDependencies(null);
  __setSecureDmStorageTestDependencies(null);
  __setStoragePathTestDependencies(null);
  __resetTransferServiceTestState();
  __resetSecureDmServiceTestState();

  environments.filter(Boolean).forEach((environment) => {
    try {
      fs.rmSync(environment.root, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup for tests only.
    }
  });
}

export function tamperBase64(value) {
  const input = String(value || "");

  if (!input) {
    return input;
  }

  const replacement = input[0] === "A" ? "B" : "A";
  return `${replacement}${input.slice(1)}`;
}
