import {
    deriveSecureRealtimeWsUrl,
    normalizeSecureBackendUrl,
    normalizeSecureRealtimeWsUrl
} from "./transportPolicy.mjs";

export function normalizeBackendUrl(value, label = "Backend URL") {
    return normalizeSecureBackendUrl(value, label);
}

export function normalizeRealtimeWsUrl(value, label = "Realtime URL") {
    return normalizeSecureRealtimeWsUrl(value, label);
}

function normalizeOptionalBackendUrl(value, label) {
    const trimmed = String(value || "").trim();
    return trimmed ? normalizeBackendUrl(trimmed, label) : "";
}

const CORE_API_BASE = normalizeBackendUrl(
    import.meta.env.VITE_CORE_API_BASE || "",
    "Core API URL"
);
const SELFHOST_API_BASE = normalizeOptionalBackendUrl(
    import.meta.env.VITE_SELFHOST_API_BASE,
    "Self-host API URL"
);

const REALTIME_WS_BASE = normalizeRealtimeWsUrl(
    import.meta.env.VITE_REALTIME_WS_BASE
        || deriveSecureRealtimeWsUrl(CORE_API_BASE),
    "Realtime DM URL"
);

export function getCoreApiBase() {
    return CORE_API_BASE;
}

export function getSelfhostApiBase() {
    return SELFHOST_API_BASE;
}

export function getRealtimeWsBase() {
    return REALTIME_WS_BASE;
}
