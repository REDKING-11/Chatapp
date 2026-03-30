import React, { useEffect, useState } from "react";
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

    const [joinedServers, setJoinedServers] = useState(() => {
        const saved = localStorage.getItem("joinedServers");
        if (!saved) return [];

        try {
            return JSON.parse(saved);
        } catch {
            return [];
        }
    });

    const [selectedJoinedServerId, setSelectedJoinedServerId] = useState(() => {
        return localStorage.getItem("selectedJoinedServerId") || null;
    });

    const [serverData, setServerData] = useState(null);
    const [selectedChannelId, setSelectedChannelId] = useState(null);

    const [showJoinModal, setShowJoinModal] = useState(false);

    useEffect(() => {
        localStorage.setItem("joinedServers", JSON.stringify(joinedServers));
    }, [joinedServers]);

    useEffect(() => {
        if (selectedJoinedServerId) {
            localStorage.setItem("selectedJoinedServerId", selectedJoinedServerId);
        }
    }, [selectedJoinedServerId]);

    useEffect(() => {
        const token = localStorage.getItem("authToken");

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
            })
            .catch(() => {
                localStorage.removeItem("authToken");
                setCurrentUser(null);
            })
            .finally(() => {
                setAuthLoading(false);
            });
    }, []);

    useEffect(() => {
        if (!currentUser || !selectedJoinedServerId) return;

        const selectedJoinedServer = joinedServers.find(
            (server) => server.id === selectedJoinedServerId
        );

        if (!selectedJoinedServer) return;

        fetch(`${selectedJoinedServer.backendUrl}/api/server`)
            .then((res) => res.json())
            .then((data) => {
                setServerData(data);

                if (data.channels?.length > 0) {
                    setSelectedChannelId(data.channels[0].id);
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

    return (
        <>
            <div className="topbar">
                <div>
                    <strong>{currentUser.username}</strong>
                    {serverData?.name ? ` — ${serverData.name}` : ""}
                </div>

                <div className="topbar-actions">
                    <button onClick={() => setShowJoinModal(true)}>Join Server</button>
                    <button
                        onClick={() => {
                            localStorage.removeItem("authToken");
                            setCurrentUser(null);
                        }}
                    >
                        Logout
                    </button>
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
                    backendUrl={
                        joinedServers.find((server) => server.id === selectedJoinedServerId)
                            ?.backendUrl || null
                    }
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