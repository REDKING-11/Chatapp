import ChatBlock from "./blocks/ChatBlock";
import ColumnBlock from "./blocks/ColumnBlock";
import RowBlock from "./blocks/RowBlock";
import TextBlock from "./blocks/TextBlock";
import ButtonBlock from "./blocks/ButtonBlock";
import HeadingBlock from "./blocks/HeadingBlock";
import InputBlock from "./blocks/InputBlock";
import TextareaBlock from "./blocks/TextareaBlock";
import ImageBlock from "./blocks/ImageBlock";
import SpacerBlock from "./blocks/SpacerBlock";

const componentMap = {
    row: RowBlock,
    column: ColumnBlock,
    chat: ChatBlock,
    text: TextBlock,
    button: ButtonBlock,
    heading: HeadingBlock,
    input: InputBlock,
    textarea: TextareaBlock,
    image: ImageBlock,
    spacer: SpacerBlock,
};

export default function LayoutRenderer({ layout, channelId, currentUser, backendUrl, onServerOffline }) {
    if (!layout || typeof layout !== "object") {
        return <div>Invalid layout</div>;
    }

    const Component = componentMap[layout.type];

    if (!Component) {
        return (
            <div className="builder-unknown-block">
                Unknown block type: {layout.type}
            </div>
        );
    }

    return (
        <Component
            node={layout}
            channelId={layout.props?.channelId || channelId}
            currentUser={currentUser}
            backendUrl={backendUrl}
            onServerOffline={onServerOffline}
        />
    );
}
