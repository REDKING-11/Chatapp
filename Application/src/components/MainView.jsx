import LayoutRenderer from "./LayoutRenderer";
import { defaultLayouts } from "../layouts/defaultLayouts";

export default function MainView({ channel, currentUser, backendUrl }) {
    if (!channel) {
        return (
            <main className="main">
                <h1>No channel selected</h1>
            </main>
        );
    }

    const layout = channel.layout || defaultLayouts[channel.type] || null;

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