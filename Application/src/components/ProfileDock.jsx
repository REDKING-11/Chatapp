import { useEffect, useMemo, useRef, useState } from "react";
import {
    fetchProfileAssetBlobUrl,
    fetchProfileAssetManifest
} from "../features/profile/actions";
import {
    fetchServerProfile,
    updateServerProfile
} from "../features/profile/serverProfileActions";
import {
    getConfiguredPresenceMeta,
    PRESENCE_OPTIONS
} from "../features/presence";

function getUserLabel(user) {
    return user?.displayName || user?.usernameBase || user?.username || "User";
}

function getUserHandle(user) {
    if (user?.usernameTag && user?.usernameBase) {
        return `${user.usernameBase}#${user.usernameTag}`;
    }

    return user?.handle || user?.username || "unknown";
}

function getInitials(label) {
    const normalized = String(label || "").trim();
    if (!normalized) {
        return "?";
    }

    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
        return parts[0].slice(0, 1).toUpperCase();
    }

    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export default function ProfileDock({
    currentUser,
    backendUrl,
    profileMediaHostUrl,
    clientSettings,
    onChangeClientSetting,
    onOpenClientSettings,
    onLogout
}) {
    const [isCardOpen, setIsCardOpen] = useState(false);
    const [contextMenuOpen, setContextMenuOpen] = useState(false);
    const [profileManifest, setProfileManifest] = useState(null);
    const [avatarUrl, setAvatarUrl] = useState(null);
    const [bannerUrl, setBannerUrl] = useState(null);
    const [mediaRefreshNonce, setMediaRefreshNonce] = useState(0);
    const [serverProfile, setServerProfile] = useState(null);
    const [serverDescription, setServerDescription] = useState("");
    const [serverProfileSaving, setServerProfileSaving] = useState(false);
    const [serverProfileStatus, setServerProfileStatus] = useState("");
    const [isEditingServerDescription, setIsEditingServerDescription] = useState(false);
    const cardRef = useRef(null);
    const contextMenuRef = useRef(null);
    const buttonRef = useRef(null);
    const userLabel = useMemo(() => getUserLabel(currentUser), [currentUser]);
    const userHandle = useMemo(() => getUserHandle(currentUser), [currentUser]);
    const initials = useMemo(() => getInitials(userLabel), [userLabel]);
    const hasServerProfile = Boolean(backendUrl);
    const presenceStatus = clientSettings?.presenceStatus || "online";
    const presenceMeta = getConfiguredPresenceMeta(presenceStatus);

    useEffect(() => {
        async function loadManifest() {
            if (!profileMediaHostUrl || !currentUser?.id) {
                setProfileManifest(null);
                return;
            }

            try {
                const manifest = await fetchProfileAssetManifest({
                    backendUrl: profileMediaHostUrl,
                    userId: currentUser.id
                });
                setProfileManifest(manifest);
            } catch {
                setProfileManifest(null);
            }
        }

        loadManifest();
    }, [currentUser?.id, mediaRefreshNonce, profileMediaHostUrl]);

    useEffect(() => {
        function handleProfileMediaUpdated() {
            setMediaRefreshNonce((value) => value + 1);
        }

        window.addEventListener("profileMediaUpdated", handleProfileMediaUpdated);
        return () => window.removeEventListener("profileMediaUpdated", handleProfileMediaUpdated);
    }, []);

    useEffect(() => {
        let revokedUrl = null;

        async function loadAvatar() {
            if (!profileMediaHostUrl || !currentUser?.id || !profileManifest?.avatar?.hasAsset) {
                setAvatarUrl(null);
                return;
            }

            try {
                const objectUrl = await fetchProfileAssetBlobUrl({
                    backendUrl: profileMediaHostUrl,
                    userId: currentUser.id,
                    assetType: "avatar"
                });
                revokedUrl = objectUrl;
                setAvatarUrl(objectUrl);
            } catch {
                setAvatarUrl(null);
            }
        }

        loadAvatar();

        return () => {
            if (revokedUrl) {
                URL.revokeObjectURL(revokedUrl);
            }
        };
    }, [currentUser?.id, profileManifest?.avatar?.hasAsset, profileMediaHostUrl]);

    useEffect(() => {
        let revokedUrl = null;

        async function loadBanner() {
            if (!profileMediaHostUrl || !currentUser?.id || !profileManifest?.banner?.hasAsset) {
                setBannerUrl(null);
                return;
            }

            try {
                const objectUrl = await fetchProfileAssetBlobUrl({
                    backendUrl: profileMediaHostUrl,
                    userId: currentUser.id,
                    assetType: "banner"
                });
                revokedUrl = objectUrl;
                setBannerUrl(objectUrl);
            } catch {
                setBannerUrl(null);
            }
        }

        loadBanner();

        return () => {
            if (revokedUrl) {
                URL.revokeObjectURL(revokedUrl);
            }
        };
    }, [currentUser?.id, profileManifest?.banner?.hasAsset, profileMediaHostUrl]);

    useEffect(() => {
        setServerProfile(null);
        setServerDescription("");
        setServerProfileStatus("");
        setIsEditingServerDescription(false);
    }, [backendUrl, currentUser?.id]);

    useEffect(() => {
        let cancelled = false;

        async function loadServerProfile() {
            if (!isCardOpen || !backendUrl || !currentUser?.id) {
                return;
            }

            try {
                const profile = await fetchServerProfile({ backendUrl });

                if (cancelled) {
                    return;
                }

                setServerProfile(profile);
                setServerDescription(profile?.description || "");
                setServerProfileStatus("");
                setIsEditingServerDescription(false);
            } catch {
                if (!cancelled) {
                    setServerProfile(null);
                    setServerDescription("");
                    setServerProfileStatus("Could not load this server profile yet.");
                    setIsEditingServerDescription(false);
                }
            }
        }

        loadServerProfile();

        return () => {
            cancelled = true;
        };
    }, [backendUrl, currentUser?.id, isCardOpen]);

    useEffect(() => {
        if (!isCardOpen && !contextMenuOpen) {
            return undefined;
        }

        function handleWindowClick(event) {
            if (
                cardRef.current?.contains(event.target)
                || contextMenuRef.current?.contains(event.target)
                || buttonRef.current?.contains(event.target)
            ) {
                return;
            }

            setIsCardOpen(false);
            setContextMenuOpen(false);
        }

        window.addEventListener("click", handleWindowClick);
        return () => window.removeEventListener("click", handleWindowClick);
    }, [contextMenuOpen, isCardOpen]);

    async function handleCopyHandle() {
        try {
            await navigator.clipboard.writeText(userHandle);
        } catch {
            // ignore clipboard failures for now
        }
        setContextMenuOpen(false);
    }

    async function handleSaveServerDescription() {
        if (!backendUrl || serverProfileSaving) {
            return;
        }

        setServerProfileSaving(true);
        setServerProfileStatus("");

        try {
            const profile = await updateServerProfile({
                backendUrl,
                description: serverDescription
            });
            setServerProfile(profile);
            setServerDescription(profile?.description || "");
            setServerProfileStatus("Saved for this server.");
            setIsEditingServerDescription(false);
        } catch (error) {
            setServerProfileStatus(error?.message || "Could not save this server profile.");
        } finally {
            setServerProfileSaving(false);
        }
    }

    function handleStatusChange(nextStatus) {
        if (!nextStatus || nextStatus === presenceStatus) {
            return;
        }

        onChangeClientSetting?.("presenceStatus", nextStatus);
    }

    return (
        <div className="profile-dock">
            {isCardOpen ? (
                <div ref={cardRef} className="profile-dock-card" onClick={(event) => event.stopPropagation()}>
                    <div
                        className="profile-dock-card-banner"
                        style={bannerUrl ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                    >
                        <span className="profile-dock-card-star profile-dock-card-star-large" />
                        <span className="profile-dock-card-star profile-dock-card-star-small" />
                    </div>

                    <div className="profile-dock-card-body">
                        <div className="profile-dock-card-avatar-wrap">
                            <div className="profile-dock-avatar profile-dock-card-avatar">
                                {avatarUrl ? <img src={avatarUrl} alt={userLabel} className="profile-dock-avatar-image" /> : initials}
                            </div>
                            <span className={`profile-dock-card-status-dot is-${presenceStatus}`.trim()} />
                        </div>

                        <div className="profile-dock-card-actions">
                            <button type="button" title="Profile card">
                                <span>v</span>
                            </button>
                            <button type="button" title="Copy handle" onClick={handleCopyHandle}>
                                <span>#</span>
                            </button>
                            <button
                                type="button"
                                title="Client settings"
                                onClick={() => {
                                    setIsCardOpen(false);
                                    onOpenClientSettings?.();
                                }}
                            >
                                <span>o</span>
                            </button>
                        </div>

                        <div className="profile-dock-card-meta">
                            <strong>{userLabel}</strong>
                            <span>{userHandle}</span>
                        </div>

                        <div className="profile-dock-status-panel">
                            <div className="profile-dock-status-summary">
                                <span className={`profile-dock-status-pill is-${presenceStatus}`.trim()}>
                                    {presenceMeta.label}
                                </span>
                                <small>{presenceMeta.detail}</small>
                            </div>

                            <div className="profile-dock-status-grid" aria-label="Presence status">
                                {PRESENCE_OPTIONS.map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        className={`profile-dock-status-option ${option.id === presenceStatus ? "is-active" : ""}`.trim()}
                                        onClick={() => handleStatusChange(option.id)}
                                    >
                                        <span className={`profile-dock-status-dot is-${option.id}`.trim()} aria-hidden="true" />
                                        <span>{option.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="profile-dock-host-note">
                            Edit your display name, avatar, and background from Client Settings, Profile.
                        </div>

                        {hasServerProfile ? (
                            <div className="profile-dock-server-description">
                                <div className="profile-dock-server-description-header">
                                    <div>
                                        <strong>Server Description</strong>
                                        <span>Only you can edit this for this server.</span>
                                    </div>
                                    <button
                                        type="button"
                                        className="profile-dock-server-description-settings"
                                        title={isEditingServerDescription ? "Close server description editor" : "Edit server description"}
                                        onClick={() => {
                                            setServerProfileStatus("");
                                            setServerDescription(serverProfile?.description || "");
                                            setIsEditingServerDescription((prev) => !prev);
                                        }}
                                    >
                                        <span>o</span>
                                    </button>
                                </div>

                                {!isEditingServerDescription ? (
                                    <div className="profile-dock-server-description-display">
                                        <p>
                                            {serverProfile?.description?.trim()
                                                || "No server-specific profile description yet."}
                                        </p>
                                        <span>
                                            {serverProfile?.updatedAt
                                                ? `Updated ${new Date(serverProfile.updatedAt).toLocaleString()}`
                                                : "Use settings to add one."}
                                        </span>
                                    </div>
                                ) : (
                                    <>
                                        <textarea
                                            value={serverDescription}
                                            onChange={(event) => {
                                                setServerDescription(event.target.value.slice(0, 280));
                                                if (serverProfileStatus) {
                                                    setServerProfileStatus("");
                                                }
                                            }}
                                            placeholder="Add a server-specific profile description..."
                                            maxLength={280}
                                        />

                                        <div className="profile-dock-server-description-footer">
                                            <span>{serverDescription.length}/280</span>
                                            <div className="profile-dock-server-description-actions">
                                                <button
                                                    type="button"
                                                    className="secondary"
                                                    onClick={() => {
                                                        setServerDescription(serverProfile?.description || "");
                                                        setServerProfileStatus("");
                                                        setIsEditingServerDescription(false);
                                                    }}
                                                    disabled={serverProfileSaving}
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleSaveServerDescription}
                                                    disabled={serverProfileSaving}
                                                >
                                                    {serverProfileSaving ? "Saving..." : "Save"}
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {serverProfileStatus ? (
                                    <p className="profile-dock-server-description-status">{serverProfileStatus}</p>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {contextMenuOpen ? (
                <div
                    ref={contextMenuRef}
                    className="profile-dock-context-menu"
                    onClick={(event) => event.stopPropagation()}
                >
                    <button
                        type="button"
                        onClick={() => {
                            setContextMenuOpen(false);
                            setIsCardOpen(true);
                        }}
                    >
                        Open profile
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setContextMenuOpen(false);
                            onOpenClientSettings?.();
                        }}
                    >
                        Profile & settings
                    </button>
                    <button type="button" onClick={handleCopyHandle}>
                        Copy handle
                    </button>
                    <button
                        type="button"
                        className="danger"
                        onClick={() => {
                            setContextMenuOpen(false);
                            onLogout?.();
                        }}
                    >
                        Logout
                    </button>
                </div>
            ) : null}

            <button
                ref={buttonRef}
                type="button"
                className={`profile-dock-button ${isCardOpen || contextMenuOpen ? "is-open" : ""}`}
                onClick={() => {
                    setContextMenuOpen(false);
                    setIsCardOpen((prev) => !prev);
                }}
                onContextMenu={(event) => {
                    event.preventDefault();
                    setIsCardOpen(false);
                    setContextMenuOpen((prev) => !prev);
                }}
                title={userHandle}
            >
                <div className="profile-dock-avatar">
                    {avatarUrl ? <img src={avatarUrl} alt={userLabel} className="profile-dock-avatar-image" /> : initials}
                </div>
                <div className="profile-dock-meta">
                    <strong>{userLabel}</strong>
                    <span>{userHandle} · {presenceMeta.label}</span>
                </div>
            </button>
        </div>
    );
}
