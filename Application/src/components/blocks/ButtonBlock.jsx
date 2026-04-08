export default function ButtonBlock({ node }) {
    const style = {};

    if (node?.props?.style) {
        node.props.style.split(";").forEach((rule) => {
            const [key, value] = rule.split(":");
            if (key && value) {
                const jsKey = key.trim().replace(/-([a-z])/g, (_, l) => l.toUpperCase());
                style[jsKey] = value.trim();
            }
        });
    }

    return (
        <button
            className={`builder-node builder-node-button ${node.className || ""}`.trim()}
            data-node-id={node.id}
            data-node-type={node.type}
            style={style}
        >
            {node.props?.text || "Button"}
        </button>
    );
}