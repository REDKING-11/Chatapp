export default function InputBlock({ node }) {
    let style = {};

    if (typeof node?.props?.style === "string") {
        node.props.style.split(";").forEach((line) => {
            const i = line.indexOf(":");
            if (i !== -1) {
                const key = line.slice(0, i).trim();
                const val = line.slice(i + 1).trim();
                const jsKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                style[jsKey] = val;
            }
        });
    }

    return (
        <input
            className={`builder-node builder-node-input ${node.className || ""}`.trim()}
            placeholder={node.props?.placeholder || "Type here"}
            style={style}
            readOnly
        />
    );
}