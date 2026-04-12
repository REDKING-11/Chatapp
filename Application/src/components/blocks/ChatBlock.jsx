import { useEffect, useMemo, useState } from "react";
import useChatMessages from "../../features/chat/useChatMessages";
import MessageList from "../../features/chat/components/MessageList";
import ChatActionBanner from "../../features/chat/components/ChatActionBanner";
import ChatComposer from "../../features/chat/components/ChatComposer";
import { buildAppLinkContext } from "../../lib/appLinks";

export default function ChatBlock({
    channelId,
    channels = [],
    currentUser,
    backendUrl,
    currentServerId = null,
    currentServerName = "",
    onServerOffline
}) {
    const [input, setInput] = useState("");
    const [replyTo, setReplyTo] = useState(null);
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [selectedMessageId, setSelectedMessageId] = useState(null);
    const [reactionPickerRequest, setReactionPickerRequest] = useState(null);
    const [fileShortcutSignal, setFileShortcutSignal] = useState(0);
    const [focusMessageRequest, setFocusMessageRequest] = useState(null);

    const {
        messages,
        loading,
        sending,
        sendNewMessage,
        editExistingMessage,
        deleteExistingMessage,
        toggleReaction
    } = useChatMessages({
        channelId,
        currentUser,
        backendUrl,
        onServerOffline
    });

    const markdownLinkContext = useMemo(() => {
        const users = Array.from(new Map(
            messages
                .filter((message) => message.userId != null || message.author)
                .map((message) => [
                    String(message.userId ?? message.author),
                    {
                        id: message.userId ?? null,
                        targetId: message.userId ?? null,
                        scope: message.userId != null && String(message.userId) !== String(currentUser?.id) ? "friend" : "self",
                        username: message.author,
                        label: message.author
                    }
                ])
        ).values());

        return buildAppLinkContext({
            currentUser,
            users,
            channels: (channels || []).map((channel) => ({
                ...channel,
                serverId: currentServerId,
                serverName: currentServerName
            })),
            currentServerId,
            currentServerName,
            includeEveryone: true
        });
    }, [channels, currentServerId, currentServerName, currentUser, messages]);
    const messageLinkBase = currentServerId != null && channelId != null
        ? `chatapp://server/${encodeURIComponent(String(currentServerId))}/channel/${encodeURIComponent(String(channelId))}`
        : "";

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

    useEffect(() => {
        function handleShortcut(event) {
            const action = event.detail?.action;
            const scope = event.detail?.scope;

            if (scope && scope !== "chat") {
                return;
            }

            if (action === "openReactionPicker") {
                const targetMessage = messages.find((message) => String(message.id) === String(selectedMessageId))
                    || [...messages].reverse().find((message) => !message.isDeleted);

                if (targetMessage) {
                    setSelectedMessageId(targetMessage.id);
                    setReactionPickerRequest({
                        messageId: targetMessage.id,
                        token: Date.now()
                    });
                }
                return;
            }

            if (action === "attachFile") {
                setFileShortcutSignal(Date.now());
                return;
            }

            if (action === "editLastMessage" && !input.trim()) {
                const lastOwnMessage = [...messages].reverse().find((message) => (
                    !message.isDeleted
                    && (
                        message.userId != null
                            ? String(message.userId) === String(currentUser?.id)
                            : message.author === currentUser?.username
                    )
                ));

                if (lastOwnMessage) {
                    startEdit(lastOwnMessage);
                    setSelectedMessageId(lastOwnMessage.id);
                }
            }
        }

        window.addEventListener("chatapp-shortcut", handleShortcut);
        return () => window.removeEventListener("chatapp-shortcut", handleShortcut);
    }, [currentUser?.id, currentUser?.username, input, messages, selectedMessageId]);

    useEffect(() => {
        function handleFocusMessage(event) {
            const { scope, channelId: targetChannelId, messageId, token } = event.detail || {};

            if (scope !== "chat" || messageId == null) {
                return;
            }

            if (targetChannelId != null && String(targetChannelId) !== String(channelId)) {
                return;
            }

            setFocusMessageRequest({
                messageId: String(messageId),
                token: token || Date.now()
            });
        }

        window.addEventListener("chatapp-focus-message", handleFocusMessage);
        return () => window.removeEventListener("chatapp-focus-message", handleFocusMessage);
    }, [channelId]);

    useEffect(() => {
        if (!focusMessageRequest) {
            return;
        }

        const targetMessage = messages.find((message) => String(message.id) === String(focusMessageRequest.messageId));
        if (!targetMessage) {
            return;
        }

        setSelectedMessageId(targetMessage.id);
        const matchingNode = Array.from(document.querySelectorAll(".message-stack[data-message-id]"))
            .find((node) => node.getAttribute("data-message-id") === String(targetMessage.id));

        if (matchingNode) {
            matchingNode.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }

        setFocusMessageRequest(null);
    }, [focusMessageRequest, messages]);

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
                    markdownLinkContext={markdownLinkContext}
                    messageLinkBase={messageLinkBase}
                    onReply={startReply}
                    onEdit={startEdit}
                    onDelete={deleteExistingMessage}
                    onToggleReaction={(message, emoji) => toggleReaction({ messageId: message.id, emoji })}
                    onCopyLink={async (href) => {
                        try {
                            await navigator.clipboard.writeText(href);
                        } catch (error) {
                            console.error("Failed to copy message link:", error);
                        }
                    }}
                    selectedMessageId={selectedMessageId}
                    onSelectMessage={(message) => setSelectedMessageId(message.id)}
                    reactionPickerRequest={reactionPickerRequest}
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
                shortcutScope="chat"
                openFileSignal={fileShortcutSignal}
                linkContext={markdownLinkContext}
            />
        </div>
    );
}
