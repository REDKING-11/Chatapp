import MarkdownContent from "../../../components/MarkdownContent";
import MessageReactions from "../../../components/MessageReactions";

export default function MessageItem({
    message,
    messageMap,
    currentUser,
    markdownLinkContext = null,
    messageLinkBase = "",
    onReply,
    onEdit,
    onDelete,
    onToggleReaction,
    onCopyLink,
    isSelected = false,
    onSelect = null,
    openReactionPickerSignal = 0
}) {
    const repliedMessage = message.replyTo
        ? messageMap[message.replyTo]
        : null;

    const isOwnMessage =
        message.userId != null
            ? String(message.userId) === String(currentUser.id)
            : message.author === currentUser.username;

    return (
        <div
            data-message-id={message.id}
            className={`message-stack ${message.isDeleted ? "is-deleted" : ""} ${isSelected ? "is-selected" : ""}`.trim()}
            onClick={() => onSelect?.(message)}
        >
            <div className="message-card">
                {message.replyTo && (
                    <div className="reply-preview">
                        {repliedMessage ? (
                            repliedMessage.isDeleted ? (
                                <em>Original message was deleted</em>
                            ) : (
                                <>
                                    <strong>{repliedMessage.author}</strong>:{" "}
                                    <MarkdownContent
                                        as="span"
                                        className="markdown-inline"
                                        inline
                                        value={repliedMessage.content}
                                        linkContext={markdownLinkContext}
                                    />
                                </>
                            )
                        ) : (
                            <em>Original message not found</em>
                        )}
                    </div>
                )}

                <div className={message.isDeleted ? "deleted-message" : ""}>
                    <strong>{message.author}:</strong>{" "}
                    <div className={`${message.isDeleted ? "deleted-content" : ""} markdown-body`.trim()}>
                        <MarkdownContent
                            as="div"
                            value={message.content}
                            linkContext={markdownLinkContext}
                        />
                    </div>
                    {message.updatedAt && !message.isDeleted && (
                        <span className="edited-tag"> (edited)</span>
                    )}
                </div>

                {!message.isDeleted ? (
                    <MessageReactions
                        reactions={message.reactions}
                        currentUserId={currentUser?.id}
                        onToggleReaction={(emoji) => onToggleReaction?.(message, emoji)}
                        showAddButton={false}
                        className="message-reactions-inline"
                    />
                ) : null}
            </div>

            {!message.isDeleted && (
                <div className="message-footer-bar">
                    <div className="message-actions">
                        <button onClick={() => onReply(message)}>Reply</button>
                        {messageLinkBase ? (
                            <button onClick={() => onCopyLink?.(`${messageLinkBase}/message/${encodeURIComponent(String(message.id))}`)}>
                                Copy link
                            </button>
                        ) : null}

                        {isOwnMessage && (
                            <>
                                <button onClick={() => onEdit(message)}>Edit</button>
                                <button onClick={() => onDelete(message.id)}>Delete</button>
                            </>
                        )}
                    </div>

                    <MessageReactions
                        reactions={message.reactions}
                        currentUserId={currentUser?.id}
                        onToggleReaction={(emoji) => onToggleReaction?.(message, emoji)}
                        showEntries={false}
                        className="message-reactions-controls"
                        openPickerSignal={openReactionPickerSignal}
                    />
                </div>
            )}
        </div>
    );
}
