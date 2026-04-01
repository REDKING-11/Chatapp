const fs = require("fs");
const path = require("path");

const serverPath = path.join(__dirname, "..", "data", "servers", "srv_local_1.json");

function readServerConfig() {
    try {
        const raw = fs.readFileSync(serverPath, "utf-8");
        return JSON.parse(raw);
    } catch (err) {
        console.error("Failed to read server config:", err);
        return null;
    }
}

module.exports = {
    readServerConfig
};