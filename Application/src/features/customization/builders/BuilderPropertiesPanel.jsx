import React from "react";

export default function BuilderPropertiesPanel({
    selectedNode,
    patchSelectedNode,
    buildableChannels,
    showReorderActions = false,
    onMoveUp,
    onMoveDown,
    onDelete
}) {
    return (
        <div className="builder-panel builder-panel-properties">
            <h4>Properties</h4>

            {!selectedNode && <p>Select a node.</p>}

            {selectedNode && (
                <>
                    <label className="settings-field">
                        <span>Class Name</span>
                        <input
                            type="text"
                            value={selectedNode.className || ""}
                            onChange={(e) =>
                                patchSelectedNode((node) => ({
                                    ...node,
                                    className: e.target.value
                                }))
                            }
                            placeholder="hero-box"
                        />
                    </label>

                    <label className="settings-field">
                        <span>Inline Styles</span>
                        <textarea
                            rows="6"
                            value={selectedNode.props?.style || ""}
                            onChange={(e) =>
                                patchSelectedNode((node) => ({
                                    ...node,
                                    props: {
                                        ...(node.props || {}),
                                        style: e.target.value
                                    }
                                }))
                            }
                        />
                    </label>
                </>
            )}

            {(selectedNode?.type === "text" || selectedNode?.type === "heading") && (
                <>
                    <label className="settings-field">
                        <span>Text</span>
                        <textarea
                            rows="4"
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

                    <label className="settings-field">
                        <span>Text Engine</span>
                        <select
                            value={selectedNode.props?.layoutEngine || "browser"}
                            onChange={(e) =>
                                patchSelectedNode((node) => ({
                                    ...node,
                                    props: {
                                        ...(node.props || {}),
                                        layoutEngine: e.target.value
                                    }
                                }))
                            }
                        >
                            <option value="browser">Browser</option>
                            <option value="pretext">Pretext.js</option>
                        </select>
                    </label>

                    <label className="settings-field">
                        <span>Markdown</span>
                        <select
                            value={selectedNode.props?.markdown === false ? "off" : "on"}
                            onChange={(e) =>
                                patchSelectedNode((node) => ({
                                    ...node,
                                    props: {
                                        ...(node.props || {}),
                                        markdown: e.target.value !== "off"
                                    }
                                }))
                            }
                        >
                            <option value="on">Enabled</option>
                            <option value="off">Disabled</option>
                        </select>
                    </label>

                    {selectedNode.props?.layoutEngine === "pretext" && (
                        <>
                            <label className="settings-field">
                                <span>Font Shorthand</span>
                                <input
                                    type="text"
                                    value={selectedNode.props?.font || ""}
                                    onChange={(e) =>
                                        patchSelectedNode((node) => ({
                                            ...node,
                                            props: {
                                                ...(node.props || {}),
                                                font: e.target.value
                                            }
                                        }))
                                    }
                                    placeholder={'400 16px "Segoe UI"'}
                                />
                            </label>

                            <label className="settings-field">
                                <span>Line Height</span>
                                <input
                                    type="number"
                                    min="1"
                                    value={selectedNode.props?.lineHeight || 24}
                                    onChange={(e) =>
                                        patchSelectedNode((node) => ({
                                            ...node,
                                            props: {
                                                ...(node.props || {}),
                                                lineHeight: Number(e.target.value)
                                            }
                                        }))
                                    }
                                />
                            </label>

                            <label className="settings-field">
                                <span>White Space</span>
                                <select
                                    value={selectedNode.props?.whiteSpace || "normal"}
                                    onChange={(e) =>
                                        patchSelectedNode((node) => ({
                                            ...node,
                                            props: {
                                                ...(node.props || {}),
                                                whiteSpace: e.target.value
                                            }
                                        }))
                                    }
                                >
                                    <option value="normal">Normal</option>
                                    <option value="pre-wrap">Pre-wrap</option>
                                </select>
                            </label>

                            <label className="settings-field">
                                <span>Word Break</span>
                                <select
                                    value={selectedNode.props?.wordBreak || "normal"}
                                    onChange={(e) =>
                                        patchSelectedNode((node) => ({
                                            ...node,
                                            props: {
                                                ...(node.props || {}),
                                                wordBreak: e.target.value
                                            }
                                        }))
                                    }
                                >
                                    <option value="normal">Normal</option>
                                    <option value="keep-all">Keep all</option>
                                </select>
                            </label>
                        </>
                    )}

                    {selectedNode?.type === "heading" && (
                        <label className="settings-field">
                            <span>Heading Level</span>
                            <select
                                value={selectedNode.props?.level || 2}
                                onChange={(e) =>
                                    patchSelectedNode((node) => ({
                                        ...node,
                                        props: {
                                            ...(node.props || {}),
                                            level: Number(e.target.value)
                                        }
                                    }))
                                }
                            >
                                <option value={1}>H1</option>
                                <option value={2}>H2</option>
                                <option value={3}>H3</option>
                                <option value={4}>H4</option>
                                <option value={5}>H5</option>
                                <option value={6}>H6</option>
                            </select>
                        </label>
                    )}
                </>
            )}

            {selectedNode?.type === "chat" && (
                <>
                    <label className="settings-field">
                        <span>Chat Title</span>
                        <input
                            type="text"
                            value={selectedNode.props?.title || ""}
                            onChange={(e) =>
                                patchSelectedNode((node) => ({
                                    ...node,
                                    props: {
                                        ...(node.props || {}),
                                        title: e.target.value
                                    }
                                }))
                            }
                        />
                    </label>

                    <label className="settings-field">
                        <span>Source Channel</span>
                        <select
                            value={selectedNode.props?.channelId || ""}
                            onChange={(e) =>
                                patchSelectedNode((node) => ({
                                    ...node,
                                    props: {
                                        ...(node.props || {}),
                                        channelId: e.target.value
                                    }
                                }))
                            }
                        >
                            <option value="">Current page channel</option>
                            {buildableChannels.map((channel) => (
                                <option key={channel.id} value={channel.id}>
                                    {channel.name}
                                </option>
                            ))}
                        </select>
                    </label>
                </>
            )}

            {selectedNode?.type === "button" && (
                <>
                    <label className="settings-field">
                        <span>Button Text</span>
                        <input
                            type="text"
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

                    <label className="settings-field">
                        <span>Markdown</span>
                        <select
                            value={selectedNode.props?.markdown === false ? "off" : "on"}
                            onChange={(e) =>
                                patchSelectedNode((node) => ({
                                    ...node,
                                    props: {
                                        ...(node.props || {}),
                                        markdown: e.target.value !== "off"
                                    }
                                }))
                            }
                        >
                            <option value="on">Enabled</option>
                            <option value="off">Disabled</option>
                        </select>
                    </label>
                </>
            )}

            {(selectedNode?.type === "input" || selectedNode?.type === "textarea") && (
                <>
                    <label className="settings-field">
                        <span>Name</span>
                        <input
                            type="text"
                            value={selectedNode.props?.name || ""}
                            onChange={(e) =>
                                patchSelectedNode((node) => ({
                                    ...node,
                                    props: {
                                        ...(node.props || {}),
                                        name: e.target.value
                                    }
                                }))
                            }
                        />
                    </label>

                    <label className="settings-field">
                        <span>Placeholder</span>
                        <input
                            type="text"
                            value={selectedNode.props?.placeholder || ""}
                            onChange={(e) =>
                                patchSelectedNode((node) => ({
                                    ...node,
                                    props: {
                                        ...(node.props || {}),
                                        placeholder: e.target.value
                                    }
                                }))
                            }
                        />
                    </label>
                </>
            )}

            {selectedNode?.type === "image" && (
                <>
                    <label className="settings-field">
                        <span>Image URL</span>
                        <input
                            type="text"
                            value={selectedNode.props?.src || ""}
                            onChange={(e) =>
                                patchSelectedNode((node) => ({
                                    ...node,
                                    props: {
                                        ...(node.props || {}),
                                        src: e.target.value
                                    }
                                }))
                            }
                        />
                    </label>

                    <label className="settings-field">
                        <span>Alt Text</span>
                        <input
                            type="text"
                            value={selectedNode.props?.alt || ""}
                            onChange={(e) =>
                                patchSelectedNode((node) => ({
                                    ...node,
                                    props: {
                                        ...(node.props || {}),
                                        alt: e.target.value
                                    }
                                }))
                            }
                        />
                    </label>
                </>
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

            <div className="builder-button-grid builder-button-grid-bottom">
                {showReorderActions && (
                    <>
                        <button type="button" onClick={onMoveUp}>
                            Move Up
                        </button>
                        <button type="button" onClick={onMoveDown}>
                            Move Down
                        </button>
                    </>
                )}

                <button type="button" className="danger" onClick={onDelete}>
                    Delete Node
                </button>
            </div>
        </div>
    );
}
