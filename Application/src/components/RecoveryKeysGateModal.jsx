import { useMemo, useState } from "react";
import { regenerateRecoveryKeys } from "../features/auth/actions";
import { getStoredAuthToken } from "../features/session/actions";
import { formatAppError } from "../lib/debug";

function buildRecoveryKeyText(keys) {
    return (Array.isArray(keys) ? keys : [])
        .filter(Boolean)
        .map((key, index) => `${index + 1}. ${key}`)
        .join("\n");
}

function downloadRecoveryKeys(keys, handle) {
    const lines = [
        "Chatapp recovery keys",
        handle ? `Account: ${handle}` : "",
        "",
        buildRecoveryKeyText(keys),
        "",
        "Each key works once. Generating a new batch invalidates old unused keys."
    ].filter(Boolean);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `chatapp-recovery-keys-${handle || "account"}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

export default function RecoveryKeysGateModal({
    currentUser,
    recoveryKeys,
    onUserUpdated,
    onRecoveryKeysChange,
    onLogout
}) {
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");
    const keyText = useMemo(() => buildRecoveryKeyText(recoveryKeys), [recoveryKeys]);

    async function handleGenerateKeys() {
        const token = getStoredAuthToken();
        if (!token) {
            setError("Your session expired before recovery keys could be generated.");
            return;
        }

        try {
            setBusy(true);
            setError("");
            setNotice("");
            const data = await regenerateRecoveryKeys({ token });
            onRecoveryKeysChange?.(data.recoveryKeys || []);
            onUserUpdated?.(data.user);
            setNotice("These keys are only shown once. Copy or download them before you continue.");
        } catch (generationError) {
            setError(formatAppError(generationError, {
                fallbackMessage: "Could not generate recovery keys right now.",
                context: "Recovery keys"
            }).message);
        } finally {
            setBusy(false);
        }
    }

    async function handleCopyKeys() {
        if (!keyText) {
            return;
        }

        try {
            await navigator.clipboard.writeText(keyText);
            setNotice("Recovery keys copied to your clipboard.");
            setError("");
        } catch {
            setError("Could not copy recovery keys to the clipboard on this device.");
        }
    }

    const handleLabel = currentUser?.handle || currentUser?.username || "this account";

    return (
        <div className="recovery-gate-overlay">
            <div className="recovery-gate-modal panel-card" onClick={(event) => event.stopPropagation()}>
                <div className="recovery-gate-badge">Required before continuing</div>
                <h2>Save recovery keys for {handleLabel}</h2>
                <p>
                    Recovery keys are your last self-service fallback if you lose both your password and your other recovery methods.
                </p>
                <p>
                    Generate a new batch, store it somewhere safe, and then confirm you saved it before you keep using Chatapp.
                </p>

                {recoveryKeys.length > 0 ? (
                    <div className="recovery-gate-key-block">
                        {recoveryKeys.map((key) => (
                            <code key={key}>{key}</code>
                        ))}
                    </div>
                ) : null}

                <div className="recovery-gate-actions">
                    <button type="button" onClick={handleGenerateKeys} disabled={busy}>
                        {busy ? "Generating..." : recoveryKeys.length > 0 ? "Generate a new batch" : "Generate recovery keys"}
                    </button>
                    {recoveryKeys.length > 0 ? (
                        <>
                            <button type="button" className="secondary" onClick={handleCopyKeys} disabled={busy}>
                                Copy keys
                            </button>
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => downloadRecoveryKeys(recoveryKeys, currentUser?.handle || currentUser?.username)}
                                disabled={busy}
                            >
                                Download .txt
                            </button>
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => {
                                    onRecoveryKeysChange?.([]);
                                    setNotice("");
                                    setError("");
                                }}
                                disabled={busy}
                            >
                                I saved these
                            </button>
                        </>
                    ) : null}
                    <button type="button" className="danger" onClick={onLogout} disabled={busy}>
                        Logout
                    </button>
                </div>

                {notice ? <p className="client-settings-muted">{notice}</p> : null}
                {error ? <p className="auth-error">{error}</p> : null}
            </div>
        </div>
    );
}
