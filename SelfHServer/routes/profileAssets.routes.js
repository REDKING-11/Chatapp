const express = require("express");
const { verifyUser } = require("../services/auth.service");
const {
    saveProfileAsset,
    clearProfileAsset,
    getProfileAssetManifest,
    getProfileAssetFile
} = require("../services/profileAssets.service");

const router = express.Router();

router.get("/profile-assets/:userId/manifest", async (req, res) => {
    const manifest = getProfileAssetManifest(req.params.userId);
    res.json(manifest);
});

router.get("/profile-assets/:userId/:assetType", async (req, res) => {
    const assetType = req.params.assetType === "banner" ? "banner" : "avatar";
    const asset = getProfileAssetFile(req.params.userId, assetType);

    if (!asset) {
        return res.status(404).json({ error: "Profile asset not found" });
    }

    res.setHeader("Content-Type", asset.mimeType);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.sendFile(asset.filePath);
});

router.put("/profile-assets/me", async (req, res) => {
    const user = await verifyUser(req);

    if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { avatarDataUrl, bannerDataUrl } = req.body || {};

    try {
        if (typeof avatarDataUrl === "string" && avatarDataUrl.trim()) {
            saveProfileAsset({
                userId: user.id,
                assetType: "avatar",
                dataUrl: avatarDataUrl.trim()
            });
        }

        if (typeof bannerDataUrl === "string" && bannerDataUrl.trim()) {
            saveProfileAsset({
                userId: user.id,
                assetType: "banner",
                dataUrl: bannerDataUrl.trim()
            });
        }

        return res.json({
            ok: true,
            manifest: getProfileAssetManifest(user.id)
        });
    } catch (error) {
        return res.status(400).json({ error: error.message || "Failed to save profile asset" });
    }
});

router.delete("/profile-assets/me/:assetType", async (req, res) => {
    const user = await verifyUser(req);

    if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const assetType = req.params.assetType === "banner" ? "banner" : "avatar";
    clearProfileAsset({
        userId: user.id,
        assetType
    });

    res.json({
        ok: true,
        manifest: getProfileAssetManifest(user.id)
    });
});

module.exports = router;
