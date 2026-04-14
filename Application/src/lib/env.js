const LOCAL_DEVELOPMENT_HOSTS = new Set([
    "localhost",
    "127.0.0.1",
    "::1"
]);

function isTruthyEnvFlag(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

const ALLOW_INSECURE_REMOTE_URLS = isTruthyEnvFlag(import.meta.env.VITE_ALLOW_INSECURE_REMOTE_URLS);

function isLocalDevelopmentHostname(hostname) {
    const normalized = String(hostname || "").trim().toLowerCase();
    return LOCAL_DEVELOPMENT_HOSTS.has(normalized) || normalized.endsWith(".localhost");
}

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

function assertSecureScheme(url, { label, secureProtocol, localProtocol }) {
    const hostname = String(url.hostname || "").trim().toLowerCase();
    const isLocalDevelopment = isLocalDevelopmentHostname(hostname);

    if (url.protocol === secureProtocol) {
        return;
    }

    if (ALLOW_INSECURE_REMOTE_URLS && url.protocol === localProtocol) {
        return;
    }

    if (isLocalDevelopment && url.protocol === localProtocol) {
        return;
    }

    throw new Error(
        `${label} must use ${secureProtocol}// for remote hosts. ${localProtocol}// is allowed only for localhost development.`
    );
}

export function normalizeBackendUrl(value, label = "Backend URL") {
    const url = parseUrl(value, label);

    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error(`${label} must use http:// or https://`);
    }

    assertSecureScheme(url, {
        label,
        secureProtocol: "https:",
        localProtocol: "http:"
    });

    return normalizeUrl(url);
}

export function normalizeRealtimeWsUrl(value, label = "Realtime URL") {
    const url = parseUrl(value, label);

    if (!["ws:", "wss:"].includes(url.protocol)) {
        throw new Error(`${label} must use ws:// or wss://`);
    }

    assertSecureScheme(url, {
        label,
        secureProtocol: "wss:",
        localProtocol: "ws:"
    });

    return url.toString();
}

const CORE_API_BASE = normalizeBackendUrl(
    import.meta.env.VITE_CORE_API_BASE || "",
    "Core API URL"
);

const REALTIME_WS_BASE = normalizeRealtimeWsUrl(
    import.meta.env.VITE_REALTIME_WS_BASE
        || `${CORE_API_BASE.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:")}/ws/`,
    "Realtime DM URL"
);

export function getCoreApiBase() {
    return CORE_API_BASE;
}

export function getRealtimeWsBase() {
    return REALTIME_WS_BASE;
}
