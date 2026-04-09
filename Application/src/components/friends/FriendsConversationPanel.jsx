import { useEffect, useMemo, useState } from "react";
import {
    fetchProfileAssetBlobUrl,
    fetchProfileAssetManifest
} from "../../features/profile/actions";

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
            return () => {};
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
    messageAlignment = "split"
}) {
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

                    return (
                        <div
                            key={message.messageId}
                            className={`friend-message-row ${identityStyle === "minimal" ? "is-minimal" : ""} ${isOutgoing ? "outgoing-friend-row" : "incoming-friend-row"}`}
                        >
                            <div className="friend-message-avatar">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="" />
                                ) : (
                                    compactLabel
                                )}
                            </div>
                            <div className={`friend-message-bubble ${isOutgoing ? "outgoing-friend-message" : "incoming-friend-message"}`}>
                                <div className="friend-message-meta">
                                    <strong>{displayName}</strong>
                                    <time>{new Date(message.createdAt).toLocaleString()}</time>
                                </div>
                                <span>{message.body}</span>
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

function DirectEncryptionStage({ lockPhase, submitting }) {
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
            <p>
                {lockPhase === "closed"
                    ? "Secure DM ready. Opening your encrypted conversation."
                    : submitting
                        ? "Creating the secure DM and sharing the encryption key."
                        : "You need to encrypt this chat before messages can be sent."}
            </p>
        </div>
    );
}

function GroupConversationView({
    currentUser,
    profileMediaHostUrl,
    clientSettings,
    selectedGroupConversation,
    activeGroupParticipantNames,
    groupMessages,
    groupComposer,
    submitting,
    messageListRef,
    onGroupComposerChange,
    onSendGroupMessage
}) {
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

    if (!selectedGroupConversation) {
        return (
            <EmptyState
                title="Select a group"
                description="Create a group chat or pick one from the left to start messaging."
            />
        );
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
            </div>

            <div className="friends-inline-request">
                <span>
                    Members: {activeGroupParticipantNames.length > 0 ? activeGroupParticipantNames.join(", ") : "Just you for now"}
                </span>
            </div>

            <MessageList
                messages={groupMessages}
                emptyText="No messages yet. Start the group conversation."
                messageListRef={messageListRef}
                currentUser={currentUser}
                participantsById={participantsById}
                avatarUrls={avatarUrls}
                groupInitialsByUserId={groupInitialsByUserId}
                identityStyle={identityStyle}
                nameMode={nameMode}
                messageAlignment={messageAlignment}
            />

            <form className="friend-composer" onSubmit={onSendGroupMessage}>
                <textarea
                    value={groupComposer}
                    onChange={(event) => onGroupComposerChange(event.target.value)}
                    placeholder={`Message ${selectedGroupConversation.title}`}
                    rows={3}
                />
                <button type="submit" disabled={submitting || !groupComposer.trim()}>
                    Send group message
                </button>
            </form>
        </>
    );
}

function DirectConversationView({
    currentUser,
    profileMediaHostUrl,
    clientSettings,
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
    historyAccessRequest,
    pendingRelayLabel,
    submitting,
    showEncryptionStage,
    lockPhase,
    messages,
    composer,
    isDirectConversationEncrypted,
    canComposeDirectMessage,
    messageListRef,
    onOpenConversationSettings,
    onForgetOldConversation,
    onHistoryRequest,
    onHistoryDecline,
    onHistoryApprove,
    onRetentionAccept,
    onEncryptChat,
    onComposerChange,
    onSendMessage
}) {
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

    if (!selectedFriend) {
        return (
            <EmptyState
                title="Select a friend"
                description="Choose a friend on the left to open your direct messages."
            />
        );
    }

    return (
        <>
            <div className="friends-conversation-header">
                <div>
                    <h2>{selectedFriend.friendUsername}</h2>
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

                <button
                    type="button"
                    className="friends-settings-button"
                    onClick={onOpenConversationSettings}
                >
                    Conversation settings
                </button>
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

            {!effectiveSelectedFriend?.conversationId ? (
                <div className="friends-encrypt-callout">
                    <div>
                        <strong>Secure this chat</strong>
                        <p>This sends the hidden setup handshake so both sides can open the encrypted DM.</p>
                    </div>
                    <button
                        type="button"
                        className={`friends-encrypt-button ${submitting ? "is-busy" : ""}`}
                        onClick={onEncryptChat}
                        disabled={submitting}
                    >
                        <span className="friends-encrypt-lock" aria-hidden="true">🔒</span>
                        <span>{submitting ? "Encrypting..." : "Encrypt chat"}</span>
                    </button>
                </div>
            ) : null}

            {showEncryptionStage ? (
                <div className="friends-message-list" ref={messageListRef}>
                    <DirectEncryptionStage lockPhase={lockPhase} submitting={submitting} />
                </div>
            ) : (
                <MessageList
                    messages={messages}
                    emptyText="No messages yet. Start the conversation."
                    messageListRef={messageListRef}
                    currentUser={currentUser}
                    directFriend={selectedFriend}
                    avatarUrls={avatarUrls}
                    identityStyle={identityStyle}
                    nameMode={nameMode}
                    messageAlignment={messageAlignment}
                />
            )}

            <form className="friend-composer" onSubmit={onSendMessage}>
                <textarea
                    value={composer}
                    onChange={(event) => onComposerChange(event.target.value)}
                    placeholder={
                        isDirectConversationEncrypted
                            ? `Message ${selectedFriend.friendUsername}`
                            : "Encrypt chat first"
                    }
                    rows={3}
                    disabled={!isDirectConversationEncrypted || submitting}
                />
                <button type="submit" disabled={!canComposeDirectMessage || !composer.trim()}>
                    Send DM
                </button>
            </form>
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
