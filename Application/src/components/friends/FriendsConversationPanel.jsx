function EmptyState({ title, description }) {
    return (
        <div className="friends-empty-state">
            <h2>{title}</h2>
            <p>{description}</p>
        </div>
    );
}

function MessageList({ messages, emptyText, messageListRef, currentUser }) {
    return (
        <div className="friends-message-list" ref={messageListRef}>
            {messages.length === 0 ? (
                <p className="friends-empty-messages">{emptyText}</p>
            ) : (
                messages.map((message) => {
                    const isOutgoing = message.direction === "outgoing"
                        || (
                            message.senderUserId != null
                            && String(message.senderUserId) === String(currentUser?.id)
                        );

                    return (
                        <div
                            key={message.messageId}
                            className={`friend-message-bubble ${isOutgoing ? "outgoing-friend-message" : "incoming-friend-message"}`}
                        >
                            <small>{new Date(message.createdAt).toLocaleString()}</small>
                            <span>{message.body}</span>
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
    selectedGroupConversation,
    activeGroupParticipantNames,
    groupMessages,
    groupComposer,
    submitting,
    messageListRef,
    onGroupComposerChange,
    onSendGroupMessage
}) {
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

            <div className="friends-message-list" ref={messageListRef}>
                {showEncryptionStage ? (
                    <DirectEncryptionStage lockPhase={lockPhase} submitting={submitting} />
                ) : messages.length === 0 ? (
                    <p className="friends-empty-messages">No messages yet. Start the conversation.</p>
                ) : (
                    messages.map((message) => {
                        const isOutgoing = message.direction === "outgoing"
                            || (
                                message.senderUserId != null
                                && String(message.senderUserId) === String(currentUser?.id)
                            );

                        return (
                            <div
                                key={message.messageId}
                                className={`friend-message-bubble ${isOutgoing ? "outgoing-friend-message" : "incoming-friend-message"}`}
                            >
                                <small>{new Date(message.createdAt).toLocaleString()}</small>
                                <span>{message.body}</span>
                            </div>
                        );
                    })
                )}
            </div>

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
