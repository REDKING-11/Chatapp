export function truncatePreview(text, maxLength = 16) {
    const trimmed = String(text || "").trim();

    if (!trimmed) {
        return "";
    }

    if (trimmed.length <= maxLength) {
        return trimmed;
    }

    return `${trimmed.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function truncateNotificationBody(text, maxLength = 80) {
    return truncatePreview(text, maxLength);
}

export function getMessageTimestamp(message) {
    if (!message?.createdAt) {
        return null;
    }

    const timestamp = new Date(message.createdAt).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
}

export function getLatestMessageByTimestamp(messagesToCheck) {
    return (messagesToCheck || []).reduce((latestMessage, message) => {
        if (!message?.body) {
            return latestMessage;
        }

        if (!latestMessage) {
            return message;
        }

        const messageTimestamp = getMessageTimestamp(message) ?? 0;
        const latestTimestamp = getMessageTimestamp(latestMessage) ?? 0;
        return messageTimestamp >= latestTimestamp ? message : latestMessage;
    }, null);
}

export function getLatestIncomingMessageByTimestamp(messagesToCheck) {
    return getLatestMessageByTimestamp(
        (messagesToCheck || []).filter((message) => message.direction === "incoming")
    );
}

export function getPreviewTimestamp(preview) {
    if (!preview?.timestamp) {
        return null;
    }

    const timestamp = new Date(preview.timestamp).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
}

export function getPreviewIncomingTimestamp(preview) {
    if (!preview?.latestIncomingTimestamp) {
        return null;
    }

    const timestamp = new Date(preview.latestIncomingTimestamp).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
}
