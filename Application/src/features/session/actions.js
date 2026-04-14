import { parseJsonResponse } from "../../lib/api";
import { getCoreApiBase } from "../../lib/env";

const CORE_API_BASE = getCoreApiBase();

let authTokenCache = null;

function getLocalStorageSafe(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function removeLocalStorageSafe(key) {
    try {
        localStorage.removeItem(key);
    } catch {
        // Ignore renderer storage cleanup failures.
    }
}

export function getStoredAuthUser() {
    const savedUser = getLocalStorageSafe("authUser");
    if (!savedUser) return null;

    try {
        return JSON.parse(savedUser);
    } catch {
        removeLocalStorageSafe("authUser");
        return null;
    }
}

export function getStoredAuthToken() {
    return authTokenCache;
}

export async function hydrateAuthSession() {
    let token = null;

    if (window.authSession?.getToken) {
        const data = await window.authSession.getToken();
        token = typeof data?.token === "string" && data.token.trim() ? data.token : null;
    }

    const legacyToken = getLocalStorageSafe("authToken");
    if (!token && legacyToken) {
        token = legacyToken;
        if (window.authSession?.setToken) {
            await window.authSession.setToken(legacyToken);
        }
    }

    authTokenCache = token;
    removeLocalStorageSafe("authToken");

    return {
        token,
        user: getStoredAuthUser()
    };
}

export async function clearAuthSession() {
    authTokenCache = null;

    if (window.authSession?.clearToken) {
        await window.authSession.clearToken();
    }

    removeLocalStorageSafe("authToken");
    removeLocalStorageSafe("authUser");
}

export async function saveAuthToken(token) {
    const normalizedToken = typeof token === "string" && token.trim() ? token : null;
    authTokenCache = normalizedToken;

    if (normalizedToken) {
        if (window.authSession?.setToken) {
            await window.authSession.setToken(normalizedToken);
        }
    } else if (window.authSession?.clearToken) {
        await window.authSession.clearToken();
    }

    removeLocalStorageSafe("authToken");
}

export async function saveAuthSession({ token, user }) {
    await saveAuthToken(token);
    saveAuthUser(user);
}

export function saveAuthUser(user) {
    try {
        localStorage.setItem("authUser", JSON.stringify(user));
    } catch {
        // Best-effort cache for non-secret user profile data.
    }
}

export async function validateSession(token) {
    const res = await fetch(`${CORE_API_BASE}/auth/me.php`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    return parseJsonResponse(res, "Session check failed");
}
