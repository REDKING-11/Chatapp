export const DEFAULT_PRESENCE_STATUS = "online";

export const PRESENCE_OPTIONS = [
    {
        id: "online",
        label: "Online",
        detail: "Ready to chat"
    },
    {
        id: "free",
        label: "Free",
        detail: "Available"
    },
    {
        id: "busy",
        label: "Busy",
        detail: "Heads down"
    },
    {
        id: "chilling",
        label: "Chilling",
        detail: "Taking it easy"
    },
    {
        id: "off",
        label: "Offline",
        detail: "Away for now"
    }
];

const PRESENCE_OPTION_MAP = new Map(PRESENCE_OPTIONS.map((option) => [option.id, option]));

export const PRESENCE_STATUS_IDS = PRESENCE_OPTIONS.map((option) => option.id);

export function isValidConfiguredPresenceStatus(value) {
    return PRESENCE_OPTION_MAP.has(String(value || "").trim().toLowerCase());
}

export function normalizeConfiguredPresenceStatus(value) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return isValidConfiguredPresenceStatus(normalizedValue)
        ? normalizedValue
        : DEFAULT_PRESENCE_STATUS;
}

export function getConfiguredPresenceMeta(value) {
    return PRESENCE_OPTION_MAP.get(normalizeConfiguredPresenceStatus(value)) || PRESENCE_OPTIONS[0];
}

export function normalizeExternalPresence(presence) {
    const state = presence?.state === "online" ? "online" : "offline";

    return {
        state,
        status: state === "online"
            ? normalizeConfiguredPresenceStatus(presence?.status)
            : null
    };
}

export function resolvePresenceMeta(presence) {
    const normalizedPresence = normalizeExternalPresence(presence);

    if (normalizedPresence.state !== "online") {
        return {
            state: "offline",
            status: null,
            tone: "offline",
            label: "Offline",
            detail: "Disconnected"
        };
    }

    const configuredMeta = getConfiguredPresenceMeta(normalizedPresence.status);

    return {
        state: "online",
        status: configuredMeta.id,
        tone: configuredMeta.id,
        label: configuredMeta.label,
        detail: configuredMeta.detail
    };
}

export function formatPresenceWithSecondaryText(presence, secondaryText = "") {
    const resolvedPresence = resolvePresenceMeta(presence);
    const normalizedSecondaryText = String(secondaryText || "").trim();

    return normalizedSecondaryText
        ? `${resolvedPresence.label} · ${normalizedSecondaryText}`
        : resolvedPresence.label;
}
