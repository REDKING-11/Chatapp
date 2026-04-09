import { parseJsonResponse } from "../../lib/api";
import { getCoreApiBase } from "../../lib/env";

const CORE_API_BASE = getCoreApiBase();

export function getStoredAuthUser() {
    const savedUser = localStorage.getItem("authUser");
    if (!savedUser) return null;

    try {
        return JSON.parse(savedUser);
    } catch {
        localStorage.removeItem("authUser");
        return null;
    }
}

export function getStoredAuthToken() {
    return localStorage.getItem("authToken");
}

export function clearAuthSession() {
    localStorage.removeItem("authToken");
    localStorage.removeItem("authUser");
}

export function saveAuthUser(user) {
    localStorage.setItem("authUser", JSON.stringify(user));
}

export async function validateSession(token) {
    const res = await fetch(`${CORE_API_BASE}/auth/me.php`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    return parseJsonResponse(res, "Session check failed");
}
