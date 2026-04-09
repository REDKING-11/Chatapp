export function getSelectedServerStorageKey(userId) {
    return `selectedJoinedServerId_${userId}`;
}

export function loadSelectedServerId(userId) {
    const key = getSelectedServerStorageKey(userId);
    return localStorage.getItem(key);
}

export function saveSelectedServerId(userId, serverId) {
    const key = getSelectedServerStorageKey(userId);

    if (serverId) {
        localStorage.setItem(key, serverId);
    } else {
        localStorage.removeItem(key);
    }
}

export function clearSelectedServerId(userId) {
    const key = getSelectedServerStorageKey(userId);
    localStorage.removeItem(key);
}

export function getServerTrustWarningStorageKey(userId, serverId) {
    return `serverTrustWarningSeen_${userId}_${serverId}`;
}

export function hasSeenServerTrustWarning(userId, serverId) {
    if (!userId || !serverId) {
        return false;
    }

    return localStorage.getItem(getServerTrustWarningStorageKey(userId, serverId)) === "1";
}

export function markServerTrustWarningSeen(userId, serverId) {
    if (!userId || !serverId) {
        return;
    }

    localStorage.setItem(getServerTrustWarningStorageKey(userId, serverId), "1");
}

export function clearServerTrustWarningSeen(userId, serverId) {
    if (!userId || !serverId) {
        return;
    }

    localStorage.removeItem(getServerTrustWarningStorageKey(userId, serverId));
}
