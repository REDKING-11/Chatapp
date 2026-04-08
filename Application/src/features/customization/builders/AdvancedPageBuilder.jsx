import React from "react";
import BuilderPreviewNode from "../components/BuilderPreviewNode";
import BuilderCanvasDropZone from "../components/BuilderCanvasDropZone";
import { PALETTE_ITEMS } from "../utils/builderPalette";
import useCanvasPanZoom from "../hooks/useCanvasPanZoom";
import BuilderPropertiesPanel from "./BuilderPropertiesPanel";

export default function AdvancedPageBuilder({
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
        handleDropOnCanvasRoot,
        handleDropRelative,
        handleMoveRelative,
        handleDeleteNode,
        patchSelectedNode
    } = state;

    const canvas = useCanvasPanZoom(true);

    function handlePaletteDragStart(e, type) {
        e.dataTransfer.setData("application/x-builder-type", type);
        e.dataTransfer.effectAllowed = "copy";
    }

    return (
        <div className="builder-shell builder-shell-advanced">
            <div className="builder-toolbar builder-toolbar-advanced">
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

                <div className="builder-toolbar-meta">
                    <span className="builder-zoom-label">
                        {Math.round(canvas.zoom * 100)}%
                    </span>
                    <button
                        type="button"
                        className="secondary"
                        onClick={canvas.resetView}
                    >
                        Reset View
                    </button>
                </div>
            </div>

            <p className="builder-canvas-help">
                Middle mouse or Space + drag to pan. Ctrl/Cmd + wheel to zoom.
            </p>

            <div className="builder-visual-layout builder-visual-layout-advanced">
                <div className="builder-panel builder-panel-palette">
                    <h4>Palette</h4>

                    <div className="builder-palette-grid">
                        {PALETTE_ITEMS.map((item) => (
                            <div
                                key={item.type}
                                draggable
                                className="builder-palette-item"
                                onDragStart={(e) => handlePaletteDragStart(e, item.type)}
                            >
                                {item.label}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="builder-panel builder-panel-canvas">
                    <div
                        ref={canvas.viewportRef}
                        className={`builder-canvas-scroll-area ${canvas.isPanning ? "is-panning" : ""}`}
                    >
                        {!safeLayout ? (
                            <div className="builder-canvas-inner">
                                <BuilderCanvasDropZone
                                    label="Drop first block here"
                                    className="builder-root-drop"
                                    onDropNode={handleDropOnCanvasRoot}
                                />
                            </div>
                        ) : (
                            <div className="builder-canvas-inner">
                                <div
                                    className="builder-canvas"
                                    style={{
                                        transform: `translate(${canvas.pan.x}px, ${canvas.pan.y}px) scale(${canvas.zoom})`,
                                        transformOrigin: "0 0"
                                    }}
                                >
                                    <BuilderPreviewNode
                                        node={safeLayout}
                                        selectedNodeId={selectedNodeId}
                                        setSelectedNodeId={setSelectedNodeId}
                                        onDropRelative={handleDropRelative}
                                        onMoveRelative={(targetId, position, draggedNodeId) =>
                                            handleMoveRelative(draggedNodeId, targetId, position)
                                        }
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <BuilderPropertiesPanel
                    selectedNode={selectedNode}
                    patchSelectedNode={patchSelectedNode}
                    buildableChannels={buildableChannels}
                    showReorderActions={false}
                    onDelete={handleDeleteNode}
                />
            </div>
        </div>
    );
}