import { parseJsonResponse } from "../../lib/api";

const CORE_API_BASE = import.meta.env.VITE_CORE_API_BASE;
const REALTIME_WS_BASE =
  import.meta.env.VITE_REALTIME_WS_BASE ||
  CORE_API_BASE.replace(/^http/i, "ws").replace(/\/$/, "") + "/ws/";
export const RELAY_RETENTION_OPTIONS = [
  { seconds: 0, label: "No relay" },
  { seconds: 43200, label: "12 hours" },
  { seconds: 86400, label: "24 hours" },
  { seconds: 172800, label: "48 hours" },
  { seconds: 259200, label: "72 hours" },
  { seconds: 345600, label: "96 hours" }
];

let realtimeSocket = null;
let realtimeSocketKey = null;
let realtimeConnectedPromise = null;

function dispatchRealtimeEvent(type, detail) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

function isMissingLocalConversationError(error) {
  return /unknown dm conversation|no wrapped conversation key exists for this device/i.test(
    String(error?.message || error || "")
  );
}

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

async function handleRealtimeDelivery({ currentUser, relayItem, token }) {
  let message = null;

  try {
    message = await window.secureDm.receiveMessage({
      userId: currentUser.id,
      username: currentUser.username,
      conversationId: relayItem.conversationId,
      relayItem
    });
  } catch (error) {
    if (isMissingLocalConversationError(error)) {
      dispatchRealtimeEvent("secureDmConversationAccessRequired", {
        conversationId: relayItem.conversationId
      });
      return;
    }

    throw error;
  }

  if (relayItem.relayId) {
    const device = await window.secureDm.getDeviceBundle({
      userId: currentUser.id,
      username: currentUser.username
    });

    await fetch(`${CORE_API_BASE}/dm/relay/ack.php`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        relayId: relayItem.relayId,
        deviceId: device.deviceId
      })
    });
  }

  dispatchRealtimeEvent("secureDmMessage", {
    conversationId: relayItem.conversationId,
    message
  });
}

export function closeRealtimeConnection() {
  if (realtimeSocket) {
    realtimeSocket.close();
  }

  realtimeSocket = null;
  realtimeSocketKey = null;
  realtimeConnectedPromise = null;
}

export async function ensureRealtimeConnection({ token, currentUser }) {
  if (!window.secureDm) {
    return null;
  }

  const device = await window.secureDm.getDeviceBundle({
    userId: currentUser.id,
    username: currentUser.username
  });
  const connectionKey = `${currentUser.id}:${device.deviceId}`;

  if (
    realtimeSocket &&
    realtimeSocket.readyState === WebSocket.OPEN &&
    realtimeSocketKey === connectionKey
  ) {
    return realtimeSocket;
  }

  if (realtimeConnectedPromise && realtimeSocketKey === connectionKey) {
    return realtimeConnectedPromise;
  }

  if (realtimeSocket && realtimeSocketKey !== connectionKey) {
    closeRealtimeConnection();
  }

  realtimeSocketKey = connectionKey;
  realtimeConnectedPromise = new Promise((resolve, reject) => {
    const socket = new WebSocket(REALTIME_WS_BASE);
    realtimeSocket = socket;

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        type: "auth",
        userId: currentUser.id,
        deviceId: device.deviceId
      }));
    });

    socket.addEventListener("message", async (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === "auth:ok") {
          socket.send(JSON.stringify({ type: "dm:fetchRelay" }));
          resolve(socket);
          return;
        }

        if (payload.type === "auth:error") {
          reject(new Error(payload.error || "Realtime authentication failed"));
          return;
        }

        if (payload.type === "dm:deliver") {
          await handleRealtimeDelivery({
            currentUser,
            token,
            relayItem: payload
          });
          return;
        }

        if (payload.type === "dm:relayItems") {
          dispatchRealtimeEvent("secureDmSyncState", {
            status: "syncing",
            source: "realtime",
            pendingCount: (payload.items || []).length
          });

          for (const item of payload.items || []) {
            await handleRealtimeDelivery({
              currentUser,
              token,
              relayItem: item
            });
          }

          dispatchRealtimeEvent("secureDmSyncState", {
            status: "complete",
            source: "realtime",
            importedCount: (payload.items || []).length
          });
          return;
        }

        if (payload.type === "dm:queued") {
          dispatchRealtimeEvent("secureDmRelayQueueState", payload);
        }
      } catch (error) {
        console.error("Realtime message handling failed:", error);
      }
    });

    socket.addEventListener("close", () => {
      if (realtimeSocket === socket) {
        realtimeSocket = null;
        realtimeConnectedPromise = null;
        realtimeSocketKey = null;
      }
    });

    socket.addEventListener("error", () => {
      if (socket.readyState !== WebSocket.OPEN) {
        reject(new Error("Realtime connection failed"));
      }
    });
  });

  return realtimeConnectedPromise;
}

export async function initializeSecureDm(currentUser) {
  if (!window.secureDm) {
    throw new Error("Secure DM is only available inside the Electron desktop app");
  }

  return window.secureDm.initializeDevice({
    userId: currentUser.id,
    username: currentUser.username
  });
}

export async function registerSecureDmDevice({ token, currentUser }) {
  const deviceBundle = await window.secureDm.getDeviceBundle({
    userId: currentUser.id,
    username: currentUser.username
  });

  const res = await fetch(`${CORE_API_BASE}/keys/devices/register.php`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(deviceBundle)
  });

  return parseJsonResponse(res, "Failed to register DM device");
}

export async function fetchUserDmDevices({ token, userId }) {
  const res = await fetch(
    `${CORE_API_BASE}/keys/devices/list.php?userId=${encodeURIComponent(userId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return parseJsonResponse(res, "Failed to fetch DM devices");
}

export async function createDirectConversation({
  token,
  currentUser,
  recipientUser,
  relayTtlSeconds
}) {
  const currentDevice = await window.secureDm.getDeviceBundle({
    userId: currentUser.id,
    username: currentUser.username
  });
  const ownDevicesResponse = await fetchUserDmDevices({
    token,
    userId: currentUser.id
  });
  const recipientDevicesResponse = await fetchUserDmDevices({
    token,
    userId: recipientUser.id
  });

  if (!recipientDevicesResponse.devices?.length) {
    throw new Error("That user has not set up secure DMs on any device yet");
  }

  const additionalOwnDevices = (ownDevicesResponse.devices || []).filter(
    (device) => device.deviceId !== currentDevice.deviceId
  );
  const recipientDevices = [
    ...additionalOwnDevices,
    ...(recipientDevicesResponse.devices || [])
  ];

  const localConversation = await window.secureDm.createConversation({
    userId: currentUser.id,
    username: currentUser.username,
    title: `DM with ${recipientUser.username}`,
    participants: [recipientUser.id],
    recipientDevices
  });

  const res = await fetch(`${CORE_API_BASE}/dm/conversations/create.php`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      participantUserIds: [recipientUser.id],
      wrappedKeys: localConversation.wrappedKeys,
      relayTtlSeconds
    })
  });

  const data = await parseJsonResponse(res, "Failed to create DM conversation");
  await window.secureDm.adoptConversationId({
    userId: currentUser.id,
    username: currentUser.username,
    fromConversationId: localConversation.conversationId,
    toConversationId: data.conversation.id,
    title: `DM with ${recipientUser.username}`
  });

  return {
    remoteConversation: data.conversation,
    localConversation: {
      ...localConversation,
      conversationId: data.conversation.id
    }
  };
}

export async function importRemoteConversation({ token, currentUser, conversationId }) {
  const res = await fetch(
    `${CORE_API_BASE}/dm/conversations/get.php?conversationId=${encodeURIComponent(conversationId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
  const data = await parseJsonResponse(res, "Failed to load DM conversation");

  const messages = await window.secureDm.importConversation({
    userId: currentUser.id,
    username: currentUser.username,
    conversation: data.conversation
  });

  return {
    conversation: data.conversation,
    messages
  };
}

export async function sendDirectMessage({
  token,
  currentUser,
  conversationId,
  body
}) {
  const encryptedMessage = await window.secureDm.createMessage({
    userId: currentUser.id,
    username: currentUser.username,
    conversationId,
    senderUserId: currentUser.id,
    plaintext: body
  });

  try {
    const socket = await ensureRealtimeConnection({
      token,
      currentUser
    });

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "dm:send",
        ...encryptedMessage
      }));

      return {
        ok: true,
        message: {
          id: encryptedMessage.messageId,
          conversationId
        }
      };
    }
  } catch (error) {
    console.warn("Realtime send unavailable, falling back to HTTP relay:", error);
  }

  const res = await fetch(`${CORE_API_BASE}/dm/messages/send.php`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(encryptedMessage)
  });

  return parseJsonResponse(res, "Failed to send DM");
}

export async function pullRelayMessages({ token, currentUser }) {
  const device = await window.secureDm.getDeviceBundle({
    userId: currentUser.id,
    username: currentUser.username
  });

  const relayRes = await fetch(
    `${CORE_API_BASE}/dm/relay/pending.php?deviceId=${encodeURIComponent(device.deviceId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
  const relayData = await parseJsonResponse(relayRes, "Failed to load relay messages");
  const imported = [];

  if ((relayData.items || []).length > 0) {
    dispatchRealtimeEvent("secureDmSyncState", {
      status: "syncing",
      source: "poll",
      pendingCount: relayData.items.length
    });
  }

  for (const item of relayData.items) {
    let message;

    try {
      message = await window.secureDm.receiveMessage({
        userId: currentUser.id,
        username: currentUser.username,
        conversationId: item.conversationId,
        relayItem: item
      });
    } catch (error) {
      if (isMissingLocalConversationError(error)) {
        dispatchRealtimeEvent("secureDmConversationAccessRequired", {
          conversationId: item.conversationId
        });
        continue;
      }

      throw error;
    }

    imported.push(message);

    await fetch(`${CORE_API_BASE}/dm/relay/ack.php`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        relayId: item.relayId,
        deviceId: device.deviceId
      })
    });
  }

  if (imported.length > 0) {
    dispatchRealtimeEvent("secureDmSyncState", {
      status: "complete",
      source: "poll",
      importedCount: imported.length
    });
  }

  return imported;
}

export async function updateRelayRetention({
  token,
  conversationId,
  relayTtlSeconds,
  mode = "request"
}) {
  const res = await fetch(`${CORE_API_BASE}/dm/conversations/retention.php`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      conversationId,
      relayTtlSeconds,
      mode
    })
  });

  return parseJsonResponse(res, "Failed to update relay retention");
}
