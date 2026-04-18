import { BrowserWindow, app, ipcMain, shell } from "electron";
import {
    UPDATE_PHASES,
    createUpdateState,
    selectLatestRelease
} from "../lib/appUpdates.js";

const GITHUB_RELEASES_API_URL = "https://api.github.com/repos/REDKING-11/Chatapp/releases?per_page=12";
const GITHUB_RELEASES_PAGE = "https://github.com/REDKING-11/Chatapp/releases";
const UPDATE_STATE_CHANNEL = "app-update:state-changed";
const UPDATE_STARTUP_DELAY_MS = 4000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function createGitHubHeaders() {
    return {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": `Chatapp/${app.getVersion()}`
    };
}

function sanitizeUpdateError(error) {
    const message = String(error?.message || "").trim();

    if (!message) {
        return "Could not complete that update action right now.";
    }

    if (/rate limit/i.test(message)) {
        return "GitHub rate-limited the update check. Try again in a little bit.";
    }

    if (/aborted|timed out/i.test(message)) {
        return "The update request timed out. Try again in a moment.";
    }

    return message;
}

async function fetchReleaseCatalog() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
        const response = await fetch(GITHUB_RELEASES_API_URL, {
            headers: createGitHubHeaders(),
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`GitHub returned ${response.status} while checking for updates.`);
        }

        return await response.json();
    } finally {
        clearTimeout(timeoutId);
    }
}

export function registerAppUpdateIpc() {
    let state = createUpdateState({
        currentVersion: app.getVersion()
    });
    let scheduledCheckTimeout = null;
    let scheduledIntervalId = null;

    function broadcastState() {
        BrowserWindow.getAllWindows().forEach((window) => {
            if (!window.isDestroyed()) {
                window.webContents.send(UPDATE_STATE_CHANNEL, state);
            }
        });
    }

    function setState(patch) {
        state = createUpdateState({
            ...state,
            ...patch,
            currentVersion: app.getVersion()
        });
        broadcastState();
        return state;
    }

    async function resolveReleaseInfo() {
        const releaseCatalog = await fetchReleaseCatalog();
        return selectLatestRelease(releaseCatalog, {
            currentVersion: app.getVersion()
        });
    }

    async function checkForUpdates({ interactive = false, trigger = interactive ? "manual" : "background" } = {}) {
        if (state.phase === UPDATE_PHASES.CHECKING) {
            return state;
        }

        const previousState = state;
        setState({
            phase: UPDATE_PHASES.CHECKING,
            trigger,
            error: "",
            checkedAt: ""
        });

        try {
            const releaseInfo = await resolveReleaseInfo();
            const release = releaseInfo.latestRelease;

            if (!release || !releaseInfo.hasUpdate) {
                return setState({
                    phase: UPDATE_PHASES.UP_TO_DATE,
                    trigger,
                    latestVersion: release?.version || previousState.latestVersion || "",
                    releaseName: release?.releaseName || previousState.releaseName || "",
                    releaseUrl: release?.releaseUrl || GITHUB_RELEASES_PAGE,
                    publishedAt: release?.publishedAt || "",
                    notesSummary: release?.notesSummary || "",
                    hasUpdate: false,
                    error: "",
                    checkedAt: new Date().toISOString()
                });
            }

            return setState({
                phase: UPDATE_PHASES.AVAILABLE,
                trigger,
                latestVersion: release.version,
                releaseName: release.releaseName,
                releaseUrl: release.releaseUrl || GITHUB_RELEASES_PAGE,
                publishedAt: release.publishedAt,
                notesSummary: release.notesSummary,
                hasUpdate: true,
                error: "",
                checkedAt: new Date().toISOString()
            });
        } catch (error) {
            if (!interactive && trigger !== "manual") {
                state = previousState;
                return state;
            }

            return setState({
                phase: UPDATE_PHASES.ERROR,
                trigger,
                error: sanitizeUpdateError(error),
                checkedAt: new Date().toISOString()
            });
        }
    }

    function scheduleBackgroundChecks() {
        if (scheduledCheckTimeout || scheduledIntervalId) {
            return;
        }

        scheduledCheckTimeout = setTimeout(() => {
            checkForUpdates({ interactive: false, trigger: "startup" });
            scheduledCheckTimeout = null;
        }, UPDATE_STARTUP_DELAY_MS);

        scheduledIntervalId = setInterval(() => {
            checkForUpdates({ interactive: false, trigger: "background" });
        }, UPDATE_CHECK_INTERVAL_MS);
    }

    ipcMain.handle("app-update:get-state", () => state);
    ipcMain.handle("app-update:check", (_event, options) => checkForUpdates({
        interactive: Boolean(options?.interactive),
        trigger: Boolean(options?.interactive) ? "manual" : (options?.trigger || "background")
    }));
    ipcMain.handle("app-update:open-releases", () => {
        shell.openExternal(state.releaseUrl || GITHUB_RELEASES_PAGE);
    });

    scheduleBackgroundChecks();

    return {
        getState() {
            return state;
        }
    };
}
