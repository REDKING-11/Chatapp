import { useEffect, useState } from "react";
import {
    acceptFriendRequest,
    fetchFriends,
    openFriendConversation,
    sendFriendDirectMessage,
    sendFriendRequest
} from "../features/friends/actions";

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
        const intervalId = window.setInterval(loadFriends, 15000);
        window.addEventListener("focus", loadFriends);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener("focus", loadFriends);
        };
    }, [selectedFriendId]);

    const selectedFriend = friendsState.friends.find(
        (friend) => String(friend.friendUserId) === String(selectedFriendId)
    ) || null;

    useEffect(() => {
        async function loadConversation() {
            if (!selectedFriend) {
                setMessages([]);
                return;
            }

            try {
                const data = await openFriendConversation({
                    currentUser,
                    friend: selectedFriend
                });

                setMessages(data.messages);
            } catch (err) {
                setError(err.message);
            }
        }

        loadConversation();
    }, [selectedFriendId, friendsState.friends]);

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
                body: composer.trim()
            });

            setComposer("");
            setMessages(result.messages);
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

    return (
        <main className="main friends-main">
            <div className="friends-header">
                <div>
                    <h1>Friends</h1>
                    <p>Manage friends and start private conversations from one place.</p>
                </div>

                <button className="friends-refresh-button" onClick={loadFriends}>
                    Refresh
                </button>
            </div>

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
                                >
                                    <strong>{friend.friendUsername}</strong>
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
                            </div>

                            <div className="friends-message-list">
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
        </main>
    );
}
