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

function writeServerConfig(data) {
    fs.writeFileSync(serverPath, JSON.stringify(data, null, 2));
    return data;
}

function slugifyChannelName(name) {
    return String(name || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

function makeDefaultChannelLayout(type, channelName) {
    if (type === "page") {
        return {
            type: "column",
            children: [
                {
                    type: "heading",
                    props: {
                        text: `# ${channelName}`
                    }
                },
                {
                    type: "text",
                    props: {
                        text: "New page channel ready for customization."
                    }
                }
            ]
        };
    }

    return {
        type: "column",
        children: [
            {
                type: "text",
                props: {
                    text: `Welcome to #${channelName}`
                }
            },
            {
                type: "chat"
            }
        ]
    };
}

function createChannel({ name, type = "chat" }) {
    const server = readServerConfig();

    if (!server) {
        throw new Error("Failed to load server config");
    }

    const normalizedName = slugifyChannelName(name);

    if (!normalizedName) {
        throw new Error("Channel name is required");
    }

    if (!["chat", "page"].includes(type)) {
        throw new Error("Unsupported channel type");
    }

    const existingNames = Array.isArray(server.channels) ? server.channels : [];
    const nameTaken = existingNames.some(
        (channel) => String(channel?.name || "").toLowerCase() === normalizedName
    );

    if (nameTaken) {
        throw new Error("A channel with that name already exists");
    }

    const nextChannel = {
        id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: normalizedName,
        type,
        layout: makeDefaultChannelLayout(type, normalizedName)
    };

    const nextServer = {
        ...server,
        channels: [...existingNames, nextChannel]
    };

    writeServerConfig(nextServer);

    return {
        server: nextServer,
        channel: nextChannel
    };
}

module.exports = {
    readServerConfig,
    writeServerConfig,
    createChannel
};
