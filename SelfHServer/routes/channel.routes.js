const express = require("express");
const { readChannelMessages, readChannelMessageLogs } = require("../utils/storage");

const router = express.Router();

router.get("/channels/:channelId/messages", (req, res) => {
    const messages = readChannelMessages();
    const channelId = req.params.channelId;

    res.json(messages[channelId] || []);
});

router.get("/channels/:channelId/message-logs", (req, res) => {
    const { channelId } = req.params;
    const logs = readChannelMessageLogs();

    const channelLogs = logs.filter((log) => log.channelId === channelId);
    res.json(channelLogs);
});

module.exports = router;
