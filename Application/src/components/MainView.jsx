import LayoutRenderer from "./LayoutRenderer";
import { defaultLayouts } from "../layouts/defaultLayouts";
import FriendsHome from "./FriendsHome";

export default function MainView({
    channel,
    currentUser,
    backendUrl,
    customization,
    serverStatus,
    isFriendsView
}) {
    if (isFriendsView) {
        return <FriendsHome currentUser={currentUser} />;
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
    if (serverStatus === "offline") {
        return (
            <main className="main">
                <div className="offline-server-state">
                    <h1>Server offline</h1>
                    <p>This server is offline, deleted, or unreachable right now.</p>
                </div>
            </main>
        );
    }
    return (
        <main className="main">
            <h1>#{channel.name}</h1>

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
