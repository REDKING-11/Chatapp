import { parseJsonResponse } from "../../lib/api";
import { getCoreApiBase, getRealtimeWsBase } from "../../lib/env";

const CORE_API_BASE = getCoreApiBase();
const REALTIME_WS_BASE = getRealtimeWsBase();
export const RELAY_RETENTION_OPTIONS = [
  { seconds: 0, label: "No relay" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 21600, label: "6 hours" },
  { seconds: 43200, label: "12 hours" },
  { seconds: 86400, label: "24 hours" }
];
export const DISAPPEARING_MESSAGE_OPTIONS = [
  { seconds: 0, label: "Off" },
  { seconds: 86400, label: "24 hours" },
  { seconds: 259200, label: "3 days" },
  { seconds: 604800, label: "7 days" },
  { seconds: 1209600, label: "14 days" },
  { seconds: 2592000, label: "30 days" },
  { seconds: 5184000, label: "2 months" },
  { seconds: 10368000, label: "4 months" },
  { seconds: 15552000, label: "6 months" }
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

function isMissingRelayDeviceError(error) {
  return /device not found or revoked/i.test(String(error?.message || error || ""));
}

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

function createUserFacingDmError(message, code) {
  const error = new Error(message);
  error.code = code;
  error.userMessage = message;
  return error;
}

function hasConversationRecipientKey(device) {
  return Boolean(device?.deviceId && device?.encryptionPublicKey);
}

async function inspectDeviceList({ expectedUserId, devices }) {
  const inspectedDevices = [];

  for (const device of Array.isArray(devices) ? devices : []) {
    try {
      const verification = await window.secureDm.verifyDeviceBundles({
        expectedUserId,
        devices: [device]
      });
      const verifiedDevice = (verification.devices || [])[0] || device;
      inspectedDevices.push({
        ...device,
        ...verifiedDevice,
        signatureVerified: true,
        verificationError: null
      });
    } catch (error) {
      inspectedDevices.push({
        ...device,
        userId: Number(device?.userId),
        signatureVerified: false,
        verificationError: String(error?.message || error || "Device bundle verification failed")
      });
    }
  }

  return inspectedDevices;
}

async function queueEncryptedConversationMessage({
  token,
  currentUser,
  conversationId,
  plaintext
}) {
  const encryptedMessage = await window.secureDm.createMessage({
    userId: currentUser.id,
    username: currentUser.username,
    conversationId,
    senderUserId: currentUser.id,
    plaintext
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

async function handleRealtimeDelivery({ currentUser, relayItem, token }) {
  let message = null;
  let senderDevice = null;

  if (relayItem?.senderUserId && relayItem?.senderDeviceId) {
    const senderDevices = await fetchUserDmDevices({
      token,
      userId: relayItem.senderUserId,
      includeRevoked: true
    });
    senderDevice = (senderDevices.devices || []).find(
      (device) => String(device.deviceId) === String(relayItem.senderDeviceId)
    ) || null;
  }

  try {
    message = await window.secureDm.receiveMessage({
      userId: currentUser.id,
      username: currentUser.username,
      conversationId: relayItem.conversationId,
      relayItem,
      senderDevice
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

  if (message?.imported === true) {
    dispatchRealtimeEvent("secureDmMessage", {
      conversationId: relayItem.conversationId,
      message
    });
  }

  return message;
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

  if (!token) {
    throw new Error("Realtime authentication token is required");
  }

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
    let settled = false;

    function cleanupConnectionState() {
      if (realtimeSocket === socket) {
        realtimeSocket = null;
        realtimeConnectedPromise = null;
        realtimeSocketKey = null;
      }
    }

    function failConnection(message) {
      if (settled) {
        return;
      }

      settled = true;
      cleanupConnectionState();

      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }

      reject(new Error(message));
    }

    function finishConnection() {
      if (settled) {
        return;
      }

      settled = true;
      resolve(socket);
    }

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        type: "auth",
        userId: currentUser.id,
        deviceId: device.deviceId,
        token
      }));
    });

    socket.addEventListener("message", async (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === "auth:ok") {
          socket.send(JSON.stringify({ type: "dm:fetchRelay" }));
          finishConnection();
          return;
        }

        if (payload.type === "auth:error") {
          failConnection(payload.error || "Realtime authentication failed");
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

          let importedCount = 0;

          for (const item of payload.items || []) {
            const message = await handleRealtimeDelivery({
              currentUser,
              token,
              relayItem: item
            });

            if (message?.imported === true) {
              importedCount += 1;
            }
          }

          if (importedCount > 0) {
            dispatchRealtimeEvent("secureDmSyncState", {
              status: "complete",
              source: "realtime",
              importedCount
            });
          } else {
            dispatchRealtimeEvent("secureDmSyncState", {
              status: "idle",
              source: "realtime",
              importedCount: 0
            });
          }
          return;
        }

        if (payload.type === "dm:queued") {
          dispatchRealtimeEvent("secureDmRelayQueueState", payload);
          return;
        }

        if (payload.type === "presence:snapshot") {
          dispatchRealtimeEvent("secureDmPresenceSnapshot", payload);
          return;
        }

        if (payload.type === "presence:update") {
          dispatchRealtimeEvent("secureDmPresenceUpdate", payload);
          return;
        }

        if (String(payload.type || "").startsWith("dm:file:")) {
          dispatchRealtimeEvent("secureDmFileSignal", payload);
        }
      } catch (error) {
        console.error("Realtime message handling failed:", error);
      }
    });

    socket.addEventListener("close", () => {
      if (!settled) {
        failConnection("Realtime connection closed during authentication");
        return;
      }

      cleanupConnectionState();
    });

    socket.addEventListener("error", () => {
      if (!settled && socket.readyState !== WebSocket.OPEN) {
        failConnection("Realtime connection failed");
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

  const data = await parseJsonResponse(res, "Failed to register DM device");

  if (data?.device) {
    await window.secureDm.verifyDeviceBundles({
      expectedUserId: currentUser.id,
      devices: [data.device]
    });
  }

  return data;
}

export async function fetchPendingDmDeviceApprovals({ token }) {
  const res = await fetch(`${CORE_API_BASE}/keys/devices/pending.php`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return parseJsonResponse(res, "Failed to fetch pending DM device approvals");
}

export async function approvePendingDmDevice({ token, currentUser, requestId, approverDeviceId }) {
  const res = await fetch(`${CORE_API_BASE}/keys/devices/approve.php`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      requestId,
      approverDeviceId
    })
  });

  const data = await parseJsonResponse(res, "Failed to approve pending DM device");
  const inspectedDevices = await inspectDeviceList({
    expectedUserId: currentUser.id,
    devices: data.devices || []
  });

  return {
    ...data,
    devices: inspectedDevices.map((device) => ({
      ...device,
      revokedAt: data.devices?.find((entry) => String(entry.deviceId) === String(device.deviceId))?.revokedAt || null
    }))
  };
}

export async function fetchUserDmDevices({ token, userId, includeRevoked = false }) {
  const res = await fetch(
    `${CORE_API_BASE}/keys/devices/list.php?userId=${encodeURIComponent(userId)}&includeRevoked=${includeRevoked ? "1" : "0"}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = await parseJsonResponse(res, "Failed to fetch DM devices");
  const inspectedDevices = await inspectDeviceList({
    expectedUserId: userId,
    devices: data.devices || []
  });

  return {
    ...data,
    devices: inspectedDevices.map((device) => ({
      ...device,
      revokedAt: data.devices?.find((entry) => String(entry.deviceId) === String(device.deviceId))?.revokedAt || null
    }))
  };
}

export async function revokeDmDevice({ token, currentUser, deviceId }) {
  const res = await fetch(`${CORE_API_BASE}/keys/devices/revoke.php`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ deviceId })
  });
  const data = await parseJsonResponse(res, "Failed to revoke DM device");
  const inspectedDevices = await inspectDeviceList({
    expectedUserId: currentUser.id,
    devices: data.devices || []
  });

  return {
    ...data,
    devices: inspectedDevices
  };
}

async function refreshConversationWrappedKeys({ token, currentUser, conversation, rekey = false }) {
  const deviceCache = new Map();

  async function getDevicesForUser(userId) {
    const key = String(userId);

    if (!deviceCache.has(key)) {
      deviceCache.set(key, await fetchUserDmDevices({
        token,
        userId
      }));
    }

    return deviceCache.get(key);
  }

  const activeRecipientDevices = [];

  for (const participantUserId of conversation.participantUserIds || []) {
    const devicesResponse = await getDevicesForUser(participantUserId);

    for (const device of devicesResponse.devices || []) {
      activeRecipientDevices.push({
        userId: participantUserId,
        deviceId: device.deviceId,
        encryptionPublicKey: device.encryptionPublicKey
      });
    }
  }

  const activeWrappedKeys = rekey
    ? (await window.secureDm.rotateConversationKey({
        userId: currentUser.id,
        username: currentUser.username,
        conversationId: conversation.conversationId,
        recipientDevices: activeRecipientDevices
      })).wrappedKeys
    : await Promise.all(activeRecipientDevices.map((device) => (
        window.secureDm.createWrappedKey({
          userId: currentUser.id,
          username: currentUser.username,
          conversationId: conversation.conversationId,
          recipientUserId: device.userId,
          recipientDeviceId: device.deviceId,
          recipientPublicKey: device.encryptionPublicKey
        })
      )));

  const rewrapRes = await fetch(`${CORE_API_BASE}/dm/conversations/rewrap.php`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      conversationId: conversation.conversationId,
      wrappedKeys: activeWrappedKeys
    })
  });
  await parseJsonResponse(rewrapRes, "Failed to refresh DM device access");

  await window.secureDm.syncConversationMetadata({
    userId: currentUser.id,
    username: currentUser.username,
    conversation: {
      conversationId: conversation.conversationId,
      title: conversation.title,
      participantUserIds: conversation.participantUserIds,
      wrappedKeys: activeWrappedKeys
    }
  });

  return activeWrappedKeys;
}

export async function revokeDmDeviceAndRewrapConversations({ token, currentUser, deviceId }) {
  const revocation = await revokeDmDevice({
    token,
    currentUser,
    deviceId
  });
  const conversations = await window.secureDm.listConversations({
    userId: currentUser.id,
    username: currentUser.username
  });

  for (const conversation of conversations || []) {
    const refreshedWrappedKeys = await refreshConversationWrappedKeys({
      token,
      currentUser,
      conversation,
      rekey: true
    });

    if ((conversation.participantUserIds || []).some((participantId) => Number(participantId) !== Number(currentUser.id))) {
      await queueEncryptedConversationMessage({
        token,
        currentUser,
        conversationId: conversation.conversationId,
        plaintext: {
          kind: "message",
          body: `${currentUser.username} updated their trusted DM devices.`,
          attachments: []
        }
      });
    }

    if (!refreshedWrappedKeys.length) {
      continue;
    }
  }

  return revocation;
}

export async function rotateCurrentDmDeviceKeys({ token, currentUser }) {
  if (!window.secureDm) {
    throw new Error("Secure DM is only available inside the Electron desktop app");
  }

  await window.secureDm.beginDeviceIdentityRotation({
    userId: currentUser.id,
    username: currentUser.username
  });

  try {
    await registerSecureDmDevice({
      token,
      currentUser
    });

    const conversations = await window.secureDm.listConversations({
      userId: currentUser.id,
      username: currentUser.username
    });

    for (const conversation of conversations || []) {
      await refreshConversationWrappedKeys({
        token,
        currentUser,
        conversation,
        rekey: true
      });
    }

    await window.secureDm.commitDeviceIdentityRotation({
      userId: currentUser.id
    });
  } catch (error) {
    try {
      await window.secureDm.rollbackDeviceIdentityRotation({
        userId: currentUser.id,
        username: currentUser.username
      });

      try {
        await registerSecureDmDevice({
          token,
          currentUser
        });
      } catch (restoreError) {
        console.error("Failed to restore previous DM device bundle after rotation error:", restoreError);
      }
    } catch (rollbackError) {
      console.error("Failed to roll back DM device identity after rotation error:", rollbackError);
    }

    throw error;
  }

  return fetchUserDmDevices({
    token,
    userId: currentUser.id,
    includeRevoked: true
  });
}

export async function createDirectConversation({
  token,
  currentUser,
  recipientUser,
  relayTtlSeconds,
  messageTtlSeconds = 0
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
    (device) => device.deviceId !== currentDevice.deviceId && hasConversationRecipientKey(device)
  );
  const usableRecipientDevices = (recipientDevicesResponse.devices || []).filter(
    (device) => hasConversationRecipientKey(device)
  );
  const verifiedRecipientDevices = usableRecipientDevices.filter(
    (device) => device.signatureVerified === true
  );

  if (!usableRecipientDevices.length) {
    throw createUserFacingDmError(
      `${recipientUser.username} needs to reopen Chatapp to finish setting up secure DMs before you can start an encrypted chat.`,
      "dm_recipient_devices_unavailable"
    );
  }

  if (!verifiedRecipientDevices.length) {
    throw createUserFacingDmError(
      `${recipientUser.username} needs to open the latest Chatapp on one of their devices or rotate their DM keys before you can start an encrypted chat. Their current DM devices could not be verified yet.`,
      "dm_recipient_devices_unverified"
    );
  }

  const recipientDevices = [
    ...additionalOwnDevices,
    ...verifiedRecipientDevices
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
      relayTtlSeconds,
      messageTtlSeconds
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

  try {
    const messages = await window.secureDm.importConversation({
      userId: currentUser.id,
      username: currentUser.username,
      conversation: data.conversation
    });

    return {
      conversation: data.conversation,
      messages
    };
  } catch (error) {
    // Surface missing-key failures as a structured result so the caller can
    // offer a recovery flow rather than showing a generic error toast.
    if (error?.code === "dm_missing_conversation_key") {
      return {
        conversation: data.conversation,
        messages: null,
        missingKey: true
      };
    }
    throw error;
  }
}

/**
 * Diagnose which conversations on this device are missing a decryption key,
 * then attempt to recover each one by re-importing it from the server.
 *
 * Conversations that still fail after a server re-import — because the server
 * holds no wrapped key for this device either — are returned in `unrecoverable`
 * so the UI can prompt the user to use a device transfer package instead.
 */
export async function recoverMissingConversationKeys({ token, currentUser }) {
  const diagnosis = await window.secureDm.diagnoseMissingKeys({
    userId: currentUser.id,
    username: currentUser.username
  });

  const recovered = [];
  const unrecoverable = [];

  for (const entry of diagnosis.missing || []) {
    try {
      const result = await importRemoteConversation({
        token,
        currentUser,
        conversationId: entry.conversationId
      });

      if (result.missingKey) {
        unrecoverable.push({ ...entry, reason: "no_server_key" });
      } else {
        recovered.push(entry.conversationId);
      }
    } catch {
      unrecoverable.push({ ...entry, reason: "fetch_failed" });
    }
  }

  return { recovered, unrecoverable };
}

export async function sendDirectMessage({
  token,
  currentUser,
  conversationId,
  body,
  messageOptions = {}
}) {
  return queueEncryptedConversationMessage({
    token,
    currentUser,
    conversationId,
    plaintext: {
      kind: messageOptions.kind || "message",
      body,
      replyTo: messageOptions.replyTo || null,
      targetMessageId: messageOptions.targetMessageId || null,
      emoji: messageOptions.emoji || null,
      attachments: Array.isArray(messageOptions.attachments) ? messageOptions.attachments : []
    }
  });
}

export async function sendSecureDmRealtimeEvent({ token, currentUser, payload }) {
  const socket = await ensureRealtimeConnection({
    token,
    currentUser
  });

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw new Error("Realtime connection is not available");
  }

  socket.send(JSON.stringify(payload));

  return { ok: true };
}

export async function subscribeSecureDmPresence({ token, currentUser, userIds }) {
  const socket = await ensureRealtimeConnection({
    token,
    currentUser
  });

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw new Error("Realtime connection is not available");
  }

  const normalizedUserIds = [
    ...new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((userId) => Number(userId))
        .filter((userId) => Number.isInteger(userId) && userId > 0)
    )
  ];

  socket.send(JSON.stringify({
    type: "presence:subscribe",
    userIds: normalizedUserIds
  }));

  return { ok: true, userIds: normalizedUserIds };
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
  let relayData;

  try {
    relayData = await parseJsonResponse(relayRes, "Failed to load relay messages");
  } catch (error) {
    if (relayRes.status === 404 && isMissingRelayDeviceError(error)) {
      return [];
    }

    throw error;
  }

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
    const senderDevices = item.senderUserId
      ? await fetchUserDmDevices({
          token,
          userId: item.senderUserId,
          includeRevoked: true
        })
      : { devices: [] };
    const senderDevice = (senderDevices.devices || []).find(
      (device) => String(device.deviceId) === String(item.senderDeviceId)
    ) || null;

    try {
      message = await window.secureDm.receiveMessage({
        userId: currentUser.id,
        username: currentUser.username,
        conversationId: item.conversationId,
        relayItem: item,
        senderDevice
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

    if (message?.imported === true) {
      imported.push(message);
    }

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
  } else if ((relayData.items || []).length > 0) {
    dispatchRealtimeEvent("secureDmSyncState", {
      status: "idle",
      source: "poll",
      importedCount: 0
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

export async function updateDisappearingMessages({
  token,
  currentUser,
  conversationId,
  messageTtlSeconds,
  mode = "request"
}) {
  const res = await fetch(`${CORE_API_BASE}/dm/conversations/disappearing.php`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      conversationId,
      messageTtlSeconds,
      mode
    })
  });

  const data = await parseJsonResponse(res, "Failed to update disappearing messages");

  if (currentUser && conversationId && window.secureDm) {
    try {
      await queueEncryptedConversationMessage({
        token,
        currentUser,
        conversationId,
        plaintext: {
          kind: mode === "accept" ? "disappearing-accept" : "disappearing-request",
          body: "",
          messageTtlSeconds:
            data?.conversation?.disappearingPolicy?.currentSeconds
            ?? data?.conversation?.disappearingPolicy?.pendingSeconds
            ?? messageTtlSeconds
            ?? 0,
          mode
        }
      });

      if (data?.conversation) {
        await window.secureDm.syncConversationMetadata({
          userId: currentUser.id,
          username: currentUser.username,
          conversation: data.conversation
        });
      }
    } catch (error) {
      console.warn("Failed to emit encrypted disappearing-message control event:", error);
    }
  }

  return data;
}
