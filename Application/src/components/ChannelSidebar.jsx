import ProfileDock from "./ProfileDock";

export default function ChannelSidebar({
    channels,
    selectedChannelId,
    onSelectChannel,
    currentUser,
    profileMediaHostUrl,
    clientSettings,
    onOpenClientSettings,
    onLogout
}) {
    return (
        <aside className="channels">
            <div className="channels-scroll">
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
            </div>

            <div className="sidebar-profile-slot">
                <ProfileDock
                    currentUser={currentUser}
                    profileMediaHostUrl={profileMediaHostUrl}
                    clientSettings={clientSettings}
                    onOpenClientSettings={onOpenClientSettings}
                    onLogout={onLogout}
                />
            </div>
        </aside>
    );
}
