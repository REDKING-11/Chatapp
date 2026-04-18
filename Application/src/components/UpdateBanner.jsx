import { UPDATE_PHASES } from "../lib/appUpdates.js";

function formatPublishedAt(value) {
    if (!value) {
        return "";
    }

    const publishedAt = new Date(value);
    if (Number.isNaN(publishedAt.getTime())) {
        return "";
    }

    return publishedAt.toLocaleDateString();
}

export default function UpdateBanner({
    state,
    onDismiss,
    onCheckForUpdates,
    onOpenReleasesPage
}) {
    const publishedLabel = formatPublishedAt(state?.publishedAt);
    const canShowReleaseLink = Boolean(state?.releaseUrl);
    const isManualUpToDate = state?.phase === UPDATE_PHASES.UP_TO_DATE && state?.trigger === "manual";

    if (!state || (state.phase === UPDATE_PHASES.UP_TO_DATE && !isManualUpToDate) || state.phase === UPDATE_PHASES.CHECKING || state.phase === UPDATE_PHASES.IDLE) {
        return null;
    }

    if (state.phase === UPDATE_PHASES.AVAILABLE) {
        return (
            <div className="update-banner">
                <div className="update-banner-copy">
                    <div className="update-banner-title-row">
                        <strong>{state.latestVersion}</strong>
                        <span>{state.releaseName || "New release available"}</span>
                    </div>
                    {state.notesSummary ? <p>{state.notesSummary}</p> : null}
                    <div className="update-banner-meta">
                        {publishedLabel ? <span>Published {publishedLabel}</span> : null}
                        <span>Open the release page to download the latest MSI installer.</span>
                    </div>
                </div>
                <div className="update-banner-actions">
                    {canShowReleaseLink ? (
                        <button className="update-banner-primary" onClick={onOpenReleasesPage}>
                            Download installer
                        </button>
                    ) : null}
                    <button className="update-banner-dismiss" onClick={onDismiss}>
                        Later
                    </button>
                </div>
            </div>
        );
    }

    if (state.phase === UPDATE_PHASES.ERROR) {
        return (
            <div className="update-banner is-error">
                <div className="update-banner-copy">
                    <div className="update-banner-title-row">
                        <strong>Update problem</strong>
                        <span>{state.releaseName || "Try again"}</span>
                    </div>
                    <p>{state.error || "Could not complete that update action."}</p>
                </div>
                <div className="update-banner-actions">
                    <button className="update-banner-primary" onClick={onCheckForUpdates}>
                        Check again
                    </button>
                    {canShowReleaseLink ? (
                        <button className="update-banner-secondary" onClick={onOpenReleasesPage}>
                            View release
                        </button>
                    ) : null}
                    <button className="update-banner-dismiss" onClick={onDismiss}>
                        Close
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="update-banner is-success">
            <div className="update-banner-copy">
                <div className="update-banner-title-row">
                    <strong>You are up to date</strong>
                    <span>{state.currentVersion || "Current version"}</span>
                </div>
                <p>You already have the latest published release available for this app.</p>
            </div>
            <div className="update-banner-actions">
                {canShowReleaseLink ? (
                    <button className="update-banner-secondary" onClick={onOpenReleasesPage}>
                        View releases
                    </button>
                ) : null}
                <button className="update-banner-dismiss" onClick={onDismiss}>
                    Close
                </button>
            </div>
        </div>
    );
}
