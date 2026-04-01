const express = require("express");
const {
    getCustomization,
    saveCustomization,
    resetCustomizationToDefault
} = require("../services/customization.service");

const router = express.Router();

router.get("/customization", (req, res) => {
    const customization = getCustomization();
    res.json(customization);
});

router.put("/customization", (req, res) => {
    const customization = req.body;

    if (!customization || typeof customization !== "object") {
        return res.status(400).json({ error: "Invalid customization payload" });
    }

    const saved = saveCustomization(customization);
    res.json(saved);
});

router.post("/customization/reset", (req, res) => {
    const reset = resetCustomizationToDefault();
    res.json(reset);
});

module.exports = router;