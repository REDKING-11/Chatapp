import React from "react";

export default function BuilderCanvasDropZone({
    label,
    onDropNode,
    onMoveNode,
    className = ""
}) {
    function handleDragOver(e) {
        e.preventDefault();
    }

    function handleDrop(e) {
        e.preventDefault();

        const draggedNodeId = e.dataTransfer.getData("application/x-builder-node-id");
        if (draggedNodeId) {
            onMoveNode?.(draggedNodeId);
            return;
        }

        const draggedType = e.dataTransfer.getData("application/x-builder-type");
        if (draggedType) {
            onDropNode?.(draggedType);
        }
    }

    return (
        <div
            className={`builder-drop-zone ${className}`.trim()}
            onPointerDown={(e) => e.stopPropagation()}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {label}
        </div>
    );
}