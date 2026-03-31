import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

import ChannelSidebar from "./components/ChannelSidebar";
import MainView from "./components/MainView";
import AuthScreen from "./components/AuthScreen";
import JoinedServersSidebar from "./components/JoinedServerSidebar";
import JoinServerModal from "./components/JoinServerModal";

const CORE_API_BASE = import.meta.env.VITE_CORE_API_BASE;

function App() {
    const [currentUser, setCurrentUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    const [joinedServers, setJoinedServers] = useState([]);
    const [selectedJoinedServerId, setSelectedJoinedServerId] = useState(null);

    const [serverData, setServerData] = useState(null);
    const [selectedChannelId, setSelectedChannelId] = useState(null);
    const [showJoinModal, setShowJoinModal] = useState(false);

    const joinedServersStorageKey = useMemo(() => {
        return currentUser ? `joinedServers_${currentUser.id}` : null;
    }, [currentUser]);

    const selectedServerStorageKey = useMemo(() => {
        return currentUser ? `selectedJoinedServerId_${currentUser.id}` : null;
    }, [currentUser]);

    useEffect(() => {
        const savedUser = localStorage.getItem("authUser");
        if (savedUser) {
            try {
                setCurrentUser(JSON.parse(savedUser));
            } catch {
                localStorage.removeItem("authUser");
            }
        }
        
        const token = localStorage.getItem("authToken");
        console.log("Session check token:", token);
        console.log("CORE_API_BASE:", CORE_API_BASE);

        if (!token) {
            setAuthLoading(false);
            return;
        }

        fetch(`${CORE_API_BASE}/auth/me.php`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })
            .then(async (res) => {
                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || "Session check failed");
                }

                setCurrentUser(data.user);
                localStorage.setItem("authUser", JSON.stringify(data.user));
            })
            .catch(() => {
                localStorage.removeItem("authToken");
                localStorage.removeItem("authUser");
                setCurrentUser(null);
                setJoinedServers([]);
                setSelectedJoinedServerId(null);
                setServerData(null);
                setSelectedChannelId(null);
            })
            .finally(() => {
                setAuthLoading(false);
            });
    }, []);

    useEffect(() => {
        if (!currentUser || !joinedServersStorageKey || !selectedServerStorageKey) {
            setJoinedServers([]);
            setSelectedJoinedServerId(null);
            setServerData(null);
            setSelectedChannelId(null);
            return;
        }

        const savedJoinedServers = localStorage.getItem(joinedServersStorageKey);

        if (savedJoinedServers) {
            try {
                setJoinedServers(JSON.parse(savedJoinedServers));
            } catch {
                setJoinedServers([]);
            }
        } else {
            // One-time migration from old shared storage, if it exists
            const oldShared = localStorage.getItem("joinedServers");
            if (oldShared) {
                try {
                    const parsed = JSON.parse(oldShared);
                    setJoinedServers(parsed);
                    localStorage.setItem(joinedServersStorageKey, JSON.stringify(parsed));
                } catch {
                    setJoinedServers([]);
                }
            } else {
                setJoinedServers([]);
            }
        }

        const savedSelectedServer = localStorage.getItem(selectedServerStorageKey);

        if (savedSelectedServer) {
            setSelectedJoinedServerId(savedSelectedServer);
        } else {
            const oldSharedSelected = localStorage.getItem("selectedJoinedServerId");
            if (oldSharedSelected) {
                setSelectedJoinedServerId(oldSharedSelected);
                localStorage.setItem(selectedServerStorageKey, oldSharedSelected);
            } else {
                setSelectedJoinedServerId(null);
            }
        }

        setServerData(null);
        setSelectedChannelId(null);
    }, [currentUser, joinedServersStorageKey, selectedServerStorageKey]);

    useEffect(() => {
        if (!currentUser || !joinedServersStorageKey) return;
        localStorage.setItem(joinedServersStorageKey, JSON.stringify(joinedServers));
    }, [joinedServers, currentUser, joinedServersStorageKey]);

    useEffect(() => {
        if (!currentUser || !selectedServerStorageKey) return;

        if (selectedJoinedServerId) {
            localStorage.setItem(selectedServerStorageKey, selectedJoinedServerId);
        } else {
            localStorage.removeItem(selectedServerStorageKey);
        }
    }, [selectedJoinedServerId, currentUser, selectedServerStorageKey]);

    useEffect(() => {
        if (!selectedJoinedServerId) return;

        const exists = joinedServers.some((server) => server.id === selectedJoinedServerId);

        if (!exists) {
            setSelectedJoinedServerId(null);
            if (selectedServerStorageKey) {
                localStorage.removeItem(selectedServerStorageKey);
            }
        }
    }, [joinedServers, selectedJoinedServerId, selectedServerStorageKey]);

    useEffect(() => {
        if (!selectedJoinedServerId && joinedServers.length > 0) {
            setSelectedJoinedServerId(joinedServers[0].id);
        }
    }, [joinedServers, selectedJoinedServerId]);

    useEffect(() => {
        if (!currentUser || !selectedJoinedServerId) return;

        const selectedJoinedServer = joinedServers.find(
            (server) => server.id === selectedJoinedServerId
        );

        if (!selectedJoinedServer) return;

        fetch(`${selectedJoinedServer.backendUrl}/api/server`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || "Failed to fetch server");
                }
                return data;
            })
            .then((data) => {
                setServerData(data);

                if (data.channels?.length > 0) {
                    setSelectedChannelId((prev) => {
                        const stillExists = data.channels.some((c) => c.id === prev);
                        return stillExists ? prev : data.channels[0].id;
                    });
                } else {
                    setSelectedChannelId(null);
                }
            })
            .catch((err) => {
                console.error("Failed to fetch server:", err);
                setServerData(null);
                setSelectedChannelId(null);
            });
    }, [currentUser, selectedJoinedServerId, joinedServers]);

    function handleJoinSuccess(newServer) {
        setJoinedServers((prev) => {
            const exists = prev.some((server) => server.id === newServer.id);
            if (exists) return prev;
            return [...prev, newServer];
        });

        setSelectedJoinedServerId(newServer.id);
        setShowJoinModal(false);
    }

    function handleLogout() {
        localStorage.removeItem("authToken");
        localStorage.removeItem("authUser");

        setCurrentUser(null);
        setJoinedServers([]);
        setSelectedJoinedServerId(null);
        setServerData(null);
        setSelectedChannelId(null);
        setShowJoinModal(false);
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
    const selectedChannel = channels.find((c) => c.id === selectedChannelId) || null;
    const selectedJoinedServer =
        joinedServers.find((server) => server.id === selectedJoinedServerId) || null;

    return (
        <>
            <div className="topbar">
                <div>
                    <strong>{currentUser.username}</strong>
                    {serverData?.name ? ` — ${serverData.name}` : ""}
                </div>

                <div className="topbar-actions">
                    <button onClick={() => setShowJoinModal(true)}>Join Server</button>
                    <button onClick={handleLogout}>Logout</button>
                </div>
            </div>

            <div className="app">
                <JoinedServersSidebar
                    joinedServers={joinedServers}
                    selectedJoinedServerId={selectedJoinedServerId}
                    onSelectJoinedServer={setSelectedJoinedServerId}
                    onOpenJoinModal={() => setShowJoinModal(true)}
                />

                <ChannelSidebar
                    channels={channels}
                    selectedChannelId={selectedChannelId}
                    onSelectChannel={setSelectedChannelId}
                />

                <MainView
                    channel={selectedChannel}
                    currentUser={currentUser}
                    backendUrl={selectedJoinedServer?.backendUrl || null}
                />
            </div>

            {showJoinModal && (
                <JoinServerModal
                    currentUser={currentUser}
                    onJoinSuccess={handleJoinSuccess}
                    onClose={() => setShowJoinModal(false)}
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