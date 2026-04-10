const fs = require("fs");
const path = require("path");
const { readServerConfig } = require("./server.service");

const storePath = path.join(__dirname, "..", "data", "server-profiles.json");

function ensureStore() {
    if (!fs.existsSync(storePath)) {
        fs.writeFileSync(storePath, JSON.stringify({}, null, 2));
    }
}

function readStore() {
    ensureStore();

    try {
        return JSON.parse(fs.readFileSync(storePath, "utf-8"));
    } catch {
        return {};
    }
}

function writeStore(store) {
    ensureStore();
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function getCurrentServerId() {
    const server = readServerConfig();
    return server?.id || "default";
}

function normalizeDescription(value) {
    return String(value || "").trim().slice(0, 280);
}

function getServerProfileDescription(userId) {
    const store = readStore();
    const serverId = getCurrentServerId();
    const record = store?.[serverId]?.[String(userId)] || null;

    return {
        serverId,
        userId: Number(userId),
        description: record?.description || "",
        updatedAt: record?.updatedAt || null
    };
}

function saveServerProfileDescription({ userId, description }) {
    const store = readStore();
    const serverId = getCurrentServerId();
    const userKey = String(userId);

    if (!store[serverId]) {
        store[serverId] = {};
    }

    store[serverId][userKey] = {
        description: normalizeDescription(description),
        updatedAt: new Date().toISOString()
    };

    writeStore(store);
    return getServerProfileDescription(userId);
}

module.exports = {
    getServerProfileDescription,
    saveServerProfileDescription
};
