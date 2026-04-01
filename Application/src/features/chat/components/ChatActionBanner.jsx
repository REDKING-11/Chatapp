export default function ChatActionBanner({
    replyTo,
    editingMessageId,
    onCancel
}) {
    if (!replyTo && !editingMessageId) {
        return null;
    }

    if (replyTo) {
        return (
            <div className="action-banner">
                <span>
                    Replying to <strong>{replyTo.author}</strong>: {replyTo.content}
                </span>
                <button onClick={onCancel}>Cancel</button>
            </div>
        );
    }

    if (editingMessageId) {
        return (
            <div className="action-banner">
                <span>Editing message</span>
                <button onClick={onCancel}>Cancel</button>
            </div>
        );
    }

    return null;
}