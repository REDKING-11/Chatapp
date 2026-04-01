const fs = require("fs");
const path = require("path");

const customizationPath = path.join(__dirname, "..", "data", "customization.json");
const defaultCustomizationPath = path.join(__dirname, "..", "data", "defaultCustomization.json");

function readJson(filePath, fallback) {
    try {
        const raw = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getDefaultCustomization() {
    return readJson(defaultCustomizationPath, {});
}

function getCustomization() {
    const current = readJson(customizationPath, null);

    if (current && Object.keys(current).length > 0) {
        return current;
    }

    const preset = getDefaultCustomization();
    writeJson(customizationPath, preset);
    return preset;
}

function saveCustomization(newCustomization) {
    writeJson(customizationPath, newCustomization);
    return newCustomization;
}

function resetCustomizationToDefault() {
    const preset = getDefaultCustomization();
    writeJson(customizationPath, preset);
    return preset;
}

module.exports = {
    getCustomization,
    saveCustomization,
    resetCustomizationToDefault,
    getDefaultCustomization
};