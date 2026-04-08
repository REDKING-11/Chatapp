require("dotenv").config();

const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const mysql = require("mysql2/promise");

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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

  ws.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.type === "auth") {
        const { userId, deviceId } = data;

        if (!userId || !deviceId) {
          sendJson(ws, { type: "auth:error", error: "userId and deviceId are required" });
          return;
        }

        authedUserId = Number(userId);
        authedDeviceId = String(deviceId);
        onlineDevices.set(authedDeviceId, {
          ws,
          userId: authedUserId
        });

        sendJson(ws, { type: "auth:ok", deviceId: authedDeviceId });
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
          tag
        } = data;

        if (!conversationId || !messageId || !senderDeviceId || !Array.isArray(recipientDeviceIds)) {
          sendJson(ws, { type: "error", error: "Invalid dm:send payload" });
          return;
        }

        const undelivered = [];
        const dropped = [];

        for (const recipientDeviceId of recipientDeviceIds) {
          const onlineTarget = onlineDevices.get(String(recipientDeviceId));

          if (onlineTarget) {
            sendJson(onlineTarget.ws, {
              type: "dm:deliver",
              relayId: null,
              conversationId,
              messageId,
              senderDeviceId,
              ciphertext,
              nonce,
              aad,
              tag
            });
          } else {
            undelivered.push(String(recipientDeviceId));
          }
        }

        if (undelivered.length > 0) {
          const relayTtlSeconds = await getConversationRelayTtlSeconds(conversationId);

          if (relayTtlSeconds > 0) {
            const values = undelivered.map((recipientDeviceId) => [
              String(messageId),
              Number(conversationId),
              recipientDeviceId,
              String(senderDeviceId),
              String(ciphertext),
              String(nonce),
              String(aad),
              String(tag),
              relayTtlSeconds
            ]);

            await pool.query(
              `
              INSERT INTO dm_relay_queue
                (message_id, conversation_id, recipient_device_id, sender_device_id, ciphertext, nonce, aad, tag, expires_at)
              VALUES
                ${values.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))").join(", ")}
              `,
              values.flat()
            );
          } else {
            dropped.push(...undelivered);
          }
        }

        sendJson(ws, {
          type: "dm:queued",
          messageId,
          offlineRecipients: undelivered.filter((deviceId) => !dropped.includes(deviceId)),
          droppedRecipients: dropped
        });
        return;
      }

      if (data.type === "dm:fetchRelay") {
        const [rows] = await pool.query(
          `
          SELECT id, message_id, conversation_id, recipient_device_id, sender_device_id, ciphertext, nonce, aad, tag, created_at, expires_at
          FROM dm_relay_queue
          WHERE recipient_device_id = ?
            AND acked_at IS NULL
            AND expires_at > UTC_TIMESTAMP()
          ORDER BY created_at ASC
          `,
          [authedDeviceId]
        );

        sendJson(ws, {
          type: "dm:relayItems",
          items: rows.map((row) => ({
            relayId: row.id,
            messageId: row.message_id,
            conversationId: row.conversation_id,
            recipientDeviceId: row.recipient_device_id,
            senderDeviceId: row.sender_device_id,
            ciphertext: row.ciphertext,
            nonce: row.nonce,
            aad: row.aad,
            tag: row.tag,
            createdAt: row.created_at,
            expiresAt: row.expires_at
          }))
        });
        return;
      }

      if (data.type === "dm:ack") {
        const { relayId } = data;

        if (!relayId) {
          sendJson(ws, { type: "error", error: "relayId is required" });
          return;
        }

        await pool.query(
          `DELETE FROM dm_relay_queue WHERE id = ? AND recipient_device_id = ?`,
          [Number(relayId), authedDeviceId]
        );

        sendJson(ws, { type: "dm:ack:ok", relayId });
      }
    } catch (error) {
      sendJson(ws, { type: "error", error: error.message });
    }
  });

  ws.on("close", () => {
    if (authedDeviceId) {
      onlineDevices.delete(authedDeviceId);
    }
  });
});

server.listen(process.env.PORT || 3010, () => {
  console.log(`Realtime server listening on port ${process.env.PORT || 3010}`);
});
