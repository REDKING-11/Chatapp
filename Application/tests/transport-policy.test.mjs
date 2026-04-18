import assert from "node:assert/strict";
import { annotateNetworkError } from "../src/lib/api.js";
import {
    deriveSecureRealtimeWsUrl,
    normalizeSecureBackendUrl,
    normalizeSecureRealtimeWsUrl
} from "../src/lib/transportPolicy.mjs";

assert.equal(
    normalizeSecureBackendUrl("https://core.localhost/"),
    "https://core.localhost"
);
assert.equal(
    normalizeSecureBackendUrl("https://56.228.2.7"),
    "https://56.228.2.7"
);

assert.throws(
    () => normalizeSecureBackendUrl("http://56.228.2.7", "Core API URL"),
    /Core API URL must use https:\/\//
);
assert.throws(
    () => normalizeSecureBackendUrl("http://localhost:4000", "Core API URL"),
    /Core API URL must use https:\/\//
);

assert.throws(
    () => normalizeSecureRealtimeWsUrl("ws://56.228.2.7/ws/", "Realtime DM URL"),
    /Realtime DM URL must use wss:\/\//
);
assert.throws(
    () => normalizeSecureRealtimeWsUrl("ws://localhost:3010/ws/", "Realtime DM URL"),
    /Realtime DM URL must use wss:\/\//
);

assert.equal(
    deriveSecureRealtimeWsUrl("https://core.localhost"),
    "wss://core.localhost/ws/"
);

const localCoreError = annotateNetworkError(
    new TypeError("Failed to fetch"),
    "https://core.localhost/auth/login.php"
);
assert.equal(localCoreError.isNetworkError, true);
assert.match(localCoreError.userMessage, /Could not reach https:\/\/core\.localhost\./);

const localServerError = annotateNetworkError(
    new TypeError("Failed to fetch"),
    "https://server.localhost/api/server"
);
assert.equal(localServerError.isNetworkError, true);
assert.match(localServerError.userMessage, /Could not reach https:\/\/server\.localhost\./);

console.log("transport-policy.test.mjs: ok");
