const express = require("express");
const { readServerConfig, createChannel } = require("../services/server.service");
const { ensureChannelMessages } = require("../utils/storage");

const router = express.Router();

router.get("/health", (req, res) => {
    res.json({ ok: true });
});

router.get("/server", (req, res) => {
    const server = readServerConfig();

    if (!server) {
        return res.status(500).json({ error: "Failed to load server config" });
    }

    res.json(server);
});

router.post("/server/channels", (req, res) => {
    const { name, type } = req.body || {};

    if (!String(name || "").trim()) {
        return res.status(400).json({ error: "Channel name is required" });
    }

    try {
        const result = createChannel({ name, type });

        if (result.channel?.id) {
            ensureChannelMessages(result.channel.id);
        }

        res.status(201).json(result);
    } catch (error) {
        const message = String(error?.message || "Failed to create channel");
        const status = /already exists|required|unsupported/i.test(message) ? 400 : 500;
        res.status(status).json({ error: message });
    }
});

module.exports = router;
