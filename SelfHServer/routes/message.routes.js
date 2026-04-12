const express = require("express");
const { verifyUser } = require("../services/auth.service");
const { readMessages, writeMessages, addMessageLog } = require("../utils/storage");

const router = express.Router();

router.post("/channels/:channelId/messages", async (req, res) => {
    const user = await verifyUser(req);

    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const messages = readMessages();
    const channelId = req.params.channelId;
    const { content, replyTo } = req.body;

    if (!content || !content.trim()) {
        return res.status(400).json({ error: "Message content is required" });
    }

    const newMessage = {
        id: `m_${Date.now()}`,
        author: user.username,
        userId: user.id,
        content: content.trim(),
        createdAt: Date.now(),
        updatedAt: null,
        replyTo: replyTo || null,
        reactions: {},
        isDeleted: false
    };

    if (!messages[channelId]) {
        messages[channelId] = [];
    }

    messages[channelId].push(newMessage);
    writeMessages(messages);

    addMessageLog({
        id: `log_${Date.now()}`,
        actionType: replyTo ? "message_replied" : "message_sent",
        messageId: newMessage.id,
        channelId,
        performedBy: user.username,
        targetAuthor: user.username,
        oldContent: null,
        newContent: newMessage.content,
        replyTargetId: replyTo || null,
        timestamp: Date.now()
    });

    res.status(201).json(newMessage);
});

router.post("/messages/:messageId/reactions", async (req, res) => {
    const user = await verifyUser(req);

    if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { emoji } = req.body || {};
    const { messageId } = req.params;

    if (!emoji || !String(emoji).trim()) {
        return res.status(400).json({ error: "Reaction emoji is required" });
    }

    const reactionKey = String(emoji).trim();
    const messages = readMessages();

    for (const channelId of Object.keys(messages)) {
        const message = messages[channelId].find((m) => m.id === messageId);

        if (!message) {
            continue;
        }

        const currentUserId = String(user.id);
        const existingUsers = Array.isArray(message.reactions?.[reactionKey])
            ? message.reactions[reactionKey].map(String)
            : [];
        const hasReaction = existingUsers.includes(currentUserId);
        const nextUsers = hasReaction
            ? existingUsers.filter((entry) => entry !== currentUserId)
            : [...existingUsers, currentUserId];

        message.reactions = {
            ...(message.reactions || {}),
            [reactionKey]: nextUsers
        };

        if (nextUsers.length === 0) {
            delete message.reactions[reactionKey];
        }

        writeMessages(messages);

        addMessageLog({
            id: `log_${Date.now()}`,
            actionType: hasReaction ? "message_reaction_removed" : "message_reaction_added",
            messageId: message.id,
            channelId,
            performedBy: user.username,
            targetAuthor: message.author,
            oldContent: null,
            newContent: reactionKey,
            replyTargetId: message.replyTo || null,
            timestamp: Date.now()
        });

        return res.json(message);
    }

    res.status(404).json({ error: "Message not found" });
});

router.patch("/messages/:messageId", async (req, res) => {
    const user = await verifyUser(req);

    if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { content } = req.body;
    const { messageId } = req.params;

    if (!content || !content.trim()) {
        return res.status(400).json({ error: "Message content is required" });
    }

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

router.delete("/messages/:messageId", async (req, res) => {
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

module.exports = router;
