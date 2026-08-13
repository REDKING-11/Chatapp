const SEMVER_PATTERN = /^v?(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const MAX_RELEASE_NOTES_LENGTH = 220;

export const UPDATE_PHASES = Object.freeze({
    IDLE: "idle",
    CHECKING: "checking",
    UP_TO_DATE: "up-to-date",
    AVAILABLE: "available",
    ERROR: "error"
});

export const UPDATE_DOWNLOAD_PHASES = Object.freeze({
    IDLE: "idle",
    DOWNLOADING: "downloading",
    DOWNLOADED: "downloaded",
    ERROR: "error"
});

export const DEFAULT_UPDATE_STATE = Object.freeze({
    phase: UPDATE_PHASES.IDLE,
    trigger: null,
    currentVersion: "",
    latestVersion: "",
    releaseName: "",
    releaseUrl: "",
    publishedAt: "",
    notesSummary: "",
    hasUpdate: false,
    error: "",
    checkedAt: "",
    installerAssetName: "",
    installerDownloadUrl: "",
    installerDownloadSize: 0,
    installerDownloadPhase: UPDATE_DOWNLOAD_PHASES.IDLE,
    installerDownloadProgress: 0,
    installerDownloadPath: "",
    installerDownloadError: ""
});

function parsePrereleaseIdentifiers(value) {
    if (!value) {
        return [];
    }

    return String(value)
        .split(".")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => (/^\d+$/.test(entry) ? Number(entry) : entry));
}

export function normalizeVersionTag(value) {
    return String(value || "").trim().replace(/^v/i, "");
}

export function parseSemver(value) {
    const normalized = normalizeVersionTag(value);
    const match = SEMVER_PATTERN.exec(normalized);

    if (!match?.groups) {
        return null;
    }

    return {
        raw: String(value || ""),
        version: normalized,
        major: Number(match.groups.major),
        minor: Number(match.groups.minor),
        patch: Number(match.groups.patch),
        prerelease: parsePrereleaseIdentifiers(match.groups.prerelease || "")
    };
}

function comparePrereleaseIdentifiers(left, right) {
    const leftIsNumber = typeof left === "number";
    const rightIsNumber = typeof right === "number";

    if (leftIsNumber && rightIsNumber) {
        return left === right ? 0 : (left > right ? 1 : -1);
    }

    if (leftIsNumber) {
        return -1;
    }

    if (rightIsNumber) {
        return 1;
    }

    if (left === right) {
        return 0;
    }

    return String(left).localeCompare(String(right));
}

export function compareVersions(left, right) {
    const leftVersion = parseSemver(left);
    const rightVersion = parseSemver(right);

    if (!leftVersion && !rightVersion) {
        return 0;
    }

    if (!leftVersion) {
        return -1;
    }

    if (!rightVersion) {
        return 1;
    }

    for (const key of ["major", "minor", "patch"]) {
        if (leftVersion[key] !== rightVersion[key]) {
            return leftVersion[key] > rightVersion[key] ? 1 : -1;
        }
    }

    const leftPrerelease = leftVersion.prerelease;
    const rightPrerelease = rightVersion.prerelease;

    if (leftPrerelease.length === 0 && rightPrerelease.length === 0) {
        return 0;
    }

    if (leftPrerelease.length === 0) {
        return 1;
    }

    if (rightPrerelease.length === 0) {
        return -1;
    }

    const length = Math.max(leftPrerelease.length, rightPrerelease.length);
    for (let index = 0; index < length; index += 1) {
        const leftIdentifier = leftPrerelease[index];
        const rightIdentifier = rightPrerelease[index];

        if (leftIdentifier == null) {
            return -1;
        }

        if (rightIdentifier == null) {
            return 1;
        }

        const comparison = comparePrereleaseIdentifiers(leftIdentifier, rightIdentifier);
        if (comparison !== 0) {
            return comparison;
        }
    }

    return 0;
}

export function summarizeReleaseNotes(value) {
    const normalized = String(value || "")
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => line.replace(/^[-*#>\s]+/, "").trim())
        .filter(Boolean)
        .join(" ");

    if (!normalized) {
        return "";
    }

    if (normalized.length <= MAX_RELEASE_NOTES_LENGTH) {
        return normalized;
    }

    return `${normalized.slice(0, MAX_RELEASE_NOTES_LENGTH - 1).trimEnd()}...`;
}

function normalizeReleaseAsset(asset) {
    const name = String(asset?.name || "").trim();
    const downloadUrl = String(asset?.downloadUrl || asset?.browser_download_url || "").trim();

    if (!name || !downloadUrl) {
        return null;
    }

    return {
        name,
        downloadUrl,
        size: Number(asset?.size || 0)
    };
}

export function selectInstallerAsset(assets, { platform = "win32" } = {}) {
    if (!Array.isArray(assets) || platform !== "win32") {
        return null;
    }

    return assets.find((asset) => /\.msi$/i.test(String(asset?.name || ""))) || null;
}

export function normalizeGitHubRelease(release) {
    const parsedVersion = parseSemver(release?.tag_name);

    if (!parsedVersion) {
        return null;
    }

    return {
        tagName: String(release?.tag_name || ""),
        version: parsedVersion.version,
        isDraft: Boolean(release?.draft),
        isPrerelease: Boolean(release?.prerelease || parsedVersion.prerelease.length > 0),
        releaseName: String(release?.name || "").trim() || `v${parsedVersion.version}`,
        releaseUrl: String(release?.html_url || "").trim(),
        publishedAt: String(release?.published_at || release?.created_at || "").trim(),
        notesSummary: summarizeReleaseNotes(release?.body || ""),
        assets: Array.isArray(release?.assets)
            ? release.assets.map(normalizeReleaseAsset).filter(Boolean)
            : []
    };
}

export function selectLatestRelease(releases, { currentVersion = "", platform = "win32" } = {}) {
    const normalizedCurrentVersion = normalizeVersionTag(currentVersion);
    const parsedCurrentVersion = parseSemver(normalizedCurrentVersion);
    const allowPrereleases = Boolean(parsedCurrentVersion?.prerelease?.length);
    const normalizedReleases = Array.isArray(releases)
        ? releases
            .map(normalizeGitHubRelease)
            .filter(Boolean)
            .filter((release) => !release.isDraft && (!release.isPrerelease || allowPrereleases))
            .map((release) => ({
                ...release,
                installerAsset: selectInstallerAsset(release.assets, { platform })
            }))
            .sort((left, right) => compareVersions(right.version, left.version))
        : [];

    const latestRelease = normalizedReleases[0] || null;

    if (!latestRelease) {
        return {
            currentVersion: normalizedCurrentVersion,
            latestRelease: null,
            hasUpdate: false
        };
    }

    return {
        currentVersion: normalizedCurrentVersion,
        latestRelease,
        hasUpdate: compareVersions(latestRelease.version, normalizedCurrentVersion) > 0,
        platform
    };
}

export function createUpdateState(base = {}) {
    return {
        ...DEFAULT_UPDATE_STATE,
        ...base
    };
}
