import { useEffect, useState } from "react";

export default function JoinedServersSidebar({
    joinedServers,
    selectedJoinedServerId,
    friendsTabId,
    onSelectJoinedServer,
    onOpenJoinModal,
    onLeaveServer,
    onOpenSettings,
    serverStatuses
}) {
    const [contextMenu, setContextMenu] = useState(null);

    useEffect(() => {
        function handleGlobalClick() {
            setContextMenu(null);
        }

        window.addEventListener("click", handleGlobalClick);
        return () => window.removeEventListener("click", handleGlobalClick);
    }, []);

    function openContextMenu(e, server) {
        e.preventDefault();

        setContextMenu({
            server,
            x: e.clientX,
            y: e.clientY
        });
    }

    async function handleLeave(serverId) {
        setContextMenu(null);
        await onLeaveServer(serverId);
    }

    return (
        <aside className="joined-servers-sidebar">
            <div className="joined-servers-list">
                <button
                    className={
                        selectedJoinedServerId === friendsTabId
                            ? "joined-server-button active-joined-server friends-home-button"
                            : "joined-server-button friends-home-button"
                    }
                    onClick={() => onSelectJoinedServer(friendsTabId)}
                    title="Friends"
                >
                    F
                </button>

                <div className="joined-servers-divider" />

                {joinedServers.map((server) => {
                    const status = serverStatuses?.[server.id] || "unknown";

                    return (
                        <button
                            key={server.id}
                            className={
                                selectedJoinedServerId === server.id
                                    ? `joined-server-button active-joined-server ${status === "offline" ? "offline-server" : ""}`
                                    : `joined-server-button ${status === "offline" ? "offline-server" : ""}`
                            }
                            onClick={() => onSelectJoinedServer(server.id)}
                            onContextMenu={(e) => openContextMenu(e, server)}
                            title={
                                status === "offline"
                                    ? `${server.name} (Offline)`
                                    : server.name
                            }
                        >
                            {server.name?.[0] || "?"}
                            {status === "offline" && <span className="server-offline-dot" />}
                        </button>
                    );
                })}
            </div>

            <button
                className="join-server-button"
                onClick={onOpenJoinModal}
                title="Join server"
            >
                +
            </button>

            {contextMenu && (
                <div
                    className="server-context-menu"
                    style={{
                        top: `${contextMenu.y}px`,
                        left: `${contextMenu.x}px`
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {serverStatuses?.[contextMenu.server.id] === "offline" && (
                        <button className="server-context-item" disabled>
                            Server is offline
                        </button>
                    )}

                    <button
                        className="server-context-item"
                        onClick={() => {
                            setContextMenu(null);
                            onOpenSettings?.(contextMenu.server);
                        }}
                    >
                        Server Settings
                    </button>

                    <button className="server-context-item" disabled>
                        Mark All Read
                    </button>

                    <button
                        className="server-context-item danger"
                        onClick={() => handleLeave(contextMenu.server.id)}
                    >
                        Leave Server
                    </button>
                </div>
            )}
        </aside>
    );
}
