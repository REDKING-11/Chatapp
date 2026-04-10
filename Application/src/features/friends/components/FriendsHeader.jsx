export default function FriendsHeader({
    autoRefreshEnabled,
    onRefresh,
    onToggleAutoRefresh
}) {
    return (
        <div className="friends-header">
            <div>
                <h1>Friends</h1>
                <p>Manage friends and start private conversations from one place.</p>
            </div>

            <div className="friends-header-actions">
                <button className="friends-refresh-button" onClick={onRefresh}>
                    Refresh
                </button>

                <label className="friends-autorefresh-toggle">
                    <span className="friends-autorefresh-label">Auto</span>
                    <input
                        type="checkbox"
                        checked={autoRefreshEnabled}
                        onChange={(event) => onToggleAutoRefresh(event.target.checked)}
                    />
                    <span className="friends-autorefresh-switch" aria-hidden="true">
                        <span className="friends-autorefresh-knob" />
                    </span>
                </label>
            </div>
        </div>
    );
}
