import { parseJsonResponse } from "../../lib/api";
import { getCoreApiBase } from "../../lib/env";
import { getStoredAuthToken } from "../session/actions";
import {
    canReadConversationLocally
} from "../dm/conversationAccess.js";
import {
    fetchUserDmDevices,
    flushPendingSecureDmDeliveryStates,
    getSecureDmConversationAccess,
    importRemoteConversation,
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

function createMissingLocalConversationAccessError(conversationId) {
    const error = new Error(
        "This device does not have the local secure DM keys for that conversation yet. Reopen the chat after the local data migration completes, or import your DM device transfer package if this is a new device."
    );
    error.code = "GROUP_DM_LOCAL_ACCESS_REQUIRED";
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
        console.warn("Failed to sync local group conversation metadata:", error);
    }
}

async function hasLocalConversationAccess({ currentUser, conversationId }) {
    const access = await getSecureDmConversationAccess({
        currentUser,
        conversationId
    });

    return canReadConversationLocally(access);
}

export async function fetchGroupConversations() {
    const res = await fetch(`${CORE_API_BASE}/dm/conversations/list.php`, {
        headers: {
            Authorization: `Bearer ${getStoredAuthToken()}`
        }
    });
    const data = await parseJsonResponse(res, "Failed to load conversations");

    return (data.conversations || []).filter((conversation) => conversation.kind === "group");
}

export async function fetchPendingGroupInvites() {
    const res = await fetch(`${CORE_API_BASE}/dm/invites/list.php`, {
        headers: {
            Authorization: `Bearer ${getStoredAuthToken()}`
        }
    });
    const data = await parseJsonResponse(res, "Failed to load group invites");

    return data.invites || [];
}

export async function createGroupConversation({
    currentUser,
    title,
    participantUsers,
    relayTtlSeconds
}) {
    const token = getStoredAuthToken();
    const currentDevice = await window.secureDm.getDeviceBundle({
        userId: currentUser.id,
        username: currentUser.username
    });
    const ownDevicesResponse = await fetchUserDmDevices({
        token,
        userId: currentUser.id
    });
    const recipientResponses = await Promise.all(
        participantUsers.map(async (participant) => ({
            participant,
            response: await fetchUserDmDevices({
                token,
                userId: participant.id
            })
        }))
    );

    const missingParticipants = recipientResponses
        .filter(({ response }) => !(response.devices || []).length)
        .map(({ participant }) => participant.username);

    if (missingParticipants.length > 0) {
        throw new Error(
            `${missingParticipants.join(", ")} ${missingParticipants.length === 1 ? "has" : "have"} not set up secure DMs yet`
        );
    }

    const additionalOwnDevices = (ownDevicesResponse.devices || []).filter(
        (device) => device.deviceId !== currentDevice.deviceId
    );
    const recipientDevices = [
        ...additionalOwnDevices,
        ...recipientResponses.flatMap(({ response }) => response.devices || [])
    ];

    const localConversation = await window.secureDm.createConversation({
        userId: currentUser.id,
        username: currentUser.username,
        title,
        participants: participantUsers.map((participant) => participant.id),
        recipientDevices
    });

    const res = await fetch(`${CORE_API_BASE}/dm/conversations/create.php`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
            kind: "group",
            title,
            participantUserIds: participantUsers.map((participant) => participant.id),
            wrappedKeys: localConversation.wrappedKeys,
            relayTtlSeconds
        })
    });

    const data = await parseJsonResponse(res, "Failed to create group conversation");
    await window.secureDm.adoptConversationId({
        userId: currentUser.id,
        username: currentUser.username,
        fromConversationId: localConversation.conversationId,
        toConversationId: data.conversation.id,
        title: data.conversation.title || title
    });

    return {
        conversation: data.conversation
    };
}

export async function openGroupConversation({ currentUser, conversationId }) {
    const remoteConversation = await fetchRemoteConversationMetadata(conversationId);
    await syncLocalConversationMetadata({
        currentUser,
        conversation: remoteConversation
    });
    const hasAccess = await hasLocalConversationAccess({
        currentUser,
        conversationId
    });

    if (!hasAccess) {
        const imported = await importRemoteConversation({
            token: getStoredAuthToken(),
            currentUser,
            conversationId
        });
        const access = await getSecureDmConversationAccess({
            currentUser,
            conversationId
        });

        return {
            conversation: imported.conversation || remoteConversation,
            messages: imported.messages || [],
            hasLocalAccess: canReadConversationLocally(access)
        };
    }

    await flushPendingSecureDmDeliveryStates({
        currentUser,
        conversationId
    });

    return {
        conversation: remoteConversation,
        messages: await window.secureDm.listMessages({
            userId: currentUser.id,
            conversationId
        }),
        hasLocalAccess: true
    };
}

export async function sendGroupConversationMessage({
    currentUser,
    conversationId,
    body,
    replyTo = null,
    attachments = []
}) {
    const opened = await openGroupConversation({
        currentUser,
        conversationId
    });

    if (opened.hasLocalAccess === false) {
        throw createMissingLocalConversationAccessError(conversationId);
    }

    await sendDirectMessage({
        token: getStoredAuthToken(),
        currentUser,
        conversationId,
        body,
        messageOptions: {
          kind: "message",
          replyTo,
          attachments
        }
    });

    return openGroupConversation({
        currentUser,
        conversationId
    });
}

export async function editGroupConversationMessage({
    currentUser,
    conversationId,
    messageId,
    body
}) {
    await sendDirectMessage({
        token: getStoredAuthToken(),
        currentUser,
        conversationId,
        body,
        messageOptions: {
            kind: "edit",
            targetMessageId: messageId
        }
    });

    return openGroupConversation({
        currentUser,
        conversationId
    });
}

export async function deleteGroupConversationMessage({
    currentUser,
    conversationId,
    messageId
}) {
    await sendDirectMessage({
        token: getStoredAuthToken(),
        currentUser,
        conversationId,
        body: "",
        messageOptions: {
            kind: "delete",
            targetMessageId: messageId
        }
    });

    return openGroupConversation({
        currentUser,
        conversationId
    });
}

export async function toggleGroupConversationReaction({
    currentUser,
    conversationId,
    messageId,
    emoji
}) {
    await sendDirectMessage({
        token: getStoredAuthToken(),
        currentUser,
        conversationId,
        body: "",
        messageOptions: {
            kind: "reaction",
            targetMessageId: messageId,
            emoji
        }
    });

    return openGroupConversation({
        currentUser,
        conversationId
    });
}

export async function acceptGroupInvite({ currentUser, inviteId }) {
    const res = await fetch(`${CORE_API_BASE}/dm/invites/accept.php`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ inviteId })
    });
    const data = await parseJsonResponse(res, "Failed to accept group invite");

    const opened = await openGroupConversation({
        currentUser,
        conversationId: data.conversation.id
    });

    return {
        inviteId,
        conversation: data.conversation,
        messages: opened.messages || [],
        hasLocalAccess: opened.hasLocalAccess !== false
    };
}

export async function declineGroupInvite(inviteId) {
    const res = await fetch(`${CORE_API_BASE}/dm/invites/decline.php`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ inviteId })
    });

    return parseJsonResponse(res, "Failed to decline group invite");
}
