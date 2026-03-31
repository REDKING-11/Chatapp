const express = require("express");
const cors = require("cors");
const { readMessages, writeMessages, readMessageLogs, addMessageLog } = require("./storage");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

async function verifyUser(req) {
    const auth = req.headers.authorization || "";
    const match = auth.match(/^Bearer\s+(.*)$/);

    if (!match) return null;

    const token = match[1];

    try {
        const res = await fetch("https://core.samlam24.treok.io/auth/me.php", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!res.ok) return null;

        const data = await res.json();
        return data.user;
    } catch {
        return null;
    }
}

const serverInfo = {
    id: "srv_local_1",
    name: "Local Test Server",
    description: "Your local self-hosted server",
    icon: null,
    channels: [
        {
            id: "c1",
            name: "general",
            type: "chat",
            layout: {
                type: "column",
                children: [
                    {
                        type: "text",
                        props: {
                            text: "Welcome to general chat"
                        }
                    },
                    {
                        type: "chat"
                    }
                ]
            }
        },
        {
            id: "c2",
            name: "custom-page",
            type: "page",
            layout: {
                type: "row",
                children: [
                    {
                        type: "column",
                        children: [
                            {
                                type: "text",
                                props: {
                                    text: "Left side content"
                                }
                            }
                        ]
                    },
                    {
                        type: "column",
                        children: [
                            {
                                type: "text",
                                props: {
                                    text: "Right side content"
                                }
                            }
                        ]
                    }
                ]
            }
        }
    ]
};

const members = [];

app.get("/api/health", (req, res) => {
    res.json({ ok: true });
});

app.get("/api/server", (req, res) => {
    res.json(serverInfo);
});

app.post("/api/join", (req, res) => {
    const { userId, username } = req.body;

    if (!userId || !username) {
        return res.status(400).json({ error: "userId and username are required" });
    }

    const existingMember = members.find((member) => member.userId === userId);

    if (!existingMember) {
        members.push({
            userId,
            username,
            joinedAt: Date.now(),
            roles: ["member"]
        });
    }

    res.json({
        ok: true,
        server: {
            id: serverInfo.id,
            name: serverInfo.name,
            description: serverInfo.description,
            icon: serverInfo.icon,
            backendUrl: `http://localhost:${PORT}`
        }
    });
});

app.get("/api/channels/:channelId/messages", (req, res) => {
    const messages = readMessages();
    const channelId = req.params.channelId;

    res.json(messages[channelId] || []);
});

app.post("/api/channels/:channelId/messages", async (req, res) => {
    const user = await verifyUser(req);

    if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const messages = readMessages();
    const channelId = req.params.channelId;

    const { content, replyTo } = req.body;

    if (!content || !content.trim()) {
        return res.status(400).json({ error: "Message content is required" });
    }

    const newMessage = {
        id: `m_${Date.now()}`,
        author: user.username,   // ✅ from token
        userId: user.id,         // ✅ from token
        content: content.trim(),
        createdAt: Date.now(),
        updatedAt: null,
        replyTo: replyTo || null,
        isDeleted: false
    };

    if (!messages[channelId]) {
        messages[channelId] = [];
    }

    messages[channelId].push(newMessage);
    writeMessages(messages);

    res.status(201).json(newMessage);
});

app.patch("/api/messages/:messageId", async (req, res) => {
    const user = await verifyUser(req);

    if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { content } = req.body;
    const { messageId } = req.params;

    const messages = readMessages();

    for (const channelId of Object.keys(messages)) {
        const message = messages[channelId].find((m) => m.id === messageId);

        if (message) {
            if (message.userId !== user.id) {
                return res.status(403).json({ error: "You can only edit your own messages" });
            }

            const oldContent = message.content;

            message.content = content.trim();
            message.updatedAt = Date.now();

            writeMessages(messages);

            addMessageLog({
                id: `log_${Date.now()}`,
                actionType: "message_edited",
                messageId: message.id,
                channelId,
                performedBy: user.username,
                targetAuthor: message.author,
                oldContent,
                newContent: message.content,
                replyTargetId: message.replyTo || null,
                timestamp: Date.now()
            });

            return res.json(message);
        }
    }

    res.status(404).json({ error: "Message not found" });
});

app.delete("/api/messages/:messageId", async (req, res) => {
    const user = await verifyUser(req);

    if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { messageId } = req.params;
    const messages = readMessages();

    for (const channelId of Object.keys(messages)) {
        const message = messages[channelId].find((m) => m.id === messageId);

        if (message) {
            if (message.userId !== user.id) {
                return res.status(403).json({ error: "You can only delete your own messages" });
            }

            const oldContent = message.content;

            message.content = "[deleted]";
            message.isDeleted = true;
            message.updatedAt = Date.now();

            writeMessages(messages);

            addMessageLog({
                id: `log_${Date.now()}`,
                actionType: "message_deleted",
                messageId: message.id,
                channelId,
                performedBy: user.username,
                targetAuthor: message.author,
                oldContent,
                newContent: "[deleted]",
                replyTargetId: message.replyTo || null,
                timestamp: Date.now()
            });

            return res.json({ success: true, message });
        }
    }

    res.status(404).json({ error: "Message not found" });
});

app.get("/api/channels/:channelId/message-logs", (req, res) => {
    const { channelId } = req.params;
    const logs = readMessageLogs();

    const channelLogs = logs.filter((log) => log.channelId === channelId);
    res.json(channelLogs);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});