export default function ChannelSidebar({ channels, selectedChannelId, onSelectChannel }) {
    return (
        <aside className="channels">
            <h2 className="sidebar-title">Channels</h2>

            <div className="channel-list">
                {channels.map((channel) => (
                    <button
                        key={channel.id}
                        className={`channel-button ${
                            selectedChannelId === channel.id ? "active-channel" : ""
                        }`}
                        onClick={() => onSelectChannel(channel.id)}
                    >
                        #{channel.name}
                    </button>
                ))}
            </div>
        </aside>
    );
}