import LayoutRenderer from "./LayoutRenderer";
import { defaultLayouts } from "../layouts/defaultLayouts";
import FriendsHome from "./FriendsHome";

export default function MainView({
    channel,
    currentUser,
    backendUrl,
    profileMediaHostUrl,
    clientSettings,
    customization,
    onFriendsActivityChange,
    onOpenClientSettings,
    onLogout,
    serverName,
    serverStatus,
    isFriendsView
}) {
    if (isFriendsView) {
        return (
            <FriendsHome
                currentUser={currentUser}
                profileMediaHostUrl={profileMediaHostUrl}
                clientSettings={clientSettings}
                onActivityChange={onFriendsActivityChange}
                onOpenClientSettings={onOpenClientSettings}
                onLogout={onLogout}
            />
        );
    }

    if (serverStatus === "offline") {
        return (
            <main className="main">
                <div className="offline-server-state">
                    <h1>Server offline</h1>
                    <p>This server is offline, deleted, or unreachable right now.</p>
                    {backendUrl ? <small>{backendUrl}</small> : null}
                </div>
            </main>
        );
    }

    if (!channel) {
        return (
            <main className="main">
                <h1>No channel selected</h1>
            </main>
        );
    }

    const overrideLayout = customization?.pages?.[channel.id]?.layout || null;
    const layout = overrideLayout || channel.layout || defaultLayouts[channel.type] || null;
    return (
        <main className="main">
            <h1>#{channel.name}</h1>
            <div className="server-trust-banner" role="note">
                <strong>Server messages are stored.</strong>
                <span>
                    {serverName ? `${serverName} is hosted by someone else.` : "This server is hosted by someone else."}
                    {" "}Messages here are not end-to-end encrypted, so the server owner or anyone with backend access can read them.
                </span>
            </div>

            {layout ? (
                <LayoutRenderer
                    layout={layout}
                    channelId={channel.id}
                    currentUser={currentUser}
                    backendUrl={backendUrl}
                />
            ) : (
                <p>No layout found.</p>
            )}
        </main>
    );
}
