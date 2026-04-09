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

export default function RowBlock({ node, channelId, currentUser, backendUrl, onServerOffline }) {
    return (
        <div
            className={`layout-row builder-node builder-node-row ${node.className || ""}`.trim()}
            data-node-id={node.id}
            data-node-type={node.type}
            style={buildInlineStyle(node)}
        >
            {node.children?.map((child, index) => (
                <LayoutRenderer
                    key={child.id || index}
                    layout={child}
                    channelId={channelId}
                    currentUser={currentUser}
                    backendUrl={backendUrl}
                    onServerOffline={onServerOffline}
                />
            ))}
        </div>
    );
}
