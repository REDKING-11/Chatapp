import React from "react";

export default function BuilderTreeNode({
    node,
    selectedId,
    onSelect,
    depth = 0
}) {
    const isSelected = node.id === selectedId;
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;

    return (
        <div>
            <button
                type="button"
                className={`builder-tree-node ${isSelected ? "selected" : ""}`}
                style={{ marginLeft: depth * 14 }}
                onClick={() => onSelect(node.id)}
            >
                {node.type}
                {node.className ? ` .${node.className}` : ""}
            </button>

            {hasChildren &&
                node.children.map((child) => (
                    <BuilderTreeNode
                        key={child.id}
                        node={child}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        depth={depth + 1}
                    />
                ))}
        </div>
    );
}