const VALID_OUTGOING_DELIVERY_STATES = new Set(["sent", "queued", "failed"]);

export function normalizeOutgoingDeliveryState(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return VALID_OUTGOING_DELIVERY_STATES.has(normalizedValue)
    ? normalizedValue
    : "sent";
}

export function resolveOutgoingDeliveryStateFromRelayEvent(detail) {
  const deliveredRecipientCount = Math.max(0, Number(detail?.deliveredRecipientCount) || 0);
  const offlineRecipientCount = Array.isArray(detail?.offlineRecipients)
    ? detail.offlineRecipients.length
    : 0;
  const droppedRecipientCount = Array.isArray(detail?.droppedRecipients)
    ? detail.droppedRecipients.length
    : 0;
  const rejectedRecipientCount = Array.isArray(detail?.rejectedRecipients)
    ? detail.rejectedRecipients.length
    : 0;

  if (deliveredRecipientCount > 0) {
    return "sent";
  }

  if (offlineRecipientCount > 0) {
    return "queued";
  }

  if (droppedRecipientCount > 0) {
    return "failed";
  }

  if (rejectedRecipientCount > 0) {
    return "failed";
  }

  return "sent";
}

export function indexOutgoingDeliveryStates(messages) {
  return (Array.isArray(messages) ? messages : []).reduce((acc, message) => {
    if (!message || message.direction !== "outgoing") {
      return acc;
    }

    const messageId = message.messageId != null ? String(message.messageId) : "";

    if (!messageId) {
      return acc;
    }

    acc[messageId] = normalizeOutgoingDeliveryState(message.deliveryState);
    return acc;
  }, {});
}

export function applyOutgoingDeliveryStateUpdate(currentStates, detail) {
  const messageId = detail?.messageId != null ? String(detail.messageId) : "";

  if (!messageId) {
    return currentStates || {};
  }

  const deliveryState = normalizeOutgoingDeliveryState(detail?.deliveryState);
  const previousStates = currentStates || {};

  if (previousStates[messageId] === deliveryState) {
    return previousStates;
  }

  return {
    ...previousStates,
    [messageId]: deliveryState
  };
}
