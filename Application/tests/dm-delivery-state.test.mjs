import assert from "node:assert/strict";
import {
  applyOutgoingDeliveryStateUpdate,
  indexOutgoingDeliveryStates,
  normalizeOutgoingDeliveryState,
  resolveOutgoingDeliveryStateFromRelayEvent
} from "../src/features/dm/deliveryState.js";

assert.equal(normalizeOutgoingDeliveryState("queued"), "queued");
assert.equal(normalizeOutgoingDeliveryState("unknown"), "sent");

assert.equal(
  resolveOutgoingDeliveryStateFromRelayEvent({
    deliveredRecipientCount: 1,
    offlineRecipients: ["device-b"],
    droppedRecipients: []
  }),
  "sent"
);

assert.equal(
  resolveOutgoingDeliveryStateFromRelayEvent({
    deliveredRecipientCount: 0,
    offlineRecipients: ["device-b"],
    droppedRecipients: []
  }),
  "queued"
);

assert.equal(
  resolveOutgoingDeliveryStateFromRelayEvent({
    deliveredRecipientCount: 0,
    offlineRecipients: [],
    droppedRecipients: ["device-b"]
  }),
  "failed"
);

assert.equal(
  resolveOutgoingDeliveryStateFromRelayEvent({
    deliveredRecipientCount: 0,
    offlineRecipients: [],
    droppedRecipients: [],
    rejectedRecipients: ["device-b"]
  }),
  "failed"
);

assert.deepEqual(
  indexOutgoingDeliveryStates([
    { messageId: "a", direction: "outgoing", deliveryState: "queued" },
    { messageId: "b", direction: "incoming", deliveryState: "failed" },
    { messageId: "c", direction: "outgoing", deliveryState: "unknown" }
  ]),
  {
    a: "queued",
    c: "sent"
  }
);

assert.deepEqual(
  applyOutgoingDeliveryStateUpdate(
    { "dmmsg-1": "queued" },
    { messageId: "dmmsg-1", deliveryState: "sent" }
  ),
  { "dmmsg-1": "sent" }
);

assert.deepEqual(
  indexOutgoingDeliveryStates([
    { messageId: "dmmsg-1", direction: "outgoing", deliveryState: "sent" }
  ]),
  { "dmmsg-1": "sent" }
);

console.log("dm-delivery-state.test.mjs: ok");
