const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createPresencePayload,
  getEffectiveUserPresence,
  normalizePresenceStatus,
  updateDevicePresence
} = require("./presence");

test("normalizes invalid custom statuses back to online", () => {
  assert.equal(normalizePresenceStatus("busy"), "busy");
  assert.equal(normalizePresenceStatus("unknown"), "online");
});

test("latest online device status wins for shared presence", () => {
  const onlineDevices = new Map([
    ["device-a", { userId: 42, presenceStatus: "busy", presenceUpdatedAt: 1000 }],
    ["device-b", { userId: 42, presenceStatus: "free", presenceUpdatedAt: 2000 }]
  ]);

  assert.deepEqual(getEffectiveUserPresence(onlineDevices, 42), {
    state: "online",
    status: "free"
  });

  updateDevicePresence(onlineDevices, "device-a", "chilling", 3000);

  assert.deepEqual(createPresencePayload(onlineDevices, 42), {
    userId: 42,
    state: "online",
    status: "chilling"
  });
});

test("disconnecting the last device makes the user offline", () => {
  const onlineDevices = new Map([
    ["device-a", { userId: 7, presenceStatus: "off", presenceUpdatedAt: 4000 }]
  ]);

  assert.deepEqual(createPresencePayload(onlineDevices, 7), {
    userId: 7,
    state: "online",
    status: "off"
  });

  onlineDevices.delete("device-a");

  assert.deepEqual(createPresencePayload(onlineDevices, 7), {
    userId: 7,
    state: "offline",
    status: null
  });
});
