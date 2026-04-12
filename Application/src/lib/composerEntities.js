function normalizeToken(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^[@#]+/, "");
}

function findEntityToken(value, cursorPosition) {
    const text = String(value || "");
    const cursor = Math.max(0, Math.min(Number(cursorPosition) || 0, text.length));
    const beforeCursor = text.slice(0, cursor);
    const match = beforeCursor.match(/(^|[\s(])([@#][a-zA-Z0-9._-]*)$/);

    if (!match) {
        return null;
    }

    const token = match[2];
    const trigger = token[0];
    const start = cursor - token.length;
    return {
        trigger,
        token,
        query: normalizeToken(token),
        start,
        end: cursor
    };
}

function scoreSuggestion(entry, query) {
    const label = normalizeToken(entry.label);
    const token = normalizeToken(entry.token);

    if (!query) {
        return 2;
    }

    if (label.startsWith(query) || token.startsWith(query)) {
        return 0;
    }

    if (label.includes(query) || token.includes(query)) {
        return 1;
    }

    return 99;
}

export function getComposerEntitySuggestions(value, cursorPosition, linkContext) {
    const tokenMatch = findEntityToken(value, cursorPosition);
    if (!tokenMatch) {
        return null;
    }

    const source = tokenMatch.trigger === "@"
        ? Array.isArray(linkContext?.mentionSuggestions) ? linkContext.mentionSuggestions : []
        : Array.isArray(linkContext?.channelSuggestions) ? linkContext.channelSuggestions : [];

    if (source.length === 0) {
        return null;
    }

    const items = source
        .map((entry) => ({
            ...entry,
            score: scoreSuggestion(entry, tokenMatch.query)
        }))
        .filter((entry) => entry.score < 99)
        .sort((left, right) => (
            left.score - right.score
            || String(left.label).localeCompare(String(right.label))
        ))
        .slice(0, 5);

    if (items.length === 0) {
        return null;
    }

    return {
        ...tokenMatch,
        items
    };
}

export function applyComposerEntitySuggestion({ value, selectionStart, selectionEnd, suggestion, tokenRange }) {
    const text = String(value || "");
    const start = tokenRange?.start ?? selectionStart ?? 0;
    const end = tokenRange?.end ?? selectionEnd ?? start;
    const insertion = `${suggestion?.token || ""} `;

    return {
        value: `${text.slice(0, start)}${insertion}${text.slice(end)}`,
        cursorPosition: start + insertion.length
    };
}
