const DEFAULT_LIMITS = Object.freeze({
  wsMaxConnections: 100,
  wsMaxUnauthenticatedConnections: 20,
  wsMaxPayloadBytes: 1024 * 1024,
  wsMaxBufferedBytes: 1024 * 1024,
  wsMessageRateLimit: 120,
  wsMessageRateWindowMs: 60 * 1000,
  wsMaxPresenceSubscriptions: 200,
  dmMaxRecipientDevices: 50,
  dmMaxRelayFetchItems: 100,
  dbConnectionLimit: 5,
  dbQueueLimit: 50
});

const ENV_LIMIT_KEYS = Object.freeze({
  wsMaxConnections: "WS_MAX_CONNECTIONS",
  wsMaxUnauthenticatedConnections: "WS_MAX_UNAUTHENTICATED_CONNECTIONS",
  wsMaxPayloadBytes: "WS_MAX_PAYLOAD_BYTES",
  wsMaxBufferedBytes: "WS_MAX_BUFFERED_BYTES",
  wsMessageRateLimit: "WS_MESSAGE_RATE_LIMIT",
  wsMessageRateWindowMs: "WS_MESSAGE_RATE_WINDOW_MS",
  wsMaxPresenceSubscriptions: "WS_MAX_PRESENCE_SUBSCRIPTIONS",
  dmMaxRecipientDevices: "DM_MAX_RECIPIENT_DEVICES",
  dmMaxRelayFetchItems: "DM_MAX_RELAY_FETCH_ITEMS",
  dbConnectionLimit: "DB_CONNECTION_LIMIT",
  dbQueueLimit: "DB_QUEUE_LIMIT"
});

const LIMIT_RANGES = Object.freeze({
  wsMaxConnections: [1, 10000],
  wsMaxUnauthenticatedConnections: [1, 10000],
  wsMaxPayloadBytes: [1024, 16 * 1024 * 1024],
  wsMaxBufferedBytes: [1024, 16 * 1024 * 1024],
  wsMessageRateLimit: [1, 10000],
  wsMessageRateWindowMs: [1000, 60 * 60 * 1000],
  wsMaxPresenceSubscriptions: [1, 10000],
  dmMaxRecipientDevices: [1, 10000],
  dmMaxRelayFetchItems: [1, 1000],
  dbConnectionLimit: [1, 100],
  dbQueueLimit: [1, 10000]
});

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseIntegerLimit(value, defaultValue, min, max) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return clampNumber(Math.floor(parsed), min, max);
}

function loadRealtimeLimits(env = process.env) {
  return Object.fromEntries(
    Object.entries(DEFAULT_LIMITS).map(([key, defaultValue]) => {
      const [min, max] = LIMIT_RANGES[key];
      return [
        key,
        parseIntegerLimit(env[ENV_LIMIT_KEYS[key]], defaultValue, min, max)
      ];
    })
  );
}

function normalizeUniqueStrings(values, limit = Number.MAX_SAFE_INTEGER) {
  const normalizedLimit = Math.max(0, Number(limit) || 0);
  const items = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    const item = String(value || "").trim();

    if (!item || seen.has(item)) {
      continue;
    }

    seen.add(item);

    if (items.length < normalizedLimit) {
      items.push(item);
    }
  }

  return {
    items,
    originalCount: seen.size,
    limit: normalizedLimit,
    truncated: seen.size > normalizedLimit
  };
}

function normalizePositiveIntegers(values, limit = Number.MAX_SAFE_INTEGER) {
  const normalizedLimit = Math.max(0, Number(limit) || 0);
  const items = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    const item = Number(value);

    if (!Number.isInteger(item) || item <= 0 || seen.has(item)) {
      continue;
    }

    seen.add(item);

    if (items.length < normalizedLimit) {
      items.push(item);
    }
  }

  return {
    items,
    originalCount: seen.size,
    limit: normalizedLimit,
    truncated: seen.size > normalizedLimit
  };
}

function createFixedWindowRateLimiter({ limit, windowMs, now = () => Date.now() }) {
  const normalizedLimit = Math.max(1, Number(limit) || 1);
  const normalizedWindowMs = Math.max(1000, Number(windowMs) || 1000);
  let windowStartedAt = now();
  let count = 0;

  return {
    check() {
      const timestamp = now();

      if (timestamp - windowStartedAt >= normalizedWindowMs) {
        windowStartedAt = timestamp;
        count = 0;
      }

      count += 1;

      if (count <= normalizedLimit) {
        return {
          allowed: true,
          remaining: normalizedLimit - count,
          retryAfterMs: 0
        };
      }

      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, normalizedWindowMs - (timestamp - windowStartedAt))
      };
    }
  };
}

function createRelayPage(rows, limit, mapRow = (row) => row) {
  const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 1));
  const sourceRows = Array.isArray(rows) ? rows : [];
  const pageRows = sourceRows.slice(0, normalizedLimit);

  return {
    items: pageRows.map(mapRow),
    limit: normalizedLimit,
    hasMore: sourceRows.length > normalizedLimit,
    nextAfterRelayId: pageRows.length > 0
      ? Number(pageRows[pageRows.length - 1]?.id || 0) || null
      : null
  };
}

module.exports = {
  DEFAULT_LIMITS,
  ENV_LIMIT_KEYS,
  createFixedWindowRateLimiter,
  createRelayPage,
  loadRealtimeLimits,
  normalizePositiveIntegers,
  normalizeUniqueStrings,
  parseIntegerLimit
};
