export default function FriendRemovalConfirmModal({
    confirmation,
    submitting,
    onCancel,
    onConfirm
}) {
    if (!confirmation) {
        return null;
    }

    const friendUsername = confirmation.friend.friendUsername;

    return (
        <div
            className="friends-settings-overlay"
            onClick={() => {
                if (!submitting) {
                    onCancel();
                }
            }}
        >
            <div
                className="friends-confirm-popout panel-card"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="friends-settings-header">
                    <div>
                        <h2>{confirmation.hardDelete ? "Hard delete friend?" : "Remove friend?"}</h2>
                        <p>
                            {confirmation.hardDelete
                                ? `Remove ${friendUsername} and delete your local conversation history on this device. This cannot delete copies on other devices.`
                                : `Remove ${friendUsername} from your friends list. Re-adding the same friend later will restore this hidden conversation.`}
                        </p>
                    </div>
                </div>

                <div className="friends-confirm-actions">
                    <button
                        type="button"
                        className="friends-secondary-button"
                        onClick={onCancel}
                        disabled={submitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="server-context-item danger friends-confirm-danger"
                        onClick={onConfirm}
                        disabled={submitting}
                    >
                        {submitting
                            ? "Removing..."
                            : confirmation.hardDelete
                                ? "Hard delete"
                                : "Remove friend"}
                    </button>
                </div>
            </div>
        </div>
    );
}
