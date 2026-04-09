import { parseJsonResponse } from "../../lib/api";
import { getCoreApiBase } from "../../lib/env";
import { getStoredAuthToken } from "../session/actions";
import {
    createDirectConversation,
    fetchUserDmDevices,
    importRemoteConversation,
    RELAY_RETENTION_OPTIONS,
    updateRelayRetention,
    sendDirectMessage
} from "../dm/actions";

const CORE_API_BASE = getCoreApiBase();

function authHeaders() {
    const token = getStoredAuthToken();

    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
    };
}

function isMissingLocalConversationError(error) {
    return /unknown dm conversation|no wrapped conversation key exists for this device/i.test(
        String(error?.message || error || "")
    );
}

async function fetchRemoteConversationMetadata(conversationId) {
    const res = await fetch(
        `${CORE_API_BASE}/dm/conversations/get.php?conversationId=${encodeURIComponent(conversationId)}`,
        {
            headers: {
                Authorization: `Bearer ${getStoredAuthToken()}`
            }
        }
    );
    const data = await parseJsonResponse(res, "Failed to load conversation details");

    return data.conversation || { id: conversationId };
}

async function hasLocalConversationAccess({ currentUser, conversationId }) {
    if (!conversationId || !window.secureDm) {
        return false;
    }

    try {
        await window.secureDm.listMessages({
            userId: currentUser.id,
            conversationId
        });
        return true;
    } catch (error) {
        if (isMissingLocalConversationError(error)) {
            return false;
        }

        throw error;
    }
}

export async function fetchFriends() {
    const res = await fetch(`${CORE_API_BASE}/friends/list.php`, {
        headers: {
            Authorization: `Bearer ${getStoredAuthToken()}`
        }
    });

    return parseJsonResponse(res, "Failed to load friends");
}

export async function fetchHistoryAccessStatus({ friendUserId, conversationId }) {
    const res = await fetch(
        `${CORE_API_BASE}/friends/history_status.php?friendUserId=${encodeURIComponent(friendUserId)}&conversationId=${encodeURIComponent(conversationId)}`,
        {
            headers: {
                Authorization: `Bearer ${getStoredAuthToken()}`
            }
        }
    );

    return parseJsonResponse(res, "Failed to load history request status");
}

export async function sendFriendRequest(username) {
    const res = await fetch(`${CORE_API_BASE}/friends/request.php`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ username })
    });

    return parseJsonResponse(res, "Failed to send friend request");
}

export async function requestFriendConversationHistory({ currentUser, friend }) {
    const token = getStoredAuthToken();
    const device = await window.secureDm.getDeviceBundle({
        userId: currentUser.id,
        username: currentUser.username
    });

    const res = await fetch(`${CORE_API_BASE}/friends/history_request.php`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
            friendUserId: friend.friendUserId,
            conversationId: friend.conversationId,
            requesterDeviceId: device.deviceId
        })
    });

    await parseJsonResponse(res, "Failed to request previous conversation");
    return fetchHistoryAccessStatus({
        friendUserId: friend.friendUserId,
        conversationId: friend.conversationId
    });
}

export async function acceptFriendRequest(friendshipId) {
    const res = await fetch(`${CORE_API_BASE}/friends/accept.php`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ friendshipId })
    });

    return parseJsonResponse(res, "Failed to accept friend request");
}

export async function removeFriend(friendshipId, options = {}) {
    const res = await fetch(`${CORE_API_BASE}/friends/remove.php`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
            friendshipId,
            hardDelete: Boolean(options.hardDelete)
        })
    });

    return parseJsonResponse(res, "Failed to remove friend");
}

export async function approveFriendConversationHistory({ currentUser, friend, request }) {
    const device = await window.secureDm.getDeviceBundle({
        userId: currentUser.id,
        username: currentUser.username
    });
    const requesterDevices = await fetchUserDmDevices({
        token: getStoredAuthToken(),
        userId: request.requesterUserId
    });
    const requesterDevice = (requesterDevices.devices || []).find(
        (entry) => entry.deviceId === request.requesterDeviceId
    );

    if (!requesterDevice) {
        throw new Error("Requesting device is no longer available");
    }

    const wrappedKey = await window.secureDm.createWrappedKey({
        userId: currentUser.id,
        username: currentUser.username,
        conversationId: friend.conversationId,
        recipientUserId: request.requesterUserId,
        recipientDeviceId: request.requesterDeviceId,
        recipientPublicKey: requesterDevice.encryptionPublicKey
    });
    const conversation = await window.secureDm.exportConversationPackage({
        userId: currentUser.id,
        username: currentUser.username,
        conversationId: friend.conversationId
    });

    const res = await fetch(`${CORE_API_BASE}/friends/history_approve.php`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
            requestId: request.id,
            approverDeviceId: device.deviceId,
            wrappedKey: JSON.stringify(wrappedKey),
            conversationBlob: JSON.stringify(conversation),
            status: "approved"
        })
    });

    return parseJsonResponse(res, "Failed to approve previous conversation download");
}

export async function declineFriendConversationHistory({ requestId, currentUser }) {
    const device = await window.secureDm.getDeviceBundle({
        userId: currentUser.id,
        username: currentUser.username
    });

    const res = await fetch(`${CORE_API_BASE}/friends/history_approve.php`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
            requestId,
            approverDeviceId: device.deviceId,
            status: "declined"
        })
    });

    return parseJsonResponse(res, "Failed to decline previous conversation download");
}

export async function linkFriendConversation(friendUserId, conversationId) {
    const res = await fetch(`${CORE_API_BASE}/friends/link_dm.php`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ friendUserId, conversationId })
    });

    return parseJsonResponse(res, "Failed to link DM conversation");
}

export async function openFriendConversation({ currentUser, friend }) {
    if (friend.conversationId) {
        const remoteConversation = await fetchRemoteConversationMetadata(friend.conversationId);
        const hasAccess = await hasLocalConversationAccess({
            currentUser,
            conversationId: friend.conversationId
        });

        if (!hasAccess) {
            try {
                const imported = await importRemoteConversation({
                    token: getStoredAuthToken(),
                    currentUser,
                    conversationId: friend.conversationId
                });

                return {
                    conversationId: friend.conversationId,
                    messages: imported.messages || [],
                    conversation: imported.conversation || remoteConversation,
                    hasLocalAccess: true
                };
            } catch (error) {
                if (!isMissingLocalConversationError(error)) {
                    throw error;
                }
            }

            return {
                conversationId: friend.conversationId,
                messages: [],
                conversation: remoteConversation,
                hasLocalAccess: false
            };
        }

        return {
            conversationId: friend.conversationId,
            messages: await window.secureDm.listMessages({
                userId: currentUser.id,
                conversationId: friend.conversationId
            }),
            conversation: remoteConversation,
            hasLocalAccess: true
        };
    }

    return {
        conversationId: null,
        messages: [],
        conversation: null,
        hasLocalAccess: false
    };
}

export async function importPendingHistoryTransfers({ currentUser }) {
    const device = await window.secureDm.getDeviceBundle({
        userId: currentUser.id,
        username: currentUser.username
    });

    const pendingRes = await fetch(
        `${CORE_API_BASE}/friends/history_pending.php?deviceId=${encodeURIComponent(device.deviceId)}`,
        {
            headers: {
                Authorization: `Bearer ${getStoredAuthToken()}`
            }
        }
    );
    const pendingData = await parseJsonResponse(pendingRes, "Failed to load pending history downloads");
    const imported = [];

    for (const item of pendingData.items || []) {
        const messages = await window.secureDm.importConversationPackage({
            userId: currentUser.id,
            username: currentUser.username,
            conversation: JSON.parse(item.conversationBlob),
            wrappedKey: JSON.parse(item.wrappedKey)
        });
        imported.push({
            transferId: item.transferId,
            conversationId: item.conversationId,
            messages
        });

        await fetch(`${CORE_API_BASE}/friends/history_ack.php`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
                transferId: item.transferId
            })
        });
    }

    return imported;
}

export async function initializeFriendDirectConversation({ currentUser, friend, relayTtlSeconds }) {
    const token = getStoredAuthToken();
    let conversationId = friend.conversationId;
    let conversation = null;

    if (conversationId) {
        const opened = await openFriendConversation({
            currentUser,
            friend
        });

        return {
            conversationId,
            messages: opened.messages,
            conversation: opened.conversation
        };
    }

    const created = await createDirectConversation({
        token,
        currentUser,
        recipientUser: {
            id: friend.friendUserId,
            username: friend.friendUsername
        },
        relayTtlSeconds
    });

    conversationId = created.remoteConversation.id;
    conversation = created.remoteConversation;
    await linkFriendConversation(friend.friendUserId, conversationId);

    const opened = await openFriendConversation({
        currentUser,
        friend: {
            ...friend,
            conversationId
        }
    });

    return {
        conversationId,
        messages: opened.messages,
        conversation: conversation || opened.conversation
    };
}

export async function sendFriendDirectMessage({ currentUser, friend, body, relayTtlSeconds }) {
    const initialized = await initializeFriendDirectConversation({
        currentUser,
        friend,
        relayTtlSeconds
    });
    const conversationId = initialized.conversationId;

    await sendDirectMessage({
        token: getStoredAuthToken(),
        currentUser,
        conversationId,
        body
    });

    const opened = await openFriendConversation({
        currentUser,
        friend: {
            ...friend,
            conversationId
        }
    });

    return {
        conversationId,
        messages: opened.messages,
        conversation: initialized.conversation || opened.conversation
    };
}

export async function requestFriendRelayRetention({ conversationId, relayTtlSeconds }) {
    const token = getStoredAuthToken();
    const data = await updateRelayRetention({
        token,
        conversationId,
        relayTtlSeconds,
        mode: "request"
    });

    return data.conversation?.relayPolicy || null;
}

export async function acceptFriendRelayRetention({ conversationId }) {
    const token = getStoredAuthToken();
    const fallbackSeconds = RELAY_RETENTION_OPTIONS.find((option) => option.seconds === 86400)?.seconds ?? 86400;
    const data = await updateRelayRetention({
        token,
        conversationId,
        relayTtlSeconds: fallbackSeconds,
        mode: "accept"
    });

    return data.conversation?.relayPolicy || null;
}
