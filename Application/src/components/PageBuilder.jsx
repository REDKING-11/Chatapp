import React, { useEffect, useMemo, useState } from "react";
import {
    addChildNode,
    createNode,
    deleteNode,
    ensureNodeIds,
    findNode,
    moveNodeDown,
    moveNodeUp,
    updateNode
} from "../features/customization/pageBuilder";

function TreeNode({ node, selectedId, onSelect, depth = 0 }) {
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
            </button>

            {hasChildren &&
                node.children.map((child) => (
                    <TreeNode
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

export default function PageBuilder({
    customization,
    setCustomization,
    channels
}) {
    const buildableChannels = useMemo(
        () => (channels || []).filter((channel) => channel.type !== "customization"),
        [channels]
    );

    const [selectedPageId, setSelectedPageId] = useState("");
    const [selectedNodeId, setSelectedNodeId] = useState("");

    useEffect(() => {
        if (!selectedPageId && buildableChannels.length > 0) {
            setSelectedPageId(buildableChannels[0].id);
        }
    }, [selectedPageId, buildableChannels]);

    const pageLayout = selectedPageId
        ? customization?.pages?.[selectedPageId]?.layout || null
        : null;

    const safeLayout = useMemo(() => {
        return pageLayout ? ensureNodeIds(pageLayout) : null;
    }, [pageLayout]);

    useEffect(() => {
        if (!selectedNodeId && safeLayout?.id) {
            setSelectedNodeId(safeLayout.id);
        }
    }, [safeLayout, selectedNodeId]);

    function saveLayout(nextLayout) {
        if (!selectedPageId) return;

        setCustomization((prev) => ({
            ...prev,
            pages: {
                ...(prev.pages || {}),
                [selectedPageId]: {
                    ...(prev.pages?.[selectedPageId] || {}),
                    layout: nextLayout
                }
            }
        }));
    }

    function handleCreateRoot(type) {
        saveLayout(createNode(type));
    }

    function handleAddChild(type) {
        if (!safeLayout || !selectedNodeId) return;
        const selectedNode = findNode(safeLayout, selectedNodeId);

        if (!selectedNode || !Array.isArray(selectedNode.children)) return;

        saveLayout(addChildNode(safeLayout, selectedNodeId, createNode(type)));
    }

    function handleDeleteNode() {
        if (!safeLayout || !selectedNodeId) return;
        if (safeLayout.id === selectedNodeId) {
            saveLayout(null);
            setSelectedNodeId("");
            return;
        }

        saveLayout(deleteNode(safeLayout, selectedNodeId));
        setSelectedNodeId("");
    }

    function handleMoveUp() {
        if (!safeLayout || !selectedNodeId) return;
        saveLayout(moveNodeUp(safeLayout, selectedNodeId));
    }

    function handleMoveDown() {
        if (!safeLayout || !selectedNodeId) return;
        saveLayout(moveNodeDown(safeLayout, selectedNodeId));
    }

    function patchSelectedNode(patchFn) {
        if (!safeLayout || !selectedNodeId) return;
        saveLayout(updateNode(safeLayout, selectedNodeId, patchFn));
    }

    const selectedNode = safeLayout && selectedNodeId
        ? findNode(safeLayout, selectedNodeId)
        : null;

    return (
        <div className="builder-shell">
            <div className="builder-toolbar">
                <label className="settings-field">
                    <span>Page</span>
                    <select
                        value={selectedPageId}
                        onChange={(e) => {
                            setSelectedPageId(e.target.value);
                            setSelectedNodeId("");
                        }}
                    >
                        {buildableChannels.map((channel) => (
                            <option key={channel.id} value={channel.id}>
                                {channel.name}
                            </option>
                        ))}
                    </select>
                </label>

                {!safeLayout && (
                    <div className="builder-actions-inline">
                        <button type="button" onClick={() => handleCreateRoot("column")}>
                            New Column Root
                        </button>
                        <button type="button" onClick={() => handleCreateRoot("row")}>
                            New Row Root
                        </button>
                    </div>
                )}
            </div>

            <div className="builder-grid">
                <div className="builder-panel">
                    <h4>Structure</h4>

                    {safeLayout ? (
                        <TreeNode
                            node={safeLayout}
                            selectedId={selectedNodeId}
                            onSelect={setSelectedNodeId}
                        />
                    ) : (
                        <p>No layout yet.</p>
                    )}
                </div>

                <div className="builder-panel">
                    <h4>Actions</h4>

                    <div className="builder-button-grid">
                        <button type="button" onClick={() => handleAddChild("row")}>
                            Add Row
                        </button>
                        <button type="button" onClick={() => handleAddChild("column")}>
                            Add Column
                        </button>
                        <button type="button" onClick={() => handleAddChild("text")}>
                            Add Text
                        </button>
                        <button type="button" onClick={() => handleAddChild("chat")}>
                            Add Chat
                        </button>
                        <button type="button" onClick={() => handleAddChild("spacer")}>
                            Add Spacer
                        </button>
                        <button type="button" onClick={handleMoveUp}>
                            Move Up
                        </button>
                        <button type="button" onClick={handleMoveDown}>
                            Move Down
                        </button>
                        <button type="button" className="danger" onClick={handleDeleteNode}>
                            Delete Node
                        </button>
                    </div>
                </div>

                <div className="builder-panel">
                    <h4>Properties</h4>

                    {!selectedNode && <p>Select a node.</p>}

                    {selectedNode?.type === "text" && (
                        <label className="settings-field">
                            <span>Text</span>
                            <textarea
                                rows="5"
                                value={selectedNode.props?.text || ""}
                                onChange={(e) =>
                                    patchSelectedNode((node) => ({
                                        ...node,
                                        props: {
                                            ...(node.props || {}),
                                            text: e.target.value
                                        }
                                    }))
                                }
                            />
                        </label>
                    )}

                    {selectedNode?.type === "spacer" && (
                        <label className="settings-field">
                            <span>Height</span>
                            <input
                                type="number"
                                min="0"
                                value={selectedNode.props?.height || 24}
                                onChange={(e) =>
                                    patchSelectedNode((node) => ({
                                        ...node,
                                        props: {
                                            ...(node.props || {}),
                                            height: Number(e.target.value)
                                        }
                                    }))
                                }
                            />
                        </label>
                    )}

                    {(selectedNode?.type === "row" || selectedNode?.type === "column") && (
                        <>
                            <label className="settings-field">
                                <span>Gap</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={selectedNode.props?.gap || 16}
                                    onChange={(e) =>
                                        patchSelectedNode((node) => ({
                                            ...node,
                                            props: {
                                                ...(node.props || {}),
                                                gap: Number(e.target.value)
                                            }
                                        }))
                                    }
                                />
                            </label>

                            <label className="settings-field">
                                <span>Padding</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={selectedNode.props?.padding || 0}
                                    onChange={(e) =>
                                        patchSelectedNode((node) => ({
                                            ...node,
                                            props: {
                                                ...(node.props || {}),
                                                padding: Number(e.target.value)
                                            }
                                        }))
                                    }
                                />
                            </label>
                        </>
                    )}

                    {selectedNode?.type === "chat" && (
                        <p>Chat block has no editable props yet.</p>
                    )}
                </div>
            </div>
        </div>
    );
}