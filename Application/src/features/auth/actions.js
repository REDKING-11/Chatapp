import { parseJsonResponse } from "../../lib/api";

const CORE_API_BASE = import.meta.env.VITE_CORE_API_BASE;

export async function loginUser({ username, password }) {
    const res = await fetch(`${CORE_API_BASE}/auth/login.php`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
    });

    return parseJsonResponse(res, "Login failed");
}

export async function registerUser({ username, password, email, phone }) {
    const res = await fetch(`${CORE_API_BASE}/auth/register.php`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password, email, phone })
    });

    return parseJsonResponse(res, "Register failed");
}

export function saveAuthSession({ token, user }) {
    localStorage.setItem("authToken", token);
    localStorage.setItem("authUser", JSON.stringify(user));
}

export async function submitAuth({ mode, username, password, email, phone }) {
    if (mode === "register") {
        await registerUser({ username, password, email, phone });
        const loginData = await loginUser({ username, password });
        saveAuthSession(loginData);
        return loginData;
    }

    const loginData = await loginUser({ username, password });
    saveAuthSession(loginData);
    return loginData;
}