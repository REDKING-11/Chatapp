import { useMemo } from "react";
import MessageItem from "./MessageItem";

export default function MessageList({
    messages,
    loading,
    currentUser,
    markdownLinkContext = null,
    messageLinkBase = "",
    onReply,
    onEdit,
    onDelete,
    onToggleReaction,
    onCopyText,
    onCopyLink,
    onTogglePin,
    pinnedMessageId = null,
    selectedMessageId = null,
    onSelectMessage = null,
    reactionPickerRequest = null
}) {
    if (loading) {
        return <p>Loading messages...</p>;
    }

    if (messages.length === 0) {
        return <p>No messages yet.</p>;
    }

    const messageMap = useMemo(() => {
        const map = {};
        for (const msg of messages) {
            map[msg.id] = msg;
        }
        return map;
    }, [messages]);

    return (
        <>
            {messages.map((message) => (
                <MessageItem
                    key={message.id}
                    message={message}
                    messageMap={messageMap}
                    currentUser={currentUser}
                    markdownLinkContext={markdownLinkContext}
                    messageLinkBase={messageLinkBase}
                    onReply={onReply}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onToggleReaction={onToggleReaction}
                    onCopyText={onCopyText}
                    onCopyLink={onCopyLink}
                    onTogglePin={onTogglePin}
                    isPinned={String(pinnedMessageId || "") === String(message.id)}
                    isSelected={String(selectedMessageId || "") === String(message.id)}
                    onSelect={onSelectMessage}
                    openReactionPickerSignal={
                        reactionPickerRequest?.messageId != null
                        && String(reactionPickerRequest.messageId) === String(message.id)
                            ? reactionPickerRequest.token
                            : 0
                    }
                />
            ))}
        </>
    );
}
