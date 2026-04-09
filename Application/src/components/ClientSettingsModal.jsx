import { useRef, useState } from "react";
import {
    CLIENT_SETTINGS_DEFAULTS,
    downloadClientSettings,
    importClientSettingsFromFile,
    THEME_PRESETS
} from "../features/clientSettings";
import { formatAppError } from "../lib/debug";

const FONT_SCALE_OPTIONS = [
    { value: 0.9, label: "Compact" },
    { value: 1, label: "Default" },
    { value: 1.1, label: "Large" },
    { value: 1.25, label: "Extra large" }
];

const LINE_HEIGHT_OPTIONS = [
    { value: 1.4, label: "Tight" },
    { value: 1.5, label: "Default" },
    { value: 1.7, label: "Relaxed" }
];

const DENSITY_OPTIONS = [
    { value: "compact", label: "Compact" },
    { value: "comfortable", label: "Comfortable" },
    { value: "spacious", label: "Spacious" }
];

const COLOR_BLIND_OPTIONS = [
    { value: "none", label: "None" },
    { value: "protanopia", label: "Protanopia friendly" },
    { value: "deuteranopia", label: "Deuteranopia friendly" },
    { value: "tritanopia", label: "Tritanopia friendly" },
    { value: "monochrome", label: "Monochrome" }
];

const HIT_TARGET_OPTIONS = [
    { value: "default", label: "Default" },
    { value: "large", label: "Large" },
    { value: "xlarge", label: "Extra large" },
    { value: "max", label: "Maximum" }
];

const SETTINGS_TABS = [
    { id: "general", label: "General" },
    { id: "profile", label: "Profile" },
    { id: "advanced", label: "Advanced" }
];

function CollapsibleSection({
    title,
    description,
    isOpen,
    onToggle,
    children
}) {
    return (
        <section className={`client-settings-section ${isOpen ? "is-open" : "is-collapsed"}`}>
            <button
                type="button"
                className="client-settings-section-toggle"
                onClick={onToggle}
            >
                <div className="client-settings-section-heading">
                    <h3>{title}</h3>
                    <p>{description}</p>
                </div>
                <span className="client-settings-section-chevron" aria-hidden="true">
                    {isOpen ? "v" : ">"}
                </span>
            </button>

            {isOpen ? <div className="client-settings-section-body">{children}</div> : null}
        </section>
    );
}

export default function ClientSettingsModal({
    settings,
    onChange,
    onImport,
    onReset,
    onClose
}) {
    const importInputRef = useRef(null);
    const [importError, setImportError] = useState("");
    const [activeTab, setActiveTab] = useState("general");
    const [collapsedSections, setCollapsedSections] = useState({
        theme: false,
        readability: false,
        accessibility: false,
        profileMedia: false,
        friendTags: false,
        developer: true,
        preview: true
    });

    function toggleSection(sectionId) {
        setCollapsedSections((prev) => ({
            ...prev,
            [sectionId]: !prev[sectionId]
        }));
    }

    function updateFriendTagFolders(nextFolders) {
        onChange("friendTagFolders", nextFolders);
    }

    function handleFolderLabelChange(folderId, label) {
        updateFriendTagFolders(settings.friendTagFolders.map((folder) => (
            folder.id === folderId ? { ...folder, label } : folder
        )));
    }

    function handleTagLabelChange(folderId, tagId, label) {
        updateFriendTagFolders(settings.friendTagFolders.map((folder) => (
            folder.id === folderId
                ? {
                    ...folder,
                    tags: folder.tags.map((tag) => (
                        tag.id === tagId ? { ...tag, label } : tag
                    ))
                }
                : folder
        )));
    }

    function handleAddFolder() {
        updateFriendTagFolders([
            ...settings.friendTagFolders,
            {
                id: `folder-${Date.now()}`,
                label: "New folder",
                tags: [
                    {
                        id: `tag-${Date.now()}`,
                        label: "New tag"
                    }
                ]
            }
        ]);
    }

    function handleAddTag(folderId) {
        updateFriendTagFolders(settings.friendTagFolders.map((folder) => (
            folder.id === folderId
                ? {
                    ...folder,
                    tags: [
                        ...folder.tags,
                        {
                            id: `tag-${Date.now()}-${folder.tags.length}`,
                            label: "New tag"
                        }
                    ]
                }
                : folder
        )));
    }

    function handleRemoveFolder(folderId) {
        if (settings.friendTagFolders.length <= 1) {
            return;
        }

        updateFriendTagFolders(settings.friendTagFolders.filter((folder) => folder.id !== folderId));
    }

    function handleRemoveTag(folderId, tagId) {
        updateFriendTagFolders(
            settings.friendTagFolders
                .map((folder) => (
                    folder.id === folderId
                        ? {
                            ...folder,
                            tags: folder.tags.filter((tag) => tag.id !== tagId)
                        }
                        : folder
                ))
                .filter((folder) => folder.tags.length > 0)
        );
    }

    async function handleImportFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const imported = await importClientSettingsFromFile(file);
            setImportError("");
            onImport(imported);
        } catch (error) {
            setImportError(formatAppError(error, {
                fallbackMessage: "Could not import that settings file.",
                context: "Client settings import"
            }).message);
        } finally {
            event.target.value = "";
        }
    }

    return (
        <div className="client-settings-overlay" onClick={onClose}>
            <div
                className="client-settings-window"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="client-settings-header">
                    <div>
                        <h2>Client Settings</h2>
                        <p>Theme, accessibility, readability, and visual comfort for this device.</p>
                    </div>

                    <div className="client-settings-header-actions">
                        <button type="button" className="secondary" onClick={() => downloadClientSettings(settings)}>
                            Export
                        </button>
                        <button
                            type="button"
                            className="secondary"
                            onClick={() => importInputRef.current?.click()}
                        >
                            Import
                        </button>
                        <button type="button" className="secondary" onClick={onReset}>
                            Reset
                        </button>
                        <button type="button" className="secondary" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>

                <div className="client-settings-content">
                    <input
                        ref={importInputRef}
                        type="file"
                        accept=".json,application/json"
                        className="client-hidden-input"
                        onChange={handleImportFile}
                    />

                    {importError ? (
                        <p className="client-settings-error">{importError}</p>
                    ) : null}

                    <div className="client-settings-tabs" role="tablist" aria-label="Client settings tabs">
                        {SETTINGS_TABS.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={activeTab === tab.id}
                                className={`client-settings-tab ${activeTab === tab.id ? "active" : ""}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {activeTab === "general" ? (
                        <>
                    <CollapsibleSection
                        title="Theme"
                        description="Apply a client-wide palette across the shell, friends view, auth, and utilities."
                        isOpen={!collapsedSections.theme}
                        onToggle={() => toggleSection("theme")}
                    >
                        <div className="client-theme-grid">
                            {Object.entries(THEME_PRESETS).map(([key, preset]) => (
                                <button
                                    key={key}
                                    type="button"
                                    className={`client-theme-card ${settings.themePreset === key ? "selected" : ""}`}
                                    onClick={() => onChange("themePreset", key)}
                                >
                                    <span className="client-theme-card-title">{preset.label}</span>
                                    <span className="client-theme-swatches">
                                        <span style={{ background: preset.shell.bg }} />
                                        <span style={{ background: preset.shell.surface }} />
                                        <span style={{ background: preset.shell.accent }} />
                                        <span style={{ background: preset.server.accent }} />
                                    </span>
                                </button>
                            ))}
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="Readability"
                        description="Adjust type, spacing, and target sizes for longer sessions."
                        isOpen={!collapsedSections.readability}
                        onToggle={() => toggleSection("readability")}
                    >
                        <div className="client-settings-grid">
                            <label className="client-settings-field">
                                <span>Text size</span>
                                <select
                                    value={settings.fontScale}
                                    onChange={(event) => onChange("fontScale", Number(event.target.value))}
                                >
                                    {FONT_SCALE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="client-settings-field">
                                <span>Line height</span>
                                <select
                                    value={settings.lineHeight}
                                    onChange={(event) => onChange("lineHeight", Number(event.target.value))}
                                >
                                    {LINE_HEIGHT_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="client-settings-field">
                                <span>UI density</span>
                                <select
                                    value={settings.uiDensity}
                                    onChange={(event) => onChange("uiDensity", event.target.value)}
                                >
                                    {DENSITY_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="client-settings-field">
                                <span>Color vision mode</span>
                                <select
                                    value={settings.colorBlindMode}
                                    onChange={(event) => onChange("colorBlindMode", event.target.value)}
                                >
                                    {COLOR_BLIND_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="Accessibility"
                        description="Reduce strain, boost contrast, and make controls easier to use."
                        isOpen={!collapsedSections.accessibility}
                        onToggle={() => toggleSection("accessibility")}
                    >
                        <div className="client-accessibility-grid">
                            <label className="client-toggle-card">
                                <div className="client-toggle-copy">
                                    <strong>Reduced motion</strong>
                                    <p>Turns off non-essential animation and smooth scrolling.</p>
                                </div>
                                <div className="client-toggle-control">
                                    <input
                                        type="checkbox"
                                        checked={settings.reducedMotion}
                                        onChange={(event) => onChange("reducedMotion", event.target.checked)}
                                    />
                                </div>
                            </label>

                            <label className="client-toggle-card">
                                <div className="client-toggle-copy">
                                    <strong>High contrast</strong>
                                    <p>Boosts outlines, border visibility, and focus treatment.</p>
                                </div>
                                <div className="client-toggle-control">
                                    <input
                                        type="checkbox"
                                        checked={settings.highContrast}
                                        onChange={(event) => onChange("highContrast", event.target.checked)}
                                    />
                                </div>
                            </label>

                            <label className="client-toggle-card">
                                <div className="client-toggle-copy">
                                    <strong>Dyslexia-friendly font stack</strong>
                                    <p>Uses a more readable fallback chain with stronger letter separation.</p>
                                </div>
                                <div className="client-toggle-control">
                                    <input
                                        type="checkbox"
                                        checked={settings.dyslexicFont}
                                        onChange={(event) => onChange("dyslexicFont", event.target.checked)}
                                    />
                                </div>
                            </label>

                            <label className="client-toggle-card">
                                <div className="client-toggle-copy">
                                    <strong>Hit target size</strong>
                                    <p>Choose how much larger buttons, fields, toggles, and taps should feel.</p>
                                </div>
                                <div className="client-toggle-control">
                                    <select
                                        value={settings.hitTargetSize}
                                        onChange={(event) => onChange("hitTargetSize", event.target.value)}
                                    >
                                        {HIT_TARGET_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </label>
                        </div>
                    </CollapsibleSection>

                        </>
                    ) : null}

                    {activeTab === "advanced" ? (
                    <CollapsibleSection
                        title="Developer"
                        description="Control whether raw technical errors and extra diagnostics are shown on this device."
                        isOpen={!collapsedSections.developer}
                        onToggle={() => toggleSection("developer")}
                    >
                        <div className="client-accessibility-grid">
                            <label className="client-toggle-card">
                                <div className="client-toggle-copy">
                                    <strong>Debug mode</strong>
                                    <p>Shows raw fetch errors, extra technical details, and diagnostic hints in the UI.</p>
                                </div>
                                <div className="client-toggle-control">
                                    <input
                                        type="checkbox"
                                        checked={settings.debugMode}
                                        onChange={(event) => onChange("debugMode", event.target.checked)}
                                    />
                                </div>
                            </label>
                        </div>
                    </CollapsibleSection>
                    ) : null}

                    {activeTab === "profile" ? (
                        <>
                    <CollapsibleSection
                        title="Profile Media"
                        description="Control whether avatars and profile backgrounds load from shared servers."
                        isOpen={!collapsedSections.profileMedia}
                        onToggle={() => toggleSection("profileMedia")}
                    >
                        <div className="client-accessibility-grid">
                            <label className="client-toggle-card">
                                <div className="client-toggle-copy">
                                    <strong>Load profile pictures</strong>
                                    <p>Downloads avatars from shared servers when available.</p>
                                </div>
                                <div className="client-toggle-control">
                                    <input
                                        type="checkbox"
                                        checked={settings.autoLoadProfileAvatars}
                                        onChange={(event) => onChange("autoLoadProfileAvatars", event.target.checked)}
                                    />
                                </div>
                            </label>

                            <label className="client-toggle-card">
                                <div className="client-toggle-copy">
                                    <strong>Load profile backgrounds</strong>
                                    <p>Downloads larger banner images only if you want them.</p>
                                </div>
                                <div className="client-toggle-control">
                                    <input
                                        type="checkbox"
                                        checked={settings.autoLoadProfileBanners}
                                        onChange={(event) => onChange("autoLoadProfileBanners", event.target.checked)}
                                    />
                                </div>
                            </label>

                            <label className="client-toggle-card">
                                <div className="client-toggle-copy">
                                    <strong>Shared servers only</strong>
                                    <p>Keeps profile media loading limited to servers you already share.</p>
                                </div>
                                <div className="client-toggle-control">
                                    <input
                                        type="checkbox"
                                        checked={settings.sharedServerProfileMediaOnly}
                                        onChange={(event) => onChange("sharedServerProfileMediaOnly", event.target.checked)}
                                    />
                                </div>
                            </label>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="Friend Tags"
                        description="Organize DM tags into folders. These definitions are exported with client settings."
                        isOpen={!collapsedSections.friendTags}
                        onToggle={() => toggleSection("friendTags")}
                    >
                        <div className="client-tag-folder-list">
                            {settings.friendTagFolders.map((folder) => (
                                <div key={folder.id} className="client-tag-folder-card">
                                    <div className="client-tag-folder-header">
                                        <input
                                            type="text"
                                            value={folder.label}
                                            onChange={(event) => handleFolderLabelChange(folder.id, event.target.value)}
                                            placeholder="Folder name"
                                        />
                                        <button
                                            type="button"
                                            className="secondary client-tag-action-button client-tag-remove-folder-button"
                                            onClick={() => handleRemoveFolder(folder.id)}
                                            disabled={settings.friendTagFolders.length <= 1}
                                        >
                                            Remove folder
                                        </button>
                                    </div>

                                    <div className="client-tag-list">
                                        {folder.tags.map((tag) => (
                                            <div key={tag.id} className="client-tag-row">
                                                <input
                                                    type="text"
                                                    value={tag.label}
                                                    onChange={(event) => handleTagLabelChange(folder.id, tag.id, event.target.value)}
                                                    placeholder="Tag name"
                                                />
                                                <button
                                                    type="button"
                                                    className="secondary client-tag-action-button client-tag-remove-button"
                                                    onClick={() => handleRemoveTag(folder.id, tag.id)}
                                                    disabled={folder.tags.length <= 1}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    <button
                                        type="button"
                                        className="secondary client-tag-add-button"
                                        onClick={() => handleAddTag(folder.id)}
                                    >
                                        Add tag
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            type="button"
                            className="secondary client-tag-add-folder-button"
                            onClick={handleAddFolder}
                        >
                            Add folder
                        </button>
                    </CollapsibleSection>
                        </>
                    ) : null}

                    {activeTab === "general" ? (
                    <CollapsibleSection
                        title="Preview"
                        description="These changes apply instantly and stay on this device."
                        isOpen={!collapsedSections.preview}
                        onToggle={() => toggleSection("preview")}
                    >
                        <div className="client-preview-card">
                            <h4>Client shell preview</h4>
                            <p>
                                Theme and accessibility settings affect the auth screen, top bar,
                                settings windows, friends view, and client-owned controls.
                            </p>
                            <div className="client-preview-actions">
                                <button type="button">Primary action</button>
                                <button type="button" className="secondary">Secondary action</button>
                            </div>
                        </div>
                    </CollapsibleSection>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

export function resetClientSettings() {
    return { ...CLIENT_SETTINGS_DEFAULTS };
}
