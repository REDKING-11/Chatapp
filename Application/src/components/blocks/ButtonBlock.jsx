import MarkdownContent from "../MarkdownContent";
import { parseStyleString } from "../../lib/styleUtils";

export default function ButtonBlock({ node }) {
    const style = parseStyleString(node?.props?.style);
    const markdownEnabled = node?.props?.markdown !== false;

    if (!markdownEnabled) {
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

    return (
        <MarkdownContent
            as="button"
            className={`builder-node builder-node-button ${node.className || ""}`.trim()}
            data-node-id={node.id}
            data-node-type={node.type}
            inline
            value={node.props?.text || "Button"}
            style={style}
        />
    );
}
