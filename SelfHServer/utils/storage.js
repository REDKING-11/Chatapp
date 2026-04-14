const fs = require("fs");
const path = require("path");

const messagesPath = path.join(__dirname, "..", "data", "messages.json");
const messageLogsPath = path.join(__dirname, "..", "data", "messageLogs.json");
const dmRelayStorePath = path.join(__dirname, "..", "data", "dmRelayStore.json");
const DM_DEFAULT_RELAY_TTL_MS = 24 * 60 * 60 * 1000;
const DM_MAX_RELAY_TTL_MS = DM_DEFAULT_RELAY_TTL_MS;

const DM_PLAINTEXT_FIELD_NAMES = new Set([
    "body",
    "content",
    "message",
    "plaintext",
    "decryptedBody",
    "replyTo",
    "attachments",
    "attachmentMetadata",
    "attachmentName",
    "attachmentNames",
    "filename",
    "fileName",
    "mimeType",
    "metadata"
]);

const DM_ALLOWED_ENVELOPE_KEYS = new Set([
    "id",
    "conversationId",
    "recipientUserId",
    "recipientDeviceId",
    "senderUserId",
    "senderDeviceId",
    "ciphertext",
    "wrappedKey",
    "signature",
    "expiresAt"
]);

function readJsonFile(filePath, fallback) {
    try {
        const data = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(data);
    } catch {
        return fallback;
    }
}

function writeJsonFile(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readChannelMessages() {
    return readJsonFile(messagesPath, {});
}

function writeChannelMessages(data) {
    writeJsonFile(messagesPath, data);
}

function ensureChannelMessages(channelId) {
    const messages = readChannelMessages();

    if (!messages[channelId]) {
        messages[channelId] = [];
        writeChannelMessages(messages);
    }

    return messages[channelId];
}

function readChannelMessageLogs() {
    return readJsonFile(messageLogsPath, []);
}

function writeChannelMessageLogs(data) {
    writeJsonFile(messageLogsPath, data);
}

function addChannelMessageLog(entry) {
    const logs = readChannelMessageLogs();
    logs.push(entry);
    writeChannelMessageLogs(logs);
}

function readDmRelayStore() {
    return readJsonFile(dmRelayStorePath, {
        envelopes: []
    });
}

function writeDmRelayStore(data) {
    writeJsonFile(dmRelayStorePath, data);
}

function clampDmRelayTtlMs(value) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return DM_DEFAULT_RELAY_TTL_MS;
    }

    return Math.max(0, Math.min(DM_MAX_RELAY_TTL_MS, Math.floor(numeric)));
}

function cleanupExpiredDmRelayEnvelopes(store) {
    const nextStore = store || readDmRelayStore();
    const now = Date.now();
    const nextEnvelopes = (nextStore.envelopes || []).filter((entry) => (
        Number(entry.expiresAt || 0) > now
    ));

    if (nextEnvelopes.length !== (nextStore.envelopes || []).length) {
        nextStore.envelopes = nextEnvelopes;
        writeDmRelayStore(nextStore);
    }

    return nextStore;
}

function assertNoPlaintextDmFields(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return;
    }

    for (const [key, value] of Object.entries(payload)) {
        if (DM_PLAINTEXT_FIELD_NAMES.has(key)) {
            throw new Error(`DM relay payload must not include plaintext field "${key}"`);
        }

        if (value && typeof value === "object") {
            assertNoPlaintextDmFields(value);
        }
    }
}

function sanitizeDmRelayEnvelope(payload) {
    assertNoPlaintextDmFields(payload);

    const sanitized = {};

    for (const [key, value] of Object.entries(payload || {})) {
        if (DM_ALLOWED_ENVELOPE_KEYS.has(key) && value !== undefined) {
            sanitized[key] = value;
        }
    }

    return sanitized;
}

function appendDmRelayEnvelope(payload) {
    const envelope = sanitizeDmRelayEnvelope(payload);
    const store = cleanupExpiredDmRelayEnvelopes();

    store.envelopes.push(envelope);
    writeDmRelayStore(store);

    return envelope;
}

function listDmRelayEnvelopes(filters = {}) {
    const { recipientUserId, recipientDeviceId } = filters;
    const store = cleanupExpiredDmRelayEnvelopes();

    return store.envelopes.filter((entry) => {
        if (recipientUserId && String(entry.recipientUserId) !== String(recipientUserId)) {
            return false;
        }

        if (recipientDeviceId && String(entry.recipientDeviceId) !== String(recipientDeviceId)) {
            return false;
        }

        return true;
    });
}

function removeDmRelayEnvelope(envelopeId, filters = {}) {
    const { recipientUserId, recipientDeviceId } = filters;
    const store = cleanupExpiredDmRelayEnvelopes();
    const index = store.envelopes.findIndex((entry) => String(entry.id) === String(envelopeId));

    if (index === -1) {
        return null;
    }

    const current = store.envelopes[index];

    if (recipientUserId && String(current.recipientUserId) !== String(recipientUserId)) {
        throw new Error("Envelope does not belong to this user");
    }

    if (recipientDeviceId && String(current.recipientDeviceId) !== String(recipientDeviceId)) {
        throw new Error("Envelope does not belong to this device");
    }

    store.envelopes.splice(index, 1);
    writeDmRelayStore(store);

    return current;
}

module.exports = {
    DM_DEFAULT_RELAY_TTL_MS,
    clampDmRelayTtlMs,
    readChannelMessages,
    writeChannelMessages,
    ensureChannelMessages,
    readChannelMessageLogs,
    writeChannelMessageLogs,
    addChannelMessageLog,
    readDmRelayStore,
    writeDmRelayStore,
    sanitizeDmRelayEnvelope,
    appendDmRelayEnvelope,
    listDmRelayEnvelopes,
    removeDmRelayEnvelope
};
