import { parseJsonResponse } from "../../lib/api";

const CORE_API_BASE = import.meta.env.VITE_CORE_API_BASE;

function getAuthHeaders() {
    const token = localStorage.getItem("authToken");

    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}

export async function fetchServerData(backendUrl) {
    const res = await fetch(`${backendUrl}/api/server`);
    return parseJsonResponse(res, "Failed to fetch server");
}

export async function fetchUserServers() {
    const res = await fetch(`${CORE_API_BASE}/user/servers/index.php`, {
        method: "GET",
        headers: getAuthHeaders()
    });

    return parseJsonResponse(res, "Failed to load joined servers");
}

export async function joinServer({ backendUrl }) {
    const trimmedUrl = backendUrl.trim();

    if (!trimmedUrl) {
        throw new Error("Backend URL is required");
    }

    const externalServerData = await fetchServerData(trimmedUrl);

    const res = await fetch(`${CORE_API_BASE}/user/servers/index.php`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
            externalServerId: externalServerData.id ?? null,
            name: externalServerData.name,
            description: externalServerData.description || "",
            connectUrl: trimmedUrl,
            icon: externalServerData.icon || null
        })
    });

    return parseJsonResponse(res, "Failed to join server");
}

export async function leaveServer(serverId) {
    const res = await fetch(`${CORE_API_BASE}/user/servers/delete.php?id=${serverId}`, {
        method: "DELETE",
        headers: getAuthHeaders()
    });

    return parseJsonResponse(res, "Failed to leave server");
}