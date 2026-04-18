import assert from "node:assert/strict";
import {
  canReadConversationLocally,
  deriveConversationAccessFromMetadata
} from "../src/features/dm/conversationAccess.js";
import {
  createPendingDeliveryStateQueue,
  flushPendingDeliveryStateQueue
} from "../src/features/dm/pendingDeliveryStateQueue.js";
import { createBackgroundConversationImportTracker } from "../src/features/dm/backgroundConversationImportTracker.js";

assert.deepEqual(
  deriveConversationAccessFromMetadata({
    conversationId: "missing",
    conversation: null,
    deviceId: "device-a"
  }),
  {
    conversationId: "missing",
    status: "missing-local",
    hasConversation: false,
    hasWrappedKey: false,
    hasConversationKey: false
  }
);

const readableMissingWrappedKey = deriveConversationAccessFromMetadata({
  conversationId: "wrapped-missing",
  deviceId: "device-a",
  conversation: {
    conversationId: "wrapped-missing",
    conversationKey: "local-key",
    wrappedKeys: []
  }
});

assert.equal(readableMissingWrappedKey.status, "missing-key");
assert.equal(readableMissingWrappedKey.hasWrappedKey, false);
assert.equal(readableMissingWrappedKey.hasConversationKey, true);
assert.equal(canReadConversationLocally(readableMissingWrappedKey), true);

const unreadableMissingKey = deriveConversationAccessFromMetadata({
  conversationId: "key-missing",
  deviceId: "device-a",
  conversation: {
    conversationId: "key-missing",
    conversationKey: null,
    wrappedKeys: [{ deviceId: "device-a" }]
  }
});

assert.equal(unreadableMissingKey.status, "missing-key");
assert.equal(canReadConversationLocally(unreadableMissingKey), false);

assert.deepEqual(
  deriveConversationAccessFromMetadata({
    conversationId: "ready",
    deviceId: "device-a",
    conversation: {
      conversationId: "ready",
      conversationKey: "local-key",
      wrappedKeys: [{ deviceId: "device-a" }]
    }
  }),
  {
    conversationId: "ready",
    status: "ready",
    hasConversation: true,
    hasWrappedKey: true,
    hasConversationKey: true
  }
);

const pendingQueue = createPendingDeliveryStateQueue();
pendingQueue.enqueue({
  conversationId: "42",
  messageId: "m-1",
  deliveryState: "queued"
});
pendingQueue.enqueue({
  conversationId: "42",
  messageId: "m-2",
  deliveryState: "failed"
});

const flushedEntries = [];
const flushResult = await flushPendingDeliveryStateQueue(pendingQueue, {
  conversationId: "42",
  persist: async (entry) => {
    flushedEntries.push(entry);
    return { ok: true };
  }
});

assert.equal(flushResult.flushedCount, 2);
assert.equal(flushResult.remainingCount, 0);
assert.deepEqual(flushedEntries, [
  {
    conversationId: "42",
    messageId: "m-1",
    deliveryState: "queued"
  },
  {
    conversationId: "42",
    messageId: "m-2",
    deliveryState: "failed"
  }
]);
assert.deepEqual(pendingQueue.list("42"), []);

const importTracker = createBackgroundConversationImportTracker();
let importCount = 0;

const [firstImport, secondImport] = await Promise.all([
  importTracker.run("42", async () => {
    importCount += 1;
    await Promise.resolve();
    return { repaired: true };
  }),
  importTracker.run("42", async () => {
    importCount += 1;
    return { repaired: false };
  })
]);

assert.equal(importCount, 1);
assert.deepEqual(firstImport, { repaired: true });
assert.deepEqual(secondImport, { repaired: true });
assert.equal(importTracker.has("42"), false);

await importTracker.run("42", async () => {
  importCount += 1;
  return { repaired: true };
});
assert.equal(importCount, 2);

console.log("dm-local-access.test.mjs: ok");
