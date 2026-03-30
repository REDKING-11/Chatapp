import ChatBlock from "./blocks/ChatBlock";
import ColumnBlock from "./blocks/ColumnBlock";
import RowBlock from "./blocks/RowBlock";
import TextBlock from "./blocks/TextBlock";

const componentMap = {
    row: RowBlock,
    column: ColumnBlock,
    chat: ChatBlock,
    text: TextBlock,
};

export default function LayoutRenderer({ layout, channelId, currentUser, backendUrl }) {
    if (!layout) {
        return <div>No layout found.</div>;
    }

    const Component = componentMap[layout.type];

    if (!Component) {
        return <div>Unknown block type: {layout.type}</div>;
    }

    return (
        <Component
            node={layout}
            channelId={channelId}
            currentUser={currentUser}
            backendUrl={backendUrl}
        />
    );
}