import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { readSecureDmStore, writeSecureDmStore } from "../src/main/dm/storage.js";
import { activateDmTestEnvironment, cleanupDmTestEnvironments, createDmTestEnvironment } from "./dm-test-helpers.mjs";

const roundTripEnv = createDmTestEnvironment("dm-storage-roundtrip");
const corruptPayloadEnv = createDmTestEnvironment("dm-storage-corrupt-payload");
const corruptMasterKeyEnv = createDmTestEnvironment("dm-storage-corrupt-master");
const migrationEnv = createDmTestEnvironment("dm-storage-migration");

try {
  activateDmTestEnvironment(roundTripEnv);
  const roundTripStore = {
    version: 1,
    users: {
      "1": {
        device: {
          deviceId: "device_roundtrip"
        },
        conversations: {}
      }
    }
  };
  writeSecureDmStore(roundTripStore);
  assert.deepEqual(readSecureDmStore(), roundTripStore);

  const stableRoundTripDir = path.join(roundTripEnv.appDataRoot, "Chatapp", "secure-dm");
  assert.equal(fs.existsSync(path.join(stableRoundTripDir, "store.json.enc")), true);
  assert.equal(fs.existsSync(path.join(stableRoundTripDir, "store.json.enc.tmp")), false);

  activateDmTestEnvironment(corruptPayloadEnv);
  writeSecureDmStore({
    version: 1,
    users: {
      "2": {
        device: {
          deviceId: "device_corrupt_payload"
        },
        conversations: {}
      }
    }
  });
  const corruptPayloadDir = path.join(corruptPayloadEnv.appDataRoot, "Chatapp", "secure-dm");
  fs.writeFileSync(path.join(corruptPayloadDir, "store.json.enc"), "{\"iv\":\"bad\",\"tag\":\"bad\",\"ciphertext\":\"bad\"}", "utf8");
  assert.deepEqual(readSecureDmStore(), {
    version: 1,
    users: {}
  });
  assert.equal(
    fs.readdirSync(corruptPayloadDir).some((entry) => entry.startsWith("store.json.enc.corrupt-")),
    true
  );

  activateDmTestEnvironment(corruptMasterKeyEnv);
  writeSecureDmStore({
    version: 1,
    users: {
      "3": {
        device: {
          deviceId: "device_corrupt_master"
        },
        conversations: {}
      }
    }
  });
  const corruptMasterDir = path.join(corruptMasterKeyEnv.appDataRoot, "Chatapp", "secure-dm");
  fs.writeFileSync(path.join(corruptMasterDir, "master-key.bin"), Buffer.from("not-encrypted", "utf8"));
  assert.deepEqual(readSecureDmStore(), {
    version: 1,
    users: {}
  });
  assert.equal(
    fs.readdirSync(corruptMasterDir).some((entry) => entry.startsWith("master-key.bin.corrupt-")),
    true
  );
  assert.equal(fs.existsSync(path.join(corruptMasterDir, "master-key.bin")), true);

  activateDmTestEnvironment(migrationEnv);
  const legacyDir = path.join(migrationEnv.userDataRoot, "secure-dm");
  const migratedStore = {
    version: 1,
    users: {
      "4": {
        device: {
          deviceId: "device_migration"
        },
        conversations: {}
      }
    }
  };
  writeSecureDmStore(migratedStore);
  const stableMigrationDir = path.join(migrationEnv.appDataRoot, "Chatapp", "secure-dm");
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.copyFileSync(path.join(stableMigrationDir, "master-key.bin"), path.join(legacyDir, "master-key.bin"));
  fs.copyFileSync(path.join(stableMigrationDir, "store.json.enc"), path.join(legacyDir, "store.json.enc"));
  fs.rmSync(path.join(migrationEnv.appDataRoot, "Chatapp"), { recursive: true, force: true });

  assert.deepEqual(readSecureDmStore(), migratedStore);
  const migratedStableDir = path.join(migrationEnv.appDataRoot, "Chatapp", "secure-dm");
  assert.equal(fs.existsSync(path.join(migratedStableDir, "master-key.bin")), true);
  assert.equal(fs.existsSync(path.join(migratedStableDir, "store.json.enc")), true);
} finally {
  cleanupDmTestEnvironments(roundTripEnv, corruptPayloadEnv, corruptMasterKeyEnv, migrationEnv);
}

console.log("dm-storage-security.test.mjs: ok");
