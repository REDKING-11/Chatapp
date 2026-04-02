import React, { useEffect, useState } from "react";
import {
    fetchCustomization,
    saveCustomization,
    resetCustomization
} from "../api/actions";
import usePageBuilderState from "../hooks/usePageBuilderState";
import EmbeddedPageBuilder from "../builders/EmbeddedPageBuilder";

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

export default function CustomizationPage({
    backendUrl,
    serverData,
    onOpenAdvancedBuilder
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

    function updateThemeField(field, value) {
        setCustomization((prev) => ({
            ...prev,
            theme: {
                ...prev.theme,
                [field]: value
            }
        }));
    }

    function updateLayoutField(field, value) {
        setCustomization((prev) => ({
            ...prev,
            layout: {
                ...prev.layout,
                [field]: value
            }
        }));
    }

    function updateCustomCss(value) {
        setCustomization((prev) => ({
            ...prev,
            customCss: value
        }));
    }

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

    if (loading) {
        return <div className="settings-panel-body">Loading customization...</div>;
    }

    if (!customization) {
        return <div className="settings-panel-body">No customization found.</div>;
    }

    return (
        <div className="settings-panel-body">
            <div className="settings-section">
                <div className="settings-section-title-row">
                    <h3>Server Theme</h3>
                </div>

                {error ? <p className="settings-error">{error}</p> : null}

                <div className="settings-grid">
                    <label className="settings-field">
                        <span>Accent</span>
                        <input
                            type="color"
                            value={customization.theme.accent}
                            onChange={(e) => updateThemeField("accent", e.target.value)}
                        />
                    </label>

                    <label className="settings-field">
                        <span>Background</span>
                        <input
                            type="color"
                            value={customization.theme.background}
                            onChange={(e) => updateThemeField("background", e.target.value)}
                        />
                    </label>

                    <label className="settings-field">
                        <span>Surface</span>
                        <input
                            type="color"
                            value={customization.theme.surface}
                            onChange={(e) => updateThemeField("surface", e.target.value)}
                        />
                    </label>

                    <label className="settings-field">
                        <span>Surface Alt</span>
                        <input
                            type="color"
                            value={customization.theme.surfaceAlt}
                            onChange={(e) => updateThemeField("surfaceAlt", e.target.value)}
                        />
                    </label>

                    <label className="settings-field">
                        <span>Text</span>
                        <input
                            type="color"
                            value={customization.theme.text}
                            onChange={(e) => updateThemeField("text", e.target.value)}
                        />
                    </label>

                    <label className="settings-field">
                        <span>Muted Text</span>
                        <input
                            type="color"
                            value={customization.theme.textMuted}
                            onChange={(e) => updateThemeField("textMuted", e.target.value)}
                        />
                    </label>

                    <label className="settings-field">
                        <span>Danger</span>
                        <input
                            type="color"
                            value={customization.theme.danger}
                            onChange={(e) => updateThemeField("danger", e.target.value)}
                        />
                    </label>

                    <label className="settings-field">
                        <span>Success</span>
                        <input
                            type="color"
                            value={customization.theme.success}
                            onChange={(e) => updateThemeField("success", e.target.value)}
                        />
                    </label>

                    <label className="settings-field">
                        <span>Corner Radius</span>
                        <input
                            type="number"
                            min="0"
                            max="40"
                            value={customization.theme.radius}
                            onChange={(e) => updateThemeField("radius", Number(e.target.value))}
                        />
                    </label>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title-row">
                    <h3>Server Layout</h3>
                </div>

                <div className="settings-grid">
                    <label className="settings-checkbox">
                        <input
                            type="checkbox"
                            checked={customization.layout.showChannelSidebar}
                            onChange={(e) =>
                                updateLayoutField("showChannelSidebar", e.target.checked)
                            }
                        />
                        <span>Show channel sidebar</span>
                    </label>

                    <label className="settings-checkbox">
                        <input
                            type="checkbox"
                            checked={customization.layout.showMembersPanel}
                            onChange={(e) =>
                                updateLayoutField("showMembersPanel", e.target.checked)
                            }
                        />
                        <span>Show members panel</span>
                    </label>

                    <label className="settings-checkbox">
                        <input
                            type="checkbox"
                            checked={customization.layout.compactMessages}
                            onChange={(e) =>
                                updateLayoutField("compactMessages", e.target.checked)
                            }
                        />
                        <span>Compact messages</span>
                    </label>

                    <label className="settings-field">
                        <span>Channel sidebar width</span>
                        <input
                            type="number"
                            min="180"
                            max="420"
                            value={customization.layout.channelSidebarWidth}
                            onChange={(e) =>
                                updateLayoutField("channelSidebarWidth", Number(e.target.value))
                            }
                        />
                    </label>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title-row">
                    <h3>Custom CSS</h3>
                </div>

                <label className="settings-field">
                    <span>Server CSS override</span>
                    <textarea
                        rows="16"
                        value={customization.customCss || ""}
                        onChange={(e) => updateCustomCss(e.target.value)}
                    />
                </label>
            </div>

            <div className="settings-section">
                <div className="settings-section-title-row">
                    <div>
                        <h3>Page Builder</h3>
                        <p className="settings-section-subtitle">
                            Quick content and property editing here. Use Advanced Builder for drag and drop layout work.
                        </p>
                    </div>

                    {onOpenAdvancedBuilder && (
                        <button
                            type="button"
                            className="settings-mode-button"
                            onClick={onOpenAdvancedBuilder}
                        >
                            Open Advanced Builder
                        </button>
                    )}
                </div>

                <EmbeddedPageBuilder state={builderState} />
            </div>

            <div className="settings-actions">
                <button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                </button>

                <button
                    className="secondary"
                    onClick={handleReset}
                    disabled={saving}
                >
                    Reset to default
                </button>
            </div>
        </div>
    );
}