import { useState } from "react";
import { joinServer } from "../features/servers/actions";

export default function JoinServerModal({ onJoinSuccess, onClose }) {
    const [backendUrl, setBackendUrl] = useState("http://localhost:3000");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleJoin() {
        setLoading(true);
        setError("");

        try {
            const joinedServer = await joinServer({ backendUrl });
            onJoinSuccess(joinedServer);
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