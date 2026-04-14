import { parseJsonResponse } from "../../lib/api";
import { getStoredAuthToken } from "../session/actions";

function buildAuthHeaders(extra = {}) {
    const token = getStoredAuthToken();
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra
    };
}

export async function fetchServerProfile({ backendUrl }) {
    if (!backendUrl) {
        return null;
    }

    const res = await fetch(`${backendUrl}/api/server-profile/me`, {
        headers: buildAuthHeaders()
    });

    if (res.status === 404) {
        return null;
    }

    const data = await parseJsonResponse(res, "Failed to load server profile");
    return data.profile || null;
}

export async function updateServerProfile({ backendUrl, description }) {
    if (!backendUrl) {
        throw new Error("No server is available for a per-server profile description.");
    }

    const res = await fetch(`${backendUrl}/api/server-profile/me`, {
        method: "PUT",
        headers: buildAuthHeaders({
            "Content-Type": "application/json"
        }),
        body: JSON.stringify({
            description
        })
    });

    const data = await parseJsonResponse(res, "Failed to save server profile description");
    return data.profile || null;
}
