import assert from "node:assert/strict";
import {
  assertIncomingChunkLength,
  assertIncomingDownloadComplete,
  classifyIncomingChunkOffset
} from "../src/main/transfers/downloadIntegrity.js";

assert.deepEqual(
  classifyIncomingChunkOffset({
    bytesWritten: 0,
    offset: 0,
    nextOffset: 4
  }),
  {
    action: "write",
    offset: 0,
    nextOffset: 4,
    bytesWritten: 0
  }
);

assert.deepEqual(
  classifyIncomingChunkOffset({
    bytesWritten: 4,
    offset: 0,
    nextOffset: 4
  }),
  {
    action: "duplicate",
    offset: 0,
    nextOffset: 4,
    bytesWritten: 4
  }
);

assert.throws(
  () => classifyIncomingChunkOffset({
    bytesWritten: 0,
    offset: 4,
    nextOffset: 8
  }),
  /out of order/
);

assert.throws(
  () => classifyIncomingChunkOffset({
    bytesWritten: 4,
    offset: 2,
    nextOffset: 6
  }),
  /overlaps/
);

assert.equal(assertIncomingChunkLength({
  offset: 4,
  nextOffset: 8,
  byteLength: 4
}), true);

assert.throws(
  () => assertIncomingChunkLength({
    offset: 4,
    nextOffset: 8,
    byteLength: 2
  }),
  /length/
);

assert.equal(assertIncomingDownloadComplete({
  bytesWritten: 8,
  expectedBytes: 8
}), true);

assert.throws(
  () => assertIncomingDownloadComplete({
    bytesWritten: 4,
    expectedBytes: 8
  }),
  /expected size/
);

console.log("download-integrity.test.mjs: ok");
