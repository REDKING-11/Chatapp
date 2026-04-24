const DEFAULT_SEGMENTER = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function getGraphemeSegments(value) {
    const normalized = String(value ?? "");

    if (!normalized) {
        return [];
    }

    if (DEFAULT_SEGMENTER) {
        return Array.from(DEFAULT_SEGMENTER.segment(normalized), ({ segment }) => segment);
    }

    return Array.from(normalized);
}

export function countProfileTextCharacters(value) {
    return getGraphemeSegments(value).length;
}

export function clampProfileText(value, maxCharacters) {
    const normalized = String(value ?? "");
    const limit = Number.isFinite(maxCharacters) ? Math.max(0, maxCharacters) : 0;

    if (!normalized || limit === 0) {
        return limit === 0 ? "" : normalized;
    }

    const segments = getGraphemeSegments(normalized);
    if (segments.length <= limit) {
        return normalized;
    }

    return segments.slice(0, limit).join("");
}
