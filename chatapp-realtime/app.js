require("dotenv").config();

const http = require("http");
const crypto = require("crypto");
const express = require("express");
const WebSocket = require("ws");
const mysql = require("mysql2/promise");
const {
  createDmQueuedPayload,
  notifyRelayConsumption
} = require("./delivery");
const {
  createPresencePayload,
  DEFAULT_PRESENCE_STATUS,
  updateDevicePresence
} = require("./presence");

const MAX_WS_MESSAGE_BYTES = Number(process.env.MAX_WS_MESSAGE_BYTES || 2 * 1024 * 1024);
const MAX_DM_ENVELOPE_BYTES = Number(process.env.MAX_DM_ENVELOPE_BYTES || 1536 * 1024);
const MAX_DM_RECIPIENTS = Number(process.env.MAX_DM_RECIPIENTS || 50);
const RELAY_FETCH_LIMIT = Number(process.env.RELAY_FETCH_LIMIT || 50);
const RELAY_FETCH_COOLDOWN_MS = Number(process.env.RELAY_FETCH_COOLDOWN_MS || 2000);
const MAX_WS_MESSAGES_PER_SECOND = Number(process.env.MAX_WS_MESSAGES_PER_SECOND || 30);

const app = express();
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "2mb" }));

const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  maxPayload: MAX_WS_MESSAGE_BYTES
});

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

const onlineDevices = new Map();
const presenceSubscriptions = new Map();
const tableExistsCache = new Map();
const columnExistsCache = new Map();
const WS_AUTH_TIMEOUT_MS = 10000;
let relayQueueColumnsEnsured = false;
let relayQueueColumnsEnsuredPromise = null;

function logFatalAndExit(label, error) {
  console.error(`[fatal] ${label}`, error);
  process.exitCode = 1;
  try {
    server.close(() => process.exit(1));
  } catch (closeError) {
    console.error("[fatal] failed to close server cleanly", closeError);
    process.exit(1);
  }
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("uncaughtException", (error) => {
  logFatalAndExit("uncaught exception", error);
});

process.on("unhandledRejection", (error) => {
  logFatalAndExit("unhandled rejection", error);
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, onlineDevices: onlineDevices.size });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function getEnvelopeSizeBytes(parts) {
  return parts.reduce((total, value) => total + Buffer.byteLength(String(value || ""), "utf8"), 0);
}

function normalizeSubscribedUserIds(userIds) {
  return [
    ...new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((userId) => Number(userId))
        .filter((userId) => Number.isInteger(userId) && userId > 0)
    )
  ];
}

function sendPresenceSnapshot(ws, userIds) {
  const normalizedUserIds = normalizeSubscribedUserIds(userIds);

  sendJson(ws, {
    type: "presence:snapshot",
    items: normalizedUserIds.map((userId) => createPresencePayload(onlineDevices, userId))
  });
}

function updatePresenceSubscription(ws, userIds) {
  presenceSubscriptions.set(ws, new Set(normalizeSubscribedUserIds(userIds)));
  sendPresenceSnapshot(ws, userIds);
}

function clearPresenceSubscription(ws) {
  presenceSubscriptions.delete(ws);
}

function broadcastPresenceUpdate(userId) {
  const normalizedUserId = Number(userId);
  const payload = {
    type: "presence:update",
    ...createPresencePayload(onlineDevices, normalizedUserId)
  };

  presenceSubscriptions.forEach((subscribedUserIds, ws) => {
    if (subscribedUserIds?.has(normalizedUserId)) {
      sendJson(ws, payload);
    }
  });
}

function normalizeBearerToken(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const bearerMatch = trimmed.match(/^Bearer\s+(.+)$/i);
  return bearerMatch ? bearerMatch[1].trim() || null : trimmed;
}

async function tableExists(tableName) {
  if (tableExistsCache.has(tableName)) {
    return tableExistsCache.get(tableName);
  }

  const [rows] = await pool.query(
    `
    SELECT COUNT(*) AS count_found
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
    `,
    [tableName]
  );

  const exists = Number(rows[0]?.count_found ?? 0) > 0;
  tableExistsCache.set(tableName, exists);
  return exists;
}

async function columnExists(tableName, columnName) {
  const cacheKey = `${tableName}.${columnName}`;

  if (columnExistsCache.has(cacheKey)) {
    return columnExistsCache.get(cacheKey);
  }

  const [rows] = await pool.query(
    `
    SELECT COUNT(*) AS count_found
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    `,
    [tableName, columnName]
  );

  const exists = Number(rows[0]?.count_found ?? 0) > 0;
  columnExistsCache.set(cacheKey, exists);
  return exists;
}

async function ensureRelayQueueMessageSignatureColumns() {
  if (relayQueueColumnsEnsured) {
    return;
  }

  if (!relayQueueColumnsEnsuredPromise) {
    relayQueueColumnsEnsuredPromise = (async () => {
      if (!(await tableExists("dm_relay_queue"))) {
        relayQueueColumnsEnsured = true;
        return;
      }

      if (!(await columnExists("dm_relay_queue", "sender_user_id"))) {
        await pool.query("ALTER TABLE dm_relay_queue ADD COLUMN sender_user_id BIGINT NULL AFTER conversation_id");
        columnExistsCache.set("dm_relay_queue.sender_user_id", true);
      }

      if (!(await columnExists("dm_relay_queue", "message_signature"))) {
        await pool.query("ALTER TABLE dm_relay_queue ADD COLUMN message_signature TEXT NULL AFTER tag");
        columnExistsCache.set("dm_relay_queue.message_signature", true);
      }

      if (!(await columnExists("dm_relay_queue", "sender_device_name"))) {
        await pool.query("ALTER TABLE dm_relay_queue ADD COLUMN sender_device_name VARCHAR(191) NULL AFTER sender_device_id");
        columnExistsCache.set("dm_relay_queue.sender_device_name", true);
      }

      if (!(await columnExists("dm_relay_queue", "sender_encryption_public_key"))) {
        await pool.query("ALTER TABLE dm_relay_queue ADD COLUMN sender_encryption_public_key TEXT NULL AFTER sender_device_name");
        columnExistsCache.set("dm_relay_queue.sender_encryption_public_key", true);
      }

      if (!(await columnExists("dm_relay_queue", "sender_signing_public_key"))) {
        await pool.query("ALTER TABLE dm_relay_queue ADD COLUMN sender_signing_public_key TEXT NULL AFTER sender_encryption_public_key");
        columnExistsCache.set("dm_relay_queue.sender_signing_public_key", true);
      }

      if (!(await columnExists("dm_relay_queue", "sender_key_version"))) {
        await pool.query("ALTER TABLE dm_relay_queue ADD COLUMN sender_key_version INT NULL AFTER sender_signing_public_key");
        columnExistsCache.set("dm_relay_queue.sender_key_version", true);
      }

      if (!(await columnExists("dm_relay_queue", "sender_bundle_signature"))) {
        await pool.query("ALTER TABLE dm_relay_queue ADD COLUMN sender_bundle_signature TEXT NULL AFTER sender_key_version");
        columnExistsCache.set("dm_relay_queue.sender_bundle_signature", true);
      }

      relayQueueColumnsEnsured = true;
    })().finally(() => {
      relayQueueColumnsEnsuredPromise = null;
    });
  }

  await relayQueueColumnsEnsuredPromise;
}

async function findSessionByToken(token) {
  const normalizedToken = String(token || "").trim();
  const hasTokenHashColumn = await columnExists("sessions", "token_hash");
  const lookupValue = hasTokenHashColumn
    ? crypto.createHash("sha256").update(normalizedToken).digest("hex")
    : normalizedToken;
  const whereClauses = [
    hasTokenHashColumn ? "token_hash = ?" : "token = ?",
    "expires_at > UTC_TIMESTAMP()"
  ];

  if (await columnExists("sessions", "revoked_at")) {
    whereClauses.push("revoked_at IS NULL");
  }

  const [rows] = await pool.query(
    `
    SELECT user_id
    FROM sessions
    WHERE ${whereClauses.join(" AND ")}
    LIMIT 1
    `,
    [lookupValue]
  );

  const session = rows[0] || null;

  if (!session) {
    return null;
  }

  if (await columnExists("sessions", "last_seen_at")) {
    await pool.query(
      `UPDATE sessions SET last_seen_at = UTC_TIMESTAMP() WHERE ${hasTokenHashColumn ? "token_hash = ?" : "token = ?"}`,
      [lookupValue]
    );
  }

  return {
    userId: Number(session.user_id)
  };
}

async function findDeviceStateForUser(userId, deviceId) {
  const candidateTables = [];

  if (await tableExists("dm_devices")) {
    candidateTables.push("dm_devices");
  }

  if (await tableExists("device_public_keys")) {
    candidateTables.push("device_public_keys");
  }

  for (const tableName of candidateTables) {
    const [rows] = await pool.query(
      `
      SELECT device_id, revoked_at
      FROM ${tableName}
      WHERE user_id = ?
        AND device_id = ?
      ORDER BY
        CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END ASC
      LIMIT 1
      `,
      [userId, deviceId]
    );

    if (!rows[0]) {
      continue;
    }

    return {
      status: rows[0].revoked_at == null ? "active" : "revoked",
      deviceId: String(rows[0].device_id)
    };
  }

  return {
    status: "missing",
    deviceId: String(deviceId || "").trim()
  };
}

async function findPublishedDeviceRow(userId, deviceId) {
  const candidateTables = [];

  if (await tableExists("device_public_keys")) {
    candidateTables.push("device_public_keys");
  }

  if (await tableExists("dm_devices")) {
    candidateTables.push("dm_devices");
  }

  for (const tableName of candidateTables) {
    const bundleSignatureSelect = (await columnExists(tableName, "bundle_signature"))
      ? "bundle_signature"
      : "NULL AS bundle_signature";
    const [rows] = await pool.query(
      `
      SELECT
        user_id,
        device_id,
        device_name,
        encryption_public_key,
        signing_public_key,
        key_version,
        ${bundleSignatureSelect},
        revoked_at
      FROM ${tableName}
      WHERE user_id = ?
        AND device_id = ?
      ORDER BY
        CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END ASC
      LIMIT 1
      `,
      [userId, deviceId]
    );

    if (rows[0]) {
      return rows[0];
    }
  }

  return null;
}

async function authenticateRealtimeSocket({ userId, deviceId, token }) {
  const normalizedToken = normalizeBearerToken(token);
  const normalizedDeviceId = String(deviceId || "").trim();
  const claimedUserId = Number(userId);

  if (!normalizedToken || !normalizedDeviceId) {
    return {
      ok: false,
      error: "Bearer token and deviceId are required"
    };
  }

  const session = await findSessionByToken(normalizedToken);

  if (!session) {
    return {
      ok: false,
      error: "Invalid or expired bearer token"
    };
  }

  if (Number.isFinite(claimedUserId) && claimedUserId > 0 && claimedUserId !== session.userId) {
    return {
      ok: false,
      error: "userId does not match the authenticated session"
    };
  }

  const deviceState = await findDeviceStateForUser(session.userId, normalizedDeviceId);

  if (deviceState.status === "missing") {
    return {
      ok: false,
      code: "DEVICE_NOT_REGISTERED",
      error: "Device is not registered for secure DMs"
    };
  }

  if (deviceState.status === "revoked") {
    return {
      ok: false,
      code: "DEVICE_REAUTH_REQUIRED",
      error: "This device was revoked for secure DMs and must be re-authorized with MFA.",
      deviceStatus: "revoked"
    };
  }

  return {
    ok: true,
    userId: session.userId,
    deviceId: deviceState.deviceId
  };
}

async function userHasConversationAccess(userId, conversationId) {
  const [rows] = await pool.query(
    `
    SELECT c.id
    FROM dm_conversations c
    JOIN dm_conversation_participants p
      ON p.conversation_id = c.id
    WHERE c.id = ?
      AND p.user_id = ?
    LIMIT 1
    `,
    [conversationId, userId]
  );

  return Boolean(rows[0]);
}

async function getConversationRecipientDeviceIds(conversationId) {
  const [rows] = await pool.query(
    `
    SELECT device_id
    FROM dm_conversation_wrapped_keys
    WHERE conversation_id = ?
    `,
    [conversationId]
  );

  return new Set(
    rows
      .map((row) => String(row.device_id || "").trim())
      .filter(Boolean)
  );
}

function forwardDmFileSignal({ ws, authedDeviceId, authedUserId, data }) {
  const targetDeviceId = String(data.targetDeviceId || "");
  const transferId = String(data.transferId || "");

  if (!targetDeviceId || !transferId) {
    sendJson(ws, { type: "dm:file:error", transferId, error: "targetDeviceId and transferId are required" });
    return true;
  }

  const onlineTarget = onlineDevices.get(targetDeviceId);

  if (!onlineTarget) {
    sendJson(ws, {
      type: "dm:file:error",
      transferId,
      targetDeviceId,
      error: "That device is currently offline"
    });
    return true;
  }

  sendJson(onlineTarget.ws, {
    ...data,
    senderDeviceId: authedDeviceId,
    senderUserId: authedUserId
  });

  return true;
}

async function getConversationRelayTtlSeconds(conversationId) {
  const [rows] = await pool.query(
    `
    SELECT relay_ttl_seconds
    FROM dm_conversations
    WHERE id = ?
    LIMIT 1
    `,
    [Number(conversationId)]
  );

  if (!rows.length) {
    throw new Error("Conversation not found");
  }

  return Number(rows[0].relay_ttl_seconds ?? 86400);
}

wss.on("connection", (ws) => {
  let authedDeviceId = null;
  let authedUserId = null;
  let messageWindowStartedAt = Date.now();
  let messageCountInWindow = 0;
  let lastRelayFetchAt = 0;
  const authTimeout = setTimeout(() => {
    if (!authedDeviceId && ws.readyState === WebSocket.OPEN) {
      sendJson(ws, { type: "auth:error", error: "Authentication timed out" });
      ws.close(4001, "Authentication timed out");
    }
  }, WS_AUTH_TIMEOUT_MS);

  ws.on("message", async (raw) => {
    try {
      const now = Date.now();

      if (now - messageWindowStartedAt >= 1000) {
        messageWindowStartedAt = now;
        messageCountInWindow = 0;
      }

      messageCountInWindow += 1;

      if (messageCountInWindow > MAX_WS_MESSAGES_PER_SECOND) {
        sendJson(ws, { type: "error", error: "Realtime rate limit exceeded" });
        ws.close(1013, "Realtime rate limit exceeded");
        return;
      }

      if (Buffer.byteLength(raw) > MAX_WS_MESSAGE_BYTES) {
        sendJson(ws, { type: "error", error: "Realtime message is too large" });
        ws.close(1009, "Realtime message is too large");
        return;
      }

      const data = JSON.parse(raw.toString());

      if (data.type === "auth") {
        if (authedDeviceId) {
          sendJson(ws, { type: "auth:error", error: "Socket is already authenticated" });
          ws.close(4005, "Already authenticated");
          return;
        }

        const authResult = await authenticateRealtimeSocket({
          userId: data.userId,
          deviceId: data.deviceId,
          token: data.token ?? data.authorization ?? data.bearerToken
        });

        if (!authResult.ok) {
          sendJson(ws, {
            type: "auth:error",
            error: authResult.error,
            code: authResult.code || "",
            deviceStatus: authResult.deviceStatus || ""
          });
          ws.close(4003, "Authentication failed");
          return;
        }

        authedUserId = authResult.userId;
        authedDeviceId = authResult.deviceId;

        const existingConnection = onlineDevices.get(authedDeviceId);

        if (existingConnection && existingConnection.ws !== ws) {
          sendJson(existingConnection.ws, {
            type: "error",
            error: "This device connected from another realtime session"
          });
          existingConnection.ws.close(4004, "Replaced by newer realtime connection");
        }

        clearTimeout(authTimeout);
        onlineDevices.set(authedDeviceId, {
          ws,
          userId: authedUserId,
          presenceStatus: DEFAULT_PRESENCE_STATUS,
          presenceUpdatedAt: Date.now()
        });
        clearPresenceSubscription(ws);

        sendJson(ws, { type: "auth:ok", deviceId: authedDeviceId, userId: authedUserId });
        broadcastPresenceUpdate(authedUserId);
        return;
      }

      if (!authedDeviceId) {
        sendJson(ws, { type: "error", error: "Not authenticated" });
        return;
      }

      if (data.type === "dm:send") {
        const {
          conversationId,
          messageId,
          senderDeviceId,
          recipientDeviceIds,
          ciphertext,
          nonce,
          aad,
          tag,
          signature
        } = data;

        const normalizedConversationId = Number(conversationId);

        if (
          !Number.isInteger(normalizedConversationId)
          || normalizedConversationId <= 0
          || !messageId
          || !Array.isArray(recipientDeviceIds)
          || !ciphertext
          || !nonce
          || !aad
          || !tag
          || !signature
        ) {
          sendJson(ws, { type: "error", error: "Invalid dm:send payload" });
          return;
        }

        if (senderDeviceId && String(senderDeviceId) !== authedDeviceId) {
          sendJson(ws, { type: "error", error: "senderDeviceId does not match authenticated device" });
          return;
        }

        if (!(await userHasConversationAccess(authedUserId, normalizedConversationId))) {
          sendJson(ws, { type: "error", error: "Conversation not found" });
          return;
        }

        const allowedRecipientDeviceIds = await getConversationRecipientDeviceIds(normalizedConversationId);

        if (!allowedRecipientDeviceIds.has(authedDeviceId)) {
          sendJson(ws, { type: "error", error: "Authenticated device does not have access to this conversation" });
          return;
        }

        const normalizedRecipientDeviceIds = [
          ...new Set(
            recipientDeviceIds
              .map((recipientDeviceId) => String(recipientDeviceId || "").trim())
              .filter(Boolean)
          )
        ];

        if (normalizedRecipientDeviceIds.length > MAX_DM_RECIPIENTS) {
          sendJson(ws, { type: "error", error: `Too many DM recipients; maximum is ${MAX_DM_RECIPIENTS}` });
          return;
        }

        const envelopeSizeBytes = getEnvelopeSizeBytes([ciphertext, nonce, aad, tag, signature]);

        if (envelopeSizeBytes > MAX_DM_ENVELOPE_BYTES) {
          sendJson(ws, { type: "error", error: "Encrypted DM payload is too large" });
          return;
        }

        const allowedRecipients = normalizedRecipientDeviceIds.filter((recipientDeviceId) =>
          allowedRecipientDeviceIds.has(recipientDeviceId)
        );
        const rejectedRecipients = normalizedRecipientDeviceIds.filter((recipientDeviceId) =>
          !allowedRecipientDeviceIds.has(recipientDeviceId)
        );
        const undelivered = [];
        const dropped = [];
        let deliveredRecipientCount = 0;

        for (const recipientDeviceId of allowedRecipients) {
          const onlineTarget = onlineDevices.get(recipientDeviceId);

          if (onlineTarget) {
            sendJson(onlineTarget.ws, {
              type: "dm:deliver",
              relayId: null,
              conversationId: normalizedConversationId,
              messageId: String(messageId),
              senderUserId: authedUserId,
              senderDeviceId: authedDeviceId,
              ciphertext: String(ciphertext),
              nonce: String(nonce),
              aad: String(aad),
              tag: String(tag),
              signature: String(signature)
            });
            deliveredRecipientCount += 1;
          } else {
            undelivered.push(recipientDeviceId);
          }
        }

        if (undelivered.length > 0) {
          const relayTtlSeconds = await getConversationRelayTtlSeconds(normalizedConversationId);

          if (relayTtlSeconds > 0) {
            await ensureRelayQueueMessageSignatureColumns();
            const senderDeviceRow = await findPublishedDeviceRow(authedUserId, authedDeviceId);

            const values = undelivered.map((recipientDeviceId) => [
              String(messageId),
              normalizedConversationId,
              authedUserId,
              recipientDeviceId,
              authedDeviceId,
              senderDeviceRow?.device_name || null,
              senderDeviceRow?.encryption_public_key || null,
              senderDeviceRow?.signing_public_key || null,
              senderDeviceRow?.key_version ?? null,
              senderDeviceRow?.bundle_signature || null,
              String(ciphertext),
              String(nonce),
              String(aad),
              String(tag),
              String(signature),
              relayTtlSeconds
            ]);

            await pool.query(
              `
              INSERT INTO dm_relay_queue
                (message_id, conversation_id, sender_user_id, recipient_device_id, sender_device_id, sender_device_name, sender_encryption_public_key, sender_signing_public_key, sender_key_version, sender_bundle_signature, ciphertext, nonce, aad, tag, message_signature, expires_at)
              VALUES
                ${values.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))").join(", ")}
              `,
              values.flat()
            );
          } else {
            dropped.push(...undelivered);
          }
        }

        await pool.query("UPDATE dm_conversations SET updated_at = UTC_TIMESTAMP() WHERE id = ?", [normalizedConversationId]);

        sendJson(ws, createDmQueuedPayload({
          messageId: String(messageId),
          deliveredRecipientCount,
          offlineRecipients: undelivered.filter((deviceId) => !dropped.includes(deviceId)),
          droppedRecipients: dropped,
          rejectedRecipients
        }));
        return;
      }

      if (data.type === "dm:fetchRelay") {
        const now = Date.now();

        if (now - lastRelayFetchAt < RELAY_FETCH_COOLDOWN_MS) {
          sendJson(ws, { type: "error", error: "Relay fetch rate limit exceeded" });
          return;
        }

        lastRelayFetchAt = now;
        await ensureRelayQueueMessageSignatureColumns();

        const [rows] = await pool.query(
          `
          SELECT id, message_id, conversation_id, sender_user_id, recipient_device_id, sender_device_id, ciphertext, nonce, aad, tag, message_signature, created_at, expires_at
          FROM dm_relay_queue
          WHERE recipient_device_id = ?
            AND acked_at IS NULL
            AND expires_at > UTC_TIMESTAMP()
          ORDER BY created_at ASC
          LIMIT ?
          `,
          [authedDeviceId, RELAY_FETCH_LIMIT + 1]
        );
        const hasMore = rows.length > RELAY_FETCH_LIMIT;
        const limitedRows = rows.slice(0, RELAY_FETCH_LIMIT);

        sendJson(ws, {
          type: "dm:relayItems",
          hasMore,
          limit: RELAY_FETCH_LIMIT,
          items: limitedRows.map((row) => ({
            relayId: row.id,
            messageId: row.message_id,
            conversationId: row.conversation_id,
            senderUserId: row.sender_user_id == null ? null : Number(row.sender_user_id),
            recipientDeviceId: row.recipient_device_id,
            senderDeviceId: row.sender_device_id,
            ciphertext: row.ciphertext,
            nonce: row.nonce,
            aad: row.aad,
            tag: row.tag,
            signature: row.message_signature,
            createdAt: row.created_at,
            expiresAt: row.expires_at
          }))
        });
        return;
      }

      if (String(data.type || "").startsWith("dm:file:")) {
        forwardDmFileSignal({
          ws,
          authedDeviceId,
          authedUserId,
          data
        });
        return;
      }

      if (data.type === "presence:subscribe") {
        updatePresenceSubscription(ws, data.userIds);
        return;
      }

      if (data.type === "presence:set-status") {
        updateDevicePresence(onlineDevices, authedDeviceId, data.status);
        broadcastPresenceUpdate(authedUserId);
        return;
      }

      if (data.type === "dm:ack") {
        const { relayId } = data;
        const normalizedRelayId = Number(relayId);

        if (!relayId || !Number.isInteger(normalizedRelayId) || normalizedRelayId <= 0) {
          sendJson(ws, { type: "error", error: "relayId is required" });
          return;
        }

        const [relayRows] = await pool.query(
          `
          SELECT id, message_id, conversation_id, sender_device_id
          FROM dm_relay_queue
          WHERE id = ? AND recipient_device_id = ?
          LIMIT 1
          `,
          [normalizedRelayId, authedDeviceId]
        );
        const relayRow = relayRows[0] || null;

        await pool.query(
          `DELETE FROM dm_relay_queue WHERE id = ? AND recipient_device_id = ?`,
          [normalizedRelayId, authedDeviceId]
        );

        if (relayRow) {
          notifyRelayConsumption({
            onlineDevices,
            relayRow,
            recipientDeviceId: authedDeviceId,
            sendJson
          });
        }

        sendJson(ws, { type: "dm:ack:ok", relayId });
      }
    } catch (error) {
      sendJson(ws, { type: "error", error: error.message });
    }
  });

  ws.on("close", () => {
    clearTimeout(authTimeout);
    clearPresenceSubscription(ws);

    if (authedDeviceId) {
      const existingConnection = onlineDevices.get(authedDeviceId);

      if (existingConnection?.ws === ws) {
        onlineDevices.delete(authedDeviceId);
        broadcastPresenceUpdate(authedUserId);
      }
    }
  });

  ws.on("error", (error) => {
    console.warn("[websocket] connection error", error);
  });
});

server.on("error", (error) => {
  logFatalAndExit("server error", error);
});

server.listen(process.env.PORT || 3010, () => {
  console.log(`Realtime server listening on port ${process.env.PORT || 3010}`);
});
