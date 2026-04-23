import {
  fetchWithNetworkErrorContext,
  parseJsonResponse
} from "../../lib/api";
import { getCoreApiBase, getRealtimeWsBase } from "../../lib/env";
import {
  classifyDmRelayPollError,
  createAppDiagnosticError,
  normalizeAppDiagnosticError,
  recordAppDiagnostic
} from "../../lib/diagnostics.js";
import {
  normalizeOutgoingDeliveryState,
  resolveOutgoingDeliveryStateFromRelayEvent
} from "./deliveryState.js";
import {
  canReadConversationLocally,
  createConversationAccess,
  normalizeConversationAccess
} from "./conversationAccess.js";
import {
  createPendingDeliveryStateQueue,
  flushPendingDeliveryStateQueue
} from "./pendingDeliveryStateQueue.js";
import { normalizeConfiguredPresenceStatus } from "../presence";

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
let realtimeRetryAvailableAt = 0;
let realtimeLastFailureMessage = "";
const REALTIME_RETRY_COOLDOWN_MS = 15000;
const REALTIME_RELAY_ACK_TIMEOUT_MS = 5000;
const RELAY_SYNC_MAX_PAGES_PER_PULL = 5;
const outboundConversationIdByMessageId = new Map();
const pendingDeliveryStateQueue = createPendingDeliveryStateQueue();
const pendingRealtimeRelayAckWaiters = new Map();

function dispatchRealtimeEvent(type, detail) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

function normalizeRelayAckKey(value) {
  return value != null ? String(value).trim() : "";
}

function resolvePendingRealtimeRelayAck(relayId, payload) {
  const relayKey = normalizeRelayAckKey(relayId);

  if (!relayKey) {
    return false;
  }

  const waiter = pendingRealtimeRelayAckWaiters.get(relayKey);

  if (!waiter) {
    return false;
  }

  window.clearTimeout(waiter.timeoutId);
  pendingRealtimeRelayAckWaiters.delete(relayKey);
  waiter.resolve(payload);
  return true;
}

function rejectAllPendingRealtimeRelayAcks(error) {
  pendingRealtimeRelayAckWaiters.forEach((waiter) => {
    window.clearTimeout(waiter.timeoutId);
    waiter.reject(error);
  });
  pendingRealtimeRelayAckWaiters.clear();
}

function isMissingLocalConversationError(error) {
  return /unknown dm conversation|no wrapped conversation key exists for this device/i.test(
    String(error?.message || error || "")
  );
}

function isMissingRelayDeviceError(error) {
  return isDeviceNotRegisteredError(error)
    || /device not found or revoked/i.test(String(error?.message || error || ""));
}

function isMissingSenderBundleError(error) {
  return /missing verified sender device bundle for dm message/i.test(
    String(error?.message || error || "")
  );
}

function isDeviceNotRegisteredError(error) {
  const rawCode = String(error?.code || error?.details?.backendCode || "").trim().toUpperCase();
  return rawCode === "DEVICE_NOT_REGISTERED"
    || rawCode === "DM_DEVICE_NOT_REGISTERED"
    || /sender device is not registered|device is not registered for secure dms/i.test(
      String(error?.message || error || "")
    );
}

function isDeviceReauthRequiredError(error) {
  const rawCode = String(error?.code || error?.details?.backendCode || "").trim().toUpperCase();
  return rawCode === "DEVICE_REAUTH_REQUIRED"
    || rawCode === "DM_DEVICE_REAUTH_REQUIRED"
    || /re-authorized with mfa|revoked for secure dms/i.test(String(error?.message || error || ""));
}

function isSenderDeviceNotRegisteredError(error) {
  return isDeviceNotRegisteredError(error)
    || /sender device is not registered/i.test(String(error?.message || error || ""));
}

export function isDmDeviceReauthRequiredError(error) {
  return String(error?.code || "").trim() === "DM_DEVICE_REAUTH_REQUIRED"
    || isDeviceReauthRequiredError(error);
}

function toDmDeviceStateError(error, extra = {}) {
  if (isDeviceReauthRequiredError(error)) {
    return wrapDmError(error, {
      code: "DM_DEVICE_REAUTH_REQUIRED",
      userMessage: "Secure DMs are blocked on this device until you re-authorize it with MFA.",
      severity: "warning",
      ...extra
    });
  }

  if (isDeviceNotRegisteredError(error)) {
    return wrapDmError(error, {
      code: "DM_DEVICE_NOT_REGISTERED",
      userMessage: "This device is not registered for secure DMs on the server yet.",
      severity: "warning",
      ...extra
    });
  }

  return null;
}

function recordMissingSenderDeviceDiagnostic({ relayItem, currentUser, context }) {
  return recordAppDiagnostic(createAppDiagnosticError({
    code: "DM_RECEIVE_SENDER_DEVICE_MISSING",
    message: "Missing verified sender device bundle for DM message",
    userMessage: "A secure DM could not be verified because the sender device bundle is unavailable.",
    source: "dm",
    operation: "message.receive",
    severity: "warning",
    conversationId: String(relayItem?.conversationId || ""),
    details: {
      relayId: relayItem?.relayId ?? null,
      relayMessageId: String(relayItem?.messageId || ""),
      senderUserId: relayItem?.senderUserId ?? null,
      senderDeviceId: String(relayItem?.senderDeviceId || ""),
      context
    }
  }));
}

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

async function acknowledgeRelayDeliveryViaHttp({
  token,
  currentUser,
  relayId,
  deviceId,
  fallbackMessage,
  userMessage,
  conversationId
}) {
  const resolvedDeviceId = String(
    deviceId
    || (await window.secureDm.getDeviceBundle({
      userId: currentUser.id,
      username: currentUser.username
    })).deviceId
    || ""
  );

  const ackRes = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/dm/relay/ack.php`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      relayId,
      deviceId: resolvedDeviceId
    })
  });

  try {
    const result = await parseJsonResponse(ackRes, {
      fallbackMessage,
      source: "dm",
      operation: "relay.ack",
      method: "POST"
    });

    return {
      ...result,
      ok: result?.ok ?? true,
      relayId: normalizeRelayAckKey(result?.relayId || relayId),
      via: "http"
    };
  } catch (error) {
    throw wrapDmError(error, {
      code: "DM_RELAY_ACK_FAILED",
      userMessage,
      operation: "relay.ack",
      deviceId: resolvedDeviceId,
      conversationId: String(conversationId || "")
    });
  }
}

async function acknowledgeRelayDelivery({
  token,
  currentUser,
  relayId,
  deviceId,
  fallbackMessage,
  userMessage,
  conversationId
}) {
  const relayKey = normalizeRelayAckKey(relayId);

  if (!relayKey) {
    return { ok: false, relayId: "" };
  }

  if (realtimeSocket?.readyState === WebSocket.OPEN) {
    const ackPromise = new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        pendingRealtimeRelayAckWaiters.delete(relayKey);
        reject(new Error(`Timed out waiting for realtime relay ack: ${relayKey}`));
      }, REALTIME_RELAY_ACK_TIMEOUT_MS);

      pendingRealtimeRelayAckWaiters.set(relayKey, {
        resolve,
        reject,
        timeoutId
      });
    });

    try {
      realtimeSocket.send(JSON.stringify({
        type: "dm:ack",
        relayId: relayKey
      }));

      const result = await ackPromise;
      return {
        ...(result || {}),
        ok: result?.ok ?? true,
        relayId: relayKey,
        via: "realtime"
      };
    } catch (_error) {
      const waiter = pendingRealtimeRelayAckWaiters.get(relayKey);

      if (waiter) {
        window.clearTimeout(waiter.timeoutId);
        pendingRealtimeRelayAckWaiters.delete(relayKey);
      }
    }
  }

  return acknowledgeRelayDeliveryViaHttp({
    token,
    currentUser,
    relayId: relayKey,
    deviceId,
    fallbackMessage,
    userMessage,
    conversationId
  });
}

function createMissingLocalConversationAccess() {
  return createConversationAccess({
    conversationId: "",
    status: "missing-local",
    hasConversation: false,
    hasWrappedKey: false,
    hasConversationKey: false
  });
}

export async function getSecureDmConversationAccess({ currentUser, conversationId }) {
  if (!conversationId || !window.secureDm?.getConversationAccess) {
    return createConversationAccess({
      ...createMissingLocalConversationAccess(),
      conversationId
    });
  }

  const access = await window.secureDm.getConversationAccess({
    userId: currentUser?.id,
    username: currentUser?.username,
    conversationId
  });

  return normalizeConversationAccess(access);
}

async function persistSecureDmDeliveryState({
  currentUser,
  conversationId,
  messageId,
  deliveryState
}) {
  if (!conversationId || !messageId || !window.secureDm?.setMessageDeliveryState) {
    return { ok: false };
  }

  try {
    const access = await getSecureDmConversationAccess({
      currentUser,
      conversationId
    });

    if (!canReadConversationLocally(access)) {
      pendingDeliveryStateQueue.enqueue({
        conversationId,
        messageId,
        deliveryState
      });
      return {
        ok: false,
        queued: true,
        access
      };
    }

    const result = await window.secureDm.setMessageDeliveryState({
      userId: currentUser.id,
      conversationId,
      messageId,
      deliveryState
    });

    if (result?.ok === false) {
      pendingDeliveryStateQueue.enqueue({
        conversationId,
        messageId,
        deliveryState
      });
    }

    return result;
  } catch (error) {
    if (isMissingLocalConversationError(error)) {
      pendingDeliveryStateQueue.enqueue({
        conversationId,
        messageId,
        deliveryState
      });
      return {
        ok: false,
        queued: true
      };
    }

    throw error;
  }
}

export async function flushPendingSecureDmDeliveryStates({ currentUser, conversationId }) {
  if (!conversationId || !currentUser || !window.secureDm?.setMessageDeliveryState) {
    return {
      flushedCount: 0,
      remainingCount: 0
    };
  }

  const access = await getSecureDmConversationAccess({
    currentUser,
    conversationId
  });

  if (!canReadConversationLocally(access)) {
    return {
      flushedCount: 0,
      remainingCount: pendingDeliveryStateQueue.list(conversationId).length
    };
  }

  return flushPendingDeliveryStateQueue(pendingDeliveryStateQueue, {
    conversationId,
    persist: async (entry) => {
      try {
        return await window.secureDm.setMessageDeliveryState({
          userId: currentUser.id,
          conversationId: entry.conversationId,
          messageId: entry.messageId,
          deliveryState: entry.deliveryState
        });
      } catch (error) {
        if (isMissingLocalConversationError(error)) {
          return { ok: false, queued: true };
        }

        console.warn("Failed to flush queued secure DM delivery state:", error);
        return { ok: false };
      }
    }
  });
}

function createRealtimeError(message, code, extra = {}) {
  const severity = [
    "DM_REALTIME_TEMP_UNAVAILABLE",
    "DM_DEVICE_REAUTH_REQUIRED",
    "DM_DEVICE_NOT_REGISTERED"
  ].includes(code) ? "warning" : "error";
  const error = createAppDiagnosticError({
    code,
    message,
    userMessage: extra.userMessage || message,
    source: "dm",
    operation: "realtime.connect",
    severity,
    endpoint: REALTIME_WS_BASE,
    details: {
      retryAt: extra.retryAt || null
    },
    cause: extra.cause
  });
  Object.assign(error, extra);
  return error;
}

export function isRealtimeConnectionUnavailableError(error) {
  return [
    "DM_REALTIME_CONNECT_FAILED",
    "DM_REALTIME_AUTH_FAILED",
    "DM_REALTIME_TEMP_UNAVAILABLE",
    "DM_DEVICE_REAUTH_REQUIRED",
    "DM_DEVICE_NOT_REGISTERED"
  ].includes(String(error?.code || ""));
}

function createUserFacingDmError(message, code, extra = {}) {
  return createAppDiagnosticError({
    code,
    message,
    userMessage: message,
    source: "dm",
    operation: extra.operation || "conversation",
    severity: extra.severity || "warning",
    endpoint: extra.endpoint || "",
    deviceId: extra.deviceId || "",
    conversationId: extra.conversationId || "",
    friendUserId: extra.friendUserId || "",
    details: extra.details,
    cause: extra.cause
  });
}

function wrapDmError(error, overrides = {}) {
  return normalizeAppDiagnosticError(error, {
    source: "dm",
    severity: "error",
    ...overrides
  });
}

function hasConversationRecipientKey(device) {
  return Boolean(device?.deviceId && device?.encryptionPublicKey);
}

async function fetchCurrentUserRegisteredDmDevice({ token, currentUser, deviceId }) {
  const res = await fetch(
    `${CORE_API_BASE}/keys/devices/list.php?userId=${encodeURIComponent(currentUser.id)}&includeRevoked=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = await parseJsonResponse(res, "Failed to verify DM device registration");
  return (data.devices || []).find(
    (entry) => String(entry.deviceId) === String(deviceId)
  ) || null;
}

async function ensureCurrentDeviceCanUseSecureDm({ token, currentUser, device, throwIfUnavailable = false }) {
  const registeredDevice = await fetchCurrentUserRegisteredDmDevice({
    token,
    currentUser,
    deviceId: device.deviceId
  });

  if (registeredDevice && !registeredDevice.revokedAt) {
    return registeredDevice;
  }

  if (!throwIfUnavailable) {
    return null;
  }

  throw createUserFacingDmError(
    "This device is not approved for secure DMs yet. Approve it from a trusted device first.",
    "dm_device_not_registered"
  );
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

async function fetchDmDeviceList({ token, userId, includeRevoked, endpoint, operation }) {
  const res = await fetch(
    `${CORE_API_BASE}${endpoint}?userId=${encodeURIComponent(userId)}&includeRevoked=${includeRevoked ? "1" : "0"}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = await parseJsonResponse(res, {
    fallbackMessage: "Failed to fetch DM devices",
    source: "dm",
    operation,
    method: "GET"
  });
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

function mergeFetchedDeviceLists(primaryResponse, secondaryResponse) {
  const mergedById = new Map();

  const absorb = (devices = [], source) => {
    for (const device of devices) {
      const key = String(device?.deviceId || "");
      if (!key) {
        continue;
      }

      const existing = mergedById.get(key);
      if (!existing) {
        mergedById.set(key, {
          ...device,
          deviceSource: source
        });
        continue;
      }

      const existingScore = Number(Boolean(!existing.revokedAt)) * 4
        + Number(Boolean(existing.signatureVerified)) * 2
        + Number(existing.deviceSource === "keys");
      const nextScore = Number(Boolean(!device.revokedAt)) * 4
        + Number(Boolean(device.signatureVerified)) * 2
        + Number(source === "keys");

      if (nextScore > existingScore) {
        mergedById.set(key, {
          ...existing,
          ...device,
          deviceSource: source
        });
      } else {
        mergedById.set(key, {
          ...device,
          ...existing,
          deviceSource: existing.deviceSource || source
        });
      }
    }
  };

  absorb(primaryResponse?.devices || [], "keys");
  absorb(secondaryResponse?.devices || [], "legacy-dm");

  return Array.from(mergedById.values());
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
  const outboundMessageId = encryptedMessage?.messageId != null
    ? String(encryptedMessage.messageId)
    : "";

  if (outboundMessageId) {
    outboundConversationIdByMessageId.set(outboundMessageId, String(conversationId));
  }

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

  async function sendEncryptedMessageViaHttp() {
    if (outboundMessageId) {
      outboundConversationIdByMessageId.delete(outboundMessageId);
    }

    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/dm/messages/send.php`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(encryptedMessage)
    });

    return parseJsonResponse(res, {
      fallbackMessage: "Failed to send DM",
      source: "dm",
      operation: "message.send",
      method: "POST"
    });
  }

  try {
    return await sendEncryptedMessageViaHttp();
  } catch (error) {
    const deviceStateError = toDmDeviceStateError(error, {
      operation: "message.send",
      deviceId: String(encryptedMessage?.senderDeviceId || ""),
      conversationId: String(conversationId || "")
    });

    if (deviceStateError?.code === "DM_DEVICE_REAUTH_REQUIRED") {
      throw deviceStateError;
    }

    if (!isSenderDeviceNotRegisteredError(error) && !deviceStateError) {
      throw error;
    }

    console.warn("Sender device was not registered on the server. Re-registering and retrying DM send once.", error);
    await registerSecureDmDevice({
      token,
      currentUser
    });

    return sendEncryptedMessageViaHttp();
  }
}

async function handleRealtimeDelivery({ currentUser, relayItem, token }) {
  let message = null;
  let senderDevice = relayItem?.senderDevice || null;

  if (!senderDevice && relayItem?.senderUserId && relayItem?.senderDeviceId) {
    const senderDevices = await fetchUserDmDevices({
      token,
      userId: relayItem.senderUserId,
      includeRevoked: true,
      requiredDeviceId: relayItem.senderDeviceId
    });
    senderDevice = (senderDevices.devices || []).find(
      (device) => String(device.deviceId) === String(relayItem.senderDeviceId)
    ) || null;
  }

  if (!senderDevice && relayItem?.senderDeviceId) {
    recordMissingSenderDeviceDiagnostic({
      relayItem,
      currentUser,
      context: "realtime"
    });
    return null;
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

    if (isMissingSenderBundleError(error)) {
      recordMissingSenderDeviceDiagnostic({
        relayItem,
        currentUser,
        context: "realtime"
      });
      return;
    }

    throw error;
  }

  if (relayItem.relayId) {
    await acknowledgeRelayDelivery({
      token,
      currentUser,
      relayId: relayItem.relayId,
      fallbackMessage: "Failed to acknowledge relay delivery",
      userMessage: "A secure DM arrived, but Chatapp could not confirm it with the server.",
      conversationId: relayItem.conversationId
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
  rejectAllPendingRealtimeRelayAcks(new Error("Realtime connection closed"));

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

  if (Date.now() < realtimeRetryAvailableAt) {
    throw createRealtimeError(
      realtimeLastFailureMessage || "Realtime is temporarily unavailable. Please retry in a moment.",
      "DM_REALTIME_TEMP_UNAVAILABLE",
      {
        retryAt: realtimeRetryAvailableAt
      }
    );
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
    let hasAuthenticatedConnection = false;
    let realtimeRelayPageCount = 0;
    let realtimeRelayImportedCount = 0;

    function requestRealtimeRelayPage(afterRelayId = null) {
      realtimeRelayPageCount += 1;
      socket.send(JSON.stringify({
        type: "dm:fetchRelay",
        ...(afterRelayId ? { afterRelayId } : {})
      }));
    }

    function cleanupConnectionState() {
      if (realtimeSocket === socket) {
        realtimeSocket = null;
        realtimeConnectedPromise = null;
        realtimeSocketKey = null;
      }
    }

    function failConnection(message, code = "DM_REALTIME_CONNECT_FAILED") {
      if (settled) {
        return;
      }

      settled = true;
      realtimeRetryAvailableAt = Date.now() + REALTIME_RETRY_COOLDOWN_MS;
      realtimeLastFailureMessage = String(message || "Realtime connection failed");
      cleanupConnectionState();

      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }

      reject(createRealtimeError(realtimeLastFailureMessage, code, {
        retryAt: realtimeRetryAvailableAt
      }));
    }

    function finishConnection() {
      if (settled) {
        return;
      }

      settled = true;
      realtimeRetryAvailableAt = 0;
      realtimeLastFailureMessage = "";
      resolve(socket);
      dispatchRealtimeEvent("secureDmRealtimeConnected", {
        userId: currentUser.id,
        deviceId: device.deviceId,
        connectionKey
      });
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
          hasAuthenticatedConnection = true;
          realtimeRelayPageCount = 0;
          realtimeRelayImportedCount = 0;
          requestRealtimeRelayPage();
          finishConnection();
          return;
        }

        if (payload.type === "auth:error") {
          const backendCode = String(payload.code || "").trim().toUpperCase();

          if (backendCode === "DEVICE_REAUTH_REQUIRED") {
            failConnection(
              payload.error || "Secure DMs are blocked on this device until you re-authorize it with MFA.",
              "DM_DEVICE_REAUTH_REQUIRED"
            );
            return;
          }

          if (backendCode === "DEVICE_NOT_REGISTERED") {
            failConnection(
              payload.error || "This device is not registered for secure DM realtime yet.",
              "DM_DEVICE_NOT_REGISTERED"
            );
            return;
          }

          failConnection(payload.error || "Realtime authentication failed", "DM_REALTIME_AUTH_FAILED");
          return;
        }

        if (payload.type === "dm:ack:ok") {
          resolvePendingRealtimeRelayAck(payload.relayId, {
            ok: true,
            relayId: normalizeRelayAckKey(payload.relayId)
          });
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
          const relayItems = Array.isArray(payload.items) ? payload.items : [];
          dispatchRealtimeEvent("secureDmSyncState", {
            status: "syncing",
            source: "realtime",
            pendingCount: relayItems.length,
            page: realtimeRelayPageCount,
            hasMore: Boolean(payload.hasMore)
          });

          let importedCount = 0;

          for (const item of relayItems) {
            const message = await handleRealtimeDelivery({
              currentUser,
              token,
              relayItem: item
            });

            if (message?.imported === true) {
              importedCount += 1;
            }
          }

          realtimeRelayImportedCount += importedCount;

          const lastRelayId = relayItems.length > 0
            ? relayItems[relayItems.length - 1].relayId
            : null;
          const nextAfterRelayId = payload.nextAfterRelayId || lastRelayId;

          if (
            payload.hasMore
            && nextAfterRelayId
            && realtimeRelayPageCount < RELAY_SYNC_MAX_PAGES_PER_PULL
          ) {
            requestRealtimeRelayPage(nextAfterRelayId);
            return;
          }

          if (payload.hasMore && realtimeRelayPageCount >= RELAY_SYNC_MAX_PAGES_PER_PULL) {
            dispatchRealtimeEvent("secureDmSyncState", {
              status: "idle",
              source: "realtime",
              importedCount: realtimeRelayImportedCount,
              hasMore: true,
              pageLimitReached: true
            });
            return;
          }

          if (realtimeRelayImportedCount > 0) {
            dispatchRealtimeEvent("secureDmSyncState", {
              status: "complete",
              source: "realtime",
              importedCount: realtimeRelayImportedCount
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
          const messageId = payload.messageId != null ? String(payload.messageId) : "";
          const conversationId = messageId
            ? outboundConversationIdByMessageId.get(messageId) || null
            : null;
          const deliveryState = resolveOutgoingDeliveryStateFromRelayEvent(payload);

          if (messageId) {
            outboundConversationIdByMessageId.delete(messageId);
          }

          if (conversationId && window.secureDm?.setMessageDeliveryState) {
            try {
              await persistSecureDmDeliveryState({
                currentUser,
                conversationId,
                messageId,
                deliveryState
              });
            } catch (error) {
              console.warn("Failed to persist secure DM delivery state:", error);
            }
          }

          dispatchRealtimeEvent("secureDmRelayQueueState", {
            ...payload,
            conversationId,
            deliveryState
          });
          return;
        }

        if (payload.type === "dm:delivery-update") {
          const messageId = payload.messageId != null ? String(payload.messageId) : "";
          const conversationId = payload.conversationId != null ? String(payload.conversationId) : "";
          const deliveryState = normalizeOutgoingDeliveryState(payload.deliveryState || "sent");

          dispatchRealtimeEvent("secureDmDeliveryUpdate", {
            ...payload,
            conversationId,
            messageId,
            deliveryState
          });

          if (conversationId && messageId && window.secureDm?.setMessageDeliveryState) {
            try {
              await persistSecureDmDeliveryState({
                currentUser,
                conversationId,
                messageId,
                deliveryState
              });
            } catch (error) {
              console.warn("Failed to persist secure DM delivery upgrade:", error);
            }
          }
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

    socket.addEventListener("close", (event) => {
      rejectAllPendingRealtimeRelayAcks(new Error("Realtime relay ack channel closed"));

      if (!settled) {
        failConnection("Realtime connection closed during authentication", "DM_REALTIME_CONNECT_FAILED");
        return;
      }

      cleanupConnectionState();

      if (hasAuthenticatedConnection) {
        dispatchRealtimeEvent("secureDmRealtimeDisconnected", {
          userId: currentUser.id,
          deviceId: device.deviceId,
          connectionKey,
          code: event.code,
          reason: event.reason || ""
        });
      }
    });

    socket.addEventListener("error", () => {
      if (!settled && socket.readyState !== WebSocket.OPEN) {
        failConnection("Realtime connection failed", "DM_REALTIME_CONNECT_FAILED");
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

  try {
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/keys/devices/register.php`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(deviceBundle)
    });

    const data = await parseJsonResponse(res, {
      fallbackMessage: "Failed to register DM device",
      source: "dm",
      operation: "device.register",
      method: "POST"
    });

    if (data?.approvalRequired) {
      recordAppDiagnostic(createAppDiagnosticError({
        code: "DM_DEVICE_APPROVAL_REQUIRED",
        message: "This server is still using the legacy pending-device approval flow for secure DMs.",
        userMessage: "This server is still using the legacy pending-device approval flow for secure DMs.",
        source: "dm",
        operation: "device.register",
        severity: "warning",
        deviceId: String(deviceBundle?.deviceId || ""),
        details: {
          pendingDeviceId: String(data?.device?.deviceId || deviceBundle?.deviceId || ""),
          approverRequired: true
        }
      }));
    }

    if (data?.device) {
      try {
        await window.secureDm.verifyDeviceBundles({
          expectedUserId: currentUser.id,
          devices: [data.device]
        });
      } catch (error) {
        throw wrapDmError(error, {
          code: "DM_DEVICE_BUNDLE_VERIFY_FAILED",
          userMessage: "Chatapp could not verify the device bundle returned by the server.",
          operation: "device.verifyBundle",
          deviceId: String(data.device.deviceId || deviceBundle?.deviceId || "")
        });
      }
    }

    return data;
  } catch (error) {
    const deviceStateError = toDmDeviceStateError(error, {
      operation: "device.register",
      deviceId: String(deviceBundle?.deviceId || "")
    });

    if (deviceStateError) {
      throw deviceStateError;
    }

    if (String(error?.code || "").startsWith("DM_DEVICE_")) {
      throw error;
    }

    throw wrapDmError(error, {
      code: "DM_DEVICE_REGISTER_FAILED",
      userMessage: "Could not register this device for secure direct messages.",
      operation: "device.register"
    });
  }
}

export async function reauthorizeDmDevice({ token, currentUser, deviceId, totpCode }) {
  try {
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/keys/devices/reauthorize.php`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        deviceId,
        totpCode
      })
    });

    const data = await parseJsonResponse(res, {
      fallbackMessage: "Failed to re-authorize DM device",
      source: "dm",
      operation: "device.reauthorize",
      method: "POST"
    });
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
  } catch (error) {
    if (String(error?.code || "").trim().toUpperCase() === "MFA_REQUIRED_FOR_DEVICE_REAUTH") {
      throw wrapDmError(error, {
        code: "DM_DEVICE_REAUTH_REQUIRED",
        userMessage: "Set up MFA on this account before re-authorizing a revoked DM device.",
        operation: "device.reauthorize",
        deviceId: String(deviceId || ""),
        severity: "warning"
      });
    }

    const deviceStateError = toDmDeviceStateError(error, {
      operation: "device.reauthorize",
      deviceId: String(deviceId || "")
    });

    if (deviceStateError) {
      throw deviceStateError;
    }

    throw wrapDmError(error, {
      code: "DM_DEVICE_REAUTH_REQUIRED",
      userMessage: String(error?.userMessage || error?.message || "Could not re-authorize that secure DM device right now."),
      operation: "device.reauthorize",
      deviceId: String(deviceId || "")
    });
  }
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

export async function fetchUserDmDevices({ token, userId, includeRevoked = false, requiredDeviceId = "" }) {
  const primaryResponse = await fetchDmDeviceList({
    token,
    userId,
    includeRevoked,
    endpoint: "/keys/devices/list.php",
    operation: "device.list"
  });
  const normalizedRequiredDeviceId = String(requiredDeviceId || "");
  const hasRequiredPrimaryDevice = normalizedRequiredDeviceId
    ? (primaryResponse.devices || []).some((device) => String(device.deviceId) === normalizedRequiredDeviceId)
    : false;
  const shouldFetchLegacyFallback = normalizedRequiredDeviceId
    ? !hasRequiredPrimaryDevice
    : (primaryResponse.devices || []).length === 0;

  if (!shouldFetchLegacyFallback) {
    return primaryResponse;
  }

  try {
    const legacyResponse = await fetchDmDeviceList({
      token,
      userId,
      includeRevoked,
      endpoint: "/dm/devices/list.php",
      operation: "device.listLegacy"
    });

    return {
      ...primaryResponse,
      includesLegacyFallback: true,
      devices: mergeFetchedDeviceLists(primaryResponse, legacyResponse)
    };
  } catch (error) {
    console.warn("Legacy DM device fallback failed:", error);
    return primaryResponse;
  }
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
  try {
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
      throw createUserFacingDmError(
        `${recipientUser.username} has not set up secure DMs on any device yet.`,
        "DM_RECIPIENT_DEVICES_UNAVAILABLE",
        {
          operation: "conversation.create",
          friendUserId: String(recipientUser.id || "")
        }
      );
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
        "DM_RECIPIENT_DEVICES_UNAVAILABLE",
        {
          operation: "conversation.create",
          friendUserId: String(recipientUser.id || "")
        }
      );
    }

    if (!verifiedRecipientDevices.length) {
      throw createUserFacingDmError(
        `${recipientUser.username} needs to open the latest Chatapp on one of their devices or rotate their DM keys before you can start an encrypted chat. Their current DM devices could not be verified yet.`,
        "DM_RECIPIENT_DEVICES_UNVERIFIED",
        {
          operation: "conversation.create",
          friendUserId: String(recipientUser.id || "")
        }
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

    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/dm/conversations/create.php`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        participantUserIds: [recipientUser.id],
        wrappedKeys: localConversation.wrappedKeys,
        relayTtlSeconds,
        messageTtlSeconds
      })
    });

    const data = await parseJsonResponse(res, {
      fallbackMessage: "Failed to create DM conversation",
      source: "dm",
      operation: "conversation.create",
      method: "POST"
    });
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
  } catch (error) {
    if (
      [
        "DM_RECIPIENT_DEVICES_UNAVAILABLE",
        "DM_RECIPIENT_DEVICES_UNVERIFIED"
      ].includes(String(error?.code || ""))
    ) {
      throw error;
    }

    throw wrapDmError(error, {
      code: "DM_CONVERSATION_CREATE_FAILED",
      userMessage: "Could not start the encrypted chat right now.",
      operation: "conversation.create",
      friendUserId: String(recipientUser?.id || "")
    });
  }
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

  await window.secureDm.importConversation({
    userId: currentUser.id,
    username: currentUser.username,
    conversation: data.conversation
  });
  const access = await getSecureDmConversationAccess({
    currentUser,
    conversationId
  });

  if (!canReadConversationLocally(access)) {
    return {
      conversation: data.conversation,
      messages: null,
      missingKey: true
    };
  }

  await flushPendingSecureDmDeliveryStates({
    currentUser,
    conversationId
  });

  return {
    conversation: data.conversation,
    messages: await window.secureDm.listMessages({
      userId: currentUser.id,
      conversationId
    }),
    missingKey: false
  };
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
      attachments: Array.isArray(messageOptions.attachments) ? messageOptions.attachments : [],
      embeds: Array.isArray(messageOptions.embeds) ? messageOptions.embeds : []
    }
  });
}

export async function sendSecureDmRealtimeEvent({ token, currentUser, payload }) {
  const socket = await ensureRealtimeConnection({
    token,
    currentUser
  });

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw createRealtimeError("Realtime connection is not available", "DM_REALTIME_CONNECT_FAILED");
  }

  socket.send(JSON.stringify(payload));

  return { ok: true };
}

export async function updateSecureDmPresenceStatus({ token, currentUser, status }) {
  const socket = await ensureRealtimeConnection({
    token,
    currentUser
  });

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw createRealtimeError("Realtime connection is not available", "DM_REALTIME_CONNECT_FAILED");
  }

  socket.send(JSON.stringify({
    type: "presence:set-status",
    status: normalizeConfiguredPresenceStatus(status)
  }));

  return {
    ok: true,
    status: normalizeConfiguredPresenceStatus(status)
  };
}

export async function subscribeSecureDmPresence({ token, currentUser, userIds }) {
  const socket = await ensureRealtimeConnection({
    token,
    currentUser
  });

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw createRealtimeError("Realtime connection is not available", "DM_REALTIME_CONNECT_FAILED");
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

  const registeredDevice = await ensureCurrentDeviceCanUseSecureDm({
    token,
    currentUser,
    device,
    throwIfUnavailable: false
  });

  if (!registeredDevice) {
    return [];
  }

  const imported = [];
  let afterRelayId = "";
  let hasMore = true;
  let pageCount = 0;
  let sawRelayItems = false;

  while (hasMore && pageCount < RELAY_SYNC_MAX_PAGES_PER_PULL) {
    const relayUrl = new URL(`${CORE_API_BASE}/dm/relay/pending.php`);
    relayUrl.searchParams.set("deviceId", device.deviceId);

    if (afterRelayId) {
      relayUrl.searchParams.set("afterRelayId", afterRelayId);
    }

    const relayRes = await fetchWithNetworkErrorContext(
      relayUrl.toString(),
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    let relayData;

    try {
      relayData = await parseJsonResponse(relayRes, {
        fallbackMessage: "Failed to load relay messages",
        source: "dm",
        operation: "relay.poll",
        method: "GET"
      });
    } catch (error) {
      const relayError = classifyDmRelayPollError(error, {
        endpoint: `${CORE_API_BASE}/dm/relay/pending.php`,
        deviceId: String(device.deviceId || "")
      });

      recordAppDiagnostic(relayError);
      throw relayError;
    }

    const relayItems = Array.isArray(relayData.items) ? relayData.items : [];
    pageCount += 1;

    if (relayItems.length > 0) {
      sawRelayItems = true;
      dispatchRealtimeEvent("secureDmSyncState", {
        status: "syncing",
        source: "poll",
        pendingCount: relayItems.length,
        page: pageCount,
        hasMore: Boolean(relayData.hasMore)
      });
    }

    for (const item of relayItems) {
      let message;
      let senderDevice = item.senderDevice || null;
      const senderDevices = !senderDevice && item.senderUserId
        ? await fetchUserDmDevices({
            token,
            userId: item.senderUserId,
            includeRevoked: true,
            requiredDeviceId: item.senderDeviceId
          })
        : { devices: [] };
      if (!senderDevice) {
        senderDevice = (senderDevices.devices || []).find(
          (device) => String(device.deviceId) === String(item.senderDeviceId)
        ) || null;
      }

      if (!senderDevice && item.senderDeviceId) {
        recordMissingSenderDeviceDiagnostic({
          relayItem: item,
          currentUser,
          context: "relay-poll"
        });
        continue;
      }

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

        if (isMissingSenderBundleError(error)) {
          recordMissingSenderDeviceDiagnostic({
            relayItem: item,
            currentUser,
            context: "relay-poll"
          });
          continue;
        }

        throw error;
      }

      if (message?.imported === true) {
        imported.push(message);
      }

      await acknowledgeRelayDelivery({
        token,
        currentUser,
        relayId: item.relayId,
        deviceId: device.deviceId,
        fallbackMessage: "Failed to acknowledge relay message",
        userMessage: "Chatapp imported a secure DM but could not confirm it with the server.",
        conversationId: item.conversationId
      });
    }

    const lastRelayId = relayItems.length > 0
      ? relayItems[relayItems.length - 1].relayId
      : null;
    afterRelayId = String(relayData.nextAfterRelayId || lastRelayId || "");
    hasMore = Boolean(relayData.hasMore && afterRelayId);
  }

  if (imported.length > 0) {
    dispatchRealtimeEvent("secureDmSyncState", {
      status: "complete",
      source: "poll",
      importedCount: imported.length,
      hasMore
    });
  } else if (sawRelayItems) {
    dispatchRealtimeEvent("secureDmSyncState", {
      status: "idle",
      source: "poll",
      importedCount: 0,
      hasMore
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
