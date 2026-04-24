import { UPDATE_DOWNLOAD_PHASES, UPDATE_PHASES } from "../lib/appUpdates.js";

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
    onOpenReleasesPage,
    onOpenDownloadedInstaller
}) {
    const publishedLabel = formatPublishedAt(state?.publishedAt);
    const canShowReleaseLink = Boolean(state?.releaseUrl);
    const isManualUpToDate = state?.phase === UPDATE_PHASES.UP_TO_DATE && state?.trigger === "manual";
    const installerIsDownloading = state?.installerDownloadPhase === UPDATE_DOWNLOAD_PHASES.DOWNLOADING;
    const installerIsDownloaded = state?.installerDownloadPhase === UPDATE_DOWNLOAD_PHASES.DOWNLOADED;
    const installerHasError = state?.installerDownloadPhase === UPDATE_DOWNLOAD_PHASES.ERROR;
    const installerProgress = Math.max(0, Math.min(100, Number(state?.installerDownloadProgress || 0)));

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
                        {installerIsDownloading ? <span>Downloading MSI installer to Downloads...</span> : null}
                        {installerIsDownloaded ? <span>MSI installer downloaded: {state.installerAssetName || "installer"}</span> : null}
                        {installerHasError ? <span>{state.installerDownloadError || "Installer download failed."}</span> : null}
                        {!installerIsDownloading && !installerIsDownloaded && !installerHasError ? (
                            <span>{state.installerAssetName ? "MSI installer will download automatically." : "Open the release page to download the installer."}</span>
                        ) : null}
                    </div>
                    {installerIsDownloading ? (
                        <div className="update-banner-progress" aria-label={`Installer download ${installerProgress}%`}>
                            <span style={{ width: `${installerProgress}%` }} />
                        </div>
                    ) : null}
                </div>
                <div className="update-banner-actions">
                    {installerIsDownloaded ? (
                        <button className="update-banner-primary" onClick={onOpenDownloadedInstaller}>
                            Open installer
                        </button>
                    ) : null}
                    {installerIsDownloading ? (
                        <button className="update-banner-primary" type="button" disabled>
                            Downloading...
                        </button>
                    ) : null}
                    {canShowReleaseLink ? (
                        <button
                            className={installerIsDownloaded || installerIsDownloading ? "update-banner-secondary" : "update-banner-primary"}
                            onClick={onOpenReleasesPage}
                        >
                            View release
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
