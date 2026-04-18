import { replaceInlineImageMarkdownWithPlainText } from "../../dm/inlineEmbeds.js";

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

export function getMessagePreviewText(message) {
    const body = replaceInlineImageMarkdownWithPlainText(message?.body).trim();

    if (body) {
        return body;
    }

    const embeds = Array.isArray(message?.embeds) ? message.embeds : [];
    if (embeds.length > 0) {
        return embeds.length === 1 ? "Photo" : `${embeds.length} photos`;
    }

    const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
    if (attachments.length > 0) {
        if (attachments.length === 1) {
            return String(attachments[0]?.fileName || "Attachment").trim() || "Attachment";
        }

        return `${attachments.length} attachments`;
    }

    return "";
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
        if (!getMessagePreviewText(message)) {
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
