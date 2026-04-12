export const DEFAULT_REACTION_OPTIONS = [
    { key: "thumbs_up", emoji: "👍", label: "Thumbs up" },
    { key: "thumbs_down", emoji: "👎", label: "Thumbs down" },
    { key: "wave", emoji: "👋", label: "Wave" },
    { key: "man_facepalm", emoji: "🤦‍♂️", label: "Man facepalming" },
    { key: "woman_facepalm", emoji: "🤦‍♀️", label: "Woman facepalming" },
    { key: "man_shrugging", emoji: "🤷‍♂️", label: "Man shrugging" },
    { key: "woman_shrugging", emoji: "🤷‍♀️", label: "Woman shrugging" },
    { key: "heart", emoji: "❤️", label: "Heart" },
    { key: "skull", emoji: "💀", label: "Skull" }
];

export function getReactionId(emoji) {
    return String(emoji || "").trim();
}

export function getReactionCount(entry) {
    return Array.isArray(entry?.userIds) ? entry.userIds.length : 0;
}

export function normalizeReactionEntries(reactions) {
    if (!reactions || typeof reactions !== "object") {
        return [];
    }

    if (Array.isArray(reactions)) {
        return reactions;
    }

    return Object.entries(reactions).map(([emoji, userIds]) => ({
        emoji,
        userIds: Array.isArray(userIds) ? userIds : []
    }));
}
