export default function SpacerBlock({ node }) {
    const height = node?.props?.height || 24;

    return (
        <div
            className="builder-node builder-node-spacer"
            style={{
                height: `${height}px`,
                width: "100%"
            }}
        />
    );
}