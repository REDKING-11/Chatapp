const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createDmDeliveryUpdatePayload,
  createDmQueuedPayload,
  notifyRelayConsumption
} = require("./delivery");

test("mixed live and relay delivery preserves live delivery count", () => {
  assert.deepEqual(
    createDmQueuedPayload({
      messageId: "dmmsg-1",
      deliveredRecipientCount: 1,
      offlineRecipients: ["device-b"],
      droppedRecipients: [],
      rejectedRecipients: []
    }),
    {
      type: "dm:queued",
      messageId: "dmmsg-1",
      deliveredRecipientCount: 1,
      offlineRecipients: ["device-b"],
      droppedRecipients: [],
      rejectedRecipients: []
    }
  );
});

test("relay-only delivery keeps deliveredRecipientCount at zero", () => {
  assert.equal(
    createDmQueuedPayload({
      messageId: "dmmsg-2",
      deliveredRecipientCount: 0,
      offlineRecipients: ["device-c"]
    }).deliveredRecipientCount,
    0
  );
});

test("dropped delivery still serializes dropped recipients", () => {
  assert.deepEqual(
    createDmQueuedPayload({
      messageId: "dmmsg-3",
      deliveredRecipientCount: 0,
      droppedRecipients: ["device-d"]
    }),
    {
      type: "dm:queued",
      messageId: "dmmsg-3",
      deliveredRecipientCount: 0,
      offlineRecipients: [],
      droppedRecipients: ["device-d"],
      rejectedRecipients: []
    }
  );
});

test("delivery update payload marks consumed relay as sent", () => {
  assert.deepEqual(
    createDmDeliveryUpdatePayload({
      messageId: "dmmsg-4",
      conversationId: "44",
      recipientDeviceId: "device-r"
    }),
    {
      type: "dm:delivery-update",
      messageId: "dmmsg-4",
      conversationId: "44",
      deliveryState: "sent",
      recipientDeviceId: "device-r"
    }
  );
});

test("notifyRelayConsumption sends sender update when sender device is online", () => {
  const sentPayloads = [];
  const senderWs = { id: "sender-ws" };
  const result = notifyRelayConsumption({
    onlineDevices: new Map([
      ["device-sender", { ws: senderWs }]
    ]),
    relayRow: {
      message_id: "dmmsg-5",
      conversation_id: 55,
      sender_device_id: "device-sender"
    },
    recipientDeviceId: "device-recipient",
    sendJson: (ws, payload) => {
      sentPayloads.push({ ws, payload });
    }
  });

  assert.equal(result.delivered, true);
  assert.equal(result.senderDeviceId, "device-sender");
  assert.deepEqual(sentPayloads, [
    {
      ws: senderWs,
      payload: {
        type: "dm:delivery-update",
        messageId: "dmmsg-5",
        conversationId: "55",
        deliveryState: "sent",
        recipientDeviceId: "device-recipient"
      }
    }
  ]);
});

test("notifyRelayConsumption skips sender update when sender device is offline", () => {
  const sentPayloads = [];
  const result = notifyRelayConsumption({
    onlineDevices: new Map(),
    relayRow: {
      message_id: "dmmsg-6",
      conversation_id: 66,
      sender_device_id: "device-sender"
    },
    recipientDeviceId: "device-recipient",
    sendJson: (_ws, payload) => {
      sentPayloads.push(payload);
    }
  });

  assert.equal(result.delivered, false);
  assert.deepEqual(sentPayloads, []);
});
