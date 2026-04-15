export function isDebugModeEnabled() {
    if (typeof document !== "undefined" && document.body?.dataset.debugMode) {
        return document.body.dataset.debugMode === "true";
    }

    if (typeof localStorage !== "undefined") {
        try {
            const raw = localStorage.getItem("clientSettings:v1");
            const parsed = raw ? JSON.parse(raw) : null;
            return Boolean(parsed?.debugMode);
        } catch {
            return false;
        }
    }

    return false;
}

function normalizeErrorMessage(error) {
    return String(error?.message || error || "").trim();
}

export function formatAppError(error, options = {}) {
    const {
        fallbackMessage = "Something went wrong. Try again.",
        networkMessage = "Could not reach the server. Check your connection and try again.",
        invalidResponseMessage = "The server returned an invalid response.",
        context = ""
    } = options;
    const userMessage = typeof error?.userMessage === "string"
        ? error.userMessage.trim()
        : "";
    const rawMessage = normalizeErrorMessage(error);
    const lowerMessage = rawMessage.toLowerCase();
    const debugMode = isDebugModeEnabled();

    let message = fallbackMessage;

    if (userMessage) {
        message = userMessage;
    } else if (!rawMessage) {
        message = fallbackMessage;
    } else if (
        error instanceof TypeError
        || lowerMessage.includes("failed to fetch")
        || lowerMessage.includes("networkerror")
        || lowerMessage.includes("load failed")
        || lowerMessage.includes("err_connection_refused")
    ) {
        message = networkMessage;
    } else if (lowerMessage.includes("invalid json")) {
        message = invalidResponseMessage;
    } else if (debugMode) {
        message = rawMessage;
    } else if (/offline|not queued|not available|unknown dm conversation/i.test(rawMessage)) {
        message = rawMessage;
    }

    const debugDetails = rawMessage
        ? `${context ? `${context}: ` : ""}${rawMessage}`
        : "";

    return {
        message,
        debugDetails,
        rawMessage,
        debugMode
    };
}
