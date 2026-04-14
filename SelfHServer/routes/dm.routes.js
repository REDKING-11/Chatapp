const express = require("express");
const { verifyUser } = require("../services/auth.service");
const {
    DM_DEFAULT_RELAY_TTL_MS,
    appendDmRelayEnvelope,
    clampDmRelayTtlMs,
    listDmRelayEnvelopes,
    removeDmRelayEnvelope
} = require("../utils/storage");

const router = express.Router();

router.post("/dm/relay/envelopes", async (req, res) => {
    const user = await verifyUser(req);

    if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const {
        id,
        conversationId,
        recipientUserId,
        recipientDeviceId,
        senderDeviceId,
        ciphertext,
        wrappedKey,
        signature,
        relayTtlMs
    } = req.body || {};

    if (!id || !conversationId || !recipientUserId || !recipientDeviceId || !senderDeviceId) {
        return res.status(400).json({ error: "Envelope routing fields are required" });
    }

    if (!ciphertext || !wrappedKey || !signature) {
        return res.status(400).json({ error: "Ciphertext, wrapped key, and signature are required" });
    }

    try {
        const normalizedRelayTtlMs = clampDmRelayTtlMs(relayTtlMs);
        const envelope = appendDmRelayEnvelope({
            id: String(id),
            conversationId: String(conversationId),
            recipientUserId: String(recipientUserId),
            recipientDeviceId: String(recipientDeviceId),
            senderUserId: String(user.id),
            senderDeviceId: String(senderDeviceId),
            ciphertext: String(ciphertext),
            wrappedKey: String(wrappedKey),
            signature: String(signature),
            expiresAt: Date.now() + (normalizedRelayTtlMs >= 0 ? normalizedRelayTtlMs : DM_DEFAULT_RELAY_TTL_MS)
        });

        return res.status(201).json(envelope);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
});

router.get("/dm/relay/envelopes", async (req, res) => {
    const user = await verifyUser(req);

    if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { recipientDeviceId } = req.query;

    if (!recipientDeviceId) {
        return res.status(400).json({ error: "recipientDeviceId is required" });
    }

    const envelopes = listDmRelayEnvelopes({
        recipientUserId: user.id,
        recipientDeviceId
    }).map((entry) => ({
        id: entry.id,
        conversationId: entry.conversationId,
        senderUserId: entry.senderUserId,
        senderDeviceId: entry.senderDeviceId,
        ciphertext: entry.ciphertext,
        wrappedKey: entry.wrappedKey,
        signature: entry.signature
    }));

    return res.json(envelopes);
});

router.post("/dm/relay/envelopes/:envelopeId/ack", async (req, res) => {
    const user = await verifyUser(req);

    if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { recipientDeviceId } = req.body || {};

    if (!recipientDeviceId) {
        return res.status(400).json({ error: "recipientDeviceId is required" });
    }

    try {
        const removed = removeDmRelayEnvelope(req.params.envelopeId, {
            recipientUserId: user.id,
            recipientDeviceId
        });

        if (!removed) {
            return res.status(404).json({ error: "Envelope not found" });
        }

        return res.json({
            ok: true,
            id: removed.id
        });
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
});

module.exports = router;
