function normalizeConversationKey(value) {
  return value != null ? String(value) : "";
}

export function createBackgroundConversationImportTracker() {
  const inFlightByConversationId = new Map();

  async function run(conversationId, importer) {
    const conversationKey = normalizeConversationKey(conversationId);

    if (!conversationKey || typeof importer !== "function") {
      return null;
    }

    if (inFlightByConversationId.has(conversationKey)) {
      return inFlightByConversationId.get(conversationKey);
    }

    const inFlightPromise = Promise.resolve()
      .then(() => importer())
      .finally(() => {
        if (inFlightByConversationId.get(conversationKey) === inFlightPromise) {
          inFlightByConversationId.delete(conversationKey);
        }
      });

    inFlightByConversationId.set(conversationKey, inFlightPromise);
    return inFlightPromise;
  }

  function has(conversationId) {
    return inFlightByConversationId.has(normalizeConversationKey(conversationId));
  }

  return {
    run,
    has
  };
}
