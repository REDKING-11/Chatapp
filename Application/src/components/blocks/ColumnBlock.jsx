import LayoutRenderer from "../LayoutRenderer";

export default function ColumnBlock({ node, channelId, currentUser, backendUrl }) {
    return (
        <div className="layout-column">
            {node.children?.map((child, index) => (
                <LayoutRenderer
                    key={index}
                    layout={child}
                    channelId={channelId}
                    currentUser={currentUser}
                    backendUrl={backendUrl}
                />
            ))}
        </div>
    );
}