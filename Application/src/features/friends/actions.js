import { parseJsonResponse } from "../../lib/api";
import { getStoredAuthToken } from "../session/actions";
import {
    createDirectConversation,
    importRemoteConversation,
    sendDirectMessage
} from "../dm/actions";

const CORE_API_BASE = import.meta.env.VITE_CORE_API_BASE;

function authHeaders() {
    const token = getStoredAuthToken();

    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
    };
}

export async function fetchFriends() {
    const res = await fetch(`${CORE_API_BASE}/friends/list.php`, {
        headers: {
            Authorization: `Bearer ${getStoredAuthToken()}`
        }
    });

    return parseJsonResponse(res, "Failed to load friends");
}

export async function sendFriendRequest(username) {
    const res = await fetch(`${CORE_API_BASE}/friends/request.php`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ username })
    });

    return parseJsonResponse(res, "Failed to send friend request");
}

export async function acceptFriendRequest(friendshipId) {
    const res = await fetch(`${CORE_API_BASE}/friends/accept.php`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ friendshipId })
    });

    return parseJsonResponse(res, "Failed to accept friend request");
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
    const token = getStoredAuthToken();

    if (friend.conversationId) {
        await importRemoteConversation({
            token,
            currentUser,
            conversationId: friend.conversationId
        });

        const messages = await window.secureDm.listMessages({
            userId: currentUser.id,
            conversationId: friend.conversationId
        });

        return {
            conversationId: friend.conversationId,
            messages
        };
    }

    return {
        conversationId: null,
        messages: []
    };
}

export async function sendFriendDirectMessage({ currentUser, friend, body }) {
    const token = getStoredAuthToken();
    let conversationId = friend.conversationId;

    if (!conversationId) {
        const created = await createDirectConversation({
            token,
            currentUser,
            recipientUser: {
                id: friend.friendUserId,
                username: friend.friendUsername
            }
        });

        conversationId = created.remoteConversation.id;
        await linkFriendConversation(friend.friendUserId, conversationId);
    }

    await sendDirectMessage({
        token,
        currentUser,
        conversationId,
        body
    });

    const messages = await window.secureDm.listMessages({
        userId: currentUser.id,
        conversationId
    });

    return {
        conversationId,
        messages
    };
}
