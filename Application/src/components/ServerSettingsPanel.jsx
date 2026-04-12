import React, { useState } from "react";
import CustomizationPage from "../features/customization/pages/CustomizationPage";
import AdvancedBuilderWindow from "../features/customization/pages/AdvancedBuilderWindow";
import { createServerChannel } from "../features/servers/actions";

export default function ServerSettingsPanel({
    backendUrl,
    serverData,
    onClose,
    onServerDataChange,
    onSelectChannel
}) {
    const [advancedBuilderOpen, setAdvancedBuilderOpen] = useState(false);
    const [channelName, setChannelName] = useState("");
    const [channelType, setChannelType] = useState("chat");
    const [channelError, setChannelError] = useState("");
    const [creatingChannel, setCreatingChannel] = useState(false);

    async function handleCreateChannel(event) {
        event.preventDefault();

        try {
            setCreatingChannel(true);
            setChannelError("");

            const result = await createServerChannel({
                backendUrl,
                name: channelName,
                type: channelType
            });

            setChannelName("");
            onServerDataChange?.(result.server);

            if (result.channel?.id) {
                onSelectChannel?.(result.channel.id);
            }
        } catch (error) {
            setChannelError(String(error?.message || "Failed to create channel"));
        } finally {
            setCreatingChannel(false);
        }
    }

    return (
        <>
            <div className="settings-overlay" onClick={onClose}>
                <div
                    className="settings-window"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="settings-header">
                        <h2>Server Settings</h2>

                        <div className="settings-header-actions">
                            <button
                                type="button"
                                className="settings-mode-button"
                                onClick={() => setAdvancedBuilderOpen(true)}
                            >
                                Advanced Builder
                            </button>

                            <button onClick={onClose}>✕</button>
                        </div>
                    </div>

                    <div className="settings-content">
                        <div className="settings-panel-body">
                            <div className="settings-section">
                                <div className="settings-section-title-row">
                                    <div>
                                        <h3>Create Channel</h3>
                                        <p className="settings-section-subtitle">
                                            Add a new channel to this self-hosted server.
                                        </p>
                                    </div>
                                </div>

                                {channelError ? <p className="settings-error">{channelError}</p> : null}

                                <form className="server-channel-create-form" onSubmit={handleCreateChannel}>
                                    <label className="settings-field">
                                        <span>Channel name</span>
                                        <input
                                            type="text"
                                            value={channelName}
                                            onChange={(event) => setChannelName(event.target.value)}
                                            placeholder="party-planning"
                                            autoComplete="off"
                                        />
                                    </label>

                                    <label className="settings-field">
                                        <span>Channel type</span>
                                        <select
                                            value={channelType}
                                            onChange={(event) => setChannelType(event.target.value)}
                                        >
                                            <option value="chat">Chat</option>
                                            <option value="page">Page</option>
                                        </select>
                                    </label>

                                    <div className="settings-actions">
                                        <button type="submit" disabled={creatingChannel}>
                                            {creatingChannel ? "Creating..." : "Create channel"}
                                        </button>
                                    </div>
                                </form>

                                {Array.isArray(serverData?.channels) && serverData.channels.length > 0 ? (
                                    <div className="server-channel-list-preview">
                                        {serverData.channels
                                            .filter((channel) => channel?.type !== "customization")
                                            .map((channel) => (
                                                <span key={channel.id} className="server-channel-preview-pill">
                                                    #{channel.name}
                                                </span>
                                            ))}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <CustomizationPage
                            backendUrl={backendUrl}
                            serverData={serverData}
                            onOpenAdvancedBuilder={() => setAdvancedBuilderOpen(true)}
                        />
                    </div>
                </div>
            </div>

            {advancedBuilderOpen && (
                <AdvancedBuilderWindow
                    backendUrl={backendUrl}
                    serverData={serverData}
                    onClose={() => setAdvancedBuilderOpen(false)}
                />
            )}
        </>
    );
}
