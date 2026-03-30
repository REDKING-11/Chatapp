import LayoutRenderer from "../LayoutRenderer";

export default function RowBlock({ node, channelId, currentUser, backendUrl }) {
    return (
        <div className="layout-row">
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