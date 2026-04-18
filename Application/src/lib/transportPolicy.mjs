function parseUrl(value, label) {
    try {
        return new URL(String(value || "").trim());
    } catch {
        throw new Error(`${label} must be a valid URL`);
    }
}

function normalizeUrl(url) {
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
}

export function normalizeSecureBackendUrl(value, label = "Backend URL") {
    const url = parseUrl(value, label);

    if (url.protocol !== "https:") {
        throw new Error(`${label} must use https://`);
    }

    return normalizeUrl(url);
}

export function normalizeSecureRealtimeWsUrl(value, label = "Realtime URL") {
    const url = parseUrl(value, label);

    if (url.protocol !== "wss:") {
        throw new Error(`${label} must use wss://`);
    }

    return url.toString();
}

export function deriveSecureRealtimeWsUrl(backendUrl) {
    const url = new URL(normalizeSecureBackendUrl(backendUrl, "Core API URL"));

    url.protocol = "wss:";
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/ws/`;

    return url.toString();
}
