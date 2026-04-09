import { parseJsonResponse } from "../../lib/api";

function getAuthToken() {
    return localStorage.getItem("authToken");
}

function buildAuthHeaders(extra = {}) {
    const token = getAuthToken();
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra
    };
}

async function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read that image file."));
        reader.readAsDataURL(file);
    });
}

export async function uploadProfileAssets({
    backendUrl,
    avatarFile = null,
    bannerFile = null,
    avatarDataUrl = null,
    bannerDataUrl = null
}) {
    if (!backendUrl) {
        throw new Error("No shared server is available to host your profile images yet.");
    }

    const payload = {};

    if (avatarDataUrl) {
        payload.avatarDataUrl = avatarDataUrl;
    } else if (avatarFile) {
        payload.avatarDataUrl = await readFileAsDataUrl(avatarFile);
    }

    if (bannerDataUrl) {
        payload.bannerDataUrl = bannerDataUrl;
    } else if (bannerFile) {
        payload.bannerDataUrl = await readFileAsDataUrl(bannerFile);
    }

    const res = await fetch(`${backendUrl}/api/profile-assets/me`, {
        method: "PUT",
        headers: buildAuthHeaders({
            "Content-Type": "application/json"
        }),
        body: JSON.stringify(payload)
    });

    return parseJsonResponse(res, "Failed to upload profile image");
}

export async function deleteProfileAsset({ backendUrl, assetType }) {
    if (!backendUrl) {
        throw new Error("No shared server is available to host your profile images yet.");
    }

    const normalizedAssetType = assetType === "banner" ? "banner" : "avatar";
    const res = await fetch(`${backendUrl}/api/profile-assets/me/${normalizedAssetType}`, {
        method: "DELETE",
        headers: buildAuthHeaders()
    });

    return parseJsonResponse(res, "Failed to remove profile image");
}

export async function fetchProfileAssetManifest({ backendUrl, userId }) {
    if (!backendUrl || !userId) {
        return null;
    }

    let res;

    try {
        res = await fetch(`${backendUrl}/api/profile-assets/${userId}/manifest`, {
            headers: buildAuthHeaders()
        });
    } catch {
        return null;
    }

    if ([401, 403, 404].includes(res.status)) {
        return null;
    }

    return parseJsonResponse(res, "Failed to load profile assets");
}

export async function fetchProfileAssetBlobUrl({ backendUrl, userId, assetType }) {
    if (!backendUrl || !userId) {
        return null;
    }

    const normalizedAssetType = assetType === "banner" ? "banner" : "avatar";
    let res;

    try {
        res = await fetch(`${backendUrl}/api/profile-assets/${userId}/${normalizedAssetType}`, {
            headers: buildAuthHeaders()
        });
    } catch {
        return null;
    }

    if (!res.ok) {
        if ([401, 403, 404].includes(res.status)) {
            return null;
        }

        throw new Error("Failed to load profile image");
    }

    const blob = await res.blob();
    return URL.createObjectURL(blob);
}
