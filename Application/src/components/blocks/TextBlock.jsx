export default function TextBlock({ node }) {
    return (
        <div className="panel-card">
            <p>{node.props?.text || "Empty text block"}</p>
        </div>
    );
}