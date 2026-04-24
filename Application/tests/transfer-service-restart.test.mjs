import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { __setStoragePathTestDependencies } from "../src/main/storagePaths.js";
import {
  __resetTransferServiceTestState,
  __setTransferServiceTestDependencies,
  createOrReuseFileShare,
  prepareOutgoingFileShareDownload
} from "../src/main/transfers/service.js";
import { createDmTestEnvironment, cleanupDmTestEnvironments } from "./dm-test-helpers.mjs";

const environment = createDmTestEnvironment("transfer-restart");
const secondUserDataRoot = path.join(environment.root, "user-data-second");

try {
  fs.mkdirSync(environment.appDataRoot, { recursive: true });
  fs.mkdirSync(environment.userDataRoot, { recursive: true });
  fs.mkdirSync(environment.downloadsRoot, { recursive: true });
  fs.mkdirSync(secondUserDataRoot, { recursive: true });

  __setStoragePathTestDependencies({
    appDataRoot: environment.appDataRoot,
    userDataRoot: environment.userDataRoot
  });
  __setTransferServiceTestDependencies({
    userDataRoot: environment.userDataRoot,
    downloadsRoot: environment.downloadsRoot
  });
  __resetTransferServiceTestState();

  const sharedFilePath = path.join(environment.root, "demo.txt");
  fs.writeFileSync(sharedFilePath, "hello from share", "utf8");

  const shared = createOrReuseFileShare({
    filePath: sharedFilePath,
    fileName: "demo.txt",
    mimeType: "text/plain"
  });

  __setStoragePathTestDependencies({
    appDataRoot: environment.appDataRoot,
    userDataRoot: secondUserDataRoot
  });
  __setTransferServiceTestDependencies({
    userDataRoot: secondUserDataRoot,
    downloadsRoot: environment.downloadsRoot
  });
  __resetTransferServiceTestState();

  const prepared = prepareOutgoingFileShareDownload({
    shareId: shared.shareId
  });

  assert.equal(prepared.share.shareId, shared.shareId);
  assert.equal(prepared.attachment.shareId, shared.shareId);
  assert.equal(prepared.attachment.fileName, "demo.txt");
  assert.ok(String(prepared.attachment.transferId || "").startsWith("file_"));

  fs.unlinkSync(sharedFilePath);
  __resetTransferServiceTestState();

  assert.throws(
    () => prepareOutgoingFileShareDownload({
      shareId: shared.shareId
    }),
    (error) => error?.code === "share-missing"
  );

  console.log("transfer-service-restart.test.mjs: ok");
} finally {
  __setTransferServiceTestDependencies(null);
  __setStoragePathTestDependencies(null);
  __resetTransferServiceTestState();
  cleanupDmTestEnvironments(environment);
}
