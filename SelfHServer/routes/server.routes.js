const express = require("express");
const { readServerConfig } = require("../services/server.service");

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

module.exports = router;