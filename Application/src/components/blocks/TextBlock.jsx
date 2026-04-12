import PretextTextRenderer from "./PretextTextRenderer";
import MarkdownContent from "../MarkdownContent";
import { parseStyleString } from "../../lib/styleUtils";

export default function TextBlock({ node }) {
    const inlineStyle = parseStyleString(node?.props?.style);
    const isPretext = node?.props?.layoutEngine === "pretext";
    const markdownEnabled = node?.props?.markdown !== false;
    const className = `panel-card builder-node builder-node-text ${node.className || ""}`.trim();

    if (isPretext && !markdownEnabled) {
        return (
            <PretextTextRenderer
                as="div"
                className={className}
                text={node.props?.text || "Empty text block"}
                style={inlineStyle}
                font={node.props?.font}
                lineHeight={node.props?.lineHeight}
                whiteSpace={node.props?.whiteSpace || "normal"}
                wordBreak={node.props?.wordBreak || "normal"}
                data-node-id={node.id}
                data-node-type={node.type}
            />
        );
    }

    if (!markdownEnabled) {
        return (
            <div
                className={className}
                data-node-id={node.id}
                data-node-type={node.type}
                style={inlineStyle}
            >
                <p>{node.props?.text || "Empty text block"}</p>
            </div>
        );
    }

    return (
        <MarkdownContent
            as="div"
            className={className}
            data-node-id={node.id}
            data-node-type={node.type}
            value={node.props?.text || "Empty text block"}
            style={inlineStyle}
        />
    );
}
