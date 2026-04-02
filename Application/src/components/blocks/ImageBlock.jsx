export default function ImageBlock({ node }) {
    const style = {};

    if (node?.props?.style) {
        for (const rule of node.props.style.split(";")) {
            const [k, v] = rule.split(":");
            if (!k || !v) continue;
            style[k.trim().replace(/-([a-z])/g, (_, l) => l.toUpperCase())] = v.trim();
        }
    }

    return (
        <div
            className={`builder-node builder-node-image ${node.className || ""}`.trim()}
            style={style}
        >
            {node.props?.src ? (
                <img src={node.props.src} alt={node.props?.alt || ""} />
            ) : (
                <div>No image</div>
            )}
        </div>
    );
}