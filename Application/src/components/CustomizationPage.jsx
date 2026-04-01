import React, { useEffect, useState } from "react";
import {
    fetchCustomization,
    saveCustomization,
    resetCustomization
} from "../features/customization/actions";
import PageBuilder from "./PageBuilder";

function CustomizationPage({ backendUrl, serverData }) {
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
                setCustomization(data);
            } catch (err) {
                console.error(err);
                setError("Failed to load customization");
            } finally {
                setLoading(false);
            }
        }

        load();
    }, [backendUrl]);

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

    async function handleSave() {
        try {
            setSaving(true);
            setError("");
            const saved = await saveCustomization(backendUrl, customization);
            setCustomization(saved);
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
            setCustomization(reset);
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
                <h3>Server Theme</h3>

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
                <h3>Server Layout</h3>

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
                <h3>Page Builder</h3>

                <PageBuilder
                    customization={customization}
                    setCustomization={setCustomization}
                    channels={serverData?.channels || []}
                />
            </div>

            <div className="settings-actions">
                <button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                </button>

                <button className="secondary" onClick={handleReset} disabled={saving}>
                    Reset to default
                </button>
            </div>
        </div>
    );
}

export default CustomizationPage;