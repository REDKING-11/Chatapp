export default function JoinedServersSidebar({
    joinedServers,
    selectedJoinedServerId,
    onSelectJoinedServer,
    onOpenJoinModal
}) {
    return (
        <aside className="joined-servers-sidebar">
            <div className="joined-servers-list">
                {joinedServers.map((server) => (
                    <button
                        key={server.id}
                        className={
                            selectedJoinedServerId === server.id
                                ? "joined-server-button active-joined-server"
                                : "joined-server-button"
                        }
                        onClick={() => onSelectJoinedServer(server.id)}
                        title={server.name}
                    >
                        {server.name?.[0] || "?"}
                    </button>
                ))}
            </div>

            <button
                className="join-server-button"
                onClick={onOpenJoinModal}
                title="Join server"
            >
                +
            </button>
        </aside>
    );
}