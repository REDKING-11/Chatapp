export default function HeadingBlock({ node }) {
    const Tag = `h${node?.props?.level || 2}`;

    const style = {};
    if (node?.props?.style) {
        const rules = node.props.style.split(";");
        for (let r of rules) {
            const parts = r.split(":");
            if (parts.length === 2) {
                const key = parts[0].trim().replace(/-([a-z])/g, (_, l) => l.toUpperCase());
                style[key] = parts[1].trim();
            }
        }
    }

    return (
        <Tag
            className={`builder-node builder-node-heading ${node.className || ""}`.trim()}
            style={style}
        >
            {node.props?.text || "Heading"}
        </Tag>
    );
}