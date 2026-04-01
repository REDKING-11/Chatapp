import { useMemo } from "react";
import MessageItem from "./MessageItem";

export default function MessageList({
    messages,
    loading,
    currentUser,
    onReply,
    onEdit,
    onDelete
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
                    onReply={onReply}
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            ))}
        </>
    );
}