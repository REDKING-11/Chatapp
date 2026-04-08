import React from "react";
import BuilderCanvasDropZone from "./BuilderCanvasDropZone";

export default function BuilderPreviewNode({
    node,
    selectedNodeId,
    setSelectedNodeId,
    onDropRelative,
    onMoveRelative
}) {
    if (!node || typeof node !== "object") {
        return <div className="builder-preview-unknown">Invalid node</div>;
    }

    const isSelected = node.id === selectedNodeId;
    const children = Array.isArray(node.children)
        ? node.children.filter(Boolean)
        : [];
    const canHaveChildren = Array.isArray(node.children);

    function renderNodePreview() {
        switch (node.type) {
            case "row":
                return (
                    <div className="builder-preview-row">
                        {children.length > 0 ? (
                            children.map((child, index) => (
                                <BuilderPreviewNode
                                    key={child.id || `${node.id}_child_${index}`}
                                    node={child}
                                    selectedNodeId={selectedNodeId}
                                    setSelectedNodeId={setSelectedNodeId}
                                    onDropRelative={onDropRelative}
                                    onMoveRelative={onMoveRelative}
                                />
                            ))
                        ) : (
                            <div className="builder-empty-hint">Empty row</div>
                        )}
                    </div>
                );

            case "column":
                return (
                    <div className="builder-preview-column">
                        {children.length > 0 ? (
                            children.map((child, index) => (
                                <BuilderPreviewNode
                                    key={child.id || `${node.id}_child_${index}`}
                                    node={child}
                                    selectedNodeId={selectedNodeId}
                                    setSelectedNodeId={setSelectedNodeId}
                                    onDropRelative={onDropRelative}
                                    onMoveRelative={onMoveRelative}
                                />
                            ))
                        ) : (
                            <div className="builder-empty-hint">Empty column</div>
                        )}
                    </div>
                );

            case "text":
                return <div className="builder-preview-text">{node.props?.text || "Text"}</div>;

            case "heading":
                return (
                    <div className="builder-preview-heading">
                        H{node.props?.level || 2}: {node.props?.text || "Heading"}
                    </div>
                );

            case "button":
                return (
                    <button type="button" className="builder-preview-button">
                        {node.props?.text || "Button"}
                    </button>
                );

            case "input":
                return (
                    <input
                        className="builder-preview-input"
                        placeholder={node.props?.placeholder || "Input"}
                        readOnly
                    />
                );

            case "textarea":
                return (
                    <textarea
                        className="builder-preview-input"
                        placeholder={node.props?.placeholder || "Textarea"}
                        readOnly
                        rows={3}
                    />
                );

            case "image":
                return (
                    <div className="builder-preview-image">
                        {node.props?.src ? "Image" : "Empty image"}
                    </div>
                );

            case "chat":
                return <div className="builder-preview-chat">Chat block</div>;

            case "spacer":
                return (
                    <div className="builder-preview-spacer">
                        Spacer ({node.props?.height || 24}px)
                    </div>
                );

            default:
                return <div className="builder-preview-unknown">{node.type || "Unknown node"}</div>;
        }
    }

    function startNodeDrag(e) {
        e.stopPropagation();
        e.dataTransfer.setData("application/x-builder-node-id", node.id);
        e.dataTransfer.effectAllowed = "move";
    }

    return (
        <div className={`builder-canvas-node ${isSelected ? "selected" : ""}`}>
            <BuilderCanvasDropZone
                label="Top"
                className="builder-drop-top"
                onDropNode={(type) => onDropRelative(node.id, "top", type)}
                onMoveNode={(draggedNodeId) => onMoveRelative(node.id, "top", draggedNodeId)}
            />

            <div className="builder-canvas-middle">
                <BuilderCanvasDropZone
                    label="Left"
                    className="builder-drop-side"
                    onDropNode={(type) => onDropRelative(node.id, "left", type)}
                    onMoveNode={(draggedNodeId) => onMoveRelative(node.id, "left", draggedNodeId)}
                />

                <div
                    className="builder-canvas-content"
                    onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        setSelectedNodeId(node.id);
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNodeId(node.id);
                    }}
                >
                    <div className="builder-node-label-row">
                        <div className="builder-node-label">
                            {node.type}
                            {node.className ? ` .${node.className}` : ""}
                        </div>

                        <button
                            type="button"
                            className="builder-node-drag-handle"
                            draggable
                            onDragStart={startNodeDrag}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            Move
                        </button>
                    </div>

                    {renderNodePreview()}

                    {canHaveChildren && (
                        <BuilderCanvasDropZone
                            label="Drop inside"
                            className="builder-drop-inside"
                            onDropNode={(type) => onDropRelative(node.id, "inside", type)}
                            onMoveNode={(draggedNodeId) => onMoveRelative(node.id, "inside", draggedNodeId)}
                        />
                    )}
                </div>

                <BuilderCanvasDropZone
                    label="Right"
                    className="builder-drop-side"
                    onDropNode={(type) => onDropRelative(node.id, "right", type)}
                    onMoveNode={(draggedNodeId) => onMoveRelative(node.id, "right", draggedNodeId)}
                />
            </div>

            <BuilderCanvasDropZone
                label="Bottom"
                className="builder-drop-bottom"
                onDropNode={(type) => onDropRelative(node.id, "bottom", type)}
                onMoveNode={(draggedNodeId) => onMoveRelative(node.id, "bottom", draggedNodeId)}
            />
        </div>
    );
}