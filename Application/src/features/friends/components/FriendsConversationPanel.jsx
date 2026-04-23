import { useEffect, useMemo, useRef, useState } from "react";
import {
    fetchProfileAssetBlobUrl,
    fetchProfileAssetManifest
} from "../../profile/actions";
import ComposerTools from "../../../components/ComposerTools";
import ComposerEntitySuggestions from "../../../components/ComposerEntitySuggestions";
import MarkdownContent from "../../../components/MarkdownContent";
import MarkdownPreview from "../../../components/MarkdownPreview";
import MessageReactions from "../../../components/MessageReactions";
import { buildAppLinkContext } from "../../../lib/appLinks";
import { applyComposerEntitySuggestion, getComposerEntitySuggestions } from "../../../lib/composerEntities";
import { isDebugModeEnabled } from "../../../lib/debug";
import { loadPinnedMessages, savePinnedMessages } from "../../../lib/messagePins";
import {
    filterReferencedInlineImageEmbeds,
    getLegacyInlineImageEmbeds,
    replaceInlineImageMarkdownWithPlainText
} from "../../dm/inlineEmbeds.js";
import {
    inspectInlineImageEmbedRenderable
} from "../../dm/inlineEmbedContracts.js";
import { traceInlineImageDiagnostic } from "../../dm/inlineEmbedTracing.js";
import { resolvePresenceMeta } from "../../presence";

function EmptyState({ title, description }) {
    return (
        <div className="friends-empty-state">
            <h2>{title}</h2>
            <p>{description}</p>
        </div>
    );
}

function isCurrentUserMessage(message, currentUser) {
    return message.direction === "outgoing"
        || (
            message.senderUserId != null
            && String(message.senderUserId) === String(currentUser?.id)
        );
}

function getCurrentUserChatLabel(currentUser, nameMode) {
    if (nameMode === "username") {
        return currentUser?.handle || currentUser?.username || "You";
    }

    return currentUser?.displayName
        || currentUser?.displayLabel
        || currentUser?.usernameBase
        || currentUser?.username
        || "You";
}

function getParticipantChatLabel(participant, nameMode) {
    if (nameMode === "username") {
        return participant?.handle || participant?.username || "Friend";
    }

    return participant?.displayName
        || participant?.displayLabel
        || participant?.usernameBase
        || participant?.username
        || "Friend";
}

function getDirectFriendChatLabel(directFriend, nameMode) {
    if (nameMode === "username") {
        return directFriend?.friendHandle || directFriend?.friendUsername || "Friend";
    }

    return directFriend?.friendDisplayName
        || directFriend?.friendUsernameBase
        || directFriend?.friendUsername
        || "Friend";
}

function getMessageDisplayName({ message, currentUser, participantsById, directFriend, nameMode }) {
    if (isCurrentUserMessage(message, currentUser)) {
        return getCurrentUserChatLabel(currentUser, nameMode);
    }

    const participant = participantsById?.[String(message.senderUserId)];
    return participant
        ? getParticipantChatLabel(participant, nameMode)
        : getDirectFriendChatLabel(directFriend, nameMode);
}

function getInitials(label) {
    const normalized = String(label || "").trim();
    return normalized ? normalized.slice(0, 1).toUpperCase() : "?";
}

function getCompactLabelPrefix(label, length) {
    const letters = String(label || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/gi, "");

    if (!letters) {
        return "?";
    }

    return letters.slice(0, Math.max(1, length)).toUpperCase();
}

function buildUniqueGroupInitials(participants, nameMode) {
    const labelsByUserId = Object.fromEntries((participants || []).map((participant) => [
        String(participant.userId),
        getParticipantChatLabel(participant, nameMode)
    ]));
    const userIds = Object.keys(labelsByUserId);
    const result = {};

    userIds.forEach((userId) => {
        const label = labelsByUserId[userId];
        const maxLength = Math.max(1, String(label || "").replace(/[^a-z0-9]/gi, "").length);
        let length = 1;

        while (length < maxLength) {
            const currentPrefix = getCompactLabelPrefix(label, length);
            const hasCollision = userIds.some((otherUserId) => (
                otherUserId !== userId
                && getCompactLabelPrefix(labelsByUserId[otherUserId], length) === currentPrefix
            ));

            if (!hasCollision) {
                break;
            }

            length += 1;
        }

        result[userId] = getCompactLabelPrefix(label, length);
    });

    return result;
}

function getMessageSenderUserId({ message, currentUser, directFriend }) {
    if (message.senderUserId != null) {
        return String(message.senderUserId);
    }

    if (message.direction === "outgoing" && currentUser?.id != null) {
        return String(currentUser.id);
    }

    if (message.direction === "incoming" && directFriend?.friendUserId != null) {
        return String(directFriend.friendUserId);
    }

    return "";
}

function getReplyPreviewBody(text) {
    const normalizedText = replaceInlineImageMarkdownWithPlainText(
        text && typeof text === "object" ? text.body : text
    );
    const trimmed = String(normalizedText || "").trim();

    if (!trimmed) {
        return "Message";
    }

    return trimmed.length > 72 ? `${trimmed.slice(0, 69).trimEnd()}...` : trimmed;
}

function getMessageBody(text) {
    const normalizedText = text && typeof text === "object" ? text.body : text;
    return String(normalizedText || "").trim();
}

function getMessageSearchBody(text) {
    const normalizedText = replaceInlineImageMarkdownWithPlainText(
        text && typeof text === "object" ? text.body : text
    );
    return String(normalizedText || "").trim();
}

function buildConversationLinkContext({ currentUser, participantsById = {}, directFriend = null }) {
    const users = [
        ...Object.values(participantsById || {}).map((participant) => ({
            id: participant.userId,
            targetId: participant.userId,
            scope: String(participant.userId) === String(currentUser?.id) ? "self" : "friend",
            username: participant.username,
            usernameBase: participant.usernameBase,
            handle: participant.handle,
            displayName: participant.displayName || participant.displayLabel,
            label: participant.username
        })),
        directFriend ? {
            id: directFriend.friendUserId,
            targetId: directFriend.friendUserId,
            scope: "friend",
            username: directFriend.friendUsername,
            usernameBase: directFriend.friendUsernameBase,
            handle: directFriend.friendHandle,
            displayName: directFriend.friendDisplayName,
            label: directFriend.friendUsername
        } : null
    ].filter(Boolean);

    return buildAppLinkContext({
        currentUser,
        users
    });
}

function formatFileSize(bytes) {
    const value = Math.max(0, Number(bytes) || 0);

    if (value >= 1024 * 1024) {
        return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    }

    if (value >= 1024) {
        return `${Math.round(value / 1024)} KB`;
    }

    return `${value} B`;
}

function getAttachmentKey(attachment) {
    return String(attachment?.shareId || attachment?.transferId || "");
}

function getAttachmentStatusLabel(transferState, progress, isOutgoing) {
    if (!transferState || transferState.status === "idle") {
        return isOutgoing ? "Ready to share" : "Available";
    }

    if (transferState.status === "requesting") {
        return "Waiting for sender";
    }

    if (transferState.status === "uploading") {
        return `Uploading ${progress}%`;
    }

    if (transferState.status === "downloading") {
        return `Downloading ${progress}%`;
    }

    if (transferState.status === "complete") {
        return "Complete";
    }

    return transferState.error || "Transfer failed";
}

function MessageAttachmentList({
    attachments,
    transferStates,
    isOutgoing,
    fileShareStates,
    onDownloadAttachment,
    onResetAttachmentShare
}) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
        return null;
    }

    return (
        <div className="message-attachment-list">
            {attachments.map((attachment) => {
                const attachmentKey = getAttachmentKey(attachment);
                const transferState = transferStates?.[attachmentKey] || null;
                const fileShareState = attachment?.shareId ? fileShareStates?.[String(attachment.shareId)] || null : null;
                const progress = Math.max(0, Math.min(100, Math.round(Number(transferState?.progress ?? 0))));
                const effectiveStatusLabel = fileShareState?.status === "missing"
                    ? "Deprecated - file missing"
                    : fileShareState?.status === "changed"
                        ? "Deprecated - replaced"
                        : fileShareState?.status === "deprecated"
                            ? "Deprecated"
                            : getAttachmentStatusLabel(transferState, progress, isOutgoing);
                const canDownload = !isOutgoing
                    && (!fileShareState || fileShareState.status === "active")
                    && (!transferState || ["idle", "error", "complete"].includes(transferState.status));
                const statusTone = transferState?.status === "error" || (fileShareState && fileShareState.status !== "active")
                    ? "is-error"
                    : transferState?.status === "complete"
                        ? "is-complete"
                        : transferState?.status && transferState.status !== "idle"
                            ? "is-active"
                            : "";

                return (
                    <div key={attachmentKey} className={`message-attachment-card ${fileShareState && fileShareState.status !== "active" ? "is-deprecated" : ""}`.trim()}>
                        <div className="message-attachment-header">
                            <div className="message-attachment-badge" aria-hidden="true">FILE</div>
                            <div className="message-attachment-meta">
                                <strong title={attachment.fileName}>{attachment.fileName}</strong>
                                <div className="message-attachment-details">
                                    <span>{formatFileSize(attachment.fileSize)}</span>
                                    {attachment.shareId ? (
                                        <small>{fileShareState?.status === "active" ? "Reusable share" : "Deprecated share"}</small>
                                    ) : null}
                                    {attachment.mimeType ? (
                                        <small>{attachment.mimeType}</small>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                        <div className="message-attachment-footer">
                            <span className={`message-attachment-status ${statusTone}`.trim()}>{effectiveStatusLabel}</span>
                            {canDownload ? (
                                <button type="button" className="message-attachment-button" onClick={() => onDownloadAttachment?.(attachment)}>
                                    Download
                                </button>
                            ) : null}
                            {isOutgoing && attachment.shareId && fileShareState?.status === "active" ? (
                                <button type="button" className="message-attachment-button is-secondary" onClick={() => onResetAttachmentShare?.(attachment)}>
                                    Reset link
                                </button>
                            ) : null}
                        </div>
                        {transferState && transferState.status !== "idle" && transferState.status !== "error" ? (
                            <div className="message-attachment-progress">
                                <div className="message-attachment-progress-bar">
                                    <span style={{ width: `${progress}%` }} />
                                </div>
                                <small>{effectiveStatusLabel}</small>
                            </div>
                        ) : null}
                        {fileShareState?.replacedByShareId ? (
                            <div className="message-attachment-share-note">
                                Replaced by a newer share link.
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}

function PendingAttachmentList({ attachments, onRemove }) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
        return null;
    }

    return (
        <div className="composer-attachment-list">
            {attachments.map((attachment) => (
                <div key={getAttachmentKey(attachment)} className={`composer-attachment-chip ${attachment.shareId ? "is-share" : ""}`.trim()}>
                    <span title={attachment.fileName}>{attachment.fileName}</span>
                    <small>{attachment.shareId ? "Reusable share" : formatFileSize(attachment.fileSize)}</small>
                    <button type="button" onClick={() => onRemove?.(getAttachmentKey(attachment))} aria-label={`Remove ${attachment.fileName}`}>
                        x
                    </button>
                </div>
            ))}
        </div>
    );
}

function useInlineImageRenderability(embed) {
    return useMemo(
        () => inspectInlineImageEmbedRenderable(embed),
        [embed?.dataBase64, embed?.id, embed?.mimeType]
    );
}

function InlineImageEmbedFigure({ embed, pending = false, onRemove = null, diagnosticContext = null }) {
    const renderability = useInlineImageRenderability(embed);
    const imageSrc = renderability.imageSrc;
    const [renderFailed, setRenderFailed] = useState(false);
    const debugMode = isDebugModeEnabled();
    const altText = String(embed?.alt || "Image");
    const metaText = [
        formatFileSize(embed?.byteLength),
        embed?.width && embed?.height ? `${embed.width}x${embed.height}` : ""
    ]
        .filter(Boolean)
        .join(" · ");

    useEffect(() => {
        setRenderFailed(false);
    }, [imageSrc]);

    useEffect(() => {
        if (renderability.ok) {
            if (pending) {
                traceInlineImageDiagnostic({
                    level: "info",
                    debugMode,
                    onceKey: `preview.pending:${String(embed?.id || "")}`,
                    stage: "preview.pending",
                    reason: "trace",
                    message: "Pending DM inline image preview resolved a usable image source.",
                    embed,
                    embedId: embed?.id,
                    body: String(diagnosticContext?.body || ""),
                    embeds: diagnosticContext?.embeds || [embed],
                    conversationId: diagnosticContext?.conversationId || "",
                    messageId: diagnosticContext?.messageId || "",
                    surface: diagnosticContext?.surface || "pending-preview"
                });
            }
            return;
        }

        traceInlineImageDiagnostic({
            level: "warning",
            stage: pending ? "preview.pending" : "preview.inlineEmbed",
            reason: pending ? "preview-source-missing" : "invalid-image-src",
            message: "DM inline image preview is missing a usable image source.",
            embed,
            embedId: embed?.id,
            body: String(diagnosticContext?.body || ""),
            embeds: diagnosticContext?.embeds || [embed],
            conversationId: diagnosticContext?.conversationId || "",
            messageId: diagnosticContext?.messageId || "",
            surface: diagnosticContext?.surface || (pending ? "pending-preview" : "inline-embed"),
            extraDetails: {
                renderabilityReason: renderability.reason
            }
        });
    }, [
        debugMode,
        diagnosticContext?.body,
        diagnosticContext?.conversationId,
        diagnosticContext?.embeds,
        diagnosticContext?.messageId,
        diagnosticContext?.surface,
        embed,
        pending,
        renderability.ok,
        renderability.reason
    ]);

    return (
        <figure className={`inline-image-embed ${pending ? "is-pending" : ""}`.trim()}>
            {imageSrc && !renderFailed ? (
                <img
                    src={imageSrc}
                    alt={altText}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => {
                        setRenderFailed(true);
                        traceInlineImageDiagnostic({
                            level: "warning",
                            stage: pending ? "preview.pending" : "preview.inlineEmbed",
                            reason: "render-error",
                            message: "DM inline image preview failed while the browser tried to render it.",
                            embed,
                            embedId: embed?.id,
                            body: String(diagnosticContext?.body || ""),
                            embeds: diagnosticContext?.embeds || [embed],
                            conversationId: diagnosticContext?.conversationId || "",
                            messageId: diagnosticContext?.messageId || "",
                            surface: diagnosticContext?.surface || (pending ? "pending-preview" : "inline-embed")
                        });
                    }}
                />
            ) : (
                <div className="inline-image-embed-fallback">
                    <strong>{altText}</strong>
                    <span>Could not render image.</span>
                </div>
            )}
            {pending ? (
                <figcaption className="inline-image-embed-caption">
                    <div className="inline-image-embed-meta">
                        <strong title={altText}>{altText}</strong>
                        {metaText ? <small>{metaText}</small> : null}
                    </div>
                    {onRemove ? (
                        <button type="button" onClick={() => onRemove?.(embed?.id)} aria-label={`Remove ${altText}`}>
                            x
                        </button>
                    ) : null}
                </figcaption>
            ) : null}
        </figure>
    );
}

function MessageInlineEmbedList({ embeds, diagnosticContext = null }) {
    if (!Array.isArray(embeds) || embeds.length === 0) {
        return null;
    }

    return (
        <div className="message-inline-embed-list">
            {embeds.map((embed, index) => (
                <InlineImageEmbedFigure
                    key={String(embed?.id || index)}
                    embed={embed}
                    diagnosticContext={diagnosticContext}
                />
            ))}
        </div>
    );
}

function PendingInlineEmbedList({ embeds, onRemove, diagnosticContext = null }) {
    if (!Array.isArray(embeds) || embeds.length === 0) {
        return null;
    }

    return (
        <div className="composer-inline-embed-list">
            {embeds.map((embed, index) => (
                <InlineImageEmbedFigure
                    key={String(embed?.id || index)}
                    embed={embed}
                    pending
                    onRemove={onRemove}
                    diagnosticContext={diagnosticContext}
                />
            ))}
        </div>
    );
}

function useFriendMessageAvatarUrls({ userIds, profileMediaHostUrl, enabled }) {
    const [avatarUrls, setAvatarUrls] = useState({});
    const userIdKey = useMemo(
        () => Array.from(new Set((userIds || []).filter(Boolean).map(String))).sort().join("|"),
        [userIds]
    );

    useEffect(() => {
        let cancelled = false;
        const ownedUrls = [];
        const normalizedUserIds = userIdKey ? userIdKey.split("|") : [];

        setAvatarUrls({});

        if (!enabled || !profileMediaHostUrl || normalizedUserIds.length === 0) {
            return () => { };
        }

        async function loadAvatarUrls() {
            const entries = await Promise.all(normalizedUserIds.map(async (userId) => {
                const manifest = await fetchProfileAssetManifest({
                    backendUrl: profileMediaHostUrl,
                    userId
                });

                if (!manifest?.avatar?.hasAsset) {
                    return null;
                }

                const avatarUrl = await fetchProfileAssetBlobUrl({
                    backendUrl: profileMediaHostUrl,
                    userId,
                    assetType: "avatar"
                });

                if (!avatarUrl) {
                    return null;
                }

                ownedUrls.push(avatarUrl);
                return [userId, avatarUrl];
            }));

            if (cancelled) {
                ownedUrls.forEach((url) => URL.revokeObjectURL(url));
                return;
            }

            setAvatarUrls(Object.fromEntries(entries.filter(Boolean)));
        }

        loadAvatarUrls();

        return () => {
            cancelled = true;
            ownedUrls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [enabled, profileMediaHostUrl, userIdKey]);

    return avatarUrls;
}

function buildPinnedScopeKey(kind, conversationId) {
    if (!conversationId) {
        return null;
    }

    return `${kind}:${String(conversationId)}`;
}

function resolvePinnedMessages(messages, pinnedMessages) {
    if (!Array.isArray(pinnedMessages) || pinnedMessages.length === 0) {
        return [];
    }

    return pinnedMessages.map((pinnedMessage) => {
        const messageId = pinnedMessage?.messageId;

        if (messageId == null) {
            return pinnedMessage;
        }

        return messages.find((message) => String(message.messageId) === String(messageId)) || pinnedMessage;
    });
}

function PinnedMessagesMenu({
    pinnedMessages,
    isOpen,
    onToggle,
    onJump,
    onUnpin
}) {
    const count = Array.isArray(pinnedMessages) ? pinnedMessages.length : 0;

    return (
        <div className="friends-pins-menu">
            <button
                type="button"
                className={`friends-pins-button ${isOpen ? "is-open" : ""}`.trim()}
                onClick={onToggle}
                aria-expanded={isOpen ? "true" : "false"}
            >
                <span className="friends-pins-button-label">Pins</span>
                <span className="friends-pins-button-count">{count}</span>
            </button>

            {isOpen ? (
                <div className="friends-pins-popover">
                    <div className="friends-pins-popover-header">
                        <strong>Pinned messages</strong>
                        <span>{count}</span>
                    </div>
                    {count === 0 ? (
                        <p className="friends-pins-empty">No pinned messages in this chat yet.</p>
                    ) : (
                        <div className="friends-pins-list">
                            {pinnedMessages.map((message) => (
                                <div key={String(message.messageId)} className="friends-pins-item">
                                    <div className="friends-pins-item-body">
                                        <strong>{message.author || "Message"}</strong>
                                        <span>{getMessageBody(message.body) || "Message"}</span>
                                    </div>
                                    <div className="friends-pins-item-actions">
                                        <button type="button" onClick={() => onJump?.(message)}>
                                            Jump
                                        </button>
                                        <button type="button" onClick={() => onUnpin?.(message)}>
                                            Unpin
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}

function normalizeConversationSearchQuery(value) {
    return String(value || "").trim().toLowerCase();
}

function messageMatchesSearch({ message, query, displayName = "" }) {
    const normalizedQuery = normalizeConversationSearchQuery(query);

    if (!normalizedQuery) {
        return true;
    }

    const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
    const searchText = [
        displayName,
        getMessageSearchBody(message?.body),
        getReplyPreviewBody(message?.replyTo?.body),
        ...attachments.map((attachment) => attachment?.fileName || "")
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return searchText.includes(normalizedQuery);
}

function getOutgoingDeliveryMeta(deliveryState) {
    if (deliveryState === "failed") {
        return {
            label: "Failed",
            tone: "is-failed"
        };
    }

    if (deliveryState === "queued") {
        return {
            label: "Offline relay",
            tone: "is-queued"
        };
    }

    return {
        label: "Sent securely",
        tone: "is-sent"
    };
}

function MessageList({
    messages,
    emptyText,
    messageListRef,
    currentUser,
    participantsById = {},
    directFriend = null,
    avatarUrls = {},
    groupInitialsByUserId = {},
    identityStyle = "profileMedia",
    nameMode = "displayName",
    messageAlignment = "split",
    onReply = null,
    onEdit = null,
    onDelete = null,
    onToggleReaction = null,
    onCopyMessage = null,
    onTogglePin = null,
    onDownloadAttachment = null,
    messageDeliveryById = {},
    transferStates = {},
    pinnedMessageIds = [],
    selectedMessageId = null,
    onSelectMessage = null,
    reactionPickerRequest = null,
    markdownLinkContext = null,
    secureDmImageMode = false,
    conversationId = ""
}) {
    const pinnedMessageIdSet = useMemo(
        () => new Set((Array.isArray(pinnedMessageIds) ? pinnedMessageIds : []).map(String)),
        [pinnedMessageIds]
    );
    const messageMap = useMemo(
        () => Object.fromEntries(messages.map((message) => [String(message.messageId), message])),
        [messages]
    );

    return (
        <div className={`friends-message-list align-${messageAlignment}`} ref={messageListRef}>
            {messages.length === 0 ? (
                <p className="friends-empty-messages">{emptyText}</p>
            ) : (
                messages.map((message) => {
                    const isOutgoing = isCurrentUserMessage(message, currentUser);
                    const displayName = getMessageDisplayName({
                        message,
                        currentUser,
                        participantsById,
                        directFriend,
                        nameMode
                    });
                    const senderUserId = getMessageSenderUserId({
                        message,
                        currentUser,
                        directFriend
                    });
                    const avatarUrl = identityStyle === "profileMedia" ? avatarUrls[senderUserId] : null;
                    const compactLabel = groupInitialsByUserId[senderUserId] || getInitials(displayName);
                    const messageBody = getMessageBody(message.body);
                    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
                    const embeds = Array.isArray(message.embeds) ? message.embeds : [];
                    const legacyEmbeds = secureDmImageMode
                        ? getLegacyInlineImageEmbeds(messageBody, embeds)
                        : embeds;
                    const repliedMessage = message.replyTo?.messageId
                        ? messageMap[String(message.replyTo.messageId)]
                        : null;
                    const deliveryMeta = isOutgoing
                        ? getOutgoingDeliveryMeta(
                            messageDeliveryById?.[String(message.messageId)]
                                || message.deliveryState
                                || "sent"
                        )
                        : null;
                    const replyAuthor = message.replyTo?.author
                        || (repliedMessage
                            ? getMessageDisplayName({
                                message: repliedMessage,
                                currentUser,
                                participantsById,
                                directFriend,
                                nameMode
                            })
                            : "Message");

                    return (
                        <div
                            key={message.messageId}
                            data-message-id={message.messageId}
                            className={`friend-message-row ${identityStyle === "minimal" ? "is-minimal" : ""} ${isOutgoing ? "outgoing-friend-row" : "incoming-friend-row"} ${String(selectedMessageId || "") === String(message.messageId) ? "is-selected" : ""}`}
                            onClick={() => onSelectMessage?.({ ...message, author: displayName })}
                        >
                            <div className="friend-message-avatar">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="" />
                                ) : (
                                    compactLabel
                                )}
                            </div>
                            <div className="friend-message-stack">
                                <div className={`friend-message-bubble ${isOutgoing ? "outgoing-friend-message" : "incoming-friend-message"}`}>
                                    <div className="friend-message-meta">
                                        <strong>{displayName}</strong>
                                        <time>{new Date(message.createdAt).toLocaleString()}</time>
                                        {message.editedAt ? <small>edited</small> : null}
                                        {deliveryMeta ? (
                                            <small className={`friend-message-delivery ${deliveryMeta.tone}`.trim()}>
                                                {deliveryMeta.label}
                                            </small>
                                        ) : null}
                                    </div>
                                    {message.replyTo ? (
                                        <div className="friend-message-reply-preview">
                                            <strong>{replyAuthor}</strong>
                                            <MarkdownContent
                                                as="span"
                                                className="markdown-inline"
                                                inline
                                                value={getReplyPreviewBody(message.replyTo.body || repliedMessage?.body)}
                                                allowImages={false}
                                                linkContext={markdownLinkContext}
                                            />
                                        </div>
                                    ) : null}
                                    {!message.isDeleted ? (
                                        <MessageInlineEmbedList
                                            embeds={legacyEmbeds}
                                            diagnosticContext={{
                                                body: messageBody,
                                                embeds,
                                                conversationId,
                                                messageId: message.messageId,
                                                surface: "message-legacy-embed"
                                            }}
                                        />
                                    ) : null}
                                    {messageBody || message.isDeleted ? (
                                        <MarkdownContent
                                            as="div"
                                            className={`${message.isDeleted ? "friend-message-deleted" : ""} markdown-body`.trim()}
                                            value={messageBody}
                                            allowImages={false}
                                            secureDmImageMode={secureDmImageMode}
                                            secureDmEmbeds={secureDmImageMode ? embeds : null}
                                            secureDmDiagnosticContext={secureDmImageMode ? {
                                                conversationId,
                                                messageId: message.messageId,
                                                surface: "message-markdown"
                                            } : null}
                                            linkContext={markdownLinkContext}
                                        />
                                    ) : null}
                                    <MessageAttachmentList
                                        attachments={attachments}
                                        transferStates={transferStates}
                                        isOutgoing={isOutgoing}
                                        fileShareStates={fileShareStates}
                                        onDownloadAttachment={(attachment) => onDownloadAttachment?.(message, attachment)}
                                        onResetAttachmentShare={isOutgoing ? onDirectResetAttachmentShare : null}
                                    />
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
                                {!message.isDeleted ? (
                                    <div className={`friend-message-footer ${isOutgoing ? "outgoing-friend-message" : "incoming-friend-message"}`}>
                                        <div className="friend-message-actions">
                                            {onReply ? (
                                                <button type="button" onClick={() => onReply({ ...message, author: displayName })}>
                                                    Reply
                                                </button>
                                            ) : null}
                                            {onCopyMessage ? (
                                                <button type="button" onClick={() => onCopyMessage({ ...message, author: displayName })}>
                                                    Copy text
                                                </button>
                                            ) : null}
                                            {onTogglePin ? (
                                                <button type="button" onClick={() => onTogglePin({ ...message, author: displayName })}>
                                                    {pinnedMessageIdSet.has(String(message.messageId)) ? "Unpin" : "Pin"}
                                                </button>
                                            ) : null}
                                            {isOutgoing && onEdit ? (
                                                <button type="button" onClick={() => onEdit({ ...message, author: displayName })}>
                                                    Edit
                                                </button>
                                            ) : null}
                                            {isOutgoing && onDelete ? (
                                                <button type="button" onClick={() => onDelete(message)}>
                                                    Delete
                                                </button>
                                            ) : null}
                                        </div>
                                        <MessageReactions
                                            reactions={message.reactions}
                                            currentUserId={currentUser?.id}
                                            onToggleReaction={(emoji) => onToggleReaction?.(message, emoji)}
                                            showEntries={false}
                                            className="message-reactions-controls"
                                            openPickerSignal={
                                                reactionPickerRequest?.messageId != null
                                                    && String(reactionPickerRequest.messageId) === String(message.messageId)
                                                    ? reactionPickerRequest.token
                                                    : 0
                                            }
                                        />
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}

function InlineNotice({ children, actions = null }) {
    return (
        <div className="friends-inline-request">
            <span>{children}</span>
            {actions ? <div className="friends-inline-request-actions">{actions}</div> : null}
        </div>
    );
}

function MessageActionBanner({ replyTo, editingMessage, onCancel }) {
    const activeMessage = editingMessage || replyTo;

    if (!activeMessage) {
        return null;
    }

    return (
        <div className="friends-message-action-banner">
            <span>
                {editingMessage ? "Editing" : "Replying to"}{" "}
                <strong>{activeMessage.author || "message"}</strong>
                {activeMessage.body ? `: ${getReplyPreviewBody(activeMessage.body)}` : ""}
            </span>
            <button type="button" onClick={onCancel}>
                Cancel
            </button>
        </div>
    );
}

function DirectEncryptionStage({
    lockPhase,
    submitting,
    effectiveSelectedFriend,
    onEncryptChat,
    errorMessage
}) {
    return (
        <div className={`friends-encryption-stage ${lockPhase === "open" ? "is-open" : ""} ${lockPhase === "closing" ? "is-closing" : ""} ${lockPhase === "closed" ? "is-closed" : ""}`}>
            <div className="friends-encryption-lock" aria-hidden="true">
                <div className="friends-encryption-shackle" />
                <div className="friends-encryption-body">
                    <div className="friends-encryption-keyhole" />
                </div>
            </div>
            <strong>
                {lockPhase === "closed"
                    ? "Chat secured"
                    : submitting
                        ? "Encrypting chat..."
                        : "Chat is locked"}
            </strong>
            <div className="friends-encryption-stage-actions">
                <p>
                    {lockPhase === "closed"
                        ? "Secure DM ready. Opening your encrypted conversation."
                        : submitting
                            ? "Creating the secure DM and sharing the encryption key."
                            : "You need to encrypt this chat before messages can be sent."}
                </p>
                {!effectiveSelectedFriend?.conversationId ? (
                    <button
                        type="button"
                        className={`friends-encrypt-button ${submitting ? "is-busy" : ""}`}
                        onClick={onEncryptChat}
                        disabled={submitting}
                    >
                        <span className="friends-encrypt-lock" aria-hidden="true">🔒</span>
                        <span>{submitting ? "Encrypting..." : "Encrypt chat"}</span>
                    </button>
                ) : null}
                {errorMessage ? (
                    <p className="friends-error">{errorMessage}</p>
                ) : null}
            </div>
        </div>
    );
}

function GroupConversationView({
    currentUser,
    profileMediaHostUrl,
    clientSettings,
    selectedGroupConversation,
    activeGroupParticipantNames,
    shouldShowMissingGroupConversationAccessNotice,
    groupMessages,
    groupComposer,
    groupReplyTo,
    groupEditingMessage,
    submitting,
    canComposeGroupMessage,
    messageListRef,
    onGroupComposerChange,
    onSendGroupMessage,
    onGroupReply,
    onGroupEdit,
    onGroupDelete,
    onGroupToggleReaction,
    onGroupPickAttachment,
    onGroupRemoveAttachment,
    onGroupDownloadAttachment,
    groupAttachments,
    transferStates,
    onCancelGroupAction
}) {
    const composerRef = useRef(null);
    const [selectedMessageId, setSelectedMessageId] = useState(null);
    const [reactionPickerRequest, setReactionPickerRequest] = useState(null);
    const [fileShortcutSignal, setFileShortcutSignal] = useState(0);
    const [cursorPosition, setCursorPosition] = useState(0);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
    const canSubmitGroupMessage = canComposeGroupMessage && (Boolean(groupComposer.trim()) || groupAttachments.length > 0);
    const [searchQuery, setSearchQuery] = useState("");
    const [pinsMenuOpen, setPinsMenuOpen] = useState(false);
    const pinnedScopeKey = useMemo(
        () => buildPinnedScopeKey("group", selectedGroupConversation?.id),
        [selectedGroupConversation?.id]
    );
    const [pinnedMessages, setPinnedMessages] = useState(() => loadPinnedMessages(pinnedScopeKey));
    const participantsById = Object.fromEntries(
        (selectedGroupConversation?.participants || []).map((participant) => [
            String(participant.userId),
            participant
        ])
    );
    const avatarUserIds = useMemo(
        () => (selectedGroupConversation?.participants || [])
            .map((participant) => participant.userId)
            .filter(Boolean),
        [selectedGroupConversation?.participants]
    );
    const identityStyle = clientSettings?.chatIdentityStyle || "profileMedia";
    const nameMode = clientSettings?.chatNameMode || "displayName";
    const messageAlignment = clientSettings?.chatMessageAlignment || "split";
    const groupInitialsByUserId = useMemo(
        () => buildUniqueGroupInitials(selectedGroupConversation?.participants || [], nameMode),
        [selectedGroupConversation?.participants, nameMode]
    );
    const avatarUrls = useFriendMessageAvatarUrls({
        userIds: avatarUserIds,
        profileMediaHostUrl,
        enabled: identityStyle === "profileMedia" && clientSettings?.autoLoadProfileAvatars !== false
    });
    const markdownLinkContext = useMemo(
        () => buildConversationLinkContext({
            currentUser,
            participantsById
        }),
        [currentUser, participantsById]
    );
    const entitySuggestions = useMemo(
        () => getComposerEntitySuggestions(groupComposer, cursorPosition, markdownLinkContext),
        [cursorPosition, groupComposer, markdownLinkContext]
    );
    const resolvedPinnedMessages = useMemo(
        () => resolvePinnedMessages(groupMessages, pinnedMessages),
        [groupMessages, pinnedMessages]
    );
    const filteredGroupMessages = useMemo(() => {
        const normalizedQuery = normalizeConversationSearchQuery(searchQuery);

        if (!normalizedQuery) {
            return groupMessages;
        }

        return groupMessages.filter((message) => {
            const displayName = getMessageDisplayName({
                message,
                currentUser,
                participantsById,
                nameMode
            });

            return messageMatchesSearch({
                message,
                query: normalizedQuery,
                displayName
            });
        });
    }, [currentUser, groupMessages, nameMode, participantsById, searchQuery]);

    useEffect(() => {
        setActiveSuggestionIndex(0);
    }, [entitySuggestions?.token, entitySuggestions?.items?.length]);

    useEffect(() => {
        setSearchQuery("");
    }, [selectedGroupConversation?.id]);

    useEffect(() => {
        setPinnedMessages(loadPinnedMessages(pinnedScopeKey));
        setPinsMenuOpen(false);
    }, [pinnedScopeKey]);

    useEffect(() => {
        function handleShortcut(event) {
            const { action, scope } = event.detail || {};

            if (scope && scope !== "group") {
                return;
            }

            if (action === "focusComposer") {
                composerRef.current?.focus();
                return;
            }

            if (action === "attachFile") {
                setFileShortcutSignal(Date.now());
                return;
            }

            if (action === "openReactionPicker") {
                const targetMessage = groupMessages.find((message) => String(message.messageId) === String(selectedMessageId))
                    || [...groupMessages].reverse().find((message) => !message.isDeleted);

                if (targetMessage) {
                    setSelectedMessageId(targetMessage.messageId);
                    setReactionPickerRequest({
                        messageId: targetMessage.messageId,
                        token: Date.now()
                    });
                }
                return;
            }

            if (action === "editLastMessage" && !groupComposer.trim()) {
                const lastOwnMessage = [...groupMessages].reverse().find((message) => (
                    !message.isDeleted
                    && (
                        message.senderUserId != null
                            ? String(message.senderUserId) === String(currentUser?.id)
                            : message.direction === "outgoing"
                    )
                ));

                if (lastOwnMessage && onGroupEdit) {
                    onGroupEdit(lastOwnMessage);
                    setSelectedMessageId(lastOwnMessage.messageId);
                }
            }
        }

        window.addEventListener("chatapp-shortcut", handleShortcut);
        return () => window.removeEventListener("chatapp-shortcut", handleShortcut);
    }, [currentUser?.id, groupComposer, groupMessages, onGroupEdit, selectedMessageId]);

    useEffect(() => {
        if (selectedMessageId == null) {
            return;
        }

        const matchingNode = Array.from(document.querySelectorAll(".friend-message-row[data-message-id]"))
            .find((node) => node.getAttribute("data-message-id") === String(selectedMessageId));

        if (matchingNode) {
            matchingNode.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }
    }, [selectedMessageId]);

    if (!selectedGroupConversation) {
        return (
            <EmptyState
                title="Select a group"
                description="Create a group chat or pick one from the left to start messaging."
            />
        );
    }

    function updatePinnedMessages(nextMessages) {
        setPinnedMessages(savePinnedMessages(pinnedScopeKey, nextMessages));
    }

    async function handleCopyMessage(message) {
        const text = getMessageBody(message?.body);

        if (!text) {
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // ignore clipboard failures for now
        }
    }

    function handleTogglePinnedMessage(message) {
        if (!message?.messageId) {
            return;
        }

        const alreadyPinned = pinnedMessages.some(
            (entry) => String(entry?.messageId || "") === String(message.messageId)
        );

        if (alreadyPinned) {
            updatePinnedMessages(
                pinnedMessages.filter((entry) => String(entry?.messageId || "") !== String(message.messageId))
            );
            return;
        }

        updatePinnedMessages([
            {
                messageId: message.messageId,
                author: message.author,
                body: message.body
            },
            ...pinnedMessages.filter((entry) => String(entry?.messageId || "") !== String(message.messageId))
        ]);
    }

    return (
        <>
            <div className="friends-conversation-header">
                <div>
                    <h2>{selectedGroupConversation.title}</h2>
                    <p>
                        Encrypted group conversation
                        {activeGroupParticipantNames.length > 0
                            ? ` with ${activeGroupParticipantNames.join(", ")}`
                            : ""}
                    </p>
                </div>

                <div className="friends-conversation-header-actions">
                    <label className="friends-conversation-search" aria-label="Search this conversation">
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search chat"
                        />
                    </label>
                    <PinnedMessagesMenu
                        pinnedMessages={resolvedPinnedMessages}
                        isOpen={pinsMenuOpen}
                        onToggle={() => setPinsMenuOpen((prev) => !prev)}
                        onJump={(message) => {
                            setSelectedMessageId(message.messageId);
                            setPinsMenuOpen(false);
                        }}
                        onUnpin={(message) => {
                            updatePinnedMessages(
                                pinnedMessages.filter((entry) => String(entry?.messageId || "") !== String(message.messageId))
                            );
                        }}
                    />
                </div>
            </div>

            <div className="friends-inline-request">
                <span>
                    Members: {activeGroupParticipantNames.length > 0 ? activeGroupParticipantNames.join(", ") : "Just you for now"}
                </span>
            </div>

            {shouldShowMissingGroupConversationAccessNotice ? (
                <InlineNotice>
                    This device has not unlocked the active group conversation yet. Wait for the next message to sync it here, or import your DM device transfer package if this is a new device.
                </InlineNotice>
            ) : null}

            <MessageList
                messages={filteredGroupMessages}
                emptyText={normalizeConversationSearchQuery(searchQuery)
                    ? "No messages match your search."
                    : "No messages yet. Start the group conversation."}
                messageListRef={messageListRef}
                currentUser={currentUser}
                participantsById={participantsById}
                avatarUrls={avatarUrls}
                groupInitialsByUserId={groupInitialsByUserId}
                identityStyle={identityStyle}
                nameMode={nameMode}
                messageAlignment={messageAlignment}
                onReply={onGroupReply}
                onEdit={onGroupEdit}
                onDelete={onGroupDelete}
                onToggleReaction={onGroupToggleReaction}
                onCopyMessage={handleCopyMessage}
                onTogglePin={handleTogglePinnedMessage}
                onDownloadAttachment={onGroupDownloadAttachment}
                transferStates={transferStates}
                pinnedMessageIds={resolvedPinnedMessages.map((message) => message.messageId)}
                selectedMessageId={selectedMessageId}
                onSelectMessage={(message) => setSelectedMessageId(message.messageId)}
                reactionPickerRequest={reactionPickerRequest}
                markdownLinkContext={markdownLinkContext}
                conversationId={selectedGroupConversation?.id || ""}
            />

            <MessageActionBanner
                replyTo={groupReplyTo}
                editingMessage={groupEditingMessage}
                onCancel={onCancelGroupAction}
            />

            <form className="friend-composer" onSubmit={onSendGroupMessage}>
                <MarkdownPreview value={groupComposer} label="Message preview" allowImages={false} linkContext={markdownLinkContext} />
                <PendingAttachmentList attachments={groupAttachments} onRemove={onGroupRemoveAttachment} />
                <div className="friend-compose-row">
                    <ComposerTools
                        value={groupComposer}
                        onChange={onGroupComposerChange}
                        inputRef={composerRef}
                        disabled={!canComposeGroupMessage}
                        tools={groupEditingMessage ? [] : ["file"]}
                        iconOnly
                        className="composer-tools-left"
                        onPickFile={onGroupPickAttachment}
                        shortcutScope="group"
                        openFileSignal={fileShortcutSignal}
                    />
                    <div className="friend-textarea-shell">
                        <ComposerEntitySuggestions
                            suggestions={entitySuggestions}
                            activeIndex={activeSuggestionIndex}
                            onSelect={(item) => {
                                const next = applyComposerEntitySuggestion({
                                    value: groupComposer,
                                    selectionStart: composerRef.current?.selectionStart ?? cursorPosition,
                                    selectionEnd: composerRef.current?.selectionEnd ?? cursorPosition,
                                    suggestion: item,
                                    tokenRange: entitySuggestions
                                });
                                onGroupComposerChange(next.value);
                                window.requestAnimationFrame(() => {
                                    composerRef.current?.focus();
                                    composerRef.current?.setSelectionRange(next.cursorPosition, next.cursorPosition);
                                    setCursorPosition(next.cursorPosition);
                                });
                            }}
                        />
                        <textarea
                            ref={composerRef}
                            value={groupComposer}
                            onChange={(event) => {
                                onGroupComposerChange(event.target.value);
                                setCursorPosition(event.target.selectionStart ?? event.target.value.length);
                            }}
                            onClick={(event) => setCursorPosition(event.currentTarget.selectionStart ?? 0)}
                            onKeyUp={(event) => setCursorPosition(event.currentTarget.selectionStart ?? 0)}
                            onKeyDown={(event) => {
                                if (entitySuggestions?.items?.length) {
                                    if (event.key === "ArrowDown") {
                                        event.preventDefault();
                                        setActiveSuggestionIndex((prev) => (prev + 1) % entitySuggestions.items.length);
                                        return;
                                    }

                                    if (event.key === "ArrowUp") {
                                        event.preventDefault();
                                        setActiveSuggestionIndex((prev) => (prev - 1 + entitySuggestions.items.length) % entitySuggestions.items.length);
                                        return;
                                    }

                                    if (event.key === "Tab" || event.key === "Enter") {
                                        event.preventDefault();
                                        const item = entitySuggestions.items[activeSuggestionIndex] || entitySuggestions.items[0];
                                        if (item) {
                                            const next = applyComposerEntitySuggestion({
                                                value: groupComposer,
                                                selectionStart: event.currentTarget.selectionStart ?? cursorPosition,
                                                selectionEnd: event.currentTarget.selectionEnd ?? cursorPosition,
                                                suggestion: item,
                                                tokenRange: entitySuggestions
                                            });
                                            onGroupComposerChange(next.value);
                                            window.requestAnimationFrame(() => {
                                                composerRef.current?.focus();
                                                composerRef.current?.setSelectionRange(next.cursorPosition, next.cursorPosition);
                                                setCursorPosition(next.cursorPosition);
                                            });
                                        }
                                        return;
                                    }
                                }

                                if (event.key === "ArrowUp" && !groupComposer.trim()) {
                                    event.preventDefault();
                                    window.dispatchEvent(new CustomEvent("chatapp-shortcut", {
                                        detail: {
                                            action: "editLastMessage",
                                            scope: "group"
                                        }
                                    }));
                                    return;
                                }

                                if (event.ctrlKey && event.key === "Enter" && (groupComposer.trim() || groupAttachments.length > 0)) {
                                    event.preventDefault();
                                    onSendGroupMessage?.(event);
                                }
                            }}
                            placeholder={groupEditingMessage ? "Update message..." : groupReplyTo ? "Write reply..." : `Message ${selectedGroupConversation.title}`}
                            rows={3}
                            disabled={!canComposeGroupMessage}
                        />
                        <ComposerTools
                            value={groupComposer}
                            onChange={onGroupComposerChange}
                            inputRef={composerRef}
                            disabled={!canComposeGroupMessage}
                            tools={["emoji"]}
                            iconOnly
                            className="composer-tools-inline"
                            shortcutScope="group"
                        />
                    </div>
                    <button type="submit" className="friend-send-button" disabled={!canSubmitGroupMessage}>
                        {groupEditingMessage ? "Save" : "Send"}
                    </button>
                </div>
            </form>
        </>
    );
}

function DirectConversationView({
    currentUser,
    profileMediaHostUrl,
    clientSettings,
    presenceByUserId,
    selectedFriend,
    effectiveSelectedFriend,
    secureStatusRef,
    canRequestOldConversation,
    isForgettingOldConversation,
    shouldShowConversationRestartNotice,
    shouldShowMissingConversationAccessNotice,
    incomingHistoryRequest,
    outgoingHistoryRequest,
    pendingRequestedByFriend,
    pendingDisappearingRequestedByFriend,
    historyAccessRequest,
    pendingRelayLabel,
    pendingDisappearingLabel,
    submitting,
    showEncryptionStage,
    lockPhase,
    encryptChatError,
    messages,
    composer,
    directAttachments,
    directInlineEmbeds,
    directReplyTo,
    directEditingMessage,
    isDirectConversationEncrypted,
    canComposeDirectMessage,
    messageListRef,
    onOpenConversationSettings,
    onForgetOldConversation,
    onHistoryRequest,
    onHistoryDecline,
    onHistoryApprove,
    onRetentionAccept,
    onDisappearingAccept,
    onEncryptChat,
    onComposerChange,
    onSendMessage,
    onDirectReply,
    onDirectEdit,
    onDirectDelete,
    onDirectToggleReaction,
    onDirectPickAttachment,
    onDirectRemoveAttachment,
    onDirectRemoveInlineEmbed,
    onDirectDownloadAttachment,
    onDirectResetAttachmentShare,
    messageDeliveryById,
    transferStates,
    fileShareStates,
    onDirectComposerPaste,
    onCancelDirectAction
}) {
    const composerRef = useRef(null);
    const [selectedMessageId, setSelectedMessageId] = useState(null);
    const [reactionPickerRequest, setReactionPickerRequest] = useState(null);
    const [fileShortcutSignal, setFileShortcutSignal] = useState(0);
    const [cursorPosition, setCursorPosition] = useState(0);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [pinsMenuOpen, setPinsMenuOpen] = useState(false);
    const pinnedScopeKey = useMemo(
        () => buildPinnedScopeKey("direct", effectiveSelectedFriend?.conversationId || selectedFriend?.friendUserId),
        [effectiveSelectedFriend?.conversationId, selectedFriend?.friendUserId]
    );
    const [pinnedMessages, setPinnedMessages] = useState(() => loadPinnedMessages(pinnedScopeKey));
    const avatarUserIds = useMemo(
        () => [
            currentUser?.id,
            selectedFriend?.friendUserId
        ].filter(Boolean),
        [currentUser?.id, selectedFriend?.friendUserId]
    );
    const identityStyle = clientSettings?.chatIdentityStyle || "profileMedia";
    const nameMode = clientSettings?.chatNameMode || "displayName";
    const messageAlignment = clientSettings?.chatMessageAlignment || "split";
    const avatarUrls = useFriendMessageAvatarUrls({
        userIds: avatarUserIds,
        profileMediaHostUrl,
        enabled: identityStyle === "profileMedia" && clientSettings?.autoLoadProfileAvatars !== false
    });
    const markdownLinkContext = useMemo(
        () => buildConversationLinkContext({
            currentUser,
            directFriend: selectedFriend
        }),
        [currentUser, selectedFriend]
    );
    const entitySuggestions = useMemo(
        () => getComposerEntitySuggestions(composer, cursorPosition, markdownLinkContext),
        [composer, cursorPosition, markdownLinkContext]
    );
    const resolvedPinnedMessages = useMemo(
        () => resolvePinnedMessages(messages, pinnedMessages),
        [messages, pinnedMessages]
    );
    const selectedFriendPresence = resolvePresenceMeta(
        presenceByUserId?.[String(selectedFriend?.friendUserId)] || null
    );
    const referencedDirectInlineEmbeds = useMemo(
        () => filterReferencedInlineImageEmbeds(composer, directInlineEmbeds),
        [composer, directInlineEmbeds]
    );
    const canSubmitDirectMessage = canComposeDirectMessage && (
        Boolean(composer.trim())
        || directAttachments.length > 0
        || referencedDirectInlineEmbeds.length > 0
    );
    const filteredMessages = useMemo(() => {
        const normalizedQuery = normalizeConversationSearchQuery(searchQuery);

        if (!normalizedQuery) {
            return messages;
        }

        return messages.filter((message) => {
            const displayName = getMessageDisplayName({
                message,
                currentUser,
                directFriend: selectedFriend,
                nameMode
            });

            return messageMatchesSearch({
                message,
                query: normalizedQuery,
                displayName
            });
        });
    }, [currentUser, messages, nameMode, searchQuery, selectedFriend]);

    useEffect(() => {
        setActiveSuggestionIndex(0);
    }, [entitySuggestions?.token, entitySuggestions?.items?.length]);

    useEffect(() => {
        setSearchQuery("");
    }, [effectiveSelectedFriend?.conversationId, selectedFriend?.friendUserId]);

    useEffect(() => {
        setPinnedMessages(loadPinnedMessages(pinnedScopeKey));
        setPinsMenuOpen(false);
    }, [pinnedScopeKey]);

    useEffect(() => {
        function handleShortcut(event) {
            const { action, scope } = event.detail || {};

            if (scope && scope !== "direct") {
                return;
            }

            if (action === "focusComposer") {
                composerRef.current?.focus();
                return;
            }

            if (action === "attachFile") {
                setFileShortcutSignal(Date.now());
                return;
            }

            if (action === "openReactionPicker") {
                const targetMessage = messages.find((message) => String(message.messageId) === String(selectedMessageId))
                    || [...messages].reverse().find((message) => !message.isDeleted);

                if (targetMessage) {
                    setSelectedMessageId(targetMessage.messageId);
                    setReactionPickerRequest({
                        messageId: targetMessage.messageId,
                        token: Date.now()
                    });
                }
                return;
            }

            if (action === "editLastMessage" && !composer.trim()) {
                const lastOwnMessage = [...messages].reverse().find((message) => (
                    !message.isDeleted
                    && (
                        message.senderUserId != null
                            ? String(message.senderUserId) === String(currentUser?.id)
                            : message.direction === "outgoing"
                    )
                ));

                if (lastOwnMessage && onDirectEdit) {
                    onDirectEdit(lastOwnMessage);
                    setSelectedMessageId(lastOwnMessage.messageId);
                }
            }
        }

        window.addEventListener("chatapp-shortcut", handleShortcut);
        return () => window.removeEventListener("chatapp-shortcut", handleShortcut);
    }, [composer, currentUser?.id, messages, onDirectEdit, selectedMessageId]);

    useEffect(() => {
        if (selectedMessageId == null) {
            return;
        }

        const matchingNode = Array.from(document.querySelectorAll(".friend-message-row[data-message-id]"))
            .find((node) => node.getAttribute("data-message-id") === String(selectedMessageId));

        if (matchingNode) {
            matchingNode.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }
    }, [selectedMessageId]);

    if (!selectedFriend) {
        return (
            <EmptyState
                title="Select a friend"
                description="Choose a friend on the left to open your direct messages."
            />
        );
    }

    function updatePinnedMessages(nextMessages) {
        setPinnedMessages(savePinnedMessages(pinnedScopeKey, nextMessages));
    }

    async function handleCopyMessage(message) {
        const text = getMessageBody(message?.body);

        if (!text) {
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // ignore clipboard failures for now
        }
    }

    function handleTogglePinnedMessage(message) {
        if (!message?.messageId) {
            return;
        }

        const alreadyPinned = pinnedMessages.some(
            (entry) => String(entry?.messageId || "") === String(message.messageId)
        );

        if (alreadyPinned) {
            updatePinnedMessages(
                pinnedMessages.filter((entry) => String(entry?.messageId || "") !== String(message.messageId))
            );
            return;
        }

        updatePinnedMessages([
            {
                messageId: message.messageId,
                author: message.author,
                body: message.body
            },
            ...pinnedMessages.filter((entry) => String(entry?.messageId || "") !== String(message.messageId))
        ]);
    }

    return (
        <>
            <div className="friends-conversation-header">
                <div>
                    <div className="friends-user-presence">
                        <span
                            className={`friends-user-presence-dot is-${selectedFriendPresence.tone}`.trim()}
                            aria-hidden="true"
                        />
                        <div className="friends-user-presence-copy">
                            <h2>{selectedFriend.friendUsername}</h2>
                            <span className={`friends-user-presence-label is-${selectedFriendPresence.tone}`.trim()}>
                                {selectedFriendPresence.label}
                            </span>
                        </div>
                    </div>
                    <p className="friends-security-line">
                        <span
                            ref={secureStatusRef}
                            className={`friends-security-status ${effectiveSelectedFriend?.conversationId ? "is-secured" : "is-pending"}`}
                        >
                            <span className="friends-security-lock" aria-hidden="true">
                                {effectiveSelectedFriend?.conversationId ? "🔒" : "🔐"}
                            </span>
                            {effectiveSelectedFriend?.conversationId
                                ? "Your keys are shared and this DM is secured"
                                : "Press encrypt chat to establish the secure DM before you start talking."}
                        </span>
                    </p>
                </div>

                <div className="friends-conversation-header-actions">
                    <PinnedMessagesMenu
                        pinnedMessages={resolvedPinnedMessages}
                        isOpen={pinsMenuOpen}
                        onToggle={() => setPinsMenuOpen((prev) => !prev)}
                        onJump={(message) => {
                            setSelectedMessageId(message.messageId);
                            setPinsMenuOpen(false);
                        }}
                        onUnpin={(message) => {
                            updatePinnedMessages(
                                pinnedMessages.filter((entry) => String(entry?.messageId || "") !== String(message.messageId))
                            );
                        }}
                    />
                    <label className="friends-conversation-search" aria-label="Search this conversation">
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search chat"
                        />
                    </label>
                    <button
                        type="button"
                        className="friends-settings-button"
                        onClick={onOpenConversationSettings}
                    >
                        Conversation settings
                    </button>
                </div>
            </div>

            {canRequestOldConversation ? (
                <InlineNotice
                    actions={
                        <>
                            <button
                                type="button"
                                className="friends-secondary-button"
                                onClick={onForgetOldConversation}
                                disabled={submitting}
                            >
                                Forget old conversation
                            </button>
                            <button
                                type="button"
                                className="friends-secondary-button"
                                onClick={onHistoryRequest}
                                disabled={submitting}
                            >
                                Request old conversation
                            </button>
                        </>
                    }
                >
                    Need older messages from another device?
                </InlineNotice>
            ) : null}

            {isForgettingOldConversation ? (
                <InlineNotice>
                    This device is ignoring the older encrypted conversation. Your next message will start a fresh DM instead.
                </InlineNotice>
            ) : null}

            {shouldShowConversationRestartNotice ? (
                <InlineNotice
                    actions={
                        <button
                            type="button"
                            className="friends-secondary-button"
                            onClick={onForgetOldConversation}
                            disabled={submitting}
                        >
                            Forget here too
                        </button>
                    }
                >
                    This DM was restarted on another device or by your friend. To follow the active conversation here, forget the old conversation on this device too.
                </InlineNotice>
            ) : null}

            {shouldShowMissingConversationAccessNotice ? (
                <InlineNotice>
                    This device has not unlocked the active conversation yet. Wait for the next message to sync it here, or choose to forget the older conversation and start fresh on this device.
                </InlineNotice>
            ) : null}

            {incomingHistoryRequest ? (
                <InlineNotice
                    actions={
                        <>
                            <button
                                type="button"
                                className="friends-secondary-button"
                                onClick={onHistoryDecline}
                                disabled={submitting}
                            >
                                Decline
                            </button>
                            <button type="button" onClick={onHistoryApprove} disabled={submitting}>
                                Accept
                            </button>
                        </>
                    }
                >
                    {historyAccessRequest.requesterUsername} requested to download your previous conversation on device {historyAccessRequest.requesterDeviceId}.
                </InlineNotice>
            ) : null}

            {outgoingHistoryRequest ? (
                <InlineNotice>
                    Waiting for {selectedFriend.friendUsername} to approve your old conversation download request.
                </InlineNotice>
            ) : null}

            {pendingRequestedByFriend ? (
                <InlineNotice
                    actions={
                        <>
                            <button
                                type="button"
                                className="friends-secondary-button"
                                onClick={onOpenConversationSettings}
                            >
                                Open settings
                            </button>
                            <button
                                type="button"
                                className="friends-accept-button"
                                onClick={onRetentionAccept}
                                disabled={submitting}
                            >
                                Accept
                            </button>
                        </>
                    }
                >
                    {selectedFriend.friendUsername} wants to change the offline relay window to {pendingRelayLabel}.
                </InlineNotice>
            ) : null}

            {pendingDisappearingRequestedByFriend ? (
                <InlineNotice
                    actions={
                        <>
                            <button
                                type="button"
                                className="friends-secondary-button"
                                onClick={onOpenConversationSettings}
                            >
                                Open settings
                            </button>
                            <button
                                type="button"
                                className="friends-accept-button"
                                onClick={onDisappearingAccept}
                                disabled={submitting}
                            >
                                Accept
                            </button>
                        </>
                    }
                >
                    {selectedFriend.friendUsername} wants to turn on disappearing messages: {pendingDisappearingLabel}.
                </InlineNotice>
            ) : null}

            {showEncryptionStage ? (
                <div className="friends-message-list" ref={messageListRef}>
                    <DirectEncryptionStage
                        lockPhase={lockPhase}
                        submitting={submitting}
                        effectiveSelectedFriend={effectiveSelectedFriend}
                        onEncryptChat={onEncryptChat}
                        errorMessage={encryptChatError}
                    />
                </div>
            ) : (
            <MessageList
                    messages={filteredMessages}
                    emptyText={normalizeConversationSearchQuery(searchQuery)
                        ? "No messages match your search."
                        : "No messages yet. Start the conversation."}
                    messageListRef={messageListRef}
                    currentUser={currentUser}
                    directFriend={selectedFriend}
                    avatarUrls={avatarUrls}
                    identityStyle={identityStyle}
                    nameMode={nameMode}
                    messageAlignment={messageAlignment}
                    onReply={onDirectReply}
                    onEdit={onDirectEdit}
                    onDelete={onDirectDelete}
                    onToggleReaction={onDirectToggleReaction}
                    onCopyMessage={handleCopyMessage}
                    onTogglePin={handleTogglePinnedMessage}
                    onDownloadAttachment={onDirectDownloadAttachment}
                    messageDeliveryById={messageDeliveryById}
                    transferStates={transferStates}
                    pinnedMessageIds={resolvedPinnedMessages.map((message) => message.messageId)}
                    selectedMessageId={selectedMessageId}
                    onSelectMessage={(message) => setSelectedMessageId(message.messageId)}
                    reactionPickerRequest={reactionPickerRequest}
                    markdownLinkContext={markdownLinkContext}
                    secureDmImageMode
                    conversationId={selectedFriend?.conversationId || ""}
                />
            )}

            {isDirectConversationEncrypted ? (
                <>
                    <MessageActionBanner
                        replyTo={directReplyTo}
                        editingMessage={directEditingMessage}
                        onCancel={onCancelDirectAction}
                    />

                    <form className="friend-composer" onSubmit={onSendMessage}>
                        {!directEditingMessage ? (
                            <PendingInlineEmbedList
                                embeds={directInlineEmbeds}
                                onRemove={onDirectRemoveInlineEmbed}
                                diagnosticContext={{
                                    body: composer,
                                    embeds: directInlineEmbeds,
                                    conversationId: selectedFriend?.conversationId || "",
                                    surface: "pending-preview"
                                }}
                            />
                        ) : null}
                        <MarkdownPreview
                            value={composer}
                            label="Message preview"
                            allowImages={false}
                            secureDmImageMode
                            secureDmEmbeds={directInlineEmbeds}
                            secureDmDiagnosticContext={{
                                conversationId: selectedFriend?.conversationId || "",
                                surface: "composer-preview"
                            }}
                            linkContext={markdownLinkContext}
                        />
                        <PendingAttachmentList attachments={directAttachments} onRemove={onDirectRemoveAttachment} />
                        <div className="friend-compose-row">
                            <ComposerTools
                                value={composer}
                                onChange={onComposerChange}
                                inputRef={composerRef}
                                disabled={submitting}
                                tools={directEditingMessage ? [] : ["file"]}
                                iconOnly
                                className="composer-tools-left"
                                onPickFile={(file) => onDirectPickAttachment?.(file, {
                                    selectionStart: composerRef.current?.selectionStart ?? cursorPosition,
                                    selectionEnd: composerRef.current?.selectionEnd ?? cursorPosition
                                })}
                                shortcutScope="direct"
                                openFileSignal={fileShortcutSignal}
                            />
                            <div className="friend-textarea-shell">
                                <ComposerEntitySuggestions
                                    suggestions={entitySuggestions}
                                    activeIndex={activeSuggestionIndex}
                                    onSelect={(item) => {
                                        const next = applyComposerEntitySuggestion({
                                            value: composer,
                                            selectionStart: composerRef.current?.selectionStart ?? cursorPosition,
                                            selectionEnd: composerRef.current?.selectionEnd ?? cursorPosition,
                                            suggestion: item,
                                            tokenRange: entitySuggestions
                                        });
                                        onComposerChange(next.value);
                                        window.requestAnimationFrame(() => {
                                            composerRef.current?.focus();
                                            composerRef.current?.setSelectionRange(next.cursorPosition, next.cursorPosition);
                                            setCursorPosition(next.cursorPosition);
                                        });
                                    }}
                                />
                                <textarea
                                    ref={composerRef}
                                    value={composer}
                                    onChange={(event) => {
                                        onComposerChange(event.target.value);
                                        setCursorPosition(event.target.selectionStart ?? event.target.value.length);
                                    }}
                                    onClick={(event) => setCursorPosition(event.currentTarget.selectionStart ?? 0)}
                                    onKeyUp={(event) => setCursorPosition(event.currentTarget.selectionStart ?? 0)}
                                    onPaste={(event) => {
                                        Promise.resolve(onDirectComposerPaste?.(event, {
                                            selectionStart: event.currentTarget.selectionStart ?? cursorPosition,
                                            selectionEnd: event.currentTarget.selectionEnd ?? cursorPosition
                                        })).then((result) => {
                                            if (result?.selectionStart == null || result?.selectionEnd == null) {
                                                return;
                                            }

                                            window.requestAnimationFrame(() => {
                                                composerRef.current?.focus();
                                                composerRef.current?.setSelectionRange(result.selectionStart, result.selectionEnd);
                                                setCursorPosition(result.selectionStart);
                                            });
                                        });
                                    }}
                                    onKeyDown={(event) => {
                                        if (entitySuggestions?.items?.length) {
                                            if (event.key === "ArrowDown") {
                                                event.preventDefault();
                                                setActiveSuggestionIndex((prev) => (prev + 1) % entitySuggestions.items.length);
                                                return;
                                            }

                                            if (event.key === "ArrowUp") {
                                                event.preventDefault();
                                                setActiveSuggestionIndex((prev) => (prev - 1 + entitySuggestions.items.length) % entitySuggestions.items.length);
                                                return;
                                            }

                                            if (event.key === "Tab" || event.key === "Enter") {
                                                event.preventDefault();
                                                const item = entitySuggestions.items[activeSuggestionIndex] || entitySuggestions.items[0];
                                                if (item) {
                                                    const next = applyComposerEntitySuggestion({
                                                        value: composer,
                                                        selectionStart: event.currentTarget.selectionStart ?? cursorPosition,
                                                        selectionEnd: event.currentTarget.selectionEnd ?? cursorPosition,
                                                        suggestion: item,
                                                        tokenRange: entitySuggestions
                                                    });
                                                    onComposerChange(next.value);
                                                    window.requestAnimationFrame(() => {
                                                        composerRef.current?.focus();
                                                        composerRef.current?.setSelectionRange(next.cursorPosition, next.cursorPosition);
                                                        setCursorPosition(next.cursorPosition);
                                                    });
                                                }
                                                return;
                                            }
                                        }

                                        if (event.key === "ArrowUp" && !composer.trim()) {
                                            event.preventDefault();
                                            window.dispatchEvent(new CustomEvent("chatapp-shortcut", {
                                                detail: {
                                                    action: "editLastMessage",
                                                    scope: "direct"
                                                }
                                            }));
                                            return;
                                        }

                                        if (event.ctrlKey && event.key === "Enter" && (composer.trim() || directAttachments.length > 0 || referencedDirectInlineEmbeds.length > 0)) {
                                            event.preventDefault();
                                            onSendMessage?.(event);
                                        }
                                    }}
                                    placeholder={directEditingMessage ? "Update message..." : directReplyTo ? "Write reply..." : `Message ${selectedFriend.friendUsername}`}
                                    rows={3}
                                    disabled={submitting}
                                />
                                <ComposerTools
                                    value={composer}
                                    onChange={onComposerChange}
                                    inputRef={composerRef}
                                    disabled={submitting}
                                    tools={["emoji"]}
                                    iconOnly
                                    className="composer-tools-inline"
                                    shortcutScope="direct"
                                />
                            </div>
                            <button type="submit" className="friend-send-button" disabled={!canSubmitDirectMessage}>
                                {directEditingMessage ? "Save" : "Send"}
                            </button>
                        </div>
                    </form>
                </>
            ) : null}
        </>
    );
}

export default function FriendsConversationPanel(props) {
    return (
        <section className="friends-conversation panel-card">
            {props.activeView === "group" ? (
                <GroupConversationView {...props} />
            ) : (
                <DirectConversationView {...props} />
            )}
        </section>
    );
}
