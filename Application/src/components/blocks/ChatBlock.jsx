import { useState } from "react";
import useChatMessages from "../../features/chat/useChatMessages";
import MessageList from "../../features/chat/components/MessageList";
import ChatActionBanner from "../../features/chat/components/ChatActionBanner";
import ChatComposer from "../../features/chat/components/ChatComposer";

export default function ChatBlock({ channelId, currentUser, backendUrl, onServerOffline }) {
    const [input, setInput] = useState("");
    const [replyTo, setReplyTo] = useState(null);
    const [editingMessageId, setEditingMessageId] = useState(null);

    const {
        messages,
        loading,
        sending,
        sendNewMessage,
        editExistingMessage,
        deleteExistingMessage
    } = useChatMessages({
        channelId,
        currentUser,
        backendUrl,
        onServerOffline
    });

    function startEdit(message) {
        if (message.isDeleted) return;
        setEditingMessageId(message.id);
        setInput(message.content);
        setReplyTo(null);
    }

    function startReply(message) {
        if (message.isDeleted) return;
        setReplyTo(message);
        setEditingMessageId(null);
        setInput("");
    }

    function cancelAction() {
        setReplyTo(null);
        setEditingMessageId(null);
        setInput("");
    }

    async function handleEdit() {
        if (!editingMessageId) return;

        await editExistingMessage({
            messageId: editingMessageId,
            content: input
        });

        setEditingMessageId(null);
        setInput("");
    }

    async function handleReplyOrSend() {
        await sendNewMessage({
            content: input,
            replyTo: replyTo?.id || null
        });

        setReplyTo(null);
        setInput("");
    }

    async function handleSend() {
        if (!input.trim()) return;

        try {
            if (editingMessageId) {
                await handleEdit();
            } else {
                await handleReplyOrSend();
            }
        } catch (err) {
            console.error("Failed to send or edit message:", err);
        }
    }

    if (!currentUser) {
        return (
            <div className="panel-card">
                <h3>Chat</h3>
                <p>No user loaded.</p>
            </div>
        );
    }

    return (
        <div className="panel-card">
            <h3>Chat</h3>

            <div className="demo-chat">
                <MessageList
                    messages={messages}
                    loading={loading}
                    currentUser={currentUser}
                    onReply={startReply}
                    onEdit={startEdit}
                    onDelete={deleteExistingMessage}
                />
            </div>

            <ChatActionBanner
                replyTo={replyTo}
                editingMessageId={editingMessageId}
                onCancel={cancelAction}
            />

            <ChatComposer
                input={input}
                onInputChange={setInput}
                onSend={handleSend}
                sending={sending}
                replyTo={replyTo}
                editingMessageId={editingMessageId}
            />
        </div>
    );
}
