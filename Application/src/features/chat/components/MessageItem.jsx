export default function MessageItem({
    message,
    messageMap,
    currentUser,
    onReply,
    onEdit,
    onDelete
}) {
    const repliedMessage = message.replyTo
        ? messageMap[message.replyTo]
        : null;

    const isOwnMessage =
        message.userId != null
            ? String(message.userId) === String(currentUser.id)
            : message.author === currentUser.username;

    return (
        <div className="message-card">
            {message.replyTo && (
                <div className="reply-preview">
                    {repliedMessage ? (
                        repliedMessage.isDeleted ? (
                            <em>Original message was deleted</em>
                        ) : (
                            <>
                                <strong>{repliedMessage.author}</strong>: {repliedMessage.content}
                            </>
                        )
                    ) : (
                        <em>Original message not found</em>
                    )}
                </div>
            )}

            <div className={message.isDeleted ? "deleted-message" : ""}>
                <strong>{message.author}:</strong>{" "}
                <span className={message.isDeleted ? "deleted-content" : ""}>
                    {message.content}
                </span>
                {message.updatedAt && !message.isDeleted && (
                    <span className="edited-tag"> (edited)</span>
                )}
            </div>

            {!message.isDeleted && (
                <div className="message-actions">
                    <button onClick={() => onReply(message)}>Reply</button>

                    {isOwnMessage && (
                        <>
                            <button onClick={() => onEdit(message)}>Edit</button>
                            <button onClick={() => onDelete(message.id)}>Delete</button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}