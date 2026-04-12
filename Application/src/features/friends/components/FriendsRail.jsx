import { useMemo, useState } from "react";
import ProfileDock from "../../../components/ProfileDock";
import addFriendIcon from "../../../assets/add-friend.png";
import addFriendWhiteIcon from "../../../assets/add-friend-white.png";

function GroupSection({
    invites,
    conversations,
    selectedGroupConversationId,
    activeView,
    conversationPreviews,
    conversationHasUnreadActivity,
    onCreateGroup,
    onAcceptGroupInvite,
    onDeclineGroupInvite,
    onSelectGroupConversation
}) {
    return (
        <div className="friends-section">
            <div className="friends-section-heading">
                <h2>Groups</h2>
                <button
                    type="button"
                    className="friends-inline-add-button"
                    onClick={onCreateGroup}
                >
                    New
                </button>
            </div>
            {invites.length > 0 ? (
                <div className="friends-list">
                    {invites.map((invite) => (
                        <div key={invite.id} className="friend-request-card pending">
                            <div>
                                <strong>{invite.title}</strong>
                                <small>Invited by {invite.inviterUsername}</small>
                            </div>
                            <div className="friends-inline-request-actions">
                                <button
                                    type="button"
                                    className="friends-secondary-button"
                                    onClick={() => onDeclineGroupInvite(invite.id)}
                                >
                                    Decline
                                </button>
                                <button type="button" onClick={() => onAcceptGroupInvite(invite.id)}>
                                    Join
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}
            {conversations.length === 0 ? <p>No group chats yet.</p> : null}

            <div className="friends-list">
                {conversations.map((conversation) => (
                    <button
                        key={conversation.id}
                        className={`friend-card ${conversationHasUnreadActivity(conversation.id) ? "recent-friend-activity" : ""} ${activeView === "group" && String(selectedGroupConversationId) === String(conversation.id) ? "selected-friend-card" : ""}`}
                        onClick={() => onSelectGroupConversation(conversation.id)}
                    >
                        <strong>{conversation.title}</strong>
                        <span>{((conversation.participants || []).length + Number(conversation.pendingInviteCount || 0))} members</span>
                        <small className="friend-card-preview">
                            {conversationPreviews[String(conversation.id)]?.text || "No messages yet"}
                        </small>
                    </button>
                ))}
            </div>
        </div>
    );
}

function FriendCard({
    friend,
    selectedFriendId,
    activeView,
    friendTagLookup,
    conversationPreviews,
    conversationHasUnreadActivity,
    onSelectFriend,
    onOpenFriendContextMenu
}) {
    const assignedTag = friendTagLookup[String(friend.assignedTagId)] || null;
    const previewText = friend.conversationId
        ? conversationPreviews[String(friend.conversationId)]?.text || ""
        : "";
    const displayStatus = friend.conversationId ? "DM ready" : "No DM yet";
    const initial = String(friend.friendUsername || "?").trim().slice(0, 1).toUpperCase() || "?";

    return (
        <button
            key={friend.friendshipId}
            className={`friend-card ${conversationHasUnreadActivity(friend.conversationId) ? "recent-friend-activity" : ""} ${activeView === "friend" && selectedFriendId === friend.friendUserId ? "selected-friend-card" : ""}`}
            onClick={() => onSelectFriend(friend.friendUserId)}
            onContextMenu={(event) => onOpenFriendContextMenu(event, friend)}
        >
            <span className="friend-card-avatar" aria-hidden="true">{initial}</span>
            <span className="friend-card-body">
                <span className="friend-card-title-row">
                    <strong>{friend.friendUsername}</strong>
                </span>
                {assignedTag ? (
                    <small className="friend-tag-pill" title={assignedTag.label}>{assignedTag.label}</small>
                ) : null}
                <span className="friend-card-status">{previewText || displayStatus}</span>
            </span>
        </button>
    );
}

function FriendFolderSection({
    folder,
    friends,
    isCollapsed,
    selectedFriendId,
    activeView,
    friendTagLookup,
    conversationPreviews,
    conversationHasUnreadActivity,
    onSelectFriend,
    onOpenFriendContextMenu,
    onToggleCollapsed
}) {
    if (friends.length === 0) {
        return null;
    }

    return (
        <div className="friends-section">
            <button
                type="button"
                className={`friends-folder-toggle ${isCollapsed ? "collapsed" : ""}`}
                onClick={() => onToggleCollapsed(folder.id)}
            >
                <span className="friends-folder-toggle-icon" aria-hidden="true">
                    {isCollapsed ? ">" : "v"}
                </span>
                <span className="friends-folder-toggle-label">{folder.label}</span>
                <span className="friends-folder-count">{friends.length}</span>
            </button>
            {!isCollapsed ? (
                <div className="friends-list">
                    {friends.map((friend) => (
                        <FriendCard
                            key={friend.friendshipId}
                            friend={friend}
                            selectedFriendId={selectedFriendId}
                            activeView={activeView}
                            friendTagLookup={friendTagLookup}
                            conversationPreviews={conversationPreviews}
                            conversationHasUnreadActivity={conversationHasUnreadActivity}
                            onSelectFriend={onSelectFriend}
                            onOpenFriendContextMenu={onOpenFriendContextMenu}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default function FriendsRail({
    currentUser,
    profileMediaHostUrl,
    clientSettings,
    loading,
    friendsState,
    hasPendingIncomingFriendRequests,
    groupInvites,
    groupConversations,
    selectedFriendId,
    selectedGroupConversationId,
    activeView,
    friendTags,
    friendTagFolders,
    friendTagLookup,
    collapsedFriendFolders,
    conversationPreviews,
    conversationHasUnreadActivity,
    onOpenAddFriend,
    onCreateGroup,
    onAcceptGroupInvite,
    onDeclineGroupInvite,
    onSelectGroupConversation,
    onSelectFriend,
    onOpenFriendContextMenu,
    onToggleFriendFolder,
    onOpenClientSettings,
    onLogout
}) {
    const [showFriendBrowser, setShowFriendBrowser] = useState(false);
    const [friendSearchQuery, setFriendSearchQuery] = useState("");
    const [friendBrowserView, setFriendBrowserView] = useState("list");

    const friendsWithTags = friendsState.friends.map((friend) => ({
        ...friend,
        assignedTagId: friendTags[String(friend.friendUserId)] || null
    }));
    const normalizedSearchQuery = friendSearchQuery.trim().toLowerCase();
    const filteredFriends = useMemo(() => {
        if (!normalizedSearchQuery) {
            return friendsWithTags;
        }

        return friendsWithTags.filter((friend) => {
            const assignedTag = friendTagLookup[String(friend.assignedTagId)] || null;
            const preview = friend.conversationId
                ? conversationPreviews[String(friend.conversationId)]?.text || ""
                : "";
            const searchable = [
                friend.friendUsername,
                assignedTag?.label,
                assignedTag?.folderLabel,
                preview,
                friend.conversationId ? "dm ready" : "no dm yet"
            ].filter(Boolean).join(" ").toLowerCase();

            return searchable.includes(normalizedSearchQuery);
        });
    }, [conversationPreviews, friendTagLookup, friendsWithTags, normalizedSearchQuery]);
    const untaggedFriends = friendsWithTags.filter((friend) => !friend.assignedTagId);
    const readyFriendCount = friendsWithTags.filter((friend) => friend.conversationId).length;
    const taggedFriendCount = friendsWithTags.filter((friend) => friend.assignedTagId).length;

    function renderFriendList(friends, emptyText, viewMode = "list") {
        if (friends.length === 0) {
            return <p>{emptyText}</p>;
        }

        return (
            <div className={`friends-list friends-list-${viewMode}`}>
                {friends.map((friend) => (
                    <FriendCard
                        key={friend.friendshipId}
                        friend={friend}
                        selectedFriendId={selectedFriendId}
                        activeView={activeView}
                        friendTagLookup={friendTagLookup}
                        conversationPreviews={conversationPreviews}
                        conversationHasUnreadActivity={conversationHasUnreadActivity}
                        onSelectFriend={(friendUserId) => {
                            onSelectFriend(friendUserId);
                            setShowFriendBrowser(false);
                        }}
                        onOpenFriendContextMenu={onOpenFriendContextMenu}
                    />
                ))}
            </div>
        );
    }

    return (
        <section className="friends-rail panel-card">
            <div className="friends-rail-scroll">
                <div className="friends-rail-header">
                    <div>
                        <div className="friends-title-row">
                            <h2>Friends</h2>
                            <button
                                type="button"
                                className={`friends-add-icon-button ${hasPendingIncomingFriendRequests ? "has-pending-friend-requests" : ""}`.trim()}
                                onClick={onOpenAddFriend}
                                aria-label="Add friend"
                                title="Add friend"
                            >
                                <img className="friends-add-icon-dark" src={addFriendIcon} alt="" />
                                <img className="friends-add-icon-light" src={addFriendWhiteIcon} alt="" />
                            </button>
                        </div>
                        <p>Keep your groups and DMs organized.</p>
                    </div>
                </div>
                <div className="friends-rail-header-actions">
                    <label className="friends-search friends-rail-search">
                        <div className="friends-search-header">
                            <span>Search friends</span>
                            <button
                                type="button"
                                className="menu-burger"
                                onClick={() => setShowFriendBrowser(true)}
                                aria-label="Browse friends"
                                title="Browse friends"
                            >
                                <span aria-hidden="true">≡</span>
                            </button>
                        </div>
                        <input
                            type="search"
                            value={friendSearchQuery}
                            placeholder="Search by name or tag"
                            onChange={(event) => setFriendSearchQuery(event.target.value)}
                        />
                    </label>
                </div>


                {normalizedSearchQuery ? (
                    <div className="friends-section">
                        <div className="friends-section-heading">
                            <h2>Search results</h2>
                            <span className="friends-section-count">{filteredFriends.length}</span>
                        </div>
                        {renderFriendList(filteredFriends, "No friends match that search.")}
                    </div>
                ) : (
                    <>
                        <GroupSection
                            invites={groupInvites}
                            conversations={groupConversations}
                            selectedGroupConversationId={selectedGroupConversationId}
                            activeView={activeView}
                            conversationPreviews={conversationPreviews}
                            conversationHasUnreadActivity={conversationHasUnreadActivity}
                            onCreateGroup={onCreateGroup}
                            onAcceptGroupInvite={onAcceptGroupInvite}
                            onDeclineGroupInvite={onDeclineGroupInvite}
                            onSelectGroupConversation={onSelectGroupConversation}
                        />

                        {loading || friendsState.friends.length === 0 || friendTagFolders.length > 0 ? (
                            <div className="friends-section">
                                <div className="friends-section-heading">
                                    <h2>Tagged folders</h2>
                                </div>
                                {loading ? <p>Loading friends...</p> : null}
                                {!loading && friendsState.friends.length === 0 ? <p>No friends yet.</p> : null}
                            </div>
                        ) : null}

                        {friendTagFolders.map((folder) => (
                            <FriendFolderSection
                                key={folder.id}
                                folder={folder}
                                isCollapsed={Boolean(collapsedFriendFolders[String(folder.id)])}
                                friends={friendsWithTags.filter((friend) => {
                                    const assignedTag = friendTagLookup[String(friend.assignedTagId)] || null;
                                    return assignedTag?.folderId === folder.id;
                                })}
                                selectedFriendId={selectedFriendId}
                                activeView={activeView}
                                friendTagLookup={friendTagLookup}
                                conversationPreviews={conversationPreviews}
                                conversationHasUnreadActivity={conversationHasUnreadActivity}
                                onSelectFriend={onSelectFriend}
                                onOpenFriendContextMenu={onOpenFriendContextMenu}
                                onToggleCollapsed={onToggleFriendFolder}
                            />
                        ))}

                        <div className="friends-section">
                            <h2>Untagged</h2>
                            {renderFriendList(untaggedFriends, "No untagged friends.")}
                        </div>
                    </>
                )}
            </div>

            {showFriendBrowser ? (
                <div
                    className="friends-settings-overlay"
                    onClick={() => setShowFriendBrowser(false)}
                >
                    <div
                        className="friends-finder-popout panel-card"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="friends-section-heading">
                            <div>
                                <h2>All friends</h2>
                                <p>Find a DM from one place.</p>
                            </div>
                            <span className="friends-section-count">{filteredFriends.length}</span>
                        </div>
                        <div className="friends-finder-summary">
                            <span>{friendsWithTags.length} friends</span>
                            <span>{readyFriendCount} DMs ready</span>
                            <span>{taggedFriendCount} tagged</span>
                        </div>
                        <label className="friends-search">
                            <span>Search friends</span>
                            <input
                                type="search"
                                value={friendSearchQuery}
                                placeholder="Search by name or tag"
                                onChange={(event) => setFriendSearchQuery(event.target.value)}
                                autoFocus
                            />
                        </label>
                        <div className="friends-view-options" aria-label="Friend browser view">
                            {[
                                ["list", "List"],
                                ["grid", "Grid"],
                                ["compact", "Compact"]
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    className={friendBrowserView === value ? "active" : ""}
                                    onClick={() => setFriendBrowserView(value)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        {loading ? <p>Loading friends...</p> : null}
                        {!loading
                            ? renderFriendList(
                                filteredFriends,
                                normalizedSearchQuery ? "No friends match that search." : "No friends yet.",
                                friendBrowserView
                            )
                            : null}
                        <button
                            type="button"
                            className="friends-settings-close"
                            onClick={() => setShowFriendBrowser(false)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            ) : null}

            <div className="sidebar-profile-slot friends-sidebar-profile-slot">
                <ProfileDock
                    currentUser={currentUser}
                    profileMediaHostUrl={profileMediaHostUrl}
                    clientSettings={clientSettings}
                    onOpenClientSettings={onOpenClientSettings}
                    onLogout={onLogout}
                />
            </div>
        </section>
    );
}
