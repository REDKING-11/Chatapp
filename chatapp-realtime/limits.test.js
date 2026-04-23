const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFixedWindowRateLimiter,
  createRelayPage,
  loadRealtimeLimits,
  normalizePositiveIntegers,
  normalizeUniqueStrings
} = require("./limits");

test("loadRealtimeLimits keeps defaults for invalid env and clamps unsafe values", () => {
  const limits = loadRealtimeLimits({
    WS_MAX_CONNECTIONS: "not-a-number",
    WS_MAX_PAYLOAD_BYTES: "999999999",
    DB_QUEUE_LIMIT: "-10"
  });

  assert.equal(limits.wsMaxConnections, 100);
  assert.equal(limits.wsMaxPayloadBytes, 16 * 1024 * 1024);
  assert.equal(limits.dbQueueLimit, 1);
});

test("normalizers dedupe and cap subscriptions and recipient devices", () => {
  assert.deepEqual(
    normalizePositiveIntegers([1, "2", 2, 0, -1, "bad", 3], 2),
    {
      items: [1, 2],
      originalCount: 3,
      limit: 2,
      truncated: true
    }
  );

  assert.deepEqual(
    normalizeUniqueStrings([" a ", "b", "a", "", null, "c"], 2),
    {
      items: ["a", "b"],
      originalCount: 3,
      limit: 2,
      truncated: true
    }
  );
});

test("fixed window rate limiter blocks after the configured budget", () => {
  let now = 1000;
  const limiter = createFixedWindowRateLimiter({
    limit: 2,
    windowMs: 1000,
    now: () => now
  });

  assert.equal(limiter.check().allowed, true);
  assert.equal(limiter.check().allowed, true);
  assert.equal(limiter.check().allowed, false);

  now = 2100;
  assert.equal(limiter.check().allowed, true);
});

test("relay page metadata exposes limit, hasMore, and next cursor", () => {
  const page = createRelayPage(
    [
      { id: 10, message_id: "a" },
      { id: 11, message_id: "b" },
      { id: 12, message_id: "c" }
    ],
    2,
    (row) => ({ relayId: row.id, messageId: row.message_id })
  );

  assert.deepEqual(page, {
    items: [
      { relayId: 10, messageId: "a" },
      { relayId: 11, messageId: "b" }
    ],
    limit: 2,
    hasMore: true,
    nextAfterRelayId: 11
  });
});
