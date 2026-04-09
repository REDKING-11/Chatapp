import { useEffect, useMemo, useRef, useState } from "react";
import {
    fetchProfileAssetBlobUrl,
    fetchProfileAssetManifest
} from "../features/profile/actions";

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
    profileMediaHostUrl,
    clientSettings,
    onOpenClientSettings,
    onLogout
}) {
    const [isCardOpen, setIsCardOpen] = useState(false);
    const [contextMenuOpen, setContextMenuOpen] = useState(false);
    const [profileManifest, setProfileManifest] = useState(null);
    const [avatarUrl, setAvatarUrl] = useState(null);
    const [bannerUrl, setBannerUrl] = useState(null);
    const [mediaRefreshNonce, setMediaRefreshNonce] = useState(0);
    const cardRef = useRef(null);
    const contextMenuRef = useRef(null);
    const buttonRef = useRef(null);
    const userLabel = useMemo(() => getUserLabel(currentUser), [currentUser]);
    const userHandle = useMemo(() => getUserHandle(currentUser), [currentUser]);
    const initials = useMemo(() => getInitials(userLabel), [userLabel]);
    const shouldLoadAvatars = Boolean(clientSettings?.autoLoadProfileAvatars);
    const shouldLoadBanners = Boolean(clientSettings?.autoLoadProfileBanners);

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
            if (!profileMediaHostUrl || !currentUser?.id || !shouldLoadAvatars || !profileManifest?.avatar?.hasAsset) {
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
    }, [currentUser?.id, profileManifest?.avatar?.hasAsset, profileMediaHostUrl, shouldLoadAvatars]);

    useEffect(() => {
        let revokedUrl = null;

        async function loadBanner() {
            if (!profileMediaHostUrl || !currentUser?.id || !shouldLoadBanners || !profileManifest?.banner?.hasAsset) {
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
    }, [currentUser?.id, profileManifest?.banner?.hasAsset, profileMediaHostUrl, shouldLoadBanners]);

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
                            <span className="profile-dock-card-status-dot" />
                        </div>

                        <div className="profile-dock-card-actions">
                            <button type="button" title="Profile card">
                                <span>✓</span>
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
                                <span>⚙</span>
                            </button>
                        </div>

                        <div className="profile-dock-card-meta">
                            <strong>{userLabel}</strong>
                            <span>{userHandle}</span>
                        </div>

                        <div className="profile-dock-host-note">
                            Edit your display name, avatar, and background from Client Settings, Profile.
                        </div>
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
                    <span>{userHandle}</span>
                </div>
            </button>
        </div>
    );
}
