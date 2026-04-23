import assert from "node:assert/strict";
import {
  deriveShareStatus,
  normalizeShareRegistry,
  resetFileShare,
  resolveFileShareForRequest,
  syncFileShareSelection
} from "../src/main/transfers/shareRegistryCore.js";

let nextId = 1;

function createShareId() {
  const value = `share_${nextId}`;
  nextId += 1;
  return value;
}

const initialRegistry = normalizeShareRegistry({ shares: [] });

const created = syncFileShareSelection({
  registry: initialRegistry,
  filePath: "C:/Temp/demo.txt",
  fileName: "demo.txt",
  mimeType: "text/plain",
  fileSize: 120,
  modifiedMs: 1000,
  now: "2026-04-23T10:00:00.000Z",
  createShareId
});

assert.equal(created.action, "created");
assert.equal(created.share.shareId, "share_1");
assert.equal(deriveShareStatus(created.share), "active");

const reused = syncFileShareSelection({
  registry: created.registry,
  filePath: "C:/Temp/demo.txt",
  fileName: "demo.txt",
  mimeType: "text/plain",
  fileSize: 120,
  modifiedMs: 1000,
  now: "2026-04-23T10:05:00.000Z",
  createShareId
});

assert.equal(reused.action, "reused");
assert.equal(reused.share.shareId, "share_1");

const rotated = syncFileShareSelection({
  registry: reused.registry,
  filePath: "C:/Temp/demo.txt",
  fileName: "demo.txt",
  mimeType: "text/plain",
  fileSize: 180,
  modifiedMs: 2000,
  now: "2026-04-23T10:10:00.000Z",
  createShareId
});

assert.equal(rotated.action, "rotated");
assert.equal(rotated.share.shareId, "share_2");
assert.equal(rotated.registry.shares.find((entry) => entry.shareId === "share_1")?.replacedByShareId, "share_2");

const replacedRequest = resolveFileShareForRequest({
  registry: rotated.registry,
  shareId: "share_1",
  snapshot: {
    exists: true,
    fileName: "demo.txt",
    mimeType: "text/plain",
    fileSize: 180,
    modifiedMs: 2000
  },
  now: "2026-04-23T10:12:00.000Z",
  createShareId
});

assert.equal(replacedRequest.ok, false);
assert.equal(replacedRequest.errorCode, "share-replaced");
assert.equal(replacedRequest.replacementShareId, "share_2");

const missingRequest = resolveFileShareForRequest({
  registry: rotated.registry,
  shareId: "share_2",
  snapshot: {
    exists: false
  },
  now: "2026-04-23T10:15:00.000Z",
  createShareId
});

assert.equal(missingRequest.ok, false);
assert.equal(missingRequest.errorCode, "share-missing");
assert.equal(deriveShareStatus(missingRequest.share), "missing");

const resetResult = resetFileShare({
  registry: rotated.registry,
  shareId: "share_2",
  snapshot: {
    exists: true,
    fileName: "demo.txt",
    mimeType: "text/plain",
    fileSize: 180,
    modifiedMs: 2000
  },
  now: "2026-04-23T10:20:00.000Z",
  createShareId
});

assert.equal(resetResult.replacementShare.shareId, "share_3");
assert.equal(resetResult.share.replacedByShareId, "share_3");

console.log("file-share-registry.test.mjs: ok");
