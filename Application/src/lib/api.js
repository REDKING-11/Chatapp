import {
    createAppDiagnosticError,
    normalizeAppDiagnosticError
} from "./diagnostics.js";

let hasDispatchedInvalidTokenEvent = false;

export function resetApiAuthErrorState() {
    hasDispatchedInvalidTokenEvent = false;
}

function normalizeRequestUrl(requestUrl) {
    try {
        return new URL(String(requestUrl || "").trim()).toString();
    } catch {
        return "";
    }
}

function isNetworkStyleError(error) {
    const rawMessage = String(error?.message || error || "").trim().toLowerCase();

    return error?.name === "AbortError"
        || error instanceof TypeError
        || rawMessage.includes("failed to fetch")
        || rawMessage.includes("networkerror")
        || rawMessage.includes("load failed")
        || rawMessage.includes("err_connection_refused");
}

function buildLocalServiceUnavailableMessage(requestUrl) {
    const normalizedUrl = normalizeRequestUrl(requestUrl);

    if (!normalizedUrl) {
        return "";
    }

    const url = new URL(normalizedUrl);
    const origin = url.origin;

    if (url.hostname === "core.localhost") {
        return [
            `Could not reach ${origin}.`,
            "Install Caddy if needed, then start the local TLS proxy with `caddy run --config Caddyfile`,",
            "make sure chatapp-core is running on 127.0.0.1:4000,",
            "and keep chatapp-realtime on 127.0.0.1:3010 for /ws/ traffic."
        ].join(" ");
    }

    if (url.hostname === "server.localhost") {
        return [
            `Could not reach ${origin}.`,
            "Install Caddy if needed, then start the local TLS proxy with `caddy run --config Caddyfile`",
            "and make sure SelfHServer is running on 127.0.0.1:3000."
        ].join(" ");
    }

    return "";
}

function getRequestOrigin(requestUrl) {
    const normalizedUrl = normalizeRequestUrl(requestUrl);

    if (!normalizedUrl) {
        return "";
    }

    try {
        return new URL(normalizedUrl).origin;
    } catch {
        return "";
    }
}

export function isApiNetworkUnavailableError(error) {
    const code = String(error?.code || "").trim();

    return Boolean(error?.isNetworkError)
        || code === "API_NETWORK_FETCH_FAILED"
        || code === "API_TIMEOUT"
        || isNetworkStyleError(error);
}

export function annotateNetworkError(error, requestUrl) {
    if (!isNetworkStyleError(error)) {
        return error;
    }

    const message = buildLocalServiceUnavailableMessage(requestUrl);
    const normalizedUrl = normalizeRequestUrl(requestUrl);
    const origin = getRequestOrigin(requestUrl);
    const wrappedError = createAppDiagnosticError({
        code: error?.name === "AbortError" ? "API_TIMEOUT" : "API_NETWORK_FETCH_FAILED",
        message: String(error?.message || error || "Network request failed"),
        userMessage: message || (origin
            ? `Could not reach ${origin}. The backend may be offline or restarting.`
            : "Could not reach the server. The backend may be offline or restarting."),
        source: "api",
        operation: "request",
        severity: "error",
        endpoint: normalizedUrl,
        details: {
            originalName: String(error?.name || ""),
            originalMessage: String(error?.message || error || "")
        },
        cause: error
    });

    wrappedError.isNetworkError = true;
    wrappedError.requestUrl = normalizedUrl;

    return wrappedError;
}

export async function fetchWithNetworkErrorContext(requestUrl, options) {
    try {
        return await fetch(requestUrl, options);
    } catch (error) {
        throw annotateNetworkError(error, requestUrl);
    }
}

function maybeDispatchInvalidTokenEvent(res, data) {
    const message = String(data?.error || "").trim();

    if (res.status !== 401 || !/invalid token/i.test(message) || hasDispatchedInvalidTokenEvent) {
        return;
    }

    hasDispatchedInvalidTokenEvent = true;

    if (typeof window !== "undefined" && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent("chatapp-auth-invalid-token", {
            detail: {
                status: res.status,
                url: res.url || "",
                message
            }
        }));
    }
}

function normalizeParseOptions(fallbackMessageOrOptions, extraOptions = {}) {
    const base = typeof fallbackMessageOrOptions === "string"
        ? { fallbackMessage: fallbackMessageOrOptions }
        : (fallbackMessageOrOptions || {});

    return {
        fallbackMessage: "Request failed",
        source: "api",
        operation: "request",
        invalidResponseMessage: "The server returned an invalid response.",
        ...base,
        ...extraOptions
    };
}

function classifyApiErrorCode(status, data) {
    const message = String(data?.error || "").trim();
    const backendCode = String(data?.code || "").trim();

    if (backendCode) {
        return backendCode;
    }

    if (status === 401 && /invalid token/i.test(message)) {
        return "API_INVALID_TOKEN";
    }

    if (status === 401) {
        return "API_HTTP_401";
    }

    if (status === 404) {
        return "API_HTTP_404";
    }

    return "API_BACKEND_ERROR";
}

export async function parseJsonResponse(res, fallbackMessageOrOptions = "Request failed", extraOptions = {}) {
    const options = normalizeParseOptions(fallbackMessageOrOptions, extraOptions);
    const raw = await res.text();

    let data;
    try {
        data = raw ? JSON.parse(raw) : {};
    } catch (error) {
        throw createAppDiagnosticError({
            code: "API_INVALID_JSON",
            message: `Server returned invalid JSON: ${raw || "[empty response]"}`,
            userMessage: options.invalidResponseMessage,
            source: options.source,
            operation: options.operation,
            severity: "error",
            status: res.status,
            endpoint: res.url || "",
            details: {
                method: String(options.method || "").toUpperCase(),
                bodyPreview: String(raw || "[empty response]").slice(0, 600)
            },
            cause: error
        });
    }

    if (!res.ok) {
        maybeDispatchInvalidTokenEvent(res, data);
        const backendCode = String(data?.code || "").trim();
        const error = normalizeAppDiagnosticError(
            createAppDiagnosticError({
                code: classifyApiErrorCode(res.status, data),
                message: String(data?.error || options.fallbackMessage || "Request failed"),
                userMessage: String(data?.error || options.fallbackMessage || "Request failed"),
                source: options.source,
                operation: options.operation,
                severity: res.status === 401 || res.status === 404 ? "warning" : "error",
                status: res.status,
                endpoint: res.url || "",
                traceId: String(data?.traceId || ""),
                details: {
                    method: String(options.method || "").toUpperCase(),
                    backendCode,
                    backendError: String(data?.error || "")
                }
            }),
            {
                details: data?.details,
                cause: {
                    responseBody: data
                }
            }
        );

        error.responseUrl = res.url || "";
        error.responseBody = data;
        error.isAuthError = res.status === 401;
        throw error;
    }

    return data;
}
