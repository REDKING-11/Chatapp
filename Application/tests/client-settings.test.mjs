import assert from "node:assert/strict";
import {
    buildClientSettingsExport,
    loadClientSettings,
    saveClientSettings
} from "../src/features/clientSettings.js";

const storage = new Map();

globalThis.localStorage = {
    getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
        storage.set(key, String(value));
    },
    removeItem(key) {
        storage.delete(key);
    }
};

globalThis.window = {
    setTimeout(callback) {
        callback();
        return 0;
    },
    dispatchEvent() {}
};

globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
    }
};

storage.clear();
assert.equal(loadClientSettings().autoLoadFriendProfileDetails, false);
assert.deepEqual(loadClientSettings().ignoredVerificationDevicesByFriend, {});
assert.deepEqual(loadClientSettings().mutedFriendNotificationsById, {});
assert.deepEqual(loadClientSettings().friendProfileNotesById, {});

const savedOptOut = saveClientSettings({
    autoLoadFriendProfileDetails: false
});
assert.equal(savedOptOut.autoLoadFriendProfileDetails, false);
assert.equal(loadClientSettings().autoLoadFriendProfileDetails, false);

storage.set("clientSettings:v1", JSON.stringify({
    autoLoadProfileDescriptions: true
}));
assert.equal(loadClientSettings().autoLoadFriendProfileDetails, true);

const savedDefault = saveClientSettings({});
assert.equal(savedDefault.autoLoadFriendProfileDetails, false);

const exportPayload = buildClientSettingsExport({
    autoLoadFriendProfileDetails: false,
    ignoredVerificationDevicesByFriend: {
        "42": [123, "abc", "", null]
    },
    friendProfileNotesById: {
        "42": "test note",
        "43": 123
    },
    mutedFriendNotificationsById: {
        "42": true,
        "43": Date.now() + 3600000,
        "44": false
    }
});
assert.equal(exportPayload.settings.autoLoadFriendProfileDetails, false);
assert.deepEqual(exportPayload.settings.ignoredVerificationDevicesByFriend, {
    "42": ["123", "abc"]
});
assert.deepEqual(exportPayload.settings.friendProfileNotesById, {
    "42": "test note"
});
assert.deepEqual(exportPayload.settings.mutedFriendNotificationsById, {
    "42": true,
    "43": exportPayload.settings.mutedFriendNotificationsById["43"]
});
assert.equal(typeof exportPayload.settings.mutedFriendNotificationsById["43"], "number");

console.log("client-settings.test.mjs: ok");
