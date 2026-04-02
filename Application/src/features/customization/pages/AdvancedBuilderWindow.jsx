import React, { useEffect, useState } from "react";
import {
    fetchCustomization,
    saveCustomization,
    resetCustomization
} from "../api/actions";
import usePageBuilderState from "../hooks/usePageBuilderState";
import AdvancedPageBuilder from "../builders/AdvancedPageBuilder";

const DEFAULT_CUSTOMIZATION = {
    theme: {
        accent: "#5865F2",
        background: "#1e1f22",
        surface: "#2b2d31",
        surfaceAlt: "#313338",
        text: "#f2f3f5",
        textMuted: "#b5bac1",
        danger: "#da373c",
        success: "#3ba55d",
        radius: 12
    },
    layout: {
        showServerSidebar: true,
        showChannelSidebar: true,
        showMembersPanel: false,
        compactMessages: false,
        channelSidebarWidth: 260
    },
    customCss: "",
    pages: {}
};

function mergeCustomization(data) {
    return {
        ...DEFAULT_CUSTOMIZATION,
        ...data,
        theme: {
            ...DEFAULT_CUSTOMIZATION.theme,
            ...(data?.theme || {})
        },
        layout: {
            ...DEFAULT_CUSTOMIZATION.layout,
            ...(data?.layout || {})
        },
        pages: data?.pages || {},
        customCss: data?.customCss || ""
    };
}

export default function AdvancedBuilderWindow({
    backendUrl,
    serverData,
    onClose
}) {
    const [customization, setCustomization] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        async function load() {
            if (!backendUrl) return;

            try {
                setLoading(true);
                setError("");
                const data = await fetchCustomization(backendUrl);
                setCustomization(mergeCustomization(data));
            } catch (err) {
                console.error(err);
                setError("Failed to load customization");
            } finally {
                setLoading(false);
            }
        }

        load();
    }, [backendUrl]);

    const builderState = usePageBuilderState({
        customization,
        setCustomization,
        channels: serverData?.channels || []
    });

    async function handleSave() {
        try {
            setSaving(true);
            setError("");

            const payload = mergeCustomization(customization);
            const saved = await saveCustomization(backendUrl, payload);

            setCustomization(mergeCustomization(saved));
            window.dispatchEvent(new Event("customizationUpdated"));
        } catch (err) {
            console.error(err);
            setError("Failed to save customization");
        } finally {
            setSaving(false);
        }
    }

    async function handleReset() {
        try {
            setSaving(true);
            setError("");

            const reset = await resetCustomization(backendUrl);
            setCustomization(mergeCustomization(reset));
            window.dispatchEvent(new Event("customizationUpdated"));
        } catch (err) {
            console.error(err);
            setError("Failed to reset customization");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="advanced-builder-overlay" onClick={onClose}>
            <div
                className="advanced-builder-window"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="advanced-builder-header">
                    <div>
                        <h2>Advanced Page Builder</h2>
                        <p>Visual layout editor with full drag and drop control.</p>
                    </div>

                    <button onClick={onClose}>✕</button>
                </div>

                <div className="advanced-builder-content">
                    {loading ? (
                        <div className="settings-panel-body">Loading customization...</div>
                    ) : !customization ? (
                        <div className="settings-panel-body">No customization found.</div>
                    ) : (
                        <>
                            {error ? <p className="settings-error">{error}</p> : null}

                            <AdvancedPageBuilder state={builderState} />

                            <div
                                className="settings-actions"
                                style={{
                                    position: "sticky",
                                    bottom: 0,
                                    zIndex: 20,
                                    display: "flex",
                                    gap: 12,
                                    justifyContent: "flex-end",
                                    padding: "16px 20px",
                                    marginTop: 16
                                }}
                            >
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    style={{
                                        minWidth: 140,
                                        minHeight: 44,
                                        fontSize: 15,
                                        fontWeight: 600
                                    }}
                                >
                                    {saving ? "Saving..." : "Save"}
                                </button>

                                <button
                                    className="secondary"
                                    onClick={handleReset}
                                    disabled={saving}
                                    style={{
                                        minWidth: 140,
                                        minHeight: 44,
                                        fontSize: 15
                                    }}
                                >
                                    Reset to default
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}