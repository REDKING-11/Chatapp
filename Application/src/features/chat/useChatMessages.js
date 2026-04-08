import { useEffect, useState } from "react";
import {
    fetchChannelMessages,
    createMessage,
    updateMessage,
    removeMessage
} from "./actions";

function isExpectedOfflineMessageError(error) {
    return /server is offline|cannot be loaded right now|unreachable/i.test(String(error?.message || ""));
}

export default function useChatMessages({ channelId, currentUser, backendUrl }) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        async function loadMessages() {
            if (!channelId || !currentUser || !backendUrl) return;

            setLoading(true);

            try {
                const data = await fetchChannelMessages({ backendUrl, channelId });
                setMessages(data);
            } catch (err) {
                setMessages([]);

                if (!isExpectedOfflineMessageError(err)) {
                    console.error("Failed to load messages:", err);
                }
            } finally {
                setLoading(false);
            }
        }

        loadMessages();
    }, [channelId, currentUser, backendUrl]);

    async function sendNewMessage({ content, replyTo }) {
        setSending(true);
        try {
            const newMessage = await createMessage({
                backendUrl,
                channelId,
                content,
                replyTo
            });
            setMessages((prev) => [...prev, newMessage]);
            return newMessage;
        } catch (err) {
            console.error("Send failed:", err);
            throw err; // IMPORTANT
        } finally {
            setSending(false);
        }
    }

    async function editExistingMessage({ messageId, content }) {
        setSending(true);

        try {
            const updatedMessage = await updateMessage({
                backendUrl,
                messageId,
                content
            });

            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === updatedMessage.id ? updatedMessage : msg
                )
            );

            return updatedMessage;
        } finally {
            setSending(false);
        }
    }

    async function deleteExistingMessage(messageId) {
        try {
            const result = await removeMessage({ backendUrl, messageId });

            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === result.message.id ? result.message : msg
                )
            );
        } catch (err) {
            console.error("Failed to delete message:", err);
        }
    }

    return {
        messages,
        loading,
        sending,
        sendNewMessage,
        editExistingMessage,
        deleteExistingMessage
    };
}
