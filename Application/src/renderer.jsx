import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

import ChannelSidebar from "./components/ChannelSidebar";
import MainView from "./components/MainView";
import AuthScreen from "./components/AuthScreen";
import ClientSettingsModal from "./components/ClientSettingsModal";
import InitialSetupWizard from "./components/InitialSetupWizard";
import JoinedServersSidebar from "./components/JoinedServerSidebar";
import JoinServerModal from "./components/JoinServerModal";
import QuickSwitcherModal from "./components/QuickSwitcherModal";
import RecoveryKeysGateModal from "./components/RecoveryKeysGateModal";
import ShortcutInfoModal from "./components/ShortcutInfoModal";
import ServerSettingsPanel from "./components/ServerSettingsPanel";
import UpdateBanner from "./components/UpdateBanner";
import { recordAppDiagnostic } from "./lib/diagnostics.js";
import infoBlackIcon from "./assets/Info-black.png";
import infoWhiteIcon from "./assets/Info-white.png";
import infoFirstIcon from "./assets/Info-First.png";
import infoFirstWhiteIcon from "./assets/Info-First-white.png";
import {
    applyClientSettings,
    loadClientSettings,
    resetClientSettingsTab,
    saveClientSettings
} from "./features/clientSettings";
import {
    loadOnboardingState,
    saveOnboardingState
} from "./features/onboarding";
import {
    closeRealtimeConnection,
    ensureRealtimeConnection,
    initializeSecureDm,
    isDmDeviceReauthRequiredError,
    pullRelayMessages,
    registerSecureDmDevice,
    rotateCurrentDmDeviceKeys,
    updateSecureDmPresenceStatus
} from "./features/dm/actions";

import {
    hydrateAuthSession,
    getStoredAuthToken,
    validateSession,
    clearAuthSession,
    saveAuthUser
} from "./features/session/actions";

import {
    loadSelectedServerId,
    saveSelectedServerId,
    clearSelectedServerId,
    hasSeenServerTrustWarning,
    markServerTrustWarningSeen
} from "./features/servers/storage";

import {
    fetchServerData,
    fetchUserServers,
    leaveServer
} from "./features/servers/actions";

const FRIENDS_TAB_ID = "__friends__";
const SERVER_STATUS_RECHECK_MS = 30000;
const SHORTCUT_INFO_SEEN_VERSION = "v2";

function getUpdateBannerKey(updateState) {
    if (!updateState?.phase) {
        return "";
    }

    switch (updateState.phase) {
    case "available":
        return `${updateState.phase}:${updateState.latestVersion || "unknown"}`;
    case "error":
        return `error:${updateState.trigger || "unknown"}:${updateState.latestVersion || "none"}:${updateState.error || "unknown"}`;
    case "up-to-date":
        return updateState.trigger === "manual"
            ? `up-to-date:${updateState.checkedAt || Date.now()}`
            : "";
    default:
        return "";
    }
}

function isCurrentDeviceBundleVerificationError(error) {
    return /secure-dm:verify-device-bundles|device bundle signature verification failed/i.test(
        String(error?.message || error || "")
    );
}

function isExpectedOfflineFetchError(error) {
    if (!error) return false;

    if (error instanceof TypeError) {
        return true;
    }

    return /failed to fetch|networkerror|err_connection_refused|server is offline|unreachable/i.test(String(error.message || error));
}

function App() {
    const [currentUser, setCurrentUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [authNotice, setAuthNotice] = useState("");

    const [joinedServers, setJoinedServers] = useState([]);
    const [selectedJoinedServerId, setSelectedJoinedServerId] = useState(FRIENDS_TAB_ID);
    const [serverStatuses, setServerStatuses] = useState({});
    const [hasFriendsActivity, setHasFriendsActivity] = useState(false);

    const [serverData, setServerData] = useState(null);
    const [selectedChannelId, setSelectedChannelId] = useState(null);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [showServerTrustWarning, setShowServerTrustWarning] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showClientSettings, setShowClientSettings] = useState(false);
    const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
    const [showShortcutInfo, setShowShortcutInfo] = useState(false);
    const [pendingMessageNavigation, setPendingMessageNavigation] = useState(null);
    const [customization, setCustomization] = useState(null);
    const [settingsServer, setSettingsServer] = useState(null);
    const [friendsSwitcherItems, setFriendsSwitcherItems] = useState([]);
    const [clientSettings, setClientSettings] = useState(() => loadClientSettings());
    const [onboardingState, setOnboardingState] = useState(() => loadOnboardingState());
    const [hasSeenShortcutInfo, setHasSeenShortcutInfo] = useState(false);
    const [updateState, setUpdateState] = useState(null);
    const [dismissedUpdateBannerKey, setDismissedUpdateBannerKey] = useState("");
    const [recoveryGateKeys, setRecoveryGateKeys] = useState([]);

    const serverThemeRef = useRef(null);
    const serverCustomCssRef = useRef(null);
    const autoDmRepairAttemptedUserRef = useRef(null);
    const authExpiryHandlingRef = useRef(false);
    const latestPresenceStatusRef = useRef(clientSettings?.presenceStatus || "online");
    const hasAppliedPresenceStatusRef = useRef(false);

    useEffect(() => {
        latestPresenceStatusRef.current = clientSettings?.presenceStatus || "online";
    }, [clientSettings?.presenceStatus]);

    useEffect(() => {
        applyClientSettings(clientSettings);
    }, [clientSettings]);

    useEffect(() => {
        hasAppliedPresenceStatusRef.current = false;
    }, [currentUser?.id]);

    useEffect(() => {
        if (!currentUser?.id) {
            setHasSeenShortcutInfo(false);
            return;
        }

        try {
            const seen = localStorage.getItem(`shortcutInfoSeen:${SHORTCUT_INFO_SEEN_VERSION}:${currentUser.id}`) === "true";
            setHasSeenShortcutInfo(seen);
        } catch {
            setHasSeenShortcutInfo(false);
        }
    }, [currentUser?.id]);

    useEffect(() => {
        async function restoreSession() {
            let token = null;

            try {
                ({ token } = await hydrateAuthSession());
            } catch (error) {
                console.error("Session hydration failed:", error);
                resetAppState();

                try {
                    await clearAuthSession();
                } catch {
                    // Best-effort cleanup only.
                }

                setAuthNotice("Saved sign-in data could not be read. Please sign in again.");
                setAuthLoading(false);
                return;
            }

            if (!token) {
                setAuthLoading(false);
                return;
            }

            try {
                const data = await validateSession(token);
                authExpiryHandlingRef.current = false;
                setAuthNotice("");
                setCurrentUser(data.user);
                saveAuthUser(data.user);
            } catch (err) {
                console.error("Session restore failed:", err);

                if (err?.isAuthError) {
                    resetAppState();
                    await clearAuthSession();
                    setAuthNotice(err?.message || "Your session expired. Please sign in again.");
                } else {
                    resetAppState();
                    setAuthNotice(
                        err?.userMessage
                        || "Could not reach the Chatapp backend right now. Start the local TLS proxy and try again."
                    );
                }
            } finally {
                setAuthLoading(false);
            }
        }

        restoreSession();
    }, []);

    useEffect(() => {
        async function handleInvalidToken(event) {
            if (authExpiryHandlingRef.current) {
                return;
            }

            authExpiryHandlingRef.current = true;
            closeRealtimeConnection();
            setAuthNotice(event.detail?.message || "Your session expired. Please sign in again.");
            setAuthLoading(false);
            resetAppState();

            try {
                await clearAuthSession();
            } finally {
                authExpiryHandlingRef.current = false;
            }
        }

        window.addEventListener("chatapp-auth-invalid-token", handleInvalidToken);
        return () => window.removeEventListener("chatapp-auth-invalid-token", handleInvalidToken);
    }, []);

    useEffect(() => {
        let disposed = false;
        let removeUpdateListener = () => {};

        async function hydrateUpdateState() {
            try {
                const currentUpdateState = await window.appUpdates.getUpdateState();
                if (!disposed) {
                    setUpdateState(currentUpdateState || null);
                }
            } catch {
                // silently ignore — update check is best-effort
            }
            if (window.appUpdates?.onUpdateState) {
                removeUpdateListener = window.appUpdates.onUpdateState((nextUpdateState) => {
                    if (!disposed) {
                        setUpdateState(nextUpdateState || null);
                    }
                });
            }
        }
        hydrateUpdateState();
        return () => {
            disposed = true;
            removeUpdateListener();
        };
    }, []);

    useEffect(() => {
        function handleSwitcherItems(event) {
            setFriendsSwitcherItems(Array.isArray(event.detail) ? event.detail : []);
        }

        window.addEventListener("chatapp-switcher-items", handleSwitcherItems);
        return () => window.removeEventListener("chatapp-switcher-items", handleSwitcherItems);
    }, []);

    useEffect(() => {
        function isEditableTarget(target) {
            if (!target || !(target instanceof HTMLElement)) {
                return false;
            }

            return Boolean(
                target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")
            );
        }

        function emitShortcut(action, detail = {}) {
            window.dispatchEvent(new CustomEvent("chatapp-shortcut", {
                detail: { action, ...detail }
            }));
        }

        function handleGlobalShortcut(event) {
            const key = String(event.key || "").toLowerCase();
            const shortcutSelectedServer = selectedJoinedServerId !== FRIENDS_TAB_ID
                ? joinedServers.find((server) => server.id === selectedJoinedServerId) || null
                : null;

            if (event.ctrlKey && !event.shiftKey && !event.altKey && key === "k") {
                event.preventDefault();
                setShowQuickSwitcher((prev) => !prev);
                return;
            }

            if (event.ctrlKey && !event.shiftKey && !event.altKey && key === ",") {
                event.preventDefault();
                setShowClientSettings(true);
                return;
            }

            if ((event.altKey && key === "enter") || (event.ctrlKey && event.shiftKey && !event.altKey && key === "s")) {
                if (selectedJoinedServerId !== FRIENDS_TAB_ID && shortcutSelectedServer) {
                    event.preventDefault();
                    setSettingsServer(shortcutSelectedServer);
                    setShowSettings(true);
                }
                return;
            }

            if (key === "escape") {
                if (showQuickSwitcher) {
                    event.preventDefault();
                    setShowQuickSwitcher(false);
                    return;
                }

                if (showSettings) {
                    event.preventDefault();
                    setShowSettings(false);
                    setSettingsServer(null);
                    return;
                }

                if (showClientSettings) {
                    event.preventDefault();
                    setShowClientSettings(false);
                    return;
                }

                if (showShortcutInfo) {
                    event.preventDefault();
                    setShowShortcutInfo(false);
                    return;
                }

                emitShortcut("closeOverlay");
                return;
            }

            if (isEditableTarget(event.target)) {
                return;
            }

            if (event.ctrlKey && event.shiftKey && !event.altKey && key === "e") {
                event.preventDefault();
                emitShortcut("focusComposer");
                return;
            }

            if (event.ctrlKey && event.shiftKey && !event.altKey && key === "f") {
                event.preventDefault();
                emitShortcut("attachFile");
                return;
            }

            if (event.ctrlKey && event.shiftKey && !event.altKey && event.code === "Period") {
                event.preventDefault();
                emitShortcut("openEmojiPicker");
                return;
            }

            if (event.ctrlKey && event.shiftKey && !event.altKey && key === "r") {
                event.preventDefault();
                emitShortcut("openReactionPicker");
                return;
            }

            if (event.altKey && !event.ctrlKey && !event.shiftKey && key === "s") {
                event.preventDefault();
                emitShortcut("openConversationSettings");
            }
        }

        window.addEventListener("keydown", handleGlobalShortcut);
        return () => window.removeEventListener("keydown", handleGlobalShortcut);
    }, [joinedServers, selectedJoinedServerId, showClientSettings, showQuickSwitcher, showSettings, showShortcutInfo]);

    useEffect(() => {
        function handleNavigate(event) {
            const detail = event.detail || {};

            if (detail.scope === "friend" && detail.targetId != null) {
                setSelectedJoinedServerId(FRIENDS_TAB_ID);
                window.setTimeout(() => {
                    window.dispatchEvent(new CustomEvent("chatapp-switcher-select", {
                        detail
                    }));
                }, 0);
                return;
            }

            if ((detail.scope === "channel" || detail.scope === "message") && detail.serverId != null && detail.channelId != null) {
                const joinedServer = joinedServers.find((server) => String(server.id) === String(detail.serverId));

                if (!joinedServer) {
                    return;
                }

                setSelectedJoinedServerId(joinedServer.id);
                setSelectedChannelId(detail.channelId);

                if (detail.scope === "message" && detail.messageId != null) {
                    setPendingMessageNavigation({
                        channelId: detail.channelId,
                        messageId: detail.messageId,
                        token: Date.now()
                    });
                }
            }
        }

        window.addEventListener("chatapp-navigate", handleNavigate);
        return () => window.removeEventListener("chatapp-navigate", handleNavigate);
    }, [joinedServers]);

    useEffect(() => {
        if (!pendingMessageNavigation || selectedJoinedServerId === FRIENDS_TAB_ID || selectedChannelId == null) {
            return;
        }

        if (String(pendingMessageNavigation.channelId) !== String(selectedChannelId)) {
            return;
        }

        const loadedChannels = serverData?.channels || [];

        if (!loadedChannels.some((channel) => String(channel.id) === String(pendingMessageNavigation.channelId))) {
            return;
        }

        window.dispatchEvent(new CustomEvent("chatapp-focus-message", {
            detail: {
                scope: "chat",
                channelId: pendingMessageNavigation.channelId,
                messageId: pendingMessageNavigation.messageId,
                token: pendingMessageNavigation.token
            }
        }));
        setPendingMessageNavigation(null);
    }, [pendingMessageNavigation, selectedChannelId, selectedJoinedServerId, serverData]);

    useEffect(() => {
        async function loadUserServers() {
            if (!currentUser) {
                setJoinedServers([]);
                setSelectedJoinedServerId(FRIENDS_TAB_ID);
                setServerData(null);
                setSelectedChannelId(null);
                return;
            }

            try {
                const servers = await fetchUserServers();
                setJoinedServers(servers);
                setSelectedJoinedServerId(loadSelectedServerId(currentUser.id) || FRIENDS_TAB_ID);
            } catch (err) {
                console.error("Failed to load joined servers:", err);
                setJoinedServers([]);
                setSelectedJoinedServerId(FRIENDS_TAB_ID);
            }

            setServerData(null);
            setSelectedChannelId(null);
        }

        loadUserServers();
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser) return;
        saveSelectedServerId(currentUser.id, selectedJoinedServerId);
    }, [currentUser, selectedJoinedServerId]);

    useEffect(() => {
        if (!selectedJoinedServerId || selectedJoinedServerId === FRIENDS_TAB_ID) return;

        const exists = joinedServers.some((server) => server.id === selectedJoinedServerId);

        if (!exists) {
            setSelectedJoinedServerId(FRIENDS_TAB_ID);
            if (currentUser) clearSelectedServerId(currentUser.id);
        }
    }, [joinedServers, selectedJoinedServerId, currentUser]);

    useEffect(() => {
        if (!selectedJoinedServerId) {
            setSelectedJoinedServerId(FRIENDS_TAB_ID);
        }
    }, [selectedJoinedServerId]);

    useEffect(() => {
        if (!currentUser || !selectedJoinedServerId || selectedJoinedServerId === FRIENDS_TAB_ID) {
            setShowServerTrustWarning(false);
            return;
        }

        const selectedJoinedServer = joinedServers.find(
            (server) => server.id === selectedJoinedServerId
        );

        if (!selectedJoinedServer) {
            setShowServerTrustWarning(false);
            return;
        }

        setShowServerTrustWarning(
            !hasSeenServerTrustWarning(currentUser.id, selectedJoinedServerId)
        );
    }, [currentUser, joinedServers, selectedJoinedServerId]);

    useEffect(() => {
        if (!currentUser || joinedServers.length === 0) {
            return;
        }

        let disposed = false;
        let checkInFlight = false;
        let intervalId = null;

        setServerStatuses((prev) => {
            const next = { ...prev };

            joinedServers.forEach((server) => {
                if (!next[server.id]) {
                    next[server.id] = "checking";
                }
            });

            return next;
        });

        async function checkJoinedServerStatuses() {
            if (checkInFlight) {
                return;
            }

            checkInFlight = true;

            const statusEntries = await Promise.all(
                joinedServers.map(async (server) => {
                    if (window.serverHealth?.check) {
                        try {
                            const result = await window.serverHealth.check(server.backendUrl);
                            return [server.id, result?.online ? "online" : "offline"];
                        } catch (error) {
                            const missingMainHandler = /No handler registered for 'server-health:check'/i.test(
                                String(error?.message || error)
                            );

                            if (!missingMainHandler) {
                                return [server.id, "offline"];
                            }
                        }
                    }

                    try {
                        await fetchServerData(server.backendUrl);
                        return [server.id, "online"];
                    } catch {
                        return [server.id, "offline"];
                    }
                })
            );

            if (disposed) {
                checkInFlight = false;
                return;
            }

            setServerStatuses((prev) => {
                const next = { ...prev };
                let changed = false;

                statusEntries.forEach(([serverId, status]) => {
                    if (next[serverId] !== status) {
                        next[serverId] = status;
                        changed = true;
                    }
                });

                return changed ? next : prev;
            });

            checkInFlight = false;
        }

        checkJoinedServerStatuses();
        intervalId = window.setInterval(checkJoinedServerStatuses, SERVER_STATUS_RECHECK_MS);

        return () => {
            disposed = true;
            if (intervalId) {
                window.clearInterval(intervalId);
            }
        };
    }, [currentUser, joinedServers]);

    useEffect(() => {
        async function loadServer() {
            if (!currentUser || !selectedJoinedServerId || selectedJoinedServerId === FRIENDS_TAB_ID) {
                return;
            }

            const selectedJoinedServer = joinedServers.find(
                (server) => server.id === selectedJoinedServerId
            );

            if (!selectedJoinedServer) return;

            const selectedServerStatus = serverStatuses[selectedJoinedServer.id] || "checking";

            if (selectedServerStatus !== "online") {
                setServerData(null);
                setCustomization(null);
                setSelectedChannelId(null);
                return;
            }

            setServerData(null);
            setCustomization(null);
            setSelectedChannelId(null);

            try {
                const data = await fetchServerData(selectedJoinedServer.backendUrl);

                markSelectedServerOnline();
                setServerData(data);

                const visibleChannels = (data.channels || []).filter((channel) => channel?.type !== "customization");

                if (visibleChannels.length > 0) {
                    setSelectedChannelId((prev) => {
                        const stillExists = visibleChannels.some((channel) => channel.id === prev);
                        return stillExists ? prev : visibleChannels[0].id;
                    });
                } else {
                    setSelectedChannelId(null);
                }
            } catch (err) {
                if (!isExpectedOfflineFetchError(err)) {
                    console.error("Failed to fetch server:", err);
                }

                markSelectedServerOffline();
                setServerData(null);
                setCustomization(null);
                setSelectedChannelId(null);
            }
        }

        loadServer();
    }, [currentUser, selectedJoinedServerId, joinedServers, serverStatuses]);

    useEffect(() => {
        async function loadCustomization() {
            if (selectedJoinedServerId === FRIENDS_TAB_ID) {
                setCustomization(null);
                return;
            }

            const selectedJoinedServer = joinedServers.find(
                (server) => server.id === selectedJoinedServerId
            );

            if (!selectedJoinedServer) {
                setCustomization(null);
                return;
            }

            if (serverStatuses[selectedJoinedServer.id] !== "online") {
                setCustomization(null);
                return;
            }

            try {
                const res = await fetch(`${selectedJoinedServer.backendUrl}/api/customization`);
                if (!res.ok) throw new Error("Failed to load customization");

                const data = await res.json();
                setCustomization(data);
                setServerStatus(selectedJoinedServer.id, "online");
            } catch (err) {
                if (!isExpectedOfflineFetchError(err)) {
                    console.error("Failed to load customization:", err);
                }
                setCustomization(null);
                setServerStatus(selectedJoinedServer.id, "offline");
            }
        }

        loadCustomization();
    }, [joinedServers, selectedJoinedServerId, serverStatuses]);

    useEffect(() => {
        function reloadCustomization() {
            if (selectedJoinedServerId === FRIENDS_TAB_ID) return;

            const selectedJoinedServer = joinedServers.find(
                (server) => server.id === selectedJoinedServerId
            );

            if (!selectedJoinedServer) return;

            if (serverStatuses[selectedJoinedServer.id] === "offline") {
                return;
            }

            fetch(`${selectedJoinedServer.backendUrl}/api/customization`)
                .then((res) => {
                    if (!res.ok) throw new Error("Failed to reload customization");
                    return res.json();
                })
                .then(setCustomization)
                .catch((err) => {
                    if (!isExpectedOfflineFetchError(err)) {
                        console.error(err);
                    }
                });
        }

        window.addEventListener("customizationUpdated", reloadCustomization);
        return () => window.removeEventListener("customizationUpdated", reloadCustomization);
    }, [joinedServers, selectedJoinedServerId, serverStatuses]);

    useEffect(() => {
        const el = serverThemeRef.current;
        if (!el) return;

        const vars = [
            "--server-accent",
            "--server-background",
            "--server-surface",
            "--server-surface-alt",
            "--server-text",
            "--server-text-muted",
            "--server-danger",
            "--server-success",
            "--server-radius",
            "--channel-sidebar-width"
        ];

        vars.forEach((key) => el.style.removeProperty(key));

        if (!customization) return;

        const theme = customization.theme || {};
        const layout = customization.layout || {};

        if (theme.accent) el.style.setProperty("--server-accent", theme.accent);
        if (theme.background) el.style.setProperty("--server-background", theme.background);
        if (theme.surface) el.style.setProperty("--server-surface", theme.surface);
        if (theme.surfaceAlt) el.style.setProperty("--server-surface-alt", theme.surfaceAlt);
        if (theme.text) el.style.setProperty("--server-text", theme.text);
        if (theme.textMuted) el.style.setProperty("--server-text-muted", theme.textMuted);
        if (theme.danger) el.style.setProperty("--server-danger", theme.danger);
        if (theme.success) el.style.setProperty("--server-success", theme.success);
        if (theme.radius != null) el.style.setProperty("--server-radius", `${theme.radius}px`);
        if (layout.channelSidebarWidth != null) {
            el.style.setProperty("--channel-sidebar-width", `${layout.channelSidebarWidth}px`);
        }
    }, [customization]);

    useEffect(() => {
        const styleEl = serverCustomCssRef.current;
        if (!styleEl) return;

        styleEl.textContent = customization?.customCss || "";
    }, [customization]);

    useEffect(() => {
        async function setupSecureDm() {
            if (!currentUser || !window.secureDm) return;

            try {
                await initializeSecureDm(currentUser);
                const token = getStoredAuthToken();

                if (!token) {
                    return;
                }

                let registration;

                try {
                    registration = await registerSecureDmDevice({
                        token,
                        currentUser
                    });
                } catch (error) {
                    const repairKey = String(currentUser.id);
                    const canAttemptRepair =
                        autoDmRepairAttemptedUserRef.current !== repairKey
                        && isCurrentDeviceBundleVerificationError(error);

                    if (!canAttemptRepair) {
                        throw error;
                    }

                    autoDmRepairAttemptedUserRef.current = repairKey;
                    console.warn("Secure DM device bundle verification failed during startup; attempting one automatic key rotation repair.", error);

                    await rotateCurrentDmDeviceKeys({
                        token,
                        currentUser
                    });

                    registration = { ok: true, repaired: true };
                }

                if (!registration?.approvalRequired && !registration?.reauthorizationRequired) {
                    try {
                        await ensureRealtimeConnection({
                            token,
                            currentUser
                        });
                        await updateSecureDmPresenceStatus({
                            token,
                            currentUser,
                            status: latestPresenceStatusRef.current
                        });
                    } catch (error) {
                        recordAppDiagnostic(error, {
                            source: "renderer",
                            operation: "secureDm.setup.realtime",
                            severity: "warning"
                        });
                        console.warn("Realtime DM connection is unavailable; secure DM will use relay sync until it recovers.", error);
                    }
                }
            } catch (err) {
                if (isDmDeviceReauthRequiredError(err) || err?.code === "DM_DEVICE_APPROVAL_REQUIRED") {
                    recordAppDiagnostic(err, {
                        source: "renderer",
                        operation: "secureDm.setup",
                        severity: "warning"
                    });
                    console.warn("Secure DM setup is blocked for this device until it is authorized again.", err);
                    return;
                }

                recordAppDiagnostic(err, {
                    source: "renderer",
                    operation: "secureDm.setup",
                    severity: "error"
                });
                console.error("Failed to initialize secure DM:", err);
            }
        }

        setupSecureDm();
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser || !window.secureDm) return;

        let disposed = false;

        async function syncRelayMessages() {
            const token = getStoredAuthToken();

            if (!token) return;

            try {
                await pullRelayMessages({
                    token,
                    currentUser
                });
            } catch (err) {
                if (!disposed) {
                    recordAppDiagnostic(err, {
                        source: "renderer",
                        operation: "secureDm.relaySync",
                        severity: "warning"
                    });
                    console.error("Failed to sync relay messages:", err);
                }
            }
        }

        syncRelayMessages();

        return () => {
            disposed = true;
        };
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser || !window.secureDm) {
            return;
        }

        if (!hasAppliedPresenceStatusRef.current) {
            hasAppliedPresenceStatusRef.current = true;
            return;
        }

        let cancelled = false;

        async function syncPresenceStatus() {
            const token = getStoredAuthToken();

            if (!token) {
                return;
            }

            try {
                await updateSecureDmPresenceStatus({
                    token,
                    currentUser,
                    status: latestPresenceStatusRef.current
                });
            } catch (error) {
                if (
                    cancelled
                    || [
                        "DM_REALTIME_CONNECT_FAILED",
                        "DM_REALTIME_AUTH_FAILED",
                        "DM_REALTIME_TEMP_UNAVAILABLE",
                        "DM_DEVICE_REAUTH_REQUIRED",
                        "DM_DEVICE_NOT_REGISTERED",
                        "DM_DEVICE_APPROVAL_REQUIRED"
                    ].includes(String(error?.code || ""))
                ) {
                    return;
                }

                recordAppDiagnostic(error, {
                    source: "renderer",
                    operation: "secureDm.presence.sync",
                    severity: "warning"
                });
                console.warn("Failed to sync custom DM presence:", error);
            }
        }

        syncPresenceStatus();

        return () => {
            cancelled = true;
        };
    }, [clientSettings?.presenceStatus, currentUser]);

    useEffect(() => {
        if (!currentUser || !window.secureDm) {
            return undefined;
        }

        let cancelled = false;

        async function syncPresenceStatus() {
            const token = getStoredAuthToken();

            if (!token) {
                return;
            }

            try {
                await updateSecureDmPresenceStatus({
                    token,
                    currentUser,
                    status: latestPresenceStatusRef.current
                });
            } catch (error) {
                if (
                    cancelled
                    || [
                        "DM_REALTIME_CONNECT_FAILED",
                        "DM_REALTIME_AUTH_FAILED",
                        "DM_REALTIME_TEMP_UNAVAILABLE",
                        "DM_DEVICE_REAUTH_REQUIRED",
                        "DM_DEVICE_NOT_REGISTERED",
                        "DM_DEVICE_APPROVAL_REQUIRED"
                    ].includes(String(error?.code || ""))
                ) {
                    return;
                }

                recordAppDiagnostic(error, {
                    source: "renderer",
                    operation: "secureDm.presence.reconnect",
                    severity: "warning"
                });
                console.warn("Failed to restore custom DM presence after reconnect:", error);
            }
        }

        function handleRealtimeConnected() {
            syncPresenceStatus();
        }

        window.addEventListener("secureDmRealtimeConnected", handleRealtimeConnected);
        return () => {
            cancelled = true;
            window.removeEventListener("secureDmRealtimeConnected", handleRealtimeConnected);
        };
    }, [currentUser]);

    function resetAppState() {
        setCurrentUser(null);
        setJoinedServers([]);
        setSelectedJoinedServerId(FRIENDS_TAB_ID);
        setServerData(null);
        setSelectedChannelId(null);
        setShowJoinModal(false);
        setShowSettings(false);
        setCustomization(null);
        setSettingsServer(null);
        setRecoveryGateKeys([]);
    }

    function setServerStatus(serverId, status) {
        setServerStatuses((prev) => {
            if (prev[serverId] === status) {
                return prev;
            }

            return {
                ...prev,
                [serverId]: status
            };
        });
    }

    function markSelectedServerOffline() {
        if (!selectedJoinedServerId || selectedJoinedServerId === FRIENDS_TAB_ID) return;
        setServerStatus(selectedJoinedServerId, "offline");
    }

    function markSelectedServerOnline() {
        if (!selectedJoinedServerId || selectedJoinedServerId === FRIENDS_TAB_ID) return;
        setServerStatus(selectedJoinedServerId, "online");
    }

    function handleJoinSuccess(newServer) {
        setJoinedServers((prev) => {
            const exists = prev.some((server) => server.id === newServer.id);
            return exists ? prev : [...prev, newServer];
        });

        setSelectedJoinedServerId(newServer.id);
        setShowJoinModal(false);
    }

    function handleAcknowledgeServerTrustWarning() {
        if (!currentUser || !selectedJoinedServerId || selectedJoinedServerId === FRIENDS_TAB_ID) {
            setShowServerTrustWarning(false);
            return;
        }

        markServerTrustWarningSeen(currentUser.id, selectedJoinedServerId);
        setShowServerTrustWarning(false);
    }

    async function handleLeaveServer(serverId) {
        try {
            await leaveServer(serverId);

            setJoinedServers((prev) =>
                prev.filter((server) => String(server.id) !== String(serverId))
            );

            if (String(selectedJoinedServerId) === String(serverId)) {
                setSelectedJoinedServerId(FRIENDS_TAB_ID);
                setServerData(null);
                setSelectedChannelId(null);
                setCustomization(null);

                if (currentUser) clearSelectedServerId(currentUser.id);
            }
        } catch (err) {
            console.error("Failed to leave server:", err);
        }
    }

    async function handleLogout() {
        closeRealtimeConnection();
        resetAppState();
        await clearAuthSession();
        authExpiryHandlingRef.current = false;
        setAuthNotice("");
        setRecoveryGateKeys([]);
    }

    function handleClientSettingChange(key, value) {
        setClientSettings((prev) => saveClientSettings({
            ...prev,
            [key]: value
        }));
    }

    function handleClientSettingsTabReset(tabId) {
        if (!tabId) {
            return;
        }

        setClientSettings((prev) => resetClientSettingsTab(prev, tabId));
    }

    function handleClientSettingsImport(importedSettings) {
        setClientSettings(importedSettings);
    }

    function handleOpenShortcutInfo() {
        setShowShortcutInfo(true);

        if (!currentUser?.id) {
            return;
        }

        try {
            localStorage.setItem(`shortcutInfoSeen:${SHORTCUT_INFO_SEEN_VERSION}:${currentUser.id}`, "true");
            setHasSeenShortcutInfo(true);
        } catch {
            setHasSeenShortcutInfo(true);
        }
    }

    function handleOnboardingComplete(acceptance) {
        if (typeof acceptance?.autoLoadProfileDescriptions === "boolean") {
            setClientSettings((prev) => saveClientSettings({
                ...prev,
                autoLoadProfileDescriptions: acceptance.autoLoadProfileDescriptions
            }));
        }

        setOnboardingState(saveOnboardingState({
            completed: true,
            acceptedPrivacy: Boolean(acceptance.acceptedPrivacy),
            acceptedTos: Boolean(acceptance.acceptedTos),
            autoLoadProfileDescriptions: acceptance?.autoLoadProfileDescriptions !== false,
            completedAt: new Date().toISOString()
        }));
    }

    function dismissUpdateBanner() {
        const bannerKey = getUpdateBannerKey(updateState);
        if (bannerKey) {
            setDismissedUpdateBannerKey(bannerKey);
        }
    }

    async function handleCheckForUpdates() {
        setDismissedUpdateBannerKey("");

        try {
            await window.appUpdates?.checkForUpdates?.({ interactive: true });
        } catch (error) {
            recordAppDiagnostic(error, {
                source: "renderer",
                operation: "appUpdates.manualCheck",
                severity: "warning"
            });
        }
    }

    if (authLoading) {
        return (
            <div className="auth-screen">
                <div className="auth-card">
                    <h1>Loading...</h1>
                </div>
            </div>
        );
    }

    if (!currentUser) {
        if (!onboardingState.completed) {
            return (
                <InitialSetupWizard
                    currentSettings={clientSettings}
                    onImportSettings={handleClientSettingsImport}
                    onComplete={handleOnboardingComplete}
                />
            );
        }

        return (
            <AuthScreen
                noticeMessage={authNotice}
                onAuthSuccess={(user) => {
                    authExpiryHandlingRef.current = false;
                    setAuthNotice("");
                    setRecoveryGateKeys([]);
                    setCurrentUser(user);
                }}
            />
        );
    }

    const channels = serverData?.channels || [];
    const visibleChannels = channels.filter((channel) => channel?.type !== "customization");
    const selectedChannel = visibleChannels.find((channel) => channel.id === selectedChannelId) || null;
    const selectedJoinedServer =
        joinedServers.find((server) => server.id === selectedJoinedServerId) || null;
    const isFriendsView = selectedJoinedServerId === FRIENDS_TAB_ID;
    const selectedServerIsOnline = selectedJoinedServer
        ? serverStatuses[selectedJoinedServer.id] === "online"
        : false;
    const fallbackProfileMediaServer = joinedServers.find(
        (server) => serverStatuses[server.id] === "online"
    );
    const profileMediaHostUrl = selectedServerIsOnline
        ? selectedJoinedServer.backendUrl
        : fallbackProfileMediaServer?.backendUrl || null;
    const isLightTheme = clientSettings.themePreset === "light";
    const topbarInfoIcon = !hasSeenShortcutInfo
        ? (isLightTheme ? infoFirstIcon : infoFirstWhiteIcon)
        : (isLightTheme ? infoBlackIcon : infoWhiteIcon);
    const updateBannerKey = getUpdateBannerKey(updateState);
    const showUpdateBanner = Boolean(updateBannerKey && updateBannerKey !== dismissedUpdateBannerKey);
    const showRecoveryKeysGate = Boolean(
        currentUser
        && (
            recoveryGateKeys.length > 0
            || currentUser?.recovery?.recoveryKeysRequired
        )
    );
    const quickSwitcherItems = [
        {
            id: "nav:friends",
            group: "special",
            scope: "special",
            label: "Friends",
            subtitle: "Direct messages and group chats"
        },
        ...joinedServers.map((server) => ({
            id: `server:${server.id}`,
            group: "server",
            scope: "server",
            targetId: server.id,
            label: server.name,
            subtitle: serverStatuses?.[server.id] === "offline" ? "Offline server" : "Joined server"
        })),
        ...visibleChannels.map((channel) => ({
            id: `channel:${channel.id}`,
            group: "channel",
            scope: "channel",
            targetId: channel.id,
            label: `#${channel.name}`,
            subtitle: selectedJoinedServer?.name || "Channel"
        })),
        ...friendsSwitcherItems
    ];

    function handleQuickSwitcherSelect(item) {
        setShowQuickSwitcher(false);

        if (item.scope === "special") {
            setSelectedJoinedServerId(FRIENDS_TAB_ID);
            return;
        }

        if (item.scope === "server" && item.targetId != null) {
            setSelectedJoinedServerId(item.targetId);
            return;
        }

        if (item.scope === "channel" && item.targetId != null) {
            if (selectedJoinedServerId !== FRIENDS_TAB_ID && selectedJoinedServer) {
                setSelectedChannelId(item.targetId);
            }
            return;
        }

        if ((item.scope === "friend" || item.scope === "group") && item.targetId != null) {
            setSelectedJoinedServerId(FRIENDS_TAB_ID);
            window.setTimeout(() => {
                window.dispatchEvent(new CustomEvent("chatapp-switcher-select", {
                    detail: item
                }));
            }, 0);
        }
    }

    return (
        <>
            <div className="topbar">
                <div>
                    <strong>{currentUser.username}</strong>
                    {isFriendsView ? " - Friends" : serverData?.name ? ` - ${serverData.name}` : ""}
                </div>

                <div className="topbar-actions">
                    <button
                        className={`topbar-info-button ${!hasSeenShortcutInfo ? "is-first-open" : ""}`.trim()}
                        onClick={handleOpenShortcutInfo}
                        title="General features"
                        aria-label="General features"
                    >
                        <img
                            src={topbarInfoIcon}
                            alt=""
                            aria-hidden="true"
                        />
                    </button>
                    <button onClick={() => setShowClientSettings(true)}>Client Settings</button>
                </div>
            </div>

            {showUpdateBanner ? (
                <UpdateBanner
                    state={updateState}
                    onDismiss={dismissUpdateBanner}
                    onCheckForUpdates={handleCheckForUpdates}
                    onOpenReleasesPage={() => window.appUpdates?.openReleasesPage?.()}
                />
            ) : null}

            <div className="app-shell">
                <JoinedServersSidebar
                    joinedServers={joinedServers}
                    selectedJoinedServerId={selectedJoinedServerId}
                    friendsTabId={FRIENDS_TAB_ID}
                    hasFriendsActivity={hasFriendsActivity}
                    onSelectJoinedServer={setSelectedJoinedServerId}
                    onOpenJoinModal={() => setShowJoinModal(true)}
                    onLeaveServer={handleLeaveServer}
                    onOpenSettings={(server) => {
                        setSettingsServer(server);
                        setShowSettings(true);
                    }}
                    serverStatuses={serverStatuses}
                />

                <div className="server-theme-scope" ref={serverThemeRef}>
                    <style ref={serverCustomCssRef} />
                    {!isFriendsView && (
                        <ChannelSidebar
                            channels={visibleChannels}
                            selectedChannelId={selectedChannelId}
                            onSelectChannel={setSelectedChannelId}
                            currentUser={currentUser}
                            backendUrl={selectedJoinedServer?.backendUrl || null}
                            profileMediaHostUrl={profileMediaHostUrl}
                            clientSettings={clientSettings}
                            onChangeClientSetting={handleClientSettingChange}
                            onOpenClientSettings={() => setShowClientSettings(true)}
                            onLogout={handleLogout}
                        />
                    )}

                    <MainView
                        channel={selectedChannel}
                        channels={visibleChannels}
                        currentUser={currentUser}
                        backendUrl={selectedJoinedServer?.backendUrl || null}
                        profileMediaHostUrl={profileMediaHostUrl}
                        clientSettings={clientSettings}
                        onChangeClientSetting={handleClientSettingChange}
                        customization={customization}
                        onFriendsActivityChange={setHasFriendsActivity}
                        onOpenClientSettings={() => setShowClientSettings(true)}
                        onLogout={handleLogout}
                        onServerOffline={markSelectedServerOffline}
                        serverName={selectedJoinedServer?.name || serverData?.name || null}
                        serverId={selectedJoinedServer?.id || null}
                        serverStatus={selectedJoinedServer ? serverStatuses[selectedJoinedServer.id] : null}
                        isFriendsView={isFriendsView}
                    />
                </div>
            </div>

            {showJoinModal && (
                <JoinServerModal
                    currentUser={currentUser}
                    onJoinSuccess={handleJoinSuccess}
                    onClose={() => setShowJoinModal(false)}
                />
            )}

            {showSettings && settingsServer && (
                <ServerSettingsPanel
                    backendUrl={settingsServer.backendUrl}
                    serverData={serverData}
                    onServerDataChange={(nextServerData) => {
                        setServerData(nextServerData);
                    }}
                    onSelectChannel={(channelId) => {
                        setSelectedChannelId(channelId);
                    }}
                    onClose={() => {
                        setShowSettings(false);
                        setSettingsServer(null);
                    }}
                />
            )}

            {showQuickSwitcher ? (
                <QuickSwitcherModal
                    items={quickSwitcherItems}
                    onSelect={handleQuickSwitcherSelect}
                    onClose={() => setShowQuickSwitcher(false)}
                />
            ) : null}

            {showShortcutInfo ? (
                <ShortcutInfoModal
                    onClose={() => setShowShortcutInfo(false)}
                />
            ) : null}

            {showClientSettings ? (
                <ClientSettingsModal
                    settings={clientSettings}
                    currentUser={currentUser}
                    profileMediaHostUrl={profileMediaHostUrl}
                    updateState={updateState}
                    onChange={handleClientSettingChange}
                    onImport={handleClientSettingsImport}
                    onCheckForUpdates={handleCheckForUpdates}
                    onOpenReleasesPage={() => window.appUpdates?.openReleasesPage?.()}
                    onUserUpdated={(user) => {
                        setCurrentUser(user);
                        saveAuthUser(user);
                    }}
                    onTabReset={handleClientSettingsTabReset}
                    onLogout={handleLogout}
                    onClose={() => setShowClientSettings(false)}
                />
            ) : null}

            {showRecoveryKeysGate ? (
                <RecoveryKeysGateModal
                    currentUser={currentUser}
                    recoveryKeys={recoveryGateKeys}
                    onUserUpdated={(user) => {
                        setCurrentUser(user);
                        saveAuthUser(user);
                    }}
                    onRecoveryKeysChange={setRecoveryGateKeys}
                    onLogout={handleLogout}
                />
            ) : null}

            {showServerTrustWarning && selectedJoinedServer ? (
                <div
                    className="server-trust-warning-overlay"
                    onClick={handleAcknowledgeServerTrustWarning}
                >
                    <div
                        className="server-trust-warning-modal panel-card"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="server-trust-warning-badge">Server trust warning</div>
                        <h2>{selectedJoinedServer.name}</h2>
                        <p>
                            Messages in this server are stored by the host and are not end-to-end encrypted.
                        </p>
                        <p>
                            The server owner, or anyone with backend access, can read messages sent here.
                        </p>
                        <button type="button" onClick={handleAcknowledgeServerTrustWarning}>
                            I understand
                        </button>
                    </div>
                </div>
            ) : null}
        </>
    );
}

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
