import { parseJsonResponse } from "../../lib/api";
import { getCoreApiBase } from "../../lib/env";
import { getStoredAuthToken } from "../session/actions";
import {
    fetchUserDmDevices,
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

function isMissingLocalConversationError(error) {
    return /unknown dm conversation|no wrapped conversation key exists for this device/i.test(
        String(error?.message || error || "")
    );
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

        return {
            conversation: imported.conversation,
            messages: imported.messages || []
        };
    }

    return {
        conversation: {
            id: conversationId
        },
        messages: await window.secureDm.listMessages({
            userId: currentUser.id,
            conversationId
        })
    };
}

export async function sendGroupConversationMessage({
    currentUser,
    conversationId,
    body,
    replyTo = null,
    attachments = []
}) {
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
        messages: opened.messages || []
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
