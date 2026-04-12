import { parseJsonResponse } from "../../lib/api";

function normalizeChatFetchError(error, fallbackMessage) {
    if (error instanceof TypeError) {
        return new Error(fallbackMessage);
    }

    return error;
}

export function getAuthHeaders() {
    const token = localStorage.getItem("authToken");

    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}

export async function fetchChannelMessages({ backendUrl, channelId }) {
    try {
        const res = await fetch(`${backendUrl}/api/channels/${channelId}/messages`);
        return parseJsonResponse(res, "Failed to load messages");
    } catch (error) {
        throw normalizeChatFetchError(error, "This server is offline, so messages cannot be loaded right now");
    }
}

export async function createMessage({ backendUrl, channelId, content, replyTo }) {
    try {
        const res = await fetch(`${backendUrl}/api/channels/${channelId}/messages`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
                content,
                replyTo: replyTo || null
            })
        });

        return parseJsonResponse(res, "Failed to send message");
    } catch (error) {
        throw normalizeChatFetchError(error, "This server is offline, so messages cannot be sent right now");
    }
}

export async function updateMessage({ backendUrl, messageId, content }) {
    try {
        const res = await fetch(`${backendUrl}/api/messages/${messageId}`, {
            method: "PATCH",
            headers: getAuthHeaders(),
            body: JSON.stringify({ content })
        });

        return parseJsonResponse(res, "Failed to edit message");
    } catch (error) {
        throw normalizeChatFetchError(error, "This server is offline, so messages cannot be edited right now");
    }
}

export async function removeMessage({ backendUrl, messageId }) {
    try {
        const res = await fetch(`${backendUrl}/api/messages/${messageId}`, {
            method: "DELETE",
            headers: getAuthHeaders(),
            body: JSON.stringify({})
        });

        return parseJsonResponse(res, "Failed to delete message");
    } catch (error) {
        throw normalizeChatFetchError(error, "This server is offline, so messages cannot be deleted right now");
    }
}

export async function toggleMessageReaction({ backendUrl, messageId, emoji }) {
    try {
        const res = await fetch(`${backendUrl}/api/messages/${messageId}/reactions`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ emoji })
        });

        return parseJsonResponse(res, "Failed to update reaction");
    } catch (error) {
        throw normalizeChatFetchError(error, "This server is offline, so reactions cannot be updated right now");
    }
}
