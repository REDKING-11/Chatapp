import { useState } from "react";

export default function BackendManager({
    backends,
    selectedBackendUrl,
    onSelectBackend,
    onAddBackend,
    onClose
}) {
    const [newBackendUrl, setNewBackendUrl] = useState("");

    function handleAdd() {
        const trimmed = newBackendUrl.trim();
        if (!trimmed) return;

        onAddBackend(trimmed);
        setNewBackendUrl("");
    }

    return (
        <div className="backend-modal-overlay">
            <div className="backend-modal">
                <div className="backend-modal-header">
                    <h2>Backend Servers</h2>
                    <button onClick={onClose}>Close</button>
                </div>

                <div className="backend-list">
                    {backends.map((backend) => (
                        <div key={backend.url} className="backend-item">
                            <div className="backend-info">
                                <strong>{backend.name || "Unnamed backend"}</strong>
                                <p>{backend.url}</p>
                            </div>

                            <button
                                className={
                                    selectedBackendUrl === backend.url
                                        ? "backend-select-button active-backend"
                                        : "backend-select-button"
                                }
                                onClick={() => onSelectBackend(backend.url)}
                            >
                                {selectedBackendUrl === backend.url ? "Selected" : "Use"}
                            </button>
                        </div>
                    ))}
                </div>

                <div className="backend-add-row">
                    <input
                        type="text"
                        placeholder="http://localhost:3000"
                        value={newBackendUrl}
                        onChange={(e) => setNewBackendUrl(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleAdd();
                        }}
                    />
                    <button onClick={handleAdd}>Add</button>
                </div>
            </div>
        </div>
    );
}