function RequestsSection({ title, requests, incoming, submitting, onAccept }) {
    return (
        <div className="friends-section">
            <h2>{title}</h2>
            {requests.length === 0 ? <p>No {title.toLowerCase()} requests.</p> : null}
            {requests.map((request) => (
                <div
                    key={request.friendshipId}
                    className={`friend-request-card ${incoming ? "" : "pending"}`.trim()}
                >
                    <span>{request.friendUsername}</span>
                    {incoming ? (
                        <button onClick={() => onAccept(request.friendshipId)} disabled={submitting}>
                            Accept
                        </button>
                    ) : (
                        <small>Pending</small>
                    )}
                </div>
            ))}
        </div>
    );
}

export default function FriendsAddFriendModal({
    friendUsername,
    submitting,
    friendsState,
    onClose,
    onFriendUsernameChange,
    onSubmit,
    onAccept
}) {
    return (
        <div className="friends-settings-overlay" onClick={onClose}>
            <div className="friends-settings-popout panel-card friends-manage-popout" onClick={(event) => event.stopPropagation()}>
                <div className="friends-settings-header">
                    <div>
                        <h2>Friend requests</h2>
                        <p>Send a request, review incoming requests, and check outgoing ones.</p>
                    </div>

                    <button
                        type="button"
                        className="friends-settings-close"
                        onClick={onClose}
                    >
                        x
                    </button>
                </div>

                <form className="friend-request-form" onSubmit={onSubmit}>
                    <label htmlFor="friend-username-modal">Username</label>
                    <div className="friend-request-row">
                        <input
                            id="friend-username-modal"
                            value={friendUsername}
                            onChange={(event) => onFriendUsernameChange(event.target.value)}
                            placeholder="Enter exact username"
                            autoFocus
                        />
                        <button type="submit" disabled={submitting || !friendUsername.trim()}>
                            Add
                        </button>
                    </div>
                </form>

                <RequestsSection
                    title="Incoming"
                    requests={friendsState.incomingRequests}
                    incoming
                    submitting={submitting}
                    onAccept={onAccept}
                />

                <RequestsSection
                    title="Outgoing"
                    requests={friendsState.outgoingRequests}
                    incoming={false}
                    submitting={submitting}
                    onAccept={onAccept}
                />
            </div>
        </div>
    );
}
