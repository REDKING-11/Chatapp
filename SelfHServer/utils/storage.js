const fs = require("fs");
const path = require("path");

const messagesPath = path.join(__dirname, "..", "data", "messages.json");
const messageLogsPath = path.join(__dirname, "..", "data", "messageLogs.json");

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

function readMessages() {
    return readJsonFile(messagesPath, {});
}

function writeMessages(data) {
    writeJsonFile(messagesPath, data);
}

function ensureChannelMessages(channelId) {
    const messages = readMessages();

    if (!messages[channelId]) {
        messages[channelId] = [];
        writeMessages(messages);
    }

    return messages[channelId];
}

function readMessageLogs() {
    return readJsonFile(messageLogsPath, []);
}

function writeMessageLogs(data) {
    writeJsonFile(messageLogsPath, data);
}

function addMessageLog(entry) {
    const logs = readMessageLogs();
    logs.push(entry);
    writeMessageLogs(logs);
}

module.exports = {
    readMessages,
    writeMessages,
    ensureChannelMessages,
    readMessageLogs,
    writeMessageLogs,
    addMessageLog
};
