import { useState } from "react";

export default function JoinServerModal({ currentUser, onJoinSuccess, onClose }) {
    const [backendUrl, setBackendUrl] = useState("http://localhost:3000");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleJoin() {
        const trimmedUrl = backendUrl.trim();

        if (!trimmedUrl) {
            setError("Backend URL is required");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const res = await fetch(`${trimmedUrl}/api/join`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    userId: currentUser.id,
                    username: currentUser.username
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to join server");
            }

            onJoinSuccess({
                id: data.server.id,
                name: data.server.name,
                description: data.server.description,
                icon: data.server.icon,
                backendUrl: trimmedUrl
            });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="backend-modal-overlay">
            <div className="backend-modal">
                <div className="backend-modal-header">
                    <h2>Join Server</h2>
                    <button onClick={onClose}>Close</button>
                </div>

                <div className="backend-add-row">
                    <input
                        type="text"
                        placeholder="http://localhost:3000"
                        value={backendUrl}
                        onChange={(e) => setBackendUrl(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                handleJoin();
                            }
                        }}
                    />
                    <button onClick={handleJoin} disabled={loading}>
                        {loading ? "Joining..." : "Join"}
                    </button>
                </div>

                {error && <p className="auth-error">{error}</p>}
            </div>
        </div>
    );
}