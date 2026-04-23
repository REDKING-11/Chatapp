export const FILE_TRANSFER_CHUNK_ACK_TIMEOUT_MS = 30000;
export const FILE_TRANSFER_CHUNK_MAX_RETRIES = 3;
export const FILE_TRANSFER_CHUNK_THROTTLE_MS = 250;

export function createFileChunkAckKey({ transferId, shareId = "", offset = 0, nextOffset = 0 }) {
  return [
    String(transferId || ""),
    String(shareId || ""),
    Math.max(0, Number(offset) || 0),
    Math.max(0, Number(nextOffset) || 0)
  ].join(":");
}

export function createFileChunkAckCoordinator({
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout
} = {}) {
  const waiters = new Map();

  function waitForAck(chunk, { timeoutMs = FILE_TRANSFER_CHUNK_ACK_TIMEOUT_MS } = {}) {
    const key = createFileChunkAckKey(chunk);

    if (!key || waiters.has(key)) {
      cancelAck(chunk);
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeoutFn(() => {
        waiters.delete(key);
        reject(new Error("Timed out waiting for file chunk acknowledgement"));
      }, timeoutMs);

      waiters.set(key, {
        resolve,
        reject,
        timeoutId
      });
    });
  }

  function cancelAck(chunk, error = new Error("File chunk acknowledgement was cancelled")) {
    const key = createFileChunkAckKey(chunk);
    const waiter = waiters.get(key);

    if (!waiter) {
      return false;
    }

    clearTimeoutFn(waiter.timeoutId);
    waiters.delete(key);
    waiter.reject(error);
    return true;
  }

  function resolveAck(payload) {
    const key = createFileChunkAckKey(payload);
    const waiter = waiters.get(key);

    if (!waiter) {
      return false;
    }

    clearTimeoutFn(waiter.timeoutId);
    waiters.delete(key);
    waiter.resolve(payload);
    return true;
  }

  function rejectTransfer({ transferId, shareId = "" }, error = new Error("File transfer failed")) {
    let rejected = 0;

    for (const [key, waiter] of waiters.entries()) {
      const [waiterTransferId, waiterShareId] = key.split(":");
      const sameTransfer = waiterTransferId === String(transferId || "");
      const sameShare = !shareId || waiterShareId === String(shareId || "");

      if (sameTransfer && sameShare) {
        clearTimeoutFn(waiter.timeoutId);
        waiters.delete(key);
        waiter.reject(error);
        rejected += 1;
      }
    }

    return rejected;
  }

  return {
    cancelAck,
    rejectTransfer,
    resolveAck,
    waitForAck,
    pendingCount: () => waiters.size
  };
}

export function createSharedChunkThrottle({
  minimumDelayMs = FILE_TRANSFER_CHUNK_THROTTLE_MS,
  now = () => Date.now(),
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
} = {}) {
  let chain = Promise.resolve();
  let nextSendAt = 0;

  async function waitTurn() {
    const previous = chain.catch(() => {});
    const current = previous.then(async () => {
      const waitMs = Math.max(0, nextSendAt - now());

      if (waitMs > 0) {
        await delay(waitMs);
      }

      nextSendAt = now() + minimumDelayMs;
    });

    chain = current;
    return current;
  }

  return {
    waitTurn
  };
}

export async function sendFileChunkWithAck({
  chunk,
  waitForThrottle,
  sendChunk,
  waitForAck,
  cancelAck,
  maxRetries = FILE_TRANSFER_CHUNK_MAX_RETRIES
}) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    await waitForThrottle();
    const ackPromise = waitForAck(chunk);

    try {
      await sendChunk(chunk, {
        attempt,
        retry: attempt > 0
      });
    } catch (error) {
      cancelAck?.(chunk, error);
      throw error;
    }

    try {
      return await ackPromise;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("File chunk acknowledgement failed");
}
