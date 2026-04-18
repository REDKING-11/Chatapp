const DEFAULT_PRESENCE_STATUS = "online";
const VALID_PRESENCE_STATUSES = new Set(["online", "free", "busy", "chilling", "off"]);

function normalizePresenceStatus(status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  return VALID_PRESENCE_STATUSES.has(normalizedStatus)
    ? normalizedStatus
    : DEFAULT_PRESENCE_STATUS;
}

function getEffectiveUserPresence(onlineDevices, userId, options = {}) {
  const normalizedUserId = Number(userId);
  const excludedDeviceId = options.excludeDeviceId ? String(options.excludeDeviceId) : null;
  let latestConnection = null;

  for (const [deviceId, connection] of onlineDevices.entries()) {
    if (excludedDeviceId && String(deviceId) === excludedDeviceId) {
      continue;
    }

    if (Number(connection?.userId) !== normalizedUserId) {
      continue;
    }

    if (
      !latestConnection
      || Number(connection?.presenceUpdatedAt || 0) >= Number(latestConnection?.presenceUpdatedAt || 0)
    ) {
      latestConnection = connection;
    }
  }

  if (!latestConnection) {
    return {
      state: "offline",
      status: null
    };
  }

  return {
    state: "online",
    status: normalizePresenceStatus(latestConnection.presenceStatus)
  };
}

function createPresencePayload(onlineDevices, userId, options = {}) {
  const effectivePresence = getEffectiveUserPresence(onlineDevices, userId, options);

  return {
    userId: Number(userId),
    state: effectivePresence.state,
    status: effectivePresence.status
  };
}

function updateDevicePresence(onlineDevices, deviceId, status, updatedAt = Date.now()) {
  const existingConnection = onlineDevices.get(deviceId);

  if (!existingConnection) {
    return null;
  }

  const nextConnection = {
    ...existingConnection,
    presenceStatus: normalizePresenceStatus(status),
    presenceUpdatedAt: Number(updatedAt) || Date.now()
  };
  onlineDevices.set(deviceId, nextConnection);
  return nextConnection;
}

module.exports = {
  DEFAULT_PRESENCE_STATUS,
  VALID_PRESENCE_STATUSES,
  normalizePresenceStatus,
  getEffectiveUserPresence,
  createPresencePayload,
  updateDevicePresence
};
