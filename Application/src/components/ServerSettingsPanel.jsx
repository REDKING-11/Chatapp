import React, { useState } from "react";
import CustomizationPage from "../features/customization/pages/CustomizationPage";
import AdvancedBuilderWindow from "../features/customization/pages/AdvancedBuilderWindow";

export default function ServerSettingsPanel({
    backendUrl,
    serverData,
    onClose
}) {
    const [advancedBuilderOpen, setAdvancedBuilderOpen] = useState(false);

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