import {
    DEFAULT_PRESENCE_STATUS,
    PRESENCE_STATUS_IDS
} from "./presence.js";

const STORAGE_KEY = "clientSettings:v1";
const EXPORT_KIND = "chatapp-client-settings";
const EXPORT_VERSION = 1;

export const DEFAULT_FRIEND_TAG_FOLDERS = [
    {
        id: "core",
        label: "Core",
        tags: [
            { id: "bff", label: "BFF" },
            { id: "bf", label: "BF" },
            { id: "helper", label: "Helper" }
        ]
    }
];

export const THEME_PRESETS = {
    midnight: {
        label: "Midnight",
        shell: {
            bg: "#0b1020",
            surface: "#121826",
            surfaceAlt: "#1a2233",
            surfaceHover: "#243047",
            border: "#2a3347",
            text: "#f8fafc",
            textMuted: "#94a3b8",
            accent: "#4f46e5",
            accentSoft: "rgba(79, 70, 229, 0.18)",
            topbar: "#121826",
            topbarText: "#f8fafc",
            input: "#0f172a",
            overlay: "rgba(2, 6, 23, 0.72)"
        },
        server: {
            accent: "#5865f2",
            background: "#1e1f22",
            surface: "#2b2d31",
            surfaceAlt: "#313338",
            surfaceHover: "#3c3f45",
            text: "#f2f3f5",
            textMuted: "#b5bac1",
            danger: "#da373c",
            success: "#3ba55d"
        }
    },
    light: {
        label: "Light",
        shell: {
            bg: "#eef2ff",
            surface: "#ffffff",
            surfaceAlt: "#e2e8f0",
            surfaceHover: "#d8e1ee",
            border: "#cbd5e1",
            text: "#0f172a",
            textMuted: "#475569",
            accent: "#2563eb",
            accentSoft: "rgba(37, 99, 235, 0.14)",
            topbar: "#ffffff",
            topbarText: "#0f172a",
            input: "#f8fafc",
            overlay: "rgba(148, 163, 184, 0.42)"
        },
        server: {
            accent: "#2563eb",
            background: "#f8fafc",
            surface: "#ffffff",
            surfaceAlt: "#e2e8f0",
            surfaceHover: "#dbe4ef",
            text: "#0f172a",
            textMuted: "#475569",
            danger: "#dc2626",
            success: "#16a34a"
        }
    },
    forest: {
        label: "Forest",
        shell: {
            bg: "#081712",
            surface: "#11201b",
            surfaceAlt: "#193129",
            surfaceHover: "#244238",
            border: "#33584a",
            text: "#effdf5",
            textMuted: "#9bc5b2",
            accent: "#0f766e",
            accentSoft: "rgba(15, 118, 110, 0.2)",
            topbar: "#11201b",
            topbarText: "#effdf5",
            input: "#0d1714",
            overlay: "rgba(6, 20, 16, 0.76)"
        },
        server: {
            accent: "#10b981",
            background: "#0d1511",
            surface: "#17231d",
            surfaceAlt: "#203129",
            surfaceHover: "#2a4035",
            text: "#ecfdf5",
            textMuted: "#9bb8aa",
            danger: "#ef4444",
            success: "#22c55e"
        }
    },
    sunrise: {
        label: "Sunrise",
        shell: {
            bg: "#1b1020",
            surface: "#291827",
            surfaceAlt: "#382033",
            surfaceHover: "#4a2d43",
            border: "#69415d",
            text: "#fff7ed",
            textMuted: "#f0c6a6",
            accent: "#f97316",
            accentSoft: "rgba(249, 115, 22, 0.18)",
            topbar: "#291827",
            topbarText: "#fff7ed",
            input: "#1d1219",
            overlay: "rgba(24, 10, 18, 0.76)"
        },
        server: {
            accent: "#fb7185",
            background: "#1f141c",
            surface: "#301d29",
            surfaceAlt: "#412635",
            surfaceHover: "#573246",
            text: "#fff1f2",
            textMuted: "#f7b6c2",
            danger: "#fb7185",
            success: "#34d399"
        }
    }
};

export const CLIENT_SETTINGS_DEFAULTS = {
    themePreset: "midnight",
    presenceStatus: DEFAULT_PRESENCE_STATUS,
    fontScale: 1,
    lineHeight: 1.5,
    uiDensity: "comfortable",
    reducedMotion: false,
    highContrast: false,
    colorBlindMode: "none",
    dyslexicFont: false,
    hitTargetSize: "default",
    debugMode: false,
    friendTagFolders: DEFAULT_FRIEND_TAG_FOLDERS,
    friendTagAssignments: {},
    friendProfileNotesById: {},
    ignoredVerificationDevicesByFriend: {},
    mutedFriendNotificationsById: {},
    chatIdentityStyle: "profileMedia",
    chatNameMode: "displayName",
    chatMessageAlignment: "split",
    autoLoadProfileAvatars: true,
    autoLoadProfileBanners: false,
    autoLoadFriendProfileDetails: false,
    sharedServerProfileMediaOnly: true
};

export const CLIENT_SETTINGS_SECTION_KEYS = {
    theme: ["themePreset"],
    readability: ["fontScale", "lineHeight", "uiDensity", "hitTargetSize"],
    chatIdentity: ["chatIdentityStyle", "chatNameMode", "chatMessageAlignment"],
    accessibility: ["reducedMotion", "highContrast", "colorBlindMode", "dyslexicFont"],
    developer: ["debugMode"],
    profileMedia: ["autoLoadProfileAvatars", "autoLoadProfileBanners", "autoLoadFriendProfileDetails", "sharedServerProfileMediaOnly"]
};

export const CLIENT_SETTINGS_TAB_KEYS = {
    general: [
        ...CLIENT_SETTINGS_SECTION_KEYS.theme,
        ...CLIENT_SETTINGS_SECTION_KEYS.readability,
        ...CLIENT_SETTINGS_SECTION_KEYS.chatIdentity,
        ...CLIENT_SETTINGS_SECTION_KEYS.accessibility
    ],
    profile: [
        ...CLIENT_SETTINGS_SECTION_KEYS.profileMedia
    ],
    advanced: [
        ...CLIENT_SETTINGS_SECTION_KEYS.developer
    ],
    more: []
};

function sanitizeFriendTagAssignments(rawAssignments) {
    if (!rawAssignments || typeof rawAssignments !== "object" || Array.isArray(rawAssignments)) {
        return {};
    }

    return Object.entries(rawAssignments).reduce((next, [friendId, tagId]) => {
        const normalizedFriendId = String(friendId || "").trim();
        const normalizedTagId = String(tagId || "").trim();

        if (!normalizedFriendId || !normalizedTagId) {
            return next;
        }

        next[normalizedFriendId] = normalizedTagId;
        return next;
    }, {});
}

function sanitizeFriendTagFolders(rawFolders) {
    if (!Array.isArray(rawFolders) || rawFolders.length === 0) {
        return DEFAULT_FRIEND_TAG_FOLDERS.map((folder) => ({
            ...folder,
            tags: folder.tags.map((tag) => ({ ...tag }))
        }));
    }

    const nextFolders = rawFolders
        .map((folder, folderIndex) => {
            if (!folder || typeof folder !== "object") {
                return null;
            }

            const label = String(folder.label || "").trim();
            const tags = Array.isArray(folder.tags)
                ? folder.tags
                    .map((tag, tagIndex) => {
                        if (!tag || typeof tag !== "object") {
                            return null;
                        }

                        const tagLabel = String(tag.label || "").trim();
                        if (!tagLabel) {
                            return null;
                        }

                        return {
                            id: String(tag.id || `tag-${folderIndex}-${tagIndex}`),
                            label: tagLabel
                        };
                    })
                    .filter(Boolean)
                : [];

            if (!label || tags.length === 0) {
                return null;
            }

            return {
                id: String(folder.id || `folder-${folderIndex}`),
                label,
                tags
            };
        })
        .filter(Boolean);

    if (nextFolders.length === 0) {
        return DEFAULT_FRIEND_TAG_FOLDERS.map((folder) => ({
            ...folder,
            tags: folder.tags.map((tag) => ({ ...tag }))
        }));
    }

    return nextFolders;
}

function sanitizeFriendProfileNotesById(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {};
    }

    return Object.entries(raw).reduce((next, [friendId, note]) => {
        const normalizedFriendId = String(friendId || "").trim();
        if (!normalizedFriendId || typeof note !== "string") {
            return next;
        }

        next[normalizedFriendId] = note.slice(0, 500);
        return next;
    }, {});
}

function sanitizeIgnoredVerificationDevicesByFriend(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {};
    }

    return Object.entries(raw).reduce((next, [friendId, rawDeviceIds]) => {
        const normalizedFriendId = String(friendId || "").trim();

        if (!normalizedFriendId || !Array.isArray(rawDeviceIds)) {
            return next;
        }

        const normalizedDeviceIds = Array.from(
            new Set(
                rawDeviceIds
                    .map((deviceId) => String(deviceId || "").trim())
                    .filter(Boolean)
            )
        );

        if (normalizedDeviceIds.length > 0) {
            next[normalizedFriendId] = normalizedDeviceIds;
        }

        return next;
    }, {});
}

function sanitizeMutedFriendNotificationsById(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {};
    }

    return Object.entries(raw).reduce((next, [friendId, muted]) => {
        const normalizedFriendId = String(friendId || "").trim();

        if (!normalizedFriendId) {
            return next;
        }

        if (muted === true) {
            next[normalizedFriendId] = true;
            return next;
        }

        const expiresAt = Number(muted);
        if (Number.isFinite(expiresAt) && expiresAt > 0) {
            next[normalizedFriendId] = Math.floor(expiresAt);
        }

        return next;
    }, {});
}

function sanitizeSettings(raw) {
    if (!raw || typeof raw !== "object") {
        return { ...CLIENT_SETTINGS_DEFAULTS };
    }

    const next = {
        ...CLIENT_SETTINGS_DEFAULTS,
        ...raw
    };

    if (!Object.prototype.hasOwnProperty.call(raw, "autoLoadFriendProfileDetails")
        && Object.prototype.hasOwnProperty.call(raw, "autoLoadProfileDescriptions")) {
        next.autoLoadFriendProfileDetails = raw.autoLoadProfileDescriptions;
    }

    if (!PRESENCE_STATUS_IDS.includes(next.presenceStatus)) {
        next.presenceStatus = CLIENT_SETTINGS_DEFAULTS.presenceStatus;
    }

    if (!THEME_PRESETS[next.themePreset]) {
        next.themePreset = CLIENT_SETTINGS_DEFAULTS.themePreset;
    }

    if (![0.9, 1, 1.1, 1.25].includes(next.fontScale)) {
        next.fontScale = CLIENT_SETTINGS_DEFAULTS.fontScale;
    }

    if (![1.4, 1.5, 1.7].includes(next.lineHeight)) {
        next.lineHeight = CLIENT_SETTINGS_DEFAULTS.lineHeight;
    }

    if (!["compact", "comfortable", "spacious"].includes(next.uiDensity)) {
        next.uiDensity = CLIENT_SETTINGS_DEFAULTS.uiDensity;
    }

    if (!["none", "protanopia", "deuteranopia", "tritanopia", "monochrome"].includes(next.colorBlindMode)) {
        next.colorBlindMode = CLIENT_SETTINGS_DEFAULTS.colorBlindMode;
    }

    if (typeof next.largerHitTargets === "boolean" && !("hitTargetSize" in next)) {
        next.hitTargetSize = next.largerHitTargets ? "large" : "default";
    }

    if (!["default", "large", "xlarge", "max"].includes(next.hitTargetSize)) {
        next.hitTargetSize = CLIENT_SETTINGS_DEFAULTS.hitTargetSize;
    }

    next.reducedMotion = Boolean(next.reducedMotion);
    next.highContrast = Boolean(next.highContrast);
    next.dyslexicFont = Boolean(next.dyslexicFont);
    next.debugMode = Boolean(next.debugMode);
    next.friendTagFolders = sanitizeFriendTagFolders(next.friendTagFolders);
    next.friendTagAssignments = sanitizeFriendTagAssignments(next.friendTagAssignments);
    next.friendProfileNotesById = sanitizeFriendProfileNotesById(next.friendProfileNotesById);
    next.ignoredVerificationDevicesByFriend = sanitizeIgnoredVerificationDevicesByFriend(next.ignoredVerificationDevicesByFriend);
    next.mutedFriendNotificationsById = sanitizeMutedFriendNotificationsById(next.mutedFriendNotificationsById);
    if (!["profileMedia", "minimal"].includes(next.chatIdentityStyle)) {
        next.chatIdentityStyle = CLIENT_SETTINGS_DEFAULTS.chatIdentityStyle;
    }
    if (!["displayName", "username"].includes(next.chatNameMode)) {
        next.chatNameMode = CLIENT_SETTINGS_DEFAULTS.chatNameMode;
    }
    if (!["split", "allLeft", "allRight", "mineLeft"].includes(next.chatMessageAlignment)) {
        next.chatMessageAlignment = CLIENT_SETTINGS_DEFAULTS.chatMessageAlignment;
    }
    next.autoLoadProfileAvatars = Boolean(next.autoLoadProfileAvatars);
    next.autoLoadProfileBanners = Boolean(next.autoLoadProfileBanners);
    next.autoLoadFriendProfileDetails = Boolean(next.autoLoadFriendProfileDetails);
    next.sharedServerProfileMediaOnly = Boolean(next.sharedServerProfileMediaOnly);

    delete next.autoLoadProfileDescriptions;

    return next;
}

export function loadClientSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return sanitizeSettings(raw ? JSON.parse(raw) : null);
    } catch {
        return { ...CLIENT_SETTINGS_DEFAULTS };
    }
}

export function saveClientSettings(settings) {
    const next = sanitizeSettings(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (typeof window !== "undefined") {
        window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent("clientSettingsChanged", {
                detail: next
            }));
        }, 0);
    }
    return next;
}

export function resetClientSettingsSection(settings, sectionId) {
    const keys = CLIENT_SETTINGS_SECTION_KEYS[sectionId];

    if (!Array.isArray(keys) || keys.length === 0) {
        return saveClientSettings(settings);
    }

    const next = { ...settings };

    keys.forEach((key) => {
        next[key] = CLIENT_SETTINGS_DEFAULTS[key];
    });

    return saveClientSettings(next);
}

export function resetClientSettingsTab(settings, tabId) {
    const keys = CLIENT_SETTINGS_TAB_KEYS[tabId];

    if (!Array.isArray(keys) || keys.length === 0) {
        return saveClientSettings(settings);
    }

    const next = { ...settings };

    keys.forEach((key) => {
        next[key] = CLIENT_SETTINGS_DEFAULTS[key];
    });

    return saveClientSettings(next);
}

export function buildClientSettingsExport(settings) {
    return {
        kind: EXPORT_KIND,
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        settings: sanitizeSettings(settings)
    };
}

export function downloadClientSettings(settings) {
    const payload = buildClientSettingsExport(settings);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = payload.exportedAt.slice(0, 10);

    link.href = url;
    link.download = `chatapp-client-settings-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export async function importClientSettingsFromFile(file) {
    const text = await file.text();
    let parsed;

    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("That settings file is not valid JSON.");
    }

    if (parsed?.kind !== EXPORT_KIND || parsed?.version !== EXPORT_VERSION) {
        throw new Error("That file is not a supported Chatapp settings export.");
    }

    return saveClientSettings(parsed.settings);
}

function getColorBlindAccent(mode, accent) {
    switch (mode) {
        case "protanopia":
            return "#3b82f6";
        case "deuteranopia":
            return "#a855f7";
        case "tritanopia":
            return "#ef7d00";
        case "monochrome":
            return "#94a3b8";
        default:
            return accent;
    }
}

export function applyClientSettings(settings) {
    const next = sanitizeSettings(settings);
    const preset = THEME_PRESETS[next.themePreset] || THEME_PRESETS.midnight;
    const root = document.documentElement;
    const body = document.body;

    const shellAccent = getColorBlindAccent(next.colorBlindMode, preset.shell.accent);
    const serverAccent = getColorBlindAccent(next.colorBlindMode, preset.server.accent);
    const borderBoost = next.highContrast ? "#ffffff" : preset.shell.border;
    const serverBorderBoost = next.highContrast ? "rgba(255,255,255,0.75)" : preset.server.surfaceAlt;

    root.style.setProperty("--client-font-family", next.dyslexicFont
        ? "\"OpenDyslexic\", \"Segoe UI\", Verdana, sans-serif"
        : "\"Segoe UI\", \"Trebuchet MS\", Arial, sans-serif");
    root.style.setProperty("--client-font-scale", String(next.fontScale));
    root.style.setProperty("--client-line-height", String(next.lineHeight));
    const densityPadding = next.uiDensity === "compact" ? 8 : next.uiDensity === "spacious" ? 14 : 10;
    const hitTargetBoost = next.hitTargetSize === "large"
        ? 4
        : next.hitTargetSize === "xlarge"
            ? 8
            : next.hitTargetSize === "max"
                ? 12
                : 0;
    const topbarHeight = next.hitTargetSize === "large"
        ? "64px"
        : next.hitTargetSize === "xlarge"
            ? "72px"
            : next.hitTargetSize === "max"
                ? "82px"
                : "56px";
    const topbarIconButtonSize = next.hitTargetSize === "large"
        ? "46px"
        : next.hitTargetSize === "xlarge"
            ? "52px"
            : next.hitTargetSize === "max"
                ? "60px"
                : "42px";
    const topbarPaddingBlock = next.hitTargetSize === "large"
        ? "4px"
        : next.hitTargetSize === "xlarge"
            ? "6px"
            : next.hitTargetSize === "max"
                ? "8px"
                : "0px";
    root.style.setProperty("--client-control-padding", `${densityPadding + hitTargetBoost}px`);
    root.style.setProperty("--client-panel-padding", next.uiDensity === "compact" ? "14px" : next.uiDensity === "spacious" ? "22px" : "18px");
    root.style.setProperty("--client-radius-multiplier", next.uiDensity === "compact" ? "0.9" : next.uiDensity === "spacious" ? "1.12" : "1");
    root.style.setProperty("--app-topbar-height", topbarHeight);
    root.style.setProperty("--app-topbar-height-runtime", topbarHeight);
    root.style.setProperty("--app-topbar-icon-button-size", topbarIconButtonSize);
    root.style.setProperty("--app-topbar-padding-block", topbarPaddingBlock);
    root.style.setProperty("--client-toggle-size", next.hitTargetSize === "large"
        ? "24px"
        : next.hitTargetSize === "xlarge"
            ? "30px"
            : next.hitTargetSize === "max"
                ? "36px"
                : next.uiDensity === "spacious"
                    ? "24px"
                    : "20px");
    root.style.setProperty("--shell-bg", preset.shell.bg);
    root.style.setProperty("--shell-surface", preset.shell.surface);
    root.style.setProperty("--shell-surface-alt", preset.shell.surfaceAlt);
    root.style.setProperty("--shell-surface-hover", preset.shell.surfaceHover);
    root.style.setProperty("--shell-border", borderBoost);
    root.style.setProperty("--shell-text", preset.shell.text);
    root.style.setProperty("--shell-text-muted", preset.shell.textMuted);
    root.style.setProperty("--shell-accent", shellAccent);
    root.style.setProperty("--shell-accent-soft", preset.shell.accentSoft);
    root.style.setProperty("--shell-topbar", preset.shell.topbar);
    root.style.setProperty("--shell-topbar-text", preset.shell.topbarText);
    root.style.setProperty("--shell-input", preset.shell.input);
    root.style.setProperty("--shell-overlay", preset.shell.overlay);
    root.style.setProperty("--server-accent", serverAccent);
    root.style.setProperty("--server-background", preset.server.background);
    root.style.setProperty("--server-surface", preset.server.surface);
    root.style.setProperty("--server-surface-alt", serverBorderBoost);
    root.style.setProperty("--server-surface-hover", preset.server.surfaceHover);
    root.style.setProperty("--server-text", preset.server.text);
    root.style.setProperty("--server-text-muted", preset.server.textMuted);
    root.style.setProperty("--server-danger", preset.server.danger);
    root.style.setProperty("--server-success", preset.server.success);
    root.style.setProperty("--focus-ring", next.highContrast ? "#f8fafc" : shellAccent);
    root.style.setProperty("--status-success-bg", next.highContrast ? "rgba(16, 185, 129, 0.22)" : "rgba(59, 165, 93, 0.12)");
    root.style.setProperty("--status-success-border", next.highContrast ? "rgba(255,255,255,0.55)" : "rgba(59, 165, 93, 0.4)");
    root.style.setProperty("--status-danger-bg", next.highContrast ? "rgba(239, 68, 68, 0.25)" : "rgba(239, 68, 68, 0.12)");
    root.style.setProperty("--status-danger-border", next.highContrast ? "rgba(255,255,255,0.55)" : "rgba(239, 68, 68, 0.32)");

    body.dataset.clientTheme = next.themePreset;
    body.dataset.density = next.uiDensity;
    body.dataset.colorBlindMode = next.colorBlindMode;
    body.dataset.reducedMotion = String(next.reducedMotion);
    body.dataset.highContrast = String(next.highContrast);
    body.dataset.debugMode = String(next.debugMode);
}
