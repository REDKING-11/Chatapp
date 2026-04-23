import {
    fetchWithNetworkErrorContext,
    parseJsonResponse
} from "../../lib/api";
import { getCoreApiBase } from "../../lib/env";
import { normalizeAppDiagnosticError } from "../../lib/diagnostics.js";
import { getStoredAuthToken } from "../session/actions";
import {
    canReadConversationLocally
} from "../dm/conversationAccess.js";
import {
    createDirectConversation,
    DISAPPEARING_MESSAGE_OPTIONS,
    fetchUserDmDevices,
    flushPendingSecureDmDeliveryStates,
    getSecureDmConversationAccess,
    importRemoteConversation,
    RELAY_RETENTION_OPTIONS,
    updateRelayRetention,
    updateDisappearingMessages,
    sendDirectMessage
} from "../dm/actions";

const CORE_API_BASE = getCoreApiBase();

function wrapFriendsError(error, overrides = {}) {
    return normalizeAppDiagnosticError(error, {
        source: "friends",
        severity: "error",
        ...overrides
    });
}

function authHeaders() {
    const token = getStoredAuthToken();

    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
    };
}

function createMissingLocalConversationAccessError(conversationId) {
    const error = new Error(
        "This device does not have the local secure DM keys for that conversation yet. Reopen the chat after the local data migration completes, or import your DM device transfer package if this is a new device."
    );
    error.code = "FRIENDS_DM_LOCAL_ACCESS_REQUIRED";
    error.conversationId = String(conversationId || "");
    return error;
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

async function syncLocalConversationMetadata({ currentUser, conversation }) {
    if (!window.secureDm?.syncConversationMetadata || !conversation?.id) {
        return;
    }

    try {
        await window.secureDm.syncConversationMetadata({
            userId: currentUser.id,
            username: currentUser.username,
            conversation
        });
    } catch (error) {
        console.warn("Failed to sync local DM conversation metadata:", error);
    }
}

async function hasLocalConversationAccess({ currentUser, conversationId }) {
    const access = await getSecureDmConversationAccess({
        currentUser,
        conversationId
    });

    return canReadConversationLocally(access);
}

export async function fetchFriends() {
    try {
        const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/friends/list.php`, {
            headers: {
                Authorization: `Bearer ${getStoredAuthToken()}`
            }
        });

        return await parseJsonResponse(res, {
            fallbackMessage: "Failed to load friends",
            source: "friends",
            operation: "friends.load",
            method: "GET"
        });
    } catch (error) {
        throw wrapFriendsError(error, {
            code: "FRIENDS_LOAD_FAILED",
            userMessage: "Could not load your friends right now.",
            operation: "friends.load"
        });
    }
}

export async function fetchFriendProfileDescription({ friendUserId }) {
    try {
        const res = await fetchWithNetworkErrorContext(
            `${CORE_API_BASE}/friends/profile_description.php?friendUserId=${encodeURIComponent(friendUserId)}`,
            {
                headers: {
                    Authorization: `Bearer ${getStoredAuthToken()}`
                }
            }
        );

        return await parseJsonResponse(res, {
            fallbackMessage: "Failed to load friend profile description",
            source: "friends",
            operation: "friends.profileDescription.fetch",
            method: "GET"
        });
    } catch (error) {
        throw wrapFriendsError(error, {
            code: "FRIENDS_PROFILE_DESCRIPTION_FETCH_FAILED",
            userMessage: "Could not load that friend's profile description right now.",
            operation: "friends.profileDescription.fetch",
            friendUserId: String(friendUserId || "")
        });
    }
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
        await syncLocalConversationMetadata({
            currentUser,
            conversation: remoteConversation
        });
        const hasAccess = await hasLocalConversationAccess({
            currentUser,
            conversationId: friend.conversationId
        });

        if (!hasAccess) {
            const imported = await importRemoteConversation({
                token: getStoredAuthToken(),
                currentUser,
                conversationId: friend.conversationId
            });
            const access = await getSecureDmConversationAccess({
                currentUser,
                conversationId: friend.conversationId
            });

            return {
                conversationId: friend.conversationId,
                messages: imported.messages || [],
                conversation: imported.conversation || remoteConversation,
                hasLocalAccess: canReadConversationLocally(access)
            };
        }

        await flushPendingSecureDmDeliveryStates({
            currentUser,
            conversationId: friend.conversationId
        });

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
    try {
        const device = await window.secureDm.getDeviceBundle({
            userId: currentUser.id,
            username: currentUser.username
        });

        const pendingRes = await fetchWithNetworkErrorContext(
            `${CORE_API_BASE}/friends/history_pending.php?deviceId=${encodeURIComponent(device.deviceId)}`,
            {
                headers: {
                    Authorization: `Bearer ${getStoredAuthToken()}`
                }
            }
        );
        const pendingData = await parseJsonResponse(pendingRes, {
            fallbackMessage: "Failed to load pending history downloads",
            source: "friends",
            operation: "history.import.pending",
            method: "GET"
        });
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

            const ackRes = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/friends/history_ack.php`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({
                    transferId: item.transferId
                })
            });
            await parseJsonResponse(ackRes, {
                fallbackMessage: "Failed to acknowledge imported conversation history",
                source: "friends",
                operation: "history.import.ack",
                method: "POST"
            });
        }

        return imported;
    } catch (error) {
        throw wrapFriendsError(error, {
            code: "FRIENDS_HISTORY_IMPORT_FAILED",
            userMessage: "Could not import pending conversation history right now.",
            operation: "history.import"
        });
    }
}

export async function initializeFriendDirectConversation({ currentUser, friend, relayTtlSeconds, messageTtlSeconds = 0 }) {
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
            conversation: opened.conversation,
            hasLocalAccess: opened.hasLocalAccess !== false
        };
    }

    const created = await createDirectConversation({
        token,
        currentUser,
        recipientUser: {
            id: friend.friendUserId,
            username: friend.friendUsername
        },
        relayTtlSeconds,
        messageTtlSeconds
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
        conversation: conversation || opened.conversation,
        hasLocalAccess: opened.hasLocalAccess !== false
    };
}

export async function sendFriendDirectMessage({
    currentUser,
    friend,
    body,
    relayTtlSeconds,
    messageTtlSeconds = 0,
    replyTo = null,
    attachments = [],
    embeds = []
}) {
    try {
        const initialized = await initializeFriendDirectConversation({
            currentUser,
            friend,
            relayTtlSeconds,
            messageTtlSeconds
        });
        const conversationId = initialized.conversationId;

        if (initialized.hasLocalAccess === false) {
            throw createMissingLocalConversationAccessError(conversationId);
        }

        const sendResult = await sendDirectMessage({
            token: getStoredAuthToken(),
            currentUser,
            conversationId,
            body,
            messageOptions: {
              kind: "message",
              replyTo,
              attachments,
              embeds
            }
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
            outboundMessageId: sendResult?.message?.id || null,
            messages: opened.messages,
            conversation: initialized.conversation || opened.conversation
        };
    } catch (error) {
        throw wrapFriendsError(error, {
            code: "FRIENDS_DM_SEND_FAILED",
            userMessage: String(error?.userMessage || "").trim() || "Could not send that message right now.",
            operation: "dm.send",
            friendUserId: String(friend?.friendUserId || ""),
            conversationId: String(friend?.conversationId || "")
        });
    }
}

export async function editFriendDirectMessage({ currentUser, friend, messageId, body, embeds = [] }) {
    await sendDirectMessage({
        token: getStoredAuthToken(),
        currentUser,
        conversationId: friend.conversationId,
        body,
        messageOptions: {
            kind: "edit",
            targetMessageId: messageId,
            embeds
        }
    });

    return openFriendConversation({
        currentUser,
        friend
    });
}

export async function deleteFriendDirectMessage({ currentUser, friend, messageId }) {
    await sendDirectMessage({
        token: getStoredAuthToken(),
        currentUser,
        conversationId: friend.conversationId,
        body: "",
        messageOptions: {
            kind: "delete",
            targetMessageId: messageId
        }
    });

    return openFriendConversation({
        currentUser,
        friend
    });
}

export async function toggleFriendDirectReaction({ currentUser, friend, messageId, emoji }) {
    await sendDirectMessage({
        token: getStoredAuthToken(),
        currentUser,
        conversationId: friend.conversationId,
        body: "",
        messageOptions: {
            kind: "reaction",
            targetMessageId: messageId,
            emoji
        }
    });

    return openFriendConversation({
        currentUser,
        friend
    });
}

export async function requestFriendRelayRetention({ conversationId, relayTtlSeconds }) {
    const token = getStoredAuthToken();
    const data = await updateRelayRetention({
        token,
        conversationId,
        relayTtlSeconds,
        mode: "request"
    });

    return data.conversation || null;
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

    return data.conversation || null;
}

export async function requestFriendDisappearingMessages({ currentUser, conversationId, messageTtlSeconds }) {
    const token = getStoredAuthToken();
    const data = await updateDisappearingMessages({
        token,
        currentUser,
        conversationId,
        messageTtlSeconds,
        mode: "request"
    });

    return data.conversation || null;
}

export async function acceptFriendDisappearingMessages({ currentUser, conversationId }) {
    const token = getStoredAuthToken();
    const fallbackSeconds = DISAPPEARING_MESSAGE_OPTIONS.find((option) => option.seconds === 1209600)?.seconds ?? 1209600;
    const data = await updateDisappearingMessages({
        token,
        currentUser,
        conversationId,
        messageTtlSeconds: fallbackSeconds,
        mode: "accept"
    });

    return data.conversation || null;
}
