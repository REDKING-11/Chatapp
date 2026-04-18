export const APP_DIAGNOSTICS_STORAGE_KEY = "chatapp:diagnostics:v1";
export const APP_DIAGNOSTICS_CHANGED_EVENT = "chatapp-diagnostics-changed";
export const MAX_STORED_APP_DIAGNOSTICS = 200;

const VALID_SEVERITIES = new Set(["info", "warning", "error", "fatal"]);

function trimString(value) {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value) {
    return Number.isInteger(value) ? value : null;
}

function normalizeSeverity(value) {
    const normalized = trimString(value).toLowerCase();
    return VALID_SEVERITIES.has(normalized) ? normalized : "error";
}

function safeClone(value) {
    if (value == null) {
        return undefined;
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return {
            value: String(value)
        };
    }
}

function plainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }

    return value;
}

function mergeDetails(...values) {
    const merged = values.reduce((next, value) => {
        Object.assign(next, plainObject(value));
        return next;
    }, {});

    return Object.keys(merged).length > 0 ? safeClone(merged) : undefined;
}

function getNestedCause(error) {
    if (!error || typeof error !== "object") {
        return null;
    }

    if (error.cause && error.cause !== error) {
        return error.cause;
    }

    return null;
}

function serializeCause(cause) {
    if (!cause) {
        return undefined;
    }

    if (cause instanceof Error) {
        return {
            name: cause.name,
            message: trimString(cause.message),
            code: trimString(cause.code),
            stack: trimString(cause.stack)
        };
    }

    if (typeof cause === "object") {
        return safeClone(cause);
    }

    return {
        message: String(cause)
    };
}

function buildOperationLabel(operation) {
    const normalized = trimString(operation);
    return normalized || "unknown";
}

function buildDiagnosticMessage({ message, userMessage, cause }) {
    return trimString(message)
        || trimString(cause?.message)
        || trimString(cause)
        || trimString(userMessage)
        || "Unexpected error";
}

function maybeReadWindowStorage() {
    if (typeof window === "undefined" || !window.localStorage) {
        return null;
    }

    return window.localStorage;
}

function emitDiagnosticsChanged(entry) {
    if (typeof window === "undefined" || !window.dispatchEvent) {
        return;
    }

    window.dispatchEvent(new CustomEvent(APP_DIAGNOSTICS_CHANGED_EVENT, {
        detail: entry
    }));
}

export function createAppDiagnosticError(config = {}) {
    const message = buildDiagnosticMessage(config);
    const userMessage = trimString(config.userMessage) || message;
    const baseCause = config.cause instanceof Error ? config.cause : undefined;
    const error = baseCause ? new Error(message, { cause: baseCause }) : new Error(message);

    error.name = "AppDiagnosticError";
    error.isAppDiagnosticError = true;
    error.code = trimString(config.code) || "APP_UNKNOWN";
    error.userMessage = userMessage;
    error.source = trimString(config.source) || "app";
    error.operation = buildOperationLabel(config.operation);
    error.severity = normalizeSeverity(config.severity);

    const status = normalizeStatus(config.status);
    if (status !== null) {
        error.status = status;
    }

    const endpoint = trimString(config.endpoint);
    if (endpoint) {
        error.endpoint = endpoint;
    }

    const traceId = trimString(config.traceId);
    if (traceId) {
        error.traceId = traceId;
    }

    const deviceId = trimString(config.deviceId);
    if (deviceId) {
        error.deviceId = deviceId;
    }

    const conversationId = trimString(config.conversationId);
    if (conversationId) {
        error.conversationId = conversationId;
    }

    const friendUserId = trimString(config.friendUserId);
    if (friendUserId) {
        error.friendUserId = friendUserId;
    }

    const details = safeClone(config.details);
    if (details !== undefined) {
        error.details = details;
    }

    if (config.cause !== undefined) {
        error.cause = config.cause;
    }

    return error;
}

export function normalizeAppDiagnosticError(error, overrides = {}) {
    const sourceError = error && typeof error === "object" ? error : null;
    const nestedCause = getNestedCause(sourceError);
    const overrideCode = trimString(overrides.code);
    const sourceCode = trimString(sourceError?.code);
    const message = buildDiagnosticMessage({
        message: overrides.message,
        userMessage: overrides.userMessage,
        cause: sourceError || error
    });

    const details = mergeDetails(
        sourceError?.responseBody?.details,
        sourceError?.details,
        overrides.details,
        sourceError?.responseBody?.code
            ? { backendCode: sourceError.responseBody.code }
            : undefined,
        sourceError?.responseBody?.error
            ? { backendError: String(sourceError.responseBody.error) }
            : undefined,
        trimString(sourceError?.source) && trimString(overrides.source) && trimString(sourceError.source) !== trimString(overrides.source)
            ? { causeSource: trimString(sourceError.source) }
            : undefined,
        trimString(sourceError?.operation) && trimString(overrides.operation) && trimString(sourceError.operation) !== trimString(overrides.operation)
            ? { causeOperation: trimString(sourceError.operation) }
            : undefined,
        sourceCode && overrideCode && sourceCode !== overrideCode
            ? { causeCode: sourceCode }
            : undefined
    );

    const normalized = createAppDiagnosticError({
        code: overrideCode || sourceCode || "APP_UNKNOWN",
        message,
        userMessage: trimString(overrides.userMessage) || trimString(sourceError?.userMessage) || message,
        source: trimString(overrides.source) || trimString(sourceError?.source) || "app",
        operation: buildOperationLabel(overrides.operation || sourceError?.operation),
        severity: overrides.severity || sourceError?.severity || "error",
        status: overrides.status ?? sourceError?.status ?? null,
        endpoint: overrides.endpoint || sourceError?.endpoint || sourceError?.responseUrl || sourceError?.requestUrl || "",
        traceId: overrides.traceId || sourceError?.traceId || sourceError?.responseBody?.traceId || "",
        deviceId: overrides.deviceId || sourceError?.deviceId || "",
        conversationId: overrides.conversationId || sourceError?.conversationId || "",
        friendUserId: overrides.friendUserId || sourceError?.friendUserId || "",
        details,
        cause: overrides.cause !== undefined ? overrides.cause : nestedCause || sourceError || error
    });

    if (trimString(sourceError?.stack) && !trimString(normalized.stack)) {
        normalized.stack = sourceError.stack;
    }

    return normalized;
}

export function serializeAppDiagnosticError(error) {
    const diagnostic = normalizeAppDiagnosticError(error);

    return {
        code: diagnostic.code,
        message: diagnostic.message,
        userMessage: diagnostic.userMessage,
        source: diagnostic.source,
        operation: diagnostic.operation,
        severity: diagnostic.severity,
        status: diagnostic.status ?? null,
        endpoint: diagnostic.endpoint || "",
        traceId: diagnostic.traceId || "",
        details: safeClone(diagnostic.details),
        cause: serializeCause(diagnostic.cause),
        deviceId: diagnostic.deviceId || "",
        conversationId: diagnostic.conversationId || "",
        friendUserId: diagnostic.friendUserId || "",
        stack: trimString(diagnostic.stack)
    };
}

export function readStoredDiagnostics() {
    const storage = maybeReadWindowStorage();
    if (!storage) {
        return [];
    }

    try {
        const raw = storage.getItem(APP_DIAGNOSTICS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeStoredDiagnostics(entries) {
    const storage = maybeReadWindowStorage();
    if (!storage) {
        return;
    }

    try {
        storage.setItem(APP_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(entries));
    } catch {
        // Ignore storage failures so diagnostics never break the app flow.
    }
}

export function clearStoredDiagnostics() {
    writeStoredDiagnostics([]);
    emitDiagnosticsChanged(null);
}

export function recordAppDiagnostic(error, overrides = {}) {
    if (
        error
        && typeof error === "object"
        && error.__chatappDiagnosticRecorded
        && !overrides.forceRecord
    ) {
        return error.__chatappDiagnosticEntry || null;
    }

    const diagnostic = normalizeAppDiagnosticError(error, overrides);
    const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        recordedAt: new Date().toISOString(),
        ...serializeAppDiagnosticError(diagnostic)
    };
    const existing = readStoredDiagnostics();
    const nextEntries = [...existing, entry].slice(-MAX_STORED_APP_DIAGNOSTICS);

    writeStoredDiagnostics(nextEntries);

    const logLabel = `[${entry.code}] ${entry.source}.${entry.operation}`;
    if (entry.severity === "fatal" || entry.severity === "error") {
        console.error(logLabel, entry);
    } else if (entry.severity === "warning") {
        console.warn(logLabel, entry);
    } else {
        console.info(logLabel, entry);
    }

    if (error && typeof error === "object") {
        error.__chatappDiagnosticRecorded = true;
        error.__chatappDiagnosticEntry = entry;
    }

    emitDiagnosticsChanged(entry);

    return entry;
}

export async function copyStoredDiagnosticsToClipboard() {
    const entries = readStoredDiagnostics();

    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard copy is not available in this environment.");
    }

    await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
    return entries.length;
}

export function buildDiagnosticDebugDetails(error, options = {}) {
    const diagnostic = normalizeAppDiagnosticError(error, options.overrides);
    const lines = [];

    if (options.context) {
        lines.push(`Context: ${options.context}`);
    }

    lines.push(`Code: ${diagnostic.code}`);
    lines.push(`Source: ${diagnostic.source}`);
    lines.push(`Operation: ${diagnostic.operation}`);
    lines.push(`Severity: ${diagnostic.severity}`);

    if (diagnostic.status != null) {
        lines.push(`Status: ${diagnostic.status}`);
    }

    if (diagnostic.endpoint) {
        lines.push(`Endpoint: ${diagnostic.endpoint}`);
    }

    if (diagnostic.traceId) {
        lines.push(`Trace ID: ${diagnostic.traceId}`);
    }

    if (diagnostic.deviceId) {
        lines.push(`Device ID: ${diagnostic.deviceId}`);
    }

    if (diagnostic.conversationId) {
        lines.push(`Conversation ID: ${diagnostic.conversationId}`);
    }

    if (diagnostic.friendUserId) {
        lines.push(`Friend User ID: ${diagnostic.friendUserId}`);
    }

    if (diagnostic.details) {
        lines.push(`Details: ${JSON.stringify(diagnostic.details, null, 2)}`);
    }

    if (diagnostic.message) {
        lines.push(`Message: ${diagnostic.message}`);
    }

    if (diagnostic.cause && diagnostic.cause !== diagnostic) {
        const cause = serializeCause(diagnostic.cause);
        if (cause) {
            lines.push(`Cause: ${JSON.stringify(cause, null, 2)}`);
        }
    }

    return lines.join("\n");
}

export function classifyDmRelayPollError(error, context = {}) {
    const message = trimString(error?.message || error || "");
    const rawCode = trimString(error?.code || error?.details?.backendCode || "").toUpperCase();
    const isReauthRequired = rawCode === "DEVICE_REAUTH_REQUIRED";
    const isMissingDevice = rawCode === "DEVICE_NOT_REGISTERED"
        || (Number(error?.status) === 404 && /device (is not registered|not found|not found or revoked)/i.test(message));

    return normalizeAppDiagnosticError(error, {
        code: isReauthRequired
            ? "DM_DEVICE_REAUTH_REQUIRED"
            : isMissingDevice
                ? "DM_RELAY_DEVICE_MISSING"
                : "DM_RELAY_POLL_FAILED",
        userMessage: isReauthRequired
            ? "Secure DMs are blocked on this device until you re-authorize it with MFA."
            : isMissingDevice
                ? "This device is no longer registered for secure DM relay on the server."
            : "Could not sync secure DM relay messages right now.",
        source: "dm",
        operation: "relay.poll",
        severity: (isReauthRequired || isMissingDevice) ? "warning" : "error",
        ...context
    });
}

export function classifyRealtimeConnectionError(error, context = {}) {
    const rawCode = trimString(error?.code).toLowerCase();
    const message = trimString(error?.message || error || "");
    const isReauthRequired = rawCode === "device_reauth_required"
        || rawCode === "dm_device_reauth_required"
        || /re-authorized with mfa/i.test(message);
    const isMissingDevice = rawCode === "device_not_registered"
        || rawCode === "dm_device_not_registered"
        || /device is not registered/i.test(message);
    const isTemporary = rawCode === "dm_realtime_temp_unavailable" || rawCode === "realtime_temporarily_unavailable";
    const isAuth = rawCode === "dm_realtime_auth_failed"
        || /auth/i.test(message)
        || /authentication/i.test(message);

    return normalizeAppDiagnosticError(error, {
        code: isReauthRequired
            ? "DM_DEVICE_REAUTH_REQUIRED"
            : isMissingDevice
                ? "DM_DEVICE_NOT_REGISTERED"
                : isTemporary
            ? "DM_REALTIME_TEMP_UNAVAILABLE"
            : isAuth
                ? "DM_REALTIME_AUTH_FAILED"
                : "DM_REALTIME_CONNECT_FAILED",
        userMessage: isReauthRequired
            ? "Secure DMs are blocked on this device until you re-authorize it with MFA."
            : isMissingDevice
                ? "This device is not registered for secure DM realtime yet."
            : isTemporary
            ? "Realtime DM is temporarily unavailable. Chatapp will retry soon."
            : isAuth
                ? "Realtime DM authentication failed."
                : "Realtime DM could not connect.",
        source: "dm",
        operation: "realtime.connect",
        severity: (isTemporary || isReauthRequired || isMissingDevice) ? "warning" : "error",
        ...context
    });
}

function stripElectronInvokePrefix(rawMessage) {
    return String(rawMessage || "")
        .replace(/^Error invoking remote method '[^']+':\s*/i, "")
        .trim();
}

export function classifySecureDmIpcError(channel, error, overrides = {}) {
    const cleanedMessage = stripElectronInvokePrefix(error?.message || error);
    const prefixedMatch = cleanedMessage.match(/^\[(IPC_[A-Z0-9_]+)\]\s*(.*)$/);
    const message = trimString(prefixedMatch?.[2]) || cleanedMessage || "Secure DM local operation failed.";
    const operationSuffix = String(channel || "")
        .replace(/^secure-dm:/, "")
        .replace(/-/g, ".");

    return normalizeAppDiagnosticError(error, {
        code: trimString(overrides.code || prefixedMatch?.[1] || error?.code) || "IPC_SECURE_DM_FAILED",
        message,
        userMessage: overrides.userMessage || "Secure DM local operation failed.",
        source: "ipc",
        operation: overrides.operation || `secureDm.${operationSuffix || "unknown"}`,
        severity: overrides.severity || "error",
        details: mergeDetails(
            {
                channel: String(channel || "")
            },
            overrides.details
        )
    });
}
