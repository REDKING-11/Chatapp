import { normalizeOutgoingDeliveryState } from "./deliveryState.js";

function normalizeConversationKey(value) {
  return value != null ? String(value) : "";
}

function normalizeMessageKey(value) {
  return value != null ? String(value) : "";
}

export function createPendingDeliveryStateQueue() {
  const pendingByConversationId = new Map();

  function enqueue({ conversationId, messageId, deliveryState }) {
    const conversationKey = normalizeConversationKey(conversationId);
    const messageKey = normalizeMessageKey(messageId);

    if (!conversationKey || !messageKey) {
      return false;
    }

    const nextConversationEntries = new Map(
      pendingByConversationId.get(conversationKey) || []
    );

    nextConversationEntries.set(messageKey, {
      conversationId: conversationKey,
      messageId: messageKey,
      deliveryState: normalizeOutgoingDeliveryState(deliveryState)
    });
    pendingByConversationId.set(conversationKey, nextConversationEntries);
    return true;
  }

  function list(conversationId) {
    const conversationKey = normalizeConversationKey(conversationId);
    if (!conversationKey || !pendingByConversationId.has(conversationKey)) {
      return [];
    }

    return Array.from(pendingByConversationId.get(conversationKey).values());
  }

  function clearConversation(conversationId) {
    const conversationKey = normalizeConversationKey(conversationId);
    pendingByConversationId.delete(conversationKey);
  }

  async function flushConversation(conversationId, persist) {
    const conversationKey = normalizeConversationKey(conversationId);
    const entries = list(conversationKey);

    if (!conversationKey || !entries.length || typeof persist !== "function") {
      return {
        flushedCount: 0,
        remainingCount: entries.length
      };
    }

    let flushedCount = 0;
    const remainingEntries = [];

    for (const entry of entries) {
      const result = await persist(entry);

      if (result?.ok === false) {
        remainingEntries.push(entry);
        continue;
      }

      flushedCount += 1;
    }

    if (remainingEntries.length > 0) {
      const nextConversationEntries = new Map();
      remainingEntries.forEach((entry) => {
        nextConversationEntries.set(entry.messageId, entry);
      });
      pendingByConversationId.set(conversationKey, nextConversationEntries);
    } else {
      pendingByConversationId.delete(conversationKey);
    }

    return {
      flushedCount,
      remainingCount: remainingEntries.length
    };
  }

  return {
    enqueue,
    list,
    clearConversation,
    flushConversation
  };
}

export async function flushPendingDeliveryStateQueue(queue, options) {
  if (!queue?.flushConversation) {
    return {
      flushedCount: 0,
      remainingCount: 0
    };
  }

  return queue.flushConversation(options?.conversationId, options?.persist);
}
