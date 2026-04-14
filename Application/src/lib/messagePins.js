const MESSAGE_PINS_STORAGE_KEY = "chatapp:message-pins:v1";

function readMessagePins() {
    try {
        const raw = localStorage.getItem(MESSAGE_PINS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function writeMessagePins(pins) {
    localStorage.setItem(MESSAGE_PINS_STORAGE_KEY, JSON.stringify(pins));
}

export function loadPinnedMessage(scopeKey) {
    if (!scopeKey) {
        return null;
    }

    const pins = readMessagePins();
    const pinnedEntry = pins[String(scopeKey)];

    if (Array.isArray(pinnedEntry)) {
        return pinnedEntry[0] && typeof pinnedEntry[0] === "object" ? pinnedEntry[0] : null;
    }

    return pinnedEntry && typeof pinnedEntry === "object" ? pinnedEntry : null;
}

export function loadPinnedMessages(scopeKey) {
    if (!scopeKey) {
        return [];
    }

    const pins = readMessagePins();
    const pinnedEntry = pins[String(scopeKey)];

    if (Array.isArray(pinnedEntry)) {
        return pinnedEntry.filter((entry) => entry && typeof entry === "object");
    }

    return pinnedEntry && typeof pinnedEntry === "object" ? [pinnedEntry] : [];
}

export function savePinnedMessage(scopeKey, message) {
    if (!scopeKey) {
        return null;
    }

    const pins = readMessagePins();

    if (!message) {
        delete pins[String(scopeKey)];
        writeMessagePins(pins);
        return null;
    }

    pins[String(scopeKey)] = message;
    writeMessagePins(pins);
    return message;
}

export function savePinnedMessages(scopeKey, messages) {
    if (!scopeKey) {
        return [];
    }

    const pins = readMessagePins();
    const normalizedMessages = Array.isArray(messages)
        ? messages.filter((entry) => entry && typeof entry === "object")
        : [];

    if (normalizedMessages.length === 0) {
        delete pins[String(scopeKey)];
        writeMessagePins(pins);
        return [];
    }

    pins[String(scopeKey)] = normalizedMessages;
    writeMessagePins(pins);
    return normalizedMessages;
}
