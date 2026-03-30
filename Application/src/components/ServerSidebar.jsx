export default function ServerSidebar({ servers, selectedServerId, onSelectServer }) {
    return (
        <aside className="servers">
            <h2>Servers</h2>

            {servers.map((server) => (
                <button
                    key={server.id}
                    className={selectedServerId === server.id ? "active-channel" : ""}
                    onClick={() => onSelectServer(server.id)}
                >
                    {server.name[0]}
                </button>
            ))}
        </aside>
    );
}