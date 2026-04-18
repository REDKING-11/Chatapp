import assert from "node:assert/strict";
import {
    annotateNetworkError,
    parseJsonResponse
} from "../src/lib/api.js";
import {
    classifyDmRelayPollError,
    classifyRealtimeConnectionError,
    createAppDiagnosticError,
    normalizeAppDiagnosticError
} from "../src/lib/diagnostics.js";

const remoteNetworkError = annotateNetworkError(
    new TypeError("Failed to fetch"),
    "https://56.228.2.7/auth/login.php"
);
assert.equal(remoteNetworkError.code, "API_NETWORK_FETCH_FAILED");
assert.equal(remoteNetworkError.source, "api");
assert.equal(remoteNetworkError.endpoint, "https://56.228.2.7/auth/login.php");

await assert.rejects(
    () => parseJsonResponse(
        new Response(JSON.stringify({
            error: "Invalid token"
        }), {
            status: 401,
            headers: {
                "Content-Type": "application/json"
            }
        }),
        {
            fallbackMessage: "Could not validate session",
            source: "api",
            operation: "auth.validate",
            method: "GET"
        }
    ),
    (error) => {
        assert.equal(error.code, "API_INVALID_TOKEN");
        assert.equal(error.status, 401);
        assert.equal(error.source, "api");
        assert.equal(error.operation, "auth.validate");
        return true;
    }
);

await assert.rejects(
    () => parseJsonResponse(
        new Response(JSON.stringify({
            code: "DEVICE_REAUTH_REQUIRED",
            error: "This device was revoked for secure DMs and must be re-authorized with MFA."
        }), {
            status: 409,
            headers: {
                "Content-Type": "application/json"
            }
        }),
        {
            fallbackMessage: "Should not matter",
            source: "dm",
            operation: "device.register",
            method: "POST"
        }
    ),
    (error) => {
        assert.equal(error.code, "DEVICE_REAUTH_REQUIRED");
        assert.equal(error.status, 409);
        assert.equal(error.details.backendCode, "DEVICE_REAUTH_REQUIRED");
        return true;
    }
);

await assert.rejects(
    () => parseJsonResponse(
        new Response("not-json", {
            status: 200,
            headers: {
                "Content-Type": "application/json"
            }
        }),
        {
            fallbackMessage: "Should not matter",
            source: "api",
            operation: "test.invalidJson",
            method: "GET"
        }
    ),
    (error) => {
        assert.equal(error.code, "API_INVALID_JSON");
        assert.equal(error.source, "api");
        assert.equal(error.operation, "test.invalidJson");
        return true;
    }
);

const relayMissingDeviceError = classifyDmRelayPollError(
    createAppDiagnosticError({
        code: "API_HTTP_404",
        message: "Device not found or revoked",
        status: 404,
        source: "api",
        operation: "request"
    }),
    {
        deviceId: "device_123"
    }
);
assert.equal(relayMissingDeviceError.code, "DM_RELAY_DEVICE_MISSING");
assert.equal(relayMissingDeviceError.deviceId, "device_123");
assert.equal(relayMissingDeviceError.severity, "warning");

const relayRevokedDeviceError = classifyDmRelayPollError(
    createAppDiagnosticError({
        code: "DEVICE_REAUTH_REQUIRED",
        message: "This device was revoked for secure DMs and must be re-authorized with MFA.",
        status: 409,
        source: "dm",
        operation: "relay.poll"
    }),
    {
        deviceId: "device_789"
    }
);
assert.equal(relayRevokedDeviceError.code, "DM_DEVICE_REAUTH_REQUIRED");
assert.equal(relayRevokedDeviceError.deviceId, "device_789");
assert.equal(relayRevokedDeviceError.severity, "warning");

const realtimeAuthError = classifyRealtimeConnectionError(
    createAppDiagnosticError({
        code: "DM_REALTIME_AUTH_FAILED",
        message: "Realtime authentication failed",
        source: "dm",
        operation: "realtime.connect"
    }),
    {
        endpoint: "wss://56.228.2.7/ws/"
    }
);
assert.equal(realtimeAuthError.code, "DM_REALTIME_AUTH_FAILED");
assert.equal(realtimeAuthError.endpoint, "wss://56.228.2.7/ws/");

const realtimeTemporaryError = classifyRealtimeConnectionError(
    createAppDiagnosticError({
        code: "DM_REALTIME_TEMP_UNAVAILABLE",
        message: "Realtime is temporarily unavailable.",
        source: "dm",
        operation: "realtime.connect"
    })
);
assert.equal(realtimeTemporaryError.code, "DM_REALTIME_TEMP_UNAVAILABLE");
assert.equal(realtimeTemporaryError.severity, "warning");

const realtimeRevokedDeviceError = classifyRealtimeConnectionError(
    createAppDiagnosticError({
        code: "DEVICE_REAUTH_REQUIRED",
        message: "This device was revoked for secure DMs and must be re-authorized with MFA.",
        source: "dm",
        operation: "realtime.connect"
    })
);
assert.equal(realtimeRevokedDeviceError.code, "DM_DEVICE_REAUTH_REQUIRED");
assert.equal(realtimeRevokedDeviceError.severity, "warning");

const wrappedFriendsSendError = normalizeAppDiagnosticError(
    createAppDiagnosticError({
        code: "DM_RECIPIENT_DEVICES_UNVERIFIED",
        message: "Recipient devices could not be verified.",
        userMessage: "Recipient devices could not be verified.",
        source: "dm",
        operation: "conversation.create"
    }),
    {
        code: "FRIENDS_DM_SEND_FAILED",
        source: "friends",
        operation: "dm.send",
        userMessage: "Could not send that message right now."
    }
);
assert.equal(wrappedFriendsSendError.code, "FRIENDS_DM_SEND_FAILED");
assert.equal(wrappedFriendsSendError.details.causeCode, "DM_RECIPIENT_DEVICES_UNVERIFIED");

const preservedCauseError = normalizeAppDiagnosticError(
    createAppDiagnosticError({
        code: "FRIENDS_DM_SEND_FAILED",
        message: "Could not send that message right now.",
        userMessage: "Could not send that message right now.",
        source: "friends",
        operation: "dm.send",
        cause: createAppDiagnosticError({
            code: "DM_RECIPIENT_DEVICES_UNVERIFIED",
            message: "Recipient devices could not be verified.",
            source: "dm",
            operation: "conversation.create"
        })
    }),
    {
        source: "friends",
        operation: "ui.error"
    }
);
assert.equal(preservedCauseError.cause.code, "DM_RECIPIENT_DEVICES_UNVERIFIED");
assert.equal(preservedCauseError.details.causeOperation, "dm.send");

const preservedTechnicalMessage = normalizeAppDiagnosticError(
    createAppDiagnosticError({
        code: "DM_RECEIVE_UNKNOWN_CHAIN_EPOCH",
        message: "Ratchet: unknown chain epoch for sender device_abc",
        userMessage: "Chatapp could not import that secure DM on this device.",
        source: "dm",
        operation: "message.receive"
    }),
    {
        code: "IPC_SECURE_DM_FAILED",
        userMessage: "Secure DM local operation failed.",
        source: "ipc",
        operation: "secureDm.receive.message"
    }
);
assert.equal(preservedTechnicalMessage.message, "Ratchet: unknown chain epoch for sender device_abc");
assert.equal(preservedTechnicalMessage.userMessage, "Secure DM local operation failed.");
assert.equal(preservedTechnicalMessage.details.causeCode, "DM_RECEIVE_UNKNOWN_CHAIN_EPOCH");

console.log("diagnostics.test.mjs: ok");
