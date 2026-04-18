import assert from "node:assert/strict";
import {
    DEFAULT_PRESENCE_STATUS,
    PRESENCE_OPTIONS,
    formatPresenceWithSecondaryText,
    getConfiguredPresenceMeta,
    normalizeConfiguredPresenceStatus,
    normalizeExternalPresence,
    resolvePresenceMeta
} from "../src/features/presence.js";

assert.equal(DEFAULT_PRESENCE_STATUS, "online");
assert.deepEqual(
    PRESENCE_OPTIONS.map((option) => option.id),
    ["online", "free", "busy", "chilling", "off"]
);

assert.equal(normalizeConfiguredPresenceStatus("busy"), "busy");
assert.equal(normalizeConfiguredPresenceStatus("unknown"), "online");
assert.equal(getConfiguredPresenceMeta("chilling").label, "Chilling");

assert.deepEqual(
    normalizeExternalPresence({
        state: "online",
        status: "free"
    }),
    {
        state: "online",
        status: "free"
    }
);

assert.deepEqual(
    normalizeExternalPresence({
        state: "offline",
        status: "busy"
    }),
    {
        state: "offline",
        status: null
    }
);

assert.deepEqual(
    resolvePresenceMeta({
        state: "online",
        status: "off"
    }),
    {
        state: "online",
        status: "off",
        tone: "off",
        label: "Offline",
        detail: "Away for now"
    }
);

assert.deepEqual(
    resolvePresenceMeta({
        state: "offline",
        status: "busy"
    }),
    {
        state: "offline",
        status: null,
        tone: "offline",
        label: "Offline",
        detail: "Disconnected"
    }
);

assert.equal(
    formatPresenceWithSecondaryText(
        { state: "online", status: "busy" },
        "Reviewing pull requests"
    ),
    "Busy · Reviewing pull requests"
);
assert.equal(
    formatPresenceWithSecondaryText(
        { state: "offline", status: "busy" },
        "Start a secure chat"
    ),
    "Offline · Start a secure chat"
);

console.log("presence.test.mjs: ok");
