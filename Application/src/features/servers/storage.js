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