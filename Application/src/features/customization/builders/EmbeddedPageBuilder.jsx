import React from "react";
import BuilderTreeNode from "../components/BuilderTreeNode";
import BuilderPropertiesPanel from "./BuilderPropertiesPanel";

export default function EmbeddedPageBuilder({
    state
}) {
    const {
        buildableChannels,
        selectedPageId,
        setSelectedPageId,
        selectedNodeId,
        setSelectedNodeId,
        safeLayout,
        selectedNode,
        handleCreateRoot,
        handleAddChild,
        handleDeleteNode,
        handleMoveUp,
        handleMoveDown,
        patchSelectedNode
    } = state;

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
                        {buildableChannels.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </label>

                {!safeLayout && (
                    <div className="builder-actions-inline">
                        <button onClick={() => handleCreateRoot("column")}>
                            New Column Root
                        </button>
                        <button onClick={() => handleCreateRoot("row")}>
                            New Row Root
                        </button>
                    </div>
                )}
            </div>

            <div className="builder-grid">
                <div className="builder-panel">
                    <h4>Structure</h4>

                    {safeLayout ? (
                        <BuilderTreeNode
                            node={safeLayout}
                            selectedId={selectedNodeId}
                            onSelect={setSelectedNodeId}
                        />
                    ) : (
                        <p>No layout yet.</p>
                    )}
                </div>

                <div className="builder-panel">
                    <h4>Quick Actions</h4>

                    <div className="builder-button-grid">
                        <button onClick={() => handleAddChild("row")}>Row</button>
                        <button onClick={() => handleAddChild("column")}>Column</button>
                        <button onClick={() => handleAddChild("text")}>Text</button>
                        <button onClick={() => handleAddChild("heading")}>Heading</button>
                        <button onClick={() => handleAddChild("button")}>Button</button>
                        <button onClick={() => handleAddChild("chat")}>Chat</button>
                    </div>
                </div>

                <BuilderPropertiesPanel
                    selectedNode={selectedNode}
                    patchSelectedNode={patchSelectedNode}
                    buildableChannels={buildableChannels}
                    showReorderActions={true}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                    onDelete={handleDeleteNode}
                />
            </div>
        </div>
    );
}