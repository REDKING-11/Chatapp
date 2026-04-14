import { parseJsonResponse } from "../../lib/api";
import { getCoreApiBase, normalizeBackendUrl } from "../../lib/env";
import { getStoredAuthToken } from "../session/actions";

const CORE_API_BASE = getCoreApiBase();

function normalizeJoinedServer(server) {
    return {
        ...server,
        backendUrl: normalizeBackendUrl(server?.backendUrl || server?.connectUrl || "", "Server backend URL")
    };
}

function normalizeServerFetchError(error, fallbackMessage) {
    if (error instanceof TypeError) {
        return new Error(fallbackMessage);
    }

    return error;
}

function getAuthHeaders() {
    const token = getStoredAuthToken();

    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}

export async function fetchServerData(backendUrl) {
    const normalizedBackendUrl = normalizeBackendUrl(backendUrl, "Server backend URL");

    try {
        const res = await fetch(`${normalizedBackendUrl}/api/server`);
        return parseJsonResponse(res, "Failed to fetch server");
    } catch (error) {
        throw normalizeServerFetchError(error, "Server is offline or unreachable");
    }
}

export async function fetchUserServers() {
    const res = await fetch(`${CORE_API_BASE}/user/servers/index.php`, {
        method: "GET",
        headers: getAuthHeaders()
    });

    const data = await parseJsonResponse(res, "Failed to load joined servers");
    return Array.isArray(data) ? data.map(normalizeJoinedServer) : [];
}

export async function joinServer({ backendUrl }) {
    const trimmedUrl = normalizeBackendUrl(backendUrl, "Server backend URL");

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

    return normalizeJoinedServer(await parseJsonResponse(res, "Failed to join server"));
}

export async function leaveServer(serverId) {
    const res = await fetch(`${CORE_API_BASE}/user/servers/delete.php?id=${serverId}`, {
        method: "DELETE",
        headers: getAuthHeaders()
    });

    return parseJsonResponse(res, "Failed to leave server");
}

export async function createServerChannel({ backendUrl, name, type }) {
    const normalizedBackendUrl = normalizeBackendUrl(backendUrl, "Server backend URL");

    try {
        const res = await fetch(`${normalizedBackendUrl}/api/server/channels`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name,
                type
            })
        });

        return parseJsonResponse(res, "Failed to create channel");
    } catch (error) {
        throw normalizeServerFetchError(error, "Server is offline or unreachable");
    }
}
