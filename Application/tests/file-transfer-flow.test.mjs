import assert from "node:assert/strict";
import {
  createFileChunkAckCoordinator,
  createSharedChunkThrottle,
  sendFileChunkWithAck
} from "../src/features/dm/fileTransferFlow.js";

const coordinator = createFileChunkAckCoordinator();
const ackPromise = coordinator.waitForAck({
  transferId: "transfer_a",
  shareId: "share_a",
  offset: 0,
  nextOffset: 65536
});

assert.equal(coordinator.resolveAck({
  transferId: "transfer_a",
  shareId: "share_a",
  offset: 65536,
  nextOffset: 131072
}), false);

assert.equal(coordinator.resolveAck({
  transferId: "transfer_a",
  shareId: "share_a",
  offset: 0,
  nextOffset: 65536
}), true);

assert.deepEqual(await ackPromise, {
  transferId: "transfer_a",
  shareId: "share_a",
  offset: 0,
  nextOffset: 65536
});

await assert.rejects(
  createFileChunkAckCoordinator().waitForAck({
    transferId: "transfer_timeout",
    offset: 0,
    nextOffset: 1
  }, { timeoutMs: 0 }),
  /Timed out/
);

let retrySends = 0;
let retryWaits = 0;
const retryResult = await sendFileChunkWithAck({
  chunk: {
    transferId: "transfer_retry",
    offset: 0,
    nextOffset: 65536
  },
  waitForThrottle: async () => {},
  sendChunk: async () => {
    retrySends += 1;
  },
  waitForAck: async () => {
    retryWaits += 1;

    if (retryWaits < 3) {
      throw new Error("ack timeout");
    }

    return { ok: true };
  },
  maxRetries: 3
});

assert.deepEqual(retryResult, { ok: true });
assert.equal(retrySends, 3);

let failedSends = 0;
await assert.rejects(
  sendFileChunkWithAck({
    chunk: {
      transferId: "transfer_fail",
      offset: 0,
      nextOffset: 65536
    },
    waitForThrottle: async () => {},
    sendChunk: async () => {
      failedSends += 1;
    },
    waitForAck: async () => {
      throw new Error("ack timeout");
    },
    maxRetries: 3
  }),
  /ack timeout/
);
assert.equal(failedSends, 4);

let now = 1000;
const waits = [];
const throttle = createSharedChunkThrottle({
  minimumDelayMs: 250,
  now: () => now,
  delay: async (ms) => {
    waits.push(ms);
    now += ms;
  }
});

await throttle.waitTurn();
await throttle.waitTurn();
assert.deepEqual(waits, [250]);

console.log("file-transfer-flow.test.mjs: ok");
