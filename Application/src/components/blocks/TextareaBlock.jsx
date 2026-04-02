export default function TextareaBlock({ node }) {
    const style = {};

    if (node?.props?.style) {
        const parts = node.props.style.split(";");
        parts.forEach((p) => {
            const [k, v] = p.split(":");
            if (k && v) {
                style[k.trim().replace(/-([a-z])/g, (_, l) => l.toUpperCase())] = v.trim();
            }
        });
    }

    return (
        <textarea
            className={`builder-node builder-node-textarea ${node.className || ""}`.trim()}
            rows={node.props?.rows || 3}
            placeholder={node.props?.placeholder || "Textarea"}
            style={style}
            readOnly
        />
    );
}