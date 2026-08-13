import assert from "node:assert/strict";
import {
    UPDATE_DOWNLOAD_PHASES,
    createUpdateState,
    compareVersions,
    normalizeGitHubRelease,
    normalizeVersionTag,
    selectInstallerAsset,
    selectLatestRelease,
    summarizeReleaseNotes
} from "../src/lib/appUpdates.js";

assert.equal(normalizeVersionTag("v1.2.3"), "1.2.3");
assert.equal(compareVersions("1.2.3", "1.2.2"), 1);
assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
assert.equal(compareVersions("1.2.3", "1.2.3-alpha.1"), 1);
assert.equal(compareVersions("1.2.3-alpha.2", "1.2.3-alpha.10"), -1);

assert.equal(
    summarizeReleaseNotes("\n- Faster startup\n- Better update flow\n"),
    "Faster startup Better update flow"
);

const normalizedRelease = normalizeGitHubRelease({
    tag_name: "v1.4.0",
    name: "Chatapp 1.4.0",
    html_url: "https://github.com/REDKING-11/Chatapp/releases/tag/v1.4.0",
    published_at: "2026-04-18T09:00:00.000Z",
    body: "## Highlights\n\n- Better updater\n- Smoother installs\n",
    assets: [
        {
            name: "LibreChat-1.4.0.msi",
            browser_download_url: "https://github.com/REDKING-11/Chatapp/releases/download/v1.4.0/LibreChat-1.4.0.msi",
            size: 8192
        }
    ]
});

assert.equal(normalizedRelease.version, "1.4.0");
assert.equal(normalizedRelease.releaseName, "Chatapp 1.4.0");
assert.equal(normalizedRelease.notesSummary, "Highlights Better updater Smoother installs");
assert.equal(normalizedRelease.assets.length, 1);
assert.equal(normalizedRelease.assets[0].name, "LibreChat-1.4.0.msi");
assert.equal(selectInstallerAsset(normalizedRelease.assets, { platform: "win32" })?.name, "LibreChat-1.4.0.msi");
assert.equal(selectInstallerAsset(normalizedRelease.assets, { platform: "darwin" }), null);

const selectedRelease = selectLatestRelease(
    [
        {
            tag_name: "v1.5.0-beta.1",
            prerelease: true,
            name: "Beta",
            html_url: "https://example.test/beta",
            assets: []
        },
        {
            tag_name: "v1.4.0",
            draft: false,
            prerelease: false,
            name: "Stable 1.4.0",
            html_url: "https://example.test/1.4.0",
            published_at: "2026-04-18T09:00:00.000Z",
            body: "- Stable release",
            assets: [
                {
                    name: "LibreChat-1.4.0.msi",
                    browser_download_url: "https://example.test/LibreChat-1.4.0.msi",
                    size: 8192
                }
            ]
        },
        {
            tag_name: "v1.3.0",
            draft: false,
            prerelease: false,
            name: "Stable 1.3.0",
            html_url: "https://example.test/1.3.0",
            assets: []
        }
    ],
    {
        currentVersion: "1.2.5",
        platform: "win32"
    }
);

assert.equal(selectedRelease.currentVersion, "1.2.5");
assert.equal(selectedRelease.latestRelease.version, "1.4.0");
assert.equal(selectedRelease.hasUpdate, true);
assert.equal(selectedRelease.latestRelease.installerAsset.name, "LibreChat-1.4.0.msi");

const defaultUpdateState = createUpdateState();
assert.equal(defaultUpdateState.installerDownloadPhase, UPDATE_DOWNLOAD_PHASES.IDLE);
assert.equal(defaultUpdateState.installerDownloadProgress, 0);

const stablePatchRelease = selectLatestRelease(
    [
        {
            tag_name: "v0.1.6",
            draft: false,
            prerelease: false,
            name: "LibreChat 0.1.6",
            html_url: "https://example.test/0.1.6",
            assets: []
        }
    ],
    {
        currentVersion: "0.1.5",
        platform: "win32"
    }
);

assert.equal(stablePatchRelease.latestRelease.version, "0.1.6");
assert.equal(stablePatchRelease.hasUpdate, true);

const stableReleaseBeatsInstalledAlpha = selectLatestRelease(
    [
        {
            tag_name: "v0.1.6",
            draft: false,
            prerelease: false,
            name: "LibreChat 0.1.6",
            html_url: "https://example.test/0.1.6",
            assets: []
        }
    ],
    {
        currentVersion: "0.1.6-alpha",
        platform: "win32"
    }
);

assert.equal(stableReleaseBeatsInstalledAlpha.latestRelease.version, "0.1.6");
assert.equal(stableReleaseBeatsInstalledAlpha.hasUpdate, true);

const alphaChannelRelease = selectLatestRelease(
    [
        {
            tag_name: "v0.1.6-alpha",
            draft: false,
            prerelease: true,
            name: "LibreChat 0.1.6 alpha",
            html_url: "https://example.test/0.1.6-alpha",
            assets: []
        },
        {
            tag_name: "v0.1.5-alpha",
            draft: false,
            prerelease: true,
            name: "LibreChat 0.1.5 alpha",
            html_url: "https://example.test/0.1.5-alpha",
            assets: []
        }
    ],
    {
        currentVersion: "0.1.5-alpha",
        platform: "win32"
    }
);

assert.equal(alphaChannelRelease.latestRelease.version, "0.1.6-alpha");
assert.equal(alphaChannelRelease.hasUpdate, true);

const stableBuildIgnoresPrerelease = selectLatestRelease(
    [
        {
            tag_name: "v0.1.6-alpha",
            draft: false,
            prerelease: true,
            name: "LibreChat 0.1.6 alpha",
            html_url: "https://example.test/0.1.6-alpha",
            assets: []
        }
    ],
    {
        currentVersion: "0.1.5",
        platform: "win32"
    }
);

assert.equal(stableBuildIgnoresPrerelease.latestRelease, null);
assert.equal(stableBuildIgnoresPrerelease.hasUpdate, false);

const upToDateRelease = selectLatestRelease(
    [
        {
            tag_name: "v1.4.0",
            prerelease: false,
            draft: false,
            html_url: "https://example.test/1.4.0",
            assets: []
        }
    ],
    {
        currentVersion: "1.4.0",
        platform: "linux"
    }
);

assert.equal(upToDateRelease.hasUpdate, false);

console.log("app-updates.test.mjs: ok");
