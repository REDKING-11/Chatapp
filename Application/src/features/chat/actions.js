import { parseJsonResponse } from "../../lib/api";

export function getAuthHeaders() {
    const token = localStorage.getItem("authToken");

    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}

export async function fetchChannelMessages({ backendUrl, channelId }) {
    const res = await fetch(`${backendUrl}/api/channels/${channelId}/messages`);
    return parseJsonResponse(res, "Failed to load messages");
}

export async function createMessage({ backendUrl, channelId, content, replyTo }) {
    const res = await fetch(`${backendUrl}/api/channels/${channelId}/messages`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
            content,
            replyTo: replyTo || null
        })
    });

    return parseJsonResponse(res, "Failed to send message");
}

export async function updateMessage({ backendUrl, messageId, content }) {
    const res = await fetch(`${backendUrl}/api/messages/${messageId}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ content })
    });

    return parseJsonResponse(res, "Failed to edit message");
}

export async function removeMessage({ backendUrl, messageId }) {
    const res = await fetch(`${backendUrl}/api/messages/${messageId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        body: JSON.stringify({})
    });

    return parseJsonResponse(res, "Failed to delete message");
}