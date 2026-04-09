function GroupSection({
    conversations,
    selectedGroupConversationId,
    activeView,
    conversationPreviews,
    conversationHasUnreadActivity,
    onCreateGroup,
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
            {conversations.length === 0 ? <p>No group chats yet.</p> : null}

            <div className="friends-list">
                {conversations.map((conversation) => (
                    <button
                        key={conversation.id}
                        className={`friend-card ${conversationHasUnreadActivity(conversation.id) ? "recent-friend-activity" : ""} ${activeView === "group" && String(selectedGroupConversationId) === String(conversation.id) ? "selected-friend-card" : ""}`}
                        onClick={() => onSelectGroupConversation(conversation.id)}
                    >
                        <strong>{conversation.title}</strong>
                        <span>{(conversation.participants || []).length} members</span>
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

    return (
        <button
            key={friend.friendshipId}
            className={`friend-card ${conversationHasUnreadActivity(friend.conversationId) ? "recent-friend-activity" : ""} ${activeView === "friend" && selectedFriendId === friend.friendUserId ? "selected-friend-card" : ""}`}
            onClick={() => onSelectFriend(friend.friendUserId)}
            onContextMenu={(event) => onOpenFriendContextMenu(event, friend)}
        >
            <strong>{friend.friendUsername}</strong>
            {assignedTag ? (
                <small className="friend-tag-pill">{assignedTag.label}</small>
            ) : null}
            {friend.conversationId ? (
                conversationPreviews[String(friend.conversationId)]?.hasMessage ? null : (
                    <span>DM ready</span>
                )
            ) : (
                <span>No DM yet</span>
            )}
            {friend.conversationId ? (
                <small className="friend-card-preview">
                    {conversationPreviews[String(friend.conversationId)]?.text || "No messages yet"}
                </small>
            ) : null}
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
    onSelectGroupConversation,
    onSelectFriend,
    onOpenFriendContextMenu,
    onToggleFriendFolder,
    onOpenClientSettings,
    onLogout
}) {
    const friendsWithTags = friendsState.friends.map((friend) => ({
        ...friend,
        assignedTagId: friendTags[String(friend.friendUserId)] || null
    }));
    const untaggedFriends = friendsWithTags.filter((friend) => !friend.assignedTagId);

    return (
        <section className="friends-rail panel-card">
            <div className="friends-rail-scroll">
                <div className="friends-rail-header">
                    <div>
                        <h2>Friends</h2>
                        <p>Keep your groups and DMs organized.</p>
                    </div>
                    <button
                        type="button"
                        className="friends-primary-action"
                        onClick={onOpenAddFriend}
                    >
                        Add friend
                    </button>
                </div>

                <GroupSection
                    conversations={groupConversations}
                    selectedGroupConversationId={selectedGroupConversationId}
                    activeView={activeView}
                    conversationPreviews={conversationPreviews}
                    conversationHasUnreadActivity={conversationHasUnreadActivity}
                    onCreateGroup={onCreateGroup}
                    onSelectGroupConversation={onSelectGroupConversation}
                />

                <div className="friends-section">
                    <div className="friends-section-heading">
                        <h2>Tagged folders</h2>
                    </div>
                    {loading ? <p>Loading friends...</p> : null}
                    {!loading && friendsState.friends.length === 0 ? <p>No friends yet.</p> : null}
                </div>

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
                    {untaggedFriends.length === 0 ? <p>No untagged friends.</p> : null}
                    <div className="friends-list">
                        {untaggedFriends.map((friend) => (
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
                </div>
            </div>

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
import ProfileDock from "../ProfileDock";
