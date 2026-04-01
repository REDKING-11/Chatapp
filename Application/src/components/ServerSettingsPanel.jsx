import React from "react";
import CustomizationPage from "./CustomizationPage";

export default function ServerSettingsPanel({
    backendUrl,
    serverData,
    onClose
}) {
    return (
        <div className="settings-overlay" onClick={onClose}>
            <div
                className="settings-window"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="settings-header">
                    <h2>Server Settings</h2>
                    <button onClick={onClose}>✕</button>
                </div>

                <div className="settings-content">
                    <CustomizationPage
                        backendUrl={backendUrl}
                        serverData={serverData}
                    />
                </div>
            </div>
        </div>
    );
}