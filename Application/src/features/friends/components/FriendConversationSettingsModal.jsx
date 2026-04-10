import { RELAY_RETENTION_OPTIONS } from "../../dm/actions";

export default function FriendConversationSettingsModal({
    selectedFriend,
    effectiveSelectedFriend,
    selectedRelayTtlSeconds,
    relayPolicy,
    pendingRelayRequest,
    pendingRequestedByFriend,
    pendingRelayLabel,
    currentRelayLabel,
    submitting,
    onClose,
    onUndoForget,
    onRelayTtlChange,
    onRetentionRequest,
    onRetentionAccept
}) {
    if (!selectedFriend) {
        return null;
    }

    return (
        <div className="friends-settings-overlay" onClick={onClose}>
            <div className="friends-settings-popout panel-card" onClick={(event) => event.stopPropagation()}>
                <div className="friends-settings-header">
                    <div>
                        <h2>Conversation settings</h2>
                        <p>Manage offline relay behavior for this DM.</p>
                    </div>

                    <button
                        type="button"
                        className="friends-settings-close"
                        onClick={onClose}
                    >
                        x
                    </button>
                </div>

                <div className="friends-retention-copy">
                    <strong>Offline relay window</strong>
                    <span>Current policy: {currentRelayLabel}</span>
                </div>

                {selectedFriend?.conversationId && !effectiveSelectedFriend?.conversationId ? (
                    <div className="friends-retention-pending">
                        <span>This device is set to forget the older conversation and start fresh.</span>
                        <button type="button" onClick={onUndoForget}>Undo</button>
                    </div>
                ) : null}

                <form className="friends-retention-controls" onSubmit={onRetentionRequest}>
                    <select
                        value={selectedRelayTtlSeconds}
                        onChange={(event) => onRelayTtlChange(Number(event.target.value))}
                        disabled={submitting}
                    >
                        {RELAY_RETENTION_OPTIONS.map((option) => (
                            <option key={option.seconds} value={option.seconds}>
                                {option.label}
                            </option>
                        ))}
                    </select>

                    <button
                        type="submit"
                        disabled={
                            submitting ||
                            (effectiveSelectedFriend?.conversationId
                                ? selectedRelayTtlSeconds === (relayPolicy?.currentSeconds ?? 0) &&
                                  relayPolicy?.pendingSeconds == null
                                : false)
                        }
                    >
                        {effectiveSelectedFriend?.conversationId ? "Request change" : "Use for first DM"}
                    </button>
                </form>

                {pendingRelayRequest ? (
                    <div className="friends-retention-pending">
                        <span>Pending change: {pendingRelayLabel}</span>

                        {pendingRequestedByFriend ? (
                            <button type="button" onClick={onRetentionAccept} disabled={submitting}>
                                Accept change
                            </button>
                        ) : (
                            <small>Waiting for your friend to accept.</small>
                        )}
                    </div>
                ) : (
                    <small className="friends-retention-note">
                        Both people must agree before the offline relay window changes.
                    </small>
                )}
            </div>
        </div>
    );
}
