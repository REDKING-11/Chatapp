import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

import ChannelSidebar from "./components/ChannelSidebar";
import MainView from "./components/MainView";
import AuthScreen from "./components/AuthScreen";
import JoinedServersSidebar from "./components/JoinedServerSidebar";
import JoinServerModal from "./components/JoinServerModal";
import ServerSettingsPanel from "./components/ServerSettingsPanel";
import {
    closeRealtimeConnection,
    ensureRealtimeConnection,
    initializeSecureDm,
    pullRelayMessages,
    registerSecureDmDevice
} from "./features/dm/actions";

import {
    getStoredAuthToken,
    getStoredAuthUser,
    validateSession,
    clearAuthSession,
    saveAuthUser
} from "./features/session/actions";

import {
    loadSelectedServerId,
    saveSelectedServerId,
    clearSelectedServerId
} from "./features/servers/storage";

import {
    fetchServerData,
    fetchUserServers,
    leaveServer
} from "./features/servers/actions";

const FRIENDS_TAB_ID = "__friends__";

function App() {
    const [currentUser, setCurrentUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    const [joinedServers, setJoinedServers] = useState([]);
    const [selectedJoinedServerId, setSelectedJoinedServerId] = useState(FRIENDS_TAB_ID);
    const [serverStatuses, setServerStatuses] = useState({});

    const [serverData, setServerData] = useState(null);
    const [selectedChannelId, setSelectedChannelId] = useState(null);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [customization, setCustomization] = useState(null);
    const [settingsServer, setSettingsServer] = useState(null);

    const serverThemeRef = useRef(null);
    const serverCustomCssRef = useRef(null);

    useEffect(() => {
        async function restoreSession() {
            const savedUser = getStoredAuthUser();
            if (savedUser) setCurrentUser(savedUser);

            const token = getStoredAuthToken();

            if (!token) {
                setAuthLoading(false);
                return;
            }

            try {
                const data = await validateSession(token);
                setCurrentUser(data.user);
                saveAuthUser(data.user);
            } catch (err) {
                console.error("Session restore failed:", err);
                clearAuthSession();
                resetAppState();
            } finally {
                setAuthLoading(false);
            }
        }

        restoreSession();
    }, []);

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
        async function loadServer() {
            if (!currentUser || !selectedJoinedServerId || selectedJoinedServerId === FRIENDS_TAB_ID) {
                return;
            }

            const selectedJoinedServer = joinedServers.find(
                (server) => server.id === selectedJoinedServerId
            );

            if (!selectedJoinedServer) return;

            try {
                const data = await fetchServerData(selectedJoinedServer.backendUrl);

                markSelectedServerOnline();
                setServerData(data);

                if (data.channels?.length > 0) {
                    setSelectedChannelId((prev) => {
                        const stillExists = data.channels.some((channel) => channel.id === prev);
                        return stillExists ? prev : data.channels[0].id;
                    });
                } else {
                    setSelectedChannelId(null);
                }
            } catch (err) {
                console.error("Failed to fetch server:", err);

                markSelectedServerOffline();
                setServerData(null);
                setSelectedChannelId(null);
            }
        }

        loadServer();
    }, [currentUser, selectedJoinedServerId, joinedServers]);

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

            try {
                const res = await fetch(`${selectedJoinedServer.backendUrl}/api/customization`);
                if (!res.ok) throw new Error("Failed to load customization");

                const data = await res.json();
                setCustomization(data);
                setServerStatus(selectedJoinedServer.id, "online");
            } catch (err) {
                console.error("Failed to load customization:", err);
                setCustomization(null);
                setServerStatus(selectedJoinedServer.id, "offline");
            }
        }

        loadCustomization();
    }, [joinedServers, selectedJoinedServerId]);

    useEffect(() => {
        function reloadCustomization() {
            if (selectedJoinedServerId === FRIENDS_TAB_ID) return;

            const selectedJoinedServer = joinedServers.find(
                (server) => server.id === selectedJoinedServerId
            );

            if (!selectedJoinedServer) return;

            fetch(`${selectedJoinedServer.backendUrl}/api/customization`)
                .then((res) => {
                    if (!res.ok) throw new Error("Failed to reload customization");
                    return res.json();
                })
                .then(setCustomization)
                .catch((err) => console.error(err));
        }

        window.addEventListener("customizationUpdated", reloadCustomization);
        return () => window.removeEventListener("customizationUpdated", reloadCustomization);
    }, [joinedServers, selectedJoinedServerId]);

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

                if (token) {
                    await registerSecureDmDevice({
                        token,
                        currentUser
                    });
                    await ensureRealtimeConnection({
                        token,
                        currentUser
                    });
                }
            } catch (err) {
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
                    console.error("Failed to sync relay messages:", err);
                }
            }
        }

        syncRelayMessages();

        return () => {
            disposed = true;
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
    }

    function setServerStatus(serverId, status) {
        setServerStatuses((prev) => ({
            ...prev,
            [serverId]: status
        }));
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

    function handleLogout() {
        closeRealtimeConnection();
        localStorage.removeItem("authToken");
        localStorage.removeItem("authUser");
        resetAppState();
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
        return <AuthScreen onAuthSuccess={(user) => setCurrentUser(user)} />;
    }

    const channels = serverData?.channels || [];
    const selectedChannel = channels.find((channel) => channel.id === selectedChannelId) || null;
    const selectedJoinedServer =
        joinedServers.find((server) => server.id === selectedJoinedServerId) || null;
    const isFriendsView = selectedJoinedServerId === FRIENDS_TAB_ID;

    return (
        <>
            <div className="topbar">
                <div>
                    <strong>{currentUser.username}</strong>
                    {isFriendsView ? " - Friends" : serverData?.name ? ` - ${serverData.name}` : ""}
                </div>

                <div className="topbar-actions">
                    <button onClick={() => setShowJoinModal(true)}>Join Server</button>
                    <button onClick={handleLogout}>Logout</button>
                </div>
            </div>

            <div className="app-shell">
                <JoinedServersSidebar
                    joinedServers={joinedServers}
                    selectedJoinedServerId={selectedJoinedServerId}
                    friendsTabId={FRIENDS_TAB_ID}
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
                            channels={channels}
                            selectedChannelId={selectedChannelId}
                            onSelectChannel={setSelectedChannelId}
                        />
                    )}

                    <MainView
                        channel={selectedChannel}
                        currentUser={currentUser}
                        backendUrl={selectedJoinedServer?.backendUrl || null}
                        customization={customization}
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
                    onClose={() => {
                        setShowSettings(false);
                        setSettingsServer(null);
                    }}
                />
            )}
        </>
    );
}

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
