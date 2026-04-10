import { RELAY_RETENTION_OPTIONS } from "../../dm/actions";

export default function FriendsCreateGroupModal({
    friends,
    groupTitle,
    groupMemberIds,
    selectedRelayTtlSeconds,
    errorMessage,
    submitting,
    onClose,
    onGroupTitleChange,
    onRelayTtlChange,
    onToggleGroupMember,
    onCreateGroup
}) {
    return (
        <div className="friends-settings-overlay" onClick={onClose}>
            <div className="friends-settings-popout panel-card" onClick={(event) => event.stopPropagation()}>
                <div className="friends-settings-header">
                    <div>
                        <h2>New group chat</h2>
                        <p>Create an encrypted conversation with multiple friends.</p>
                    </div>

                    <button
                        type="button"
                        className="friends-settings-close"
                        onClick={onClose}
                    >
                        x
                    </button>
                </div>

                <form className="friends-group-form" onSubmit={onCreateGroup}>
                    <label className="friends-group-label" htmlFor="group-title-input">
                        Group name
                    </label>
                    <input
                        id="group-title-input"
                        className="friends-group-input"
                        value={groupTitle}
                        onChange={(event) => onGroupTitleChange(event.target.value)}
                        placeholder="Weekend plans"
                    />

                    <label className="friends-group-label" htmlFor="group-relay-select">
                        Offline relay window
                    </label>
                    <select
                        id="group-relay-select"
                        className="friends-group-input"
                        value={selectedRelayTtlSeconds}
                        onChange={(event) => onRelayTtlChange(Number(event.target.value))}
                    >
                        {RELAY_RETENTION_OPTIONS.map((option) => (
                            <option key={option.seconds} value={option.seconds}>
                                {option.label}
                            </option>
                        ))}
                    </select>

                    <div className="friends-group-member-picker">
                        {friends.length === 0 ? (
                            <p>No friends available yet.</p>
                        ) : (
                            friends.map((friend) => {
                                const memberKey = String(friend.friendUserId);

                                return (
                                    <label key={friend.friendshipId} className="friends-group-member-option">
                                        <input
                                            type="checkbox"
                                            checked={groupMemberIds.includes(memberKey)}
                                            onChange={() => onToggleGroupMember(friend.friendUserId)}
                                        />
                                        <span>{friend.friendUsername}</span>
                                    </label>
                                );
                            })
                        )}
                    </div>

                    <p className="friends-group-helper">
                        Select at least two friends. A group chat includes you plus the friends you pick.
                    </p>

                    {errorMessage ? (
                        <p className="friends-error">{errorMessage}</p>
                    ) : null}

                    <button
                        type="submit"
                        disabled={submitting || !groupTitle.trim() || groupMemberIds.length < 2}
                    >
                        {submitting ? "Creating group..." : "Create group"}
                    </button>
                </form>
            </div>
        </div>
    );
}
