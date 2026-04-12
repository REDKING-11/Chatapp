import PretextTextRenderer from "./PretextTextRenderer";
import MarkdownContent from "../MarkdownContent";
import { parseStyleString } from "../../lib/styleUtils";

export default function HeadingBlock({ node }) {
    const Tag = `h${node?.props?.level || 2}`;
    const style = parseStyleString(node?.props?.style);
    const markdownEnabled = node?.props?.markdown !== false;
    const className = `builder-node builder-node-heading ${node.className || ""}`.trim();

    if (node?.props?.layoutEngine === "pretext" && !markdownEnabled) {
        return (
            <PretextTextRenderer
                as={Tag}
                className={className}
                text={node.props?.text || "Heading"}
                style={style}
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
            <Tag
                className={className}
                style={style}
            >
                {node.props?.text || "Heading"}
            </Tag>
        );
    }

    return (
        <MarkdownContent
            as={Tag}
            className={className}
            data-node-id={node.id}
            data-node-type={node.type}
            inline
            value={node.props?.text || "Heading"}
            style={style}
        />
    );
}
