import { fetchWithNetworkErrorContext, parseJsonResponse } from "../../lib/api";
import { getCoreApiBase } from "../../lib/env";
import { getStoredAuthToken, saveAuthSession } from "../session/actions";

const CORE_API_BASE = getCoreApiBase();
const CORE_STATUS_TIMEOUT_MS = 5000;

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
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/login.php`, {
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
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/login.php`, {
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
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/register.php`, {
        method: "POST",
        headers: buildAuthRequestHeaders(),
        body: JSON.stringify({ username, password, email, phone })
    });

    return parseJsonResponse(res, "Register failed");
}

export async function fetchRecoveryStatus({ token }) {
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/recovery_status.php`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    return parseJsonResponse(res, "Failed to load recovery status");
}

export async function startEmailVerification({ token, email }) {
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/email_verification_start.php`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email })
    });

    return parseJsonResponse(res, "Failed to send verification code");
}

export async function confirmEmailVerification({ token, code }) {
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/email_verification_confirm.php`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ code })
    });

    return parseJsonResponse(res, "Failed to verify that email");
}

export async function removeRecoveryEmail({ token }) {
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/email_verification_remove.php`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    return parseJsonResponse(res, "Failed to remove the recovery email");
}

export async function regenerateRecoveryKeys({ token }) {
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/recovery_keys_regenerate.php`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    return parseJsonResponse(res, "Failed to generate recovery keys");
}

export async function requestPasswordReset({ username }) {
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/password_reset_request.php`, {
        method: "POST",
        headers: buildAuthRequestHeaders(),
        body: JSON.stringify({ username })
    });

    return parseJsonResponse(res, "Failed to request password reset");
}

export async function confirmPasswordReset({ username, method, code, newPassword }) {
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/password_reset_confirm.php`, {
        method: "POST",
        headers: buildAuthRequestHeaders(),
        body: JSON.stringify({
            username,
            method,
            code,
            newPassword
        })
    });

    return parseJsonResponse(res, "Failed to reset password");
}

export async function changePassword({ token, currentPassword, newPassword, totpCode }) {
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/password_change.php`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            currentPassword,
            newPassword,
            totpCode
        })
    });

    const data = await parseJsonResponse(res, "Failed to change password");

    if (data?.token) {
        await saveAuthSession(data);
    }

    return data;
}

export async function updateUserProfile({ displayName, profileDescription, profileGames }) {
    const body = {};
    if (displayName !== undefined) {
        body.displayName = displayName;
    }
    if (profileDescription !== undefined) {
        body.profileDescription = profileDescription;
    }
    if (profileGames !== undefined) {
        body.profileGames = profileGames;
    }

    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/profile.php`, {
        method: "POST",
        headers: buildAuthRequestHeaders(true),
        body: JSON.stringify(body)
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

export async function checkCoreApiAvailability() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CORE_STATUS_TIMEOUT_MS);

    try {
        const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/me.php`, {
            method: "GET",
            cache: "no-store",
            signal: controller.signal
        });

        return {
            ok: res.status === 401 || res.ok,
            status: res.status,
            endpoint: res.url || `${CORE_API_BASE}/auth/me.php`
        };
    } catch (error) {
        return {
            ok: false,
            status: null,
            endpoint: error?.endpoint || error?.requestUrl || `${CORE_API_BASE}/auth/me.php`,
            error
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function fetchMfaStatus({ token }) {
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/mfa_status.php`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    return parseJsonResponse(res, "Failed to load MFA status");
}

export async function beginMfaSetup({ token }) {
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/mfa_setup.php`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    return parseJsonResponse(res, "Failed to start MFA setup");
}

export async function enableMfa({ token, totpCode }) {
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/mfa_enable.php`, {
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
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/mfa_disable.php`, {
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
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/sessions_list.php`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    return parseJsonResponse(res, "Failed to load sessions");
}

export async function revokeSession({ token, publicId }) {
    const res = await fetchWithNetworkErrorContext(`${CORE_API_BASE}/auth/sessions_revoke.php`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ publicId })
    });

    return parseJsonResponse(res, "Failed to revoke session");
}
