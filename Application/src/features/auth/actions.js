import { parseJsonResponse } from "../../lib/api";
import { getCoreApiBase } from "../../lib/env";
import { getStoredAuthToken, saveAuthSession } from "../session/actions";

const CORE_API_BASE = getCoreApiBase();

function buildAuthRequestHeaders(includeToken = false) {
    const platform = typeof navigator !== "undefined"
        ? String(navigator.userAgentData?.platform || navigator.platform || "Desktop")
        : "Desktop";
    const headers = {
        "Content-Type": "application/json",
        "X-Chatapp-Session-Name": `Chatapp ${platform} app`
    };

    if (includeToken) {
        const token = getStoredAuthToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
    }

    return headers;
}

export async function loginUser({ username, password }) {
    const res = await fetch(`${CORE_API_BASE}/auth/login.php`, {
        method: "POST",
        headers: buildAuthRequestHeaders(),
        body: JSON.stringify({
            username,
            password
        })
    });

    return parseJsonResponse(res, "Login failed");
}

export async function completeMfaLogin({ username, password, challengeId, totpCode }) {
    const res = await fetch(`${CORE_API_BASE}/auth/login.php`, {
        method: "POST",
        headers: buildAuthRequestHeaders(),
        body: JSON.stringify({
            username,
            password,
            challengeId,
            totpCode
        })
    });

    const data = await parseJsonResponse(res, "Login failed");

    if (data?.token) {
        await saveAuthSession(data);
    }

    return data;
}

export async function registerUser({ username, password, email, phone }) {
    const res = await fetch(`${CORE_API_BASE}/auth/register.php`, {
        method: "POST",
        headers: buildAuthRequestHeaders(),
        body: JSON.stringify({ username, password, email, phone })
    });

    return parseJsonResponse(res, "Register failed");
}

export async function updateUserProfile({ displayName }) {
    const res = await fetch(`${CORE_API_BASE}/auth/profile.php`, {
        method: "POST",
        headers: buildAuthRequestHeaders(true),
        body: JSON.stringify({ displayName })
    });

    return parseJsonResponse(res, "Failed to update profile");
}

export async function submitAuth({ mode, username, password, email, phone }) {
    if (mode === "register") {
        await registerUser({ username, password, email, phone });
        const loginData = await loginUser({ username, password });
        if (loginData?.token) {
            await saveAuthSession(loginData);
        }
        return loginData;
    }

    const loginData = await loginUser({ username, password });
    if (loginData?.token) {
        await saveAuthSession(loginData);
    }
    return loginData;
}

export async function fetchMfaStatus({ token }) {
    const res = await fetch(`${CORE_API_BASE}/auth/mfa_status.php`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    return parseJsonResponse(res, "Failed to load MFA status");
}

export async function beginMfaSetup({ token }) {
    const res = await fetch(`${CORE_API_BASE}/auth/mfa_setup.php`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    return parseJsonResponse(res, "Failed to start MFA setup");
}

export async function enableMfa({ token, totpCode }) {
    const res = await fetch(`${CORE_API_BASE}/auth/mfa_enable.php`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ totpCode })
    });

    return parseJsonResponse(res, "Failed to enable MFA");
}

export async function disableMfa({ token, totpCode }) {
    const res = await fetch(`${CORE_API_BASE}/auth/mfa_disable.php`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ totpCode })
    });

    return parseJsonResponse(res, "Failed to disable MFA");
}

export async function fetchSessions({ token }) {
    const res = await fetch(`${CORE_API_BASE}/auth/sessions_list.php`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    return parseJsonResponse(res, "Failed to load sessions");
}

export async function revokeSession({ token, publicId }) {
    const res = await fetch(`${CORE_API_BASE}/auth/sessions_revoke.php`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ publicId })
    });

    return parseJsonResponse(res, "Failed to revoke session");
}
