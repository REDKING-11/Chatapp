const VALID_CONVERSATION_ACCESS_STATUSES = new Set([
  "ready",
  "missing-local",
  "missing-key"
]);

function normalizeBoolean(value) {
  return value === true;
}

export function normalizeConversationAccessStatus(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return VALID_CONVERSATION_ACCESS_STATUSES.has(normalizedValue)
    ? normalizedValue
    : "missing-local";
}

export function createConversationAccess({
  conversationId,
  status,
  hasConversation,
  hasWrappedKey,
  hasConversationKey
}) {
  return {
    conversationId: conversationId != null ? String(conversationId) : "",
    status: normalizeConversationAccessStatus(status),
    hasConversation: normalizeBoolean(hasConversation),
    hasWrappedKey: normalizeBoolean(hasWrappedKey),
    hasConversationKey: normalizeBoolean(hasConversationKey)
  };
}

export function deriveConversationAccessFromMetadata({
  conversation,
  conversationId,
  deviceId
}) {
  const hasConversation = Boolean(conversation);
  const hasWrappedKey = hasConversation
    && (Array.isArray(conversation?.wrappedKeys) ? conversation.wrappedKeys : []).some(
      (entry) => String(entry?.deviceId || "") === String(deviceId || "")
    );
  const hasConversationKey = Boolean(conversation?.conversationKey);
  const status = !hasConversation
    ? "missing-local"
    : (!hasWrappedKey || !hasConversationKey)
      ? "missing-key"
      : "ready";

  return createConversationAccess({
    conversationId: conversation?.conversationId ?? conversationId,
    status,
    hasConversation,
    hasWrappedKey,
    hasConversationKey
  });
}

export function normalizeConversationAccess(value) {
  if (!value || typeof value !== "object") {
    return createConversationAccess({
      conversationId: "",
      status: "missing-local",
      hasConversation: false,
      hasWrappedKey: false,
      hasConversationKey: false
    });
  }

  return createConversationAccess({
    conversationId: value.conversationId,
    status: value.status,
    hasConversation: value.hasConversation,
    hasWrappedKey: value.hasWrappedKey,
    hasConversationKey: value.hasConversationKey
  });
}

export function canReadConversationLocally(value) {
  const normalized = normalizeConversationAccess(value);
  return normalized.hasConversation && normalized.hasConversationKey;
}

export function isConversationMissingLocal(value) {
  return normalizeConversationAccess(value).status === "missing-local";
}

export function isConversationMissingKey(value) {
  return normalizeConversationAccess(value).status === "missing-key";
}
