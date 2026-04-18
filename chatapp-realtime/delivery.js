function normalizeRecipientList(value) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  ];
}

function createDmQueuedPayload({
  messageId,
  deliveredRecipientCount = 0,
  offlineRecipients = [],
  droppedRecipients = [],
  rejectedRecipients = []
}) {
  return {
    type: "dm:queued",
    messageId: String(messageId || ""),
    deliveredRecipientCount: Math.max(0, Number(deliveredRecipientCount) || 0),
    offlineRecipients: normalizeRecipientList(offlineRecipients),
    droppedRecipients: normalizeRecipientList(droppedRecipients),
    rejectedRecipients: normalizeRecipientList(rejectedRecipients)
  };
}

function createDmDeliveryUpdatePayload({
  messageId,
  conversationId,
  recipientDeviceId,
  deliveryState = "sent"
}) {
  return {
    type: "dm:delivery-update",
    messageId: String(messageId || ""),
    conversationId: String(conversationId || ""),
    deliveryState: String(deliveryState || "").trim().toLowerCase() || "sent",
    recipientDeviceId: String(recipientDeviceId || "")
  };
}

function notifyRelayConsumption({
  onlineDevices,
  relayRow,
  recipientDeviceId,
  sendJson
}) {
  const senderDeviceId = String(relayRow?.sender_device_id || "").trim();

  if (!senderDeviceId || typeof sendJson !== "function") {
    return { delivered: false, senderDeviceId, payload: null };
  }

  const senderConnection = onlineDevices?.get(senderDeviceId);

  if (!senderConnection?.ws) {
    return { delivered: false, senderDeviceId, payload: null };
  }

  const payload = createDmDeliveryUpdatePayload({
    messageId: relayRow?.message_id,
    conversationId: relayRow?.conversation_id,
    recipientDeviceId,
    deliveryState: "sent"
  });

  sendJson(senderConnection.ws, payload);
  return { delivered: true, senderDeviceId, payload };
}

module.exports = {
  createDmQueuedPayload,
  createDmDeliveryUpdatePayload,
  notifyRelayConsumption
};
