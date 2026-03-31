import { useEffect, useState } from "react";

export default function ChatBlock({ channelId, currentUser, backendUrl }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [replyTo, setReplyTo] = useState(null);
    const [editingMessageId, setEditingMessageId] = useState(null);

    useEffect(() => {
        if (!channelId || !currentUser || !backendUrl) return;
        loadMessages();
    }, [channelId, currentUser, backendUrl]);

    async function loadMessages() {
        setLoading(true);

        try {
            const res = await fetch(`${backendUrl}/api/channels/${channelId}/messages`);
            const data = await res.json();
            setMessages(data);
        } catch (err) {
            console.error("Failed to load messages:", err);
        } finally {
            setLoading(false);
        }
    }

    async function sendMessage() {
        if (!input.trim()) return;

        setSending(true);

        try {
            if (editingMessageId) {
                const res = await fetch(`${backendUrl}/api/messages/${editingMessageId}`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${localStorage.getItem("authToken")}`
                    },
                    body: JSON.stringify({
                        content: input,
                        replyTo: replyTo?.id || null
                    })
                });

                const updatedMessage = await res.json();

                setMessages((prev) =>
                    prev.map((msg) =>
                        msg.id === updatedMessage.id ? updatedMessage : msg
                    )
                );

                setEditingMessageId(null);
            } else {
                const res = await fetch(`${backendUrl}/api/channels/${channelId}/messages`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${localStorage.getItem("authToken")}`
                    },
                    body: JSON.stringify({
                        content: input
                    })
                });

                const newMessage = await res.json();
                setMessages((prev) => [...prev, newMessage]);
                setReplyTo(null);
            }

            setInput("");
        } catch (err) {
            console.error("Failed to send or edit message:", err);
        } finally {
            setSending(false);
        }
    }

    async function deleteMessage(messageId) {
        try {
            const res = await fetch(`${backendUrl}/api/messages/${messageId}`, {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("authToken")}`
                },
                body: JSON.stringify({})
            });

            const result = await res.json();

            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === result.message.id ? result.message : msg
                )
            );
        } catch (err) {
            console.error("Failed to delete message:", err);
        }
    }

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
                {loading ? (
                    <p>Loading messages...</p>
                ) : messages.length === 0 ? (
                    <p>No messages yet.</p>
                ) : (
                    messages.map((message) => {
                        const repliedMessage = message.replyTo
                            ? messages.find((msg) => msg.id === message.replyTo)
                            : null;

                        return (
                            <div key={message.id} className="message-card">
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
                                        <button onClick={() => startReply(message)}>Reply</button>
                                        <button onClick={() => startEdit(message)}>Edit</button>
                                        <button onClick={() => deleteMessage(message.id)}>Delete</button>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {replyTo && (
                <div className="action-banner">
                    <span>
                        Replying to <strong>{replyTo.author}</strong>: {replyTo.content}
                    </span>
                    <button onClick={cancelAction}>Cancel</button>
                </div>
            )}

            {editingMessageId && (
                <div className="action-banner">
                    <span>Editing message</span>
                    <button onClick={cancelAction}>Cancel</button>
                </div>
            )}

            <div className="chat-input-row">
                <input
                    className="chat-input"
                    type="text"
                    value={input}
                    placeholder={
                        editingMessageId
                            ? "Edit message..."
                            : replyTo
                                ? "Write reply..."
                                : "Type a message..."
                    }
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            sendMessage();
                        }
                    }}
                />
                <button className="chat-send-button" onClick={sendMessage} disabled={sending}>
                    {sending
                        ? editingMessageId
                            ? "Saving..."
                            : "Sending..."
                        : editingMessageId
                            ? "Save"
                            : "Send"}
                </button>
            </div>
        </div>
    );
}