const express = require("express");
const { verifyUser } = require("../services/auth.service");
const {
    getServerProfileDescription,
    saveServerProfileDescription
} = require("../services/serverProfiles.service");

const router = express.Router();

router.get("/server-profile/me", async (req, res) => {
    const user = await verifyUser(req);

    if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    return res.json({
        ok: true,
        profile: getServerProfileDescription(user.id)
    });
});

router.put("/server-profile/me", async (req, res) => {
    const user = await verifyUser(req);

    if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const description = req.body?.description;

    if (description != null && typeof description !== "string") {
        return res.status(400).json({ error: "Description must be text." });
    }

    return res.json({
        ok: true,
        profile: saveServerProfileDescription({
            userId: user.id,
            description: description || ""
        })
    });
});

module.exports = router;
