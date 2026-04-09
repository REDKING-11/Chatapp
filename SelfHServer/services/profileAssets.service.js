const fs = require("fs");
const path = require("path");

const profileAssetsDir = path.join(__dirname, "..", "data", "profile-assets");
const profileAssetsIndexPath = path.join(profileAssetsDir, "index.json");

const MAX_AVATAR_BYTES = 512 * 1024;
const MAX_BANNER_BYTES = 1024 * 1024;
const ALLOWED_MIME_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp"
};

function ensureProfileAssetStorage() {
    if (!fs.existsSync(profileAssetsDir)) {
        fs.mkdirSync(profileAssetsDir, { recursive: true });
    }

    if (!fs.existsSync(profileAssetsIndexPath)) {
        fs.writeFileSync(profileAssetsIndexPath, JSON.stringify({}, null, 2));
    }
}

function readIndex() {
    ensureProfileAssetStorage();

    try {
        return JSON.parse(fs.readFileSync(profileAssetsIndexPath, "utf-8"));
    } catch {
        return {};
    }
}

function writeIndex(data) {
    ensureProfileAssetStorage();
    fs.writeFileSync(profileAssetsIndexPath, JSON.stringify(data, null, 2));
}

function parseDataUrl(dataUrl) {
    if (typeof dataUrl !== "string") {
        throw new Error("Profile image payload is missing.");
    }

    const match = dataUrl.match(/^data:(image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
        throw new Error("Only PNG, JPG, and WEBP profile images are supported.");
    }

    const mimeType = match[1];
    const buffer = Buffer.from(match[2], "base64");
    return {
        mimeType,
        extension: ALLOWED_MIME_TYPES[mimeType],
        buffer
    };
}

function removeExistingAssetFile(existingAsset) {
    if (!existingAsset?.fileName) {
        return;
    }

    const filePath = path.join(profileAssetsDir, existingAsset.fileName);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

function saveProfileAsset({ userId, assetType, dataUrl }) {
    const parsed = parseDataUrl(dataUrl);
    const maxBytes = assetType === "banner" ? MAX_BANNER_BYTES : MAX_AVATAR_BYTES;

    if (parsed.buffer.length > maxBytes) {
        throw new Error(
            assetType === "banner"
                ? "Profile background is too large. Max size is 1 MB."
                : "Profile picture is too large. Max size is 512 KB."
        );
    }

    const index = readIndex();
    const userKey = String(userId);
    const existing = index[userKey] || {};
    const existingAsset = existing[assetType] || null;

    removeExistingAssetFile(existingAsset);

    const fileName = `${userKey}-${assetType}-${Date.now()}.${parsed.extension}`;
    const filePath = path.join(profileAssetsDir, fileName);
    fs.writeFileSync(filePath, parsed.buffer);

    const nextRecord = {
        ...existing,
        [assetType]: {
            fileName,
            mimeType: parsed.mimeType,
            sizeBytes: parsed.buffer.length,
            updatedAt: new Date().toISOString()
        }
    };

    index[userKey] = nextRecord;
    writeIndex(index);

    return nextRecord;
}

function clearProfileAsset({ userId, assetType }) {
    const index = readIndex();
    const userKey = String(userId);
    const existing = index[userKey] || {};
    const existingAsset = existing[assetType] || null;

    removeExistingAssetFile(existingAsset);
    delete existing[assetType];

    if (Object.keys(existing).length === 0) {
        delete index[userKey];
    } else {
        index[userKey] = existing;
    }

    writeIndex(index);
    return index[userKey] || {};
}

function getProfileAssetManifest(userId) {
    const index = readIndex();
    const record = index[String(userId)] || {};

    return {
        userId: Number(userId),
        avatar: record.avatar
            ? {
                hasAsset: true,
                updatedAt: record.avatar.updatedAt,
                sizeBytes: record.avatar.sizeBytes
            }
            : { hasAsset: false },
        banner: record.banner
            ? {
                hasAsset: true,
                updatedAt: record.banner.updatedAt,
                sizeBytes: record.banner.sizeBytes
            }
            : { hasAsset: false }
    };
}

function getProfileAssetFile(userId, assetType) {
    const index = readIndex();
    const record = index[String(userId)] || {};
    const asset = record[assetType] || null;

    if (!asset?.fileName) {
        return null;
    }

    const filePath = path.join(profileAssetsDir, asset.fileName);
    if (!fs.existsSync(filePath)) {
        return null;
    }

    return {
        filePath,
        mimeType: asset.mimeType || "application/octet-stream"
    };
}

module.exports = {
    saveProfileAsset,
    clearProfileAsset,
    getProfileAssetManifest,
    getProfileAssetFile
};
