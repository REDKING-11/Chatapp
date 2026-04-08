import { useEffect, useRef, useState } from "react";
import {
    acceptFriendRequest,
    acceptFriendRelayRetention,
    approveFriendConversationHistory,
    declineFriendConversationHistory,
    fetchFriends,
    fetchHistoryAccessStatus,
    importPendingHistoryTransfers,
    openFriendConversation,
    removeFriend,
    requestFriendConversationHistory,
    requestFriendRelayRetention,
    sendFriendDirectMessage,
    sendFriendRequest
} from "../features/friends/actions";
import { RELAY_RETENTION_OPTIONS } from "../features/dm/actions";

const FRIEND_TAG_OPTIONS = ["BFF", "BF", "Helper"];

export default function FriendsHome({ currentUser }) {
    const [friendsState, setFriendsState] = useState({
        friends: [],
        incomingRequests: [],
        outgoingRequests: []
    });
    const [selectedFriendId, setSelectedFriendId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [composer, setComposer] = useState("");
    const [friendUsername, setFriendUsername] = useState("");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [selectedRelayTtlSeconds, setSelectedRelayTtlSeconds] = useState(86400);
    const [conversationMeta, setConversationMeta] = useState(null);
    const [showConversationSettings, setShowConversationSettings] = useState(false);
    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
    const [historyAccessRequest, setHistoryAccessRequest] = useState(null);
    const [friendTags, setFriendTags] = useState({});
    const [friendContextMenu, setFriendContextMenu] = useState(null);
    const [syncState, setSyncState] = useState({
        status: "idle",
        importedCount: 0,
        source: null
    });
    const messageListRef = useRef(null);

    const friendTagsStorageKey = `friendTags:${currentUser.id}`;

    async function loadFriends() {
        setLoading(true);
        setError("");

        try {
            const data = await fetchFriends();
            setFriendsState(data);

            if (!selectedFriendId && data.friends.length > 0) {
                setSelectedFriendId(data.friends[0].friendUserId);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadFriends();
    }, []);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(friendTagsStorageKey);
            setFriendTags(raw ? JSON.parse(raw) : {});
        } catch {
            setFriendTags({});
        }
    }, [friendTagsStorageKey]);

    useEffect(() => {
        localStorage.setItem(friendTagsStorageKey, JSON.stringify(friendTags));
    }, [friendTags, friendTagsStorageKey]);

    useEffect(() => {
        importPendingHistoryTransfers({ currentUser }).catch((err) => {
            setError(err.message);
        });
    }, [currentUser]);

    useEffect(() => {
        if (!autoRefreshEnabled) {
            return undefined;
        }

        const intervalId = window.setInterval(loadFriends, 15000);

        function handleWindowFocus() {
            loadFriends();
        }

        window.addEventListener("focus", handleWindowFocus);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener("focus", handleWindowFocus);
        };
    }, [autoRefreshEnabled]);

    const selectedFriend = friendsState.friends.find(
        (friend) => String(friend.friendUserId) === String(selectedFriendId)
    ) || null;

    useEffect(() => {
        async function loadConversation() {
            if (!selectedFriend) {
                setMessages([]);
                setConversationMeta(null);
                setShowConversationSettings(false);
                setHistoryAccessRequest(null);
                return;
            }

            try {
                const data = await openFriendConversation({
                    currentUser,
                    friend: selectedFriend
                });

                setMessages(data.messages);
                setConversationMeta(data.conversation);
                setSelectedRelayTtlSeconds(data.conversation?.relayPolicy?.currentSeconds ?? 86400);

                if (selectedFriend.conversationId) {
                    const historyStatus = await fetchHistoryAccessStatus({
                        friendUserId: selectedFriend.friendUserId,
                        conversationId: selectedFriend.conversationId
                    });
                    setHistoryAccessRequest(historyStatus.request);
                } else {
                    setHistoryAccessRequest(null);
                }
            } catch (err) {
                setError(err.message);
            }
        }

        loadConversation();
    }, [selectedFriendId, friendsState.friends, currentUser]);

    useEffect(() => {
        async function handleSecureDmMessage() {
            if (!selectedFriend) return;

            try {
                const data = await openFriendConversation({
                    currentUser,
                    friend: selectedFriend
                });

                setMessages(data.messages);
                setConversationMeta(data.conversation);

                if (selectedFriend.conversationId) {
                    const historyStatus = await fetchHistoryAccessStatus({
                        friendUserId: selectedFriend.friendUserId,
                        conversationId: selectedFriend.conversationId
                    });
                    setHistoryAccessRequest(historyStatus.request);
                }
            } catch (err) {
                setError(err.message);
            }
        }

        window.addEventListener("secureDmMessage", handleSecureDmMessage);
        return () => window.removeEventListener("secureDmMessage", handleSecureDmMessage);
    }, [currentUser, selectedFriend]);

    useEffect(() => {
        function handleSyncState(event) {
            const detail = event.detail || {};
            setSyncState({
                status: detail.status || "idle",
                importedCount: detail.importedCount ?? 0,
                source: detail.source || null
            });
        }

        window.addEventListener("secureDmSyncState", handleSyncState);
        return () => window.removeEventListener("secureDmSyncState", handleSyncState);
    }, []);

    useEffect(() => {
        function handleRelayQueueState(event) {
            const detail = event.detail || {};
            if ((detail.droppedRecipients || []).length > 0) {
                setError("Your friend is offline and this chat is set to no relay, so the message was not queued.");
            }
        }

        window.addEventListener("secureDmRelayQueueState", handleRelayQueueState);
        return () => window.removeEventListener("secureDmRelayQueueState", handleRelayQueueState);
    }, []);

    useEffect(() => {
        if (!messageListRef.current) {
            return;
        }

        messageListRef.current.scrollTo({
            top: messageListRef.current.scrollHeight,
            behavior: "smooth"
        });
    }, [messages, selectedFriendId]);

    useEffect(() => {
        function handleGlobalClick() {
            setFriendContextMenu(null);
        }

        window.addEventListener("click", handleGlobalClick);
        return () => window.removeEventListener("click", handleGlobalClick);
    }, []);

    async function handleSendRequest(event) {
        event.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            await sendFriendRequest(friendUsername);
            setFriendUsername("");
            await loadFriends();
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleAccept(friendshipId) {
        setSubmitting(true);
        setError("");

        try {
            await acceptFriendRequest(friendshipId);
            await loadFriends();
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleSendMessage(event) {
        event.preventDefault();

        if (!selectedFriend || !composer.trim()) {
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            const result = await sendFriendDirectMessage({
                currentUser,
                friend: selectedFriend,
                body: composer.trim(),
                relayTtlSeconds: selectedRelayTtlSeconds
            });

            setComposer("");
            setMessages(result.messages);
            setConversationMeta(result.conversation);
            setFriendsState((prev) => ({
                ...prev,
                friends: prev.friends.map((friend) =>
                    friend.friendUserId === selectedFriend.friendUserId
                        ? { ...friend, conversationId: result.conversationId }
                        : friend
                )
            }));
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleRetentionRequest(event) {
        event.preventDefault();

        if (!selectedFriend?.conversationId) {
            setShowConversationSettings(false);
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            const relayPolicy = await requestFriendRelayRetention({
                conversationId: selectedFriend.conversationId,
                relayTtlSeconds: selectedRelayTtlSeconds
            });

            setConversationMeta((prev) => ({
                ...(prev || {}),
                relayPolicy
            }));
            setShowConversationSettings(false);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleRetentionAccept() {
        if (!selectedFriend?.conversationId) {
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            const relayPolicy = await acceptFriendRelayRetention({
                conversationId: selectedFriend.conversationId
            });

            setConversationMeta((prev) => ({
                ...(prev || {}),
                relayPolicy
            }));
            setSelectedRelayTtlSeconds(relayPolicy?.currentSeconds ?? 86400);
            setShowConversationSettings(false);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleHistoryRequest() {
        if (!selectedFriend?.conversationId) {
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            const data = await requestFriendConversationHistory({
                currentUser,
                friend: selectedFriend
            });
            setHistoryAccessRequest(data.request);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleHistoryApprove() {
        if (!selectedFriend?.conversationId || !historyAccessRequest) {
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            await approveFriendConversationHistory({
                currentUser,
                friend: selectedFriend,
                request: historyAccessRequest
            });
            setHistoryAccessRequest((prev) => prev ? { ...prev, status: "approved" } : prev);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleHistoryDecline() {
        if (!historyAccessRequest) {
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            await declineFriendConversationHistory({
                requestId: historyAccessRequest.id,
                currentUser
            });
            setHistoryAccessRequest((prev) => prev ? { ...prev, status: "declined" } : prev);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    function openFriendContextMenu(event, friend) {
        event.preventDefault();

        setFriendContextMenu({
            friend,
            x: event.clientX,
            y: event.clientY
        });
    }

    function applyFriendTag(friendUserId, tag) {
        setFriendContextMenu(null);
        setFriendTags((prev) => ({
            ...prev,
            [String(friendUserId)]: tag
        }));
    }

    function clearFriendTag(friendUserId) {
        setFriendContextMenu(null);
        setFriendTags((prev) => {
            const next = { ...prev };
            delete next[String(friendUserId)];
            return next;
        });
    }

    async function handleRemoveFriend(friend) {
        setFriendContextMenu(null);

        const confirmed = window.confirm(`Remove ${friend.friendUsername} from your friends list?`);
        if (!confirmed) {
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            await removeFriend(friend.friendshipId);
            setFriendTags((prev) => {
                const next = { ...prev };
                delete next[String(friend.friendUserId)];
                return next;
            });

            if (String(selectedFriendId) === String(friend.friendUserId)) {
                setSelectedFriendId(null);
                setMessages([]);
                setConversationMeta(null);
                setHistoryAccessRequest(null);
            }

            await loadFriends();
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    const relayPolicy = conversationMeta?.relayPolicy || null;
    const pendingRelayRequest = relayPolicy?.pendingSeconds != null ? relayPolicy : null;
    const pendingRequestedByFriend = Boolean(
        pendingRelayRequest
        && pendingRelayRequest.pendingRequestedByUserId !== Number(currentUser.id)
    );
    const currentRelayLabel = RELAY_RETENTION_OPTIONS.find(
        (option) => option.seconds === (relayPolicy?.currentSeconds ?? selectedRelayTtlSeconds)
    )?.label || "24 hours";
    const pendingRelayLabel = pendingRelayRequest
        ? RELAY_RETENTION_OPTIONS.find((option) => option.seconds === pendingRelayRequest.pendingSeconds)?.label
            || `${pendingRelayRequest.pendingHours} hours`
        : null;
    const hasExistingConversation = Boolean(selectedFriend?.conversationId);
    const canRequestOldConversation = Boolean(
        hasExistingConversation &&
        (!historyAccessRequest || historyAccessRequest.status === "declined") &&
        messages.length === 0
    );
    const incomingHistoryRequest = historyAccessRequest
        && historyAccessRequest.status === "pending"
        && Number(historyAccessRequest.approverUserId) === Number(currentUser.id);
    const outgoingHistoryRequest = historyAccessRequest
        && historyAccessRequest.status === "pending"
        && Number(historyAccessRequest.requesterUserId) === Number(currentUser.id);

    return (
        <main className="main friends-main">
            <div className="friends-header">
                <div>
                    <h1>Friends</h1>
                    <p>Manage friends and start private conversations from one place.</p>
                </div>

                <div className="friends-header-actions">
                    <button className="friends-refresh-button" onClick={loadFriends}>
                        Refresh
                    </button>

                    <label className="friends-autorefresh-toggle">
                        <span className="friends-autorefresh-label">Auto</span>
                        <input
                            type="checkbox"
                            checked={autoRefreshEnabled}
                            onChange={(event) => setAutoRefreshEnabled(event.target.checked)}
                        />
                        <span className="friends-autorefresh-switch" aria-hidden="true">
                            <span className="friends-autorefresh-knob" />
                        </span>
                    </label>
                </div>
            </div>

            {syncState.status === "syncing" ? (
                <div className="friends-sync-banner syncing">
                    <span className="friends-sync-spinner" />
                    <span>Syncing encrypted messages...</span>
                </div>
            ) : null}

            {syncState.status === "complete" && syncState.importedCount > 0 ? (
                <div className="friends-sync-banner success">
                    Loaded {syncState.importedCount} encrypted {syncState.importedCount === 1 ? "message" : "messages"} while you were away.
                </div>
            ) : null}

            {error && <p className="friends-error">{error}</p>}

            <div className="friends-layout">
                <section className="friends-rail panel-card">
                    <form className="friend-request-form" onSubmit={handleSendRequest}>
                        <label htmlFor="friend-username">Add friend by username</label>
                        <div className="friend-request-row">
                            <input
                                id="friend-username"
                                value={friendUsername}
                                onChange={(event) => setFriendUsername(event.target.value)}
                                placeholder="Enter exact username"
                            />
                            <button type="submit" disabled={submitting || !friendUsername.trim()}>
                                Add
                            </button>
                        </div>
                    </form>

                    <div className="friends-section">
                        <h2>Friends</h2>
                        {loading ? <p>Loading friends...</p> : null}
                        {!loading && friendsState.friends.length === 0 ? <p>No friends yet.</p> : null}

                        <div className="friends-list">
                            {friendsState.friends.map((friend) => (
                                <button
                                    key={friend.friendshipId}
                                    className={`friend-card ${selectedFriendId === friend.friendUserId ? "selected-friend-card" : ""}`}
                                    onClick={() => setSelectedFriendId(friend.friendUserId)}
                                    onContextMenu={(event) => openFriendContextMenu(event, friend)}
                                >
                                    <strong>{friend.friendUsername}</strong>
                                    {friendTags[String(friend.friendUserId)] ? (
                                        <small className="friend-tag-pill">{friendTags[String(friend.friendUserId)]}</small>
                                    ) : null}
                                    <span>{friend.conversationId ? "DM ready" : "No DM yet"}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="friends-section">
                        <h2>Incoming</h2>
                        {friendsState.incomingRequests.length === 0 ? <p>No incoming requests.</p> : null}
                        {friendsState.incomingRequests.map((request) => (
                            <div key={request.friendshipId} className="friend-request-card">
                                <span>{request.friendUsername}</span>
                                <button onClick={() => handleAccept(request.friendshipId)} disabled={submitting}>
                                    Accept
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="friends-section">
                        <h2>Outgoing</h2>
                        {friendsState.outgoingRequests.length === 0 ? <p>No outgoing requests.</p> : null}
                        {friendsState.outgoingRequests.map((request) => (
                            <div key={request.friendshipId} className="friend-request-card pending">
                                <span>{request.friendUsername}</span>
                                <small>Pending</small>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="friends-conversation panel-card">
                    {!selectedFriend ? (
                        <div className="friends-empty-state">
                            <h2>Select a friend</h2>
                            <p>Choose a friend on the left to open your direct messages.</p>
                        </div>
                    ) : (
                        <>
                            <div className="friends-conversation-header">
                                <div>
                                    <h2>{selectedFriend.friendUsername}</h2>
                                    <p>
                                        {selectedFriend.conversationId
                                            ? "Encrypted DM conversation"
                                            : "Send a first message to create an encrypted DM"}
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    className="friends-settings-button"
                                    onClick={() => setShowConversationSettings(true)}
                                >
                                    Conversation settings
                                </button>
                            </div>

                            {canRequestOldConversation ? (
                                <div className="friends-inline-request">
                                    <span>Need older messages from another device?</span>
                                    <div className="friends-inline-request-actions">
                                        <button
                                            type="button"
                                            className="friends-secondary-button"
                                            onClick={handleHistoryRequest}
                                            disabled={submitting}
                                        >
                                            Request old conversation
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            {incomingHistoryRequest ? (
                                <div className="friends-inline-request">
                                    <span>
                                        {historyAccessRequest.requesterUsername} requested to download your previous conversation on device {historyAccessRequest.requesterDeviceId}.
                                    </span>
                                    <div className="friends-inline-request-actions">
                                        <button
                                            type="button"
                                            className="friends-secondary-button"
                                            onClick={handleHistoryDecline}
                                            disabled={submitting}
                                        >
                                            Decline
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleHistoryApprove}
                                            disabled={submitting}
                                        >
                                            Accept
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            {outgoingHistoryRequest ? (
                                <div className="friends-inline-request">
                                    <span>
                                        Waiting for {selectedFriend.friendUsername} to approve your old conversation download request.
                                    </span>
                                </div>
                            ) : null}

                            {pendingRequestedByFriend ? (
                                <div className="friends-inline-request">
                                    <span>
                                        {selectedFriend.friendUsername} wants to change the offline relay window to {pendingRelayLabel}.
                                    </span>
                                    <div className="friends-inline-request-actions">
                                        <button
                                            type="button"
                                            className="friends-secondary-button"
                                            onClick={() => setShowConversationSettings(true)}
                                        >
                                            Open settings
                                        </button>
                                        <button
                                            type="button"
                                            className="friends-accept-button"
                                            onClick={handleRetentionAccept}
                                            disabled={submitting}
                                        >
                                            Accept
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            <div className="friends-message-list" ref={messageListRef}>
                                {messages.length === 0 ? (
                                    <p className="friends-empty-messages">
                                        No messages yet. Start the conversation.
                                    </p>
                                ) : (
                                    messages.map((message) => (
                                        <div
                                            key={message.messageId}
                                            className={`friend-message-bubble ${message.direction === "outgoing" ? "outgoing-friend-message" : "incoming-friend-message"}`}
                                        >
                                            <span>{message.body}</span>
                                            <small>{new Date(message.createdAt).toLocaleString()}</small>
                                        </div>
                                    ))
                                )}
                            </div>

                            <form className="friend-composer" onSubmit={handleSendMessage}>
                                <textarea
                                    value={composer}
                                    onChange={(event) => setComposer(event.target.value)}
                                    placeholder={`Message ${selectedFriend.friendUsername}`}
                                    rows={3}
                                />
                                <button type="submit" disabled={submitting || !composer.trim()}>
                                    Send DM
                                </button>
                            </form>
                        </>
                    )}
                </section>
            </div>

            {showConversationSettings && selectedFriend ? (
                <div className="friends-settings-overlay" onClick={() => setShowConversationSettings(false)}>
                    <div className="friends-settings-popout panel-card" onClick={(event) => event.stopPropagation()}>
                        <div className="friends-settings-header">
                            <div>
                                <h2>Conversation settings</h2>
                                <p>Manage offline relay behavior for this DM.</p>
                            </div>

                            <button
                                type="button"
                                className="friends-settings-close"
                                onClick={() => setShowConversationSettings(false)}
                            >
                                x
                            </button>
                        </div>

                        <div className="friends-retention-copy">
                            <strong>Offline relay window</strong>
                            <span>Current policy: {currentRelayLabel}</span>
                        </div>

                        <form className="friends-retention-controls" onSubmit={handleRetentionRequest}>
                            <select
                                value={selectedRelayTtlSeconds}
                                onChange={(event) => setSelectedRelayTtlSeconds(Number(event.target.value))}
                                disabled={submitting}
                            >
                                {RELAY_RETENTION_OPTIONS.map((option) => (
                                    <option key={option.seconds} value={option.seconds}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>

                            <button
                                type="submit"
                                disabled={
                                    submitting ||
                                    (selectedFriend.conversationId
                                        ? selectedRelayTtlSeconds === (relayPolicy?.currentSeconds ?? 86400) &&
                                          relayPolicy?.pendingSeconds == null
                                        : false)
                                }
                            >
                                {selectedFriend.conversationId ? "Request change" : "Use for first DM"}
                            </button>
                        </form>

                        {pendingRelayRequest ? (
                            <div className="friends-retention-pending">
                                <span>
                                    Pending change: {pendingRelayLabel}
                                </span>

                                {pendingRequestedByFriend ? (
                                    <button type="button" onClick={handleRetentionAccept} disabled={submitting}>
                                        Accept change
                                    </button>
                                ) : (
                                    <small>Waiting for your friend to accept.</small>
                                )}
                            </div>
                        ) : (
                            <small className="friends-retention-note">
                                Both people must agree before the offline relay window changes.
                            </small>
                        )}
                    </div>
                </div>
            ) : null}

            {friendContextMenu ? (
                <div
                    className="server-context-menu friend-context-menu"
                    style={{
                        top: `${friendContextMenu.y}px`,
                        left: `${friendContextMenu.x}px`
                    }}
                    onClick={(event) => event.stopPropagation()}
                >
                    <button
                        className="server-context-item"
                        onClick={() => {
                            setSelectedFriendId(friendContextMenu.friend.friendUserId);
                            setFriendContextMenu(null);
                        }}
                    >
                        Open DM
                    </button>

                    <button className="server-context-item" disabled>
                        Settings
                    </button>

                    <button className="server-context-item" disabled>
                        Mute
                    </button>

                    <div className="friend-context-section">
                        <span className="friend-context-label">Tag</span>
                        <div className="friend-context-tag-list">
                            {FRIEND_TAG_OPTIONS.map((tag) => (
                                <button
                                    key={tag}
                                    className="server-context-item friend-context-tag-button"
                                    onClick={() => applyFriendTag(friendContextMenu.friend.friendUserId, tag)}
                                >
                                    {tag}
                                </button>
                            ))}
                            <button
                                className="server-context-item friend-context-tag-button"
                                onClick={() => clearFriendTag(friendContextMenu.friend.friendUserId)}
                            >
                                Clear tag
                            </button>
                        </div>
                    </div>

                    <button
                        className="server-context-item danger"
                        onClick={() => handleRemoveFriend(friendContextMenu.friend)}
                    >
                        Remove friend
                    </button>
                </div>
            ) : null}
        </main>
    );
}
