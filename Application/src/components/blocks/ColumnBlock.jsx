import LayoutRenderer from "../LayoutRenderer";

function buildInlineStyle(node) {
    const style = {};

    if (node?.props?.gap != null) {
        style.gap = `${node.props.gap}px`;
    }

    if (node?.props?.padding != null) {
        style.padding = `${node.props.padding}px`;
    }

    return style;
}

export default function ColumnBlock({
    node,
    channelId,
    channels,
    currentUser,
    backendUrl,
    currentServerId,
    currentServerName,
    onServerOffline
}) {
    return (
        <div
            className={`layout-column builder-node builder-node-column ${node.className || ""}`.trim()}
            data-node-id={node.id}
            data-node-type={node.type}
            style={buildInlineStyle(node)}
        >
            {node.children?.map((child, index) => (
                <LayoutRenderer
                    key={child.id || index}
                    layout={child}
                    channelId={channelId}
                    channels={channels}
                    currentUser={currentUser}
                    backendUrl={backendUrl}
                    currentServerId={currentServerId}
                    currentServerName={currentServerName}
                    onServerOffline={onServerOffline}
                />
            ))}
        </div>
    );
}
