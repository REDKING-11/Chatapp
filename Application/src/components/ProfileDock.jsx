import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    fetchProfileAssetBlobUrl,
    fetchProfileAssetManifest
} from "../features/profile/actions";
import {
    getElementViewportRect,
    resolveAnchoredPopoverPosition
} from "../lib/popoverPosition.js";
import {
    fetchServerProfile,
    updateServerProfile
} from "../features/profile/serverProfileActions";
import {
    getConfiguredPresenceMeta,
    PRESENCE_OPTIONS
} from "../features/presence";

const KNOWN_GAME_TONES = {
    "league of legends": "is-magic",
    paladins: "is-sky",
    "dota 2": "is-ember",
    valorant: "is-crimson",
    overwatch: "is-sunset",
    minecraft: "is-forest",
    terraria: "is-forest",
    "counter-strike 2": "is-steel",
    cs2: "is-steel",
    destiny: "is-violet"
};

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

function normalizeProfileGames(games) {
    if (!Array.isArray(games)) {
        return [];
    }

    const seen = new Set();

    return games.reduce((next, game) => {
        const normalizedGame = String(game || "").trim();
        const dedupeKey = normalizedGame.toLowerCase();

        if (!normalizedGame || seen.has(dedupeKey)) {
            return next;
        }

        seen.add(dedupeKey);
        next.push(normalizedGame.slice(0, 40));
        return next;
    }, []).slice(0, 6);
}

function getGameTileTone(game) {
    const normalized = String(game || "").trim().toLowerCase();
    return KNOWN_GAME_TONES[normalized] || "is-neutral";
}

function getGameTileInitials(game) {
    const normalized = String(game || "").trim();
    if (!normalized) {
        return "?";
    }

    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function ProfileGamesRow({ games, emptyLabel = "No games added yet." }) {
    if (!games.length) {
        return <p className="profile-shared-empty">{emptyLabel}</p>;
    }

    return (
        <div className="profile-shared-games-row">
            {games.map((game) => (
                <div
                    key={game}
                    className={`profile-shared-game-tile ${getGameTileTone(game)}`.trim()}
                    title={game}
                >
                    <span className="profile-shared-game-badge" aria-hidden="true">
                        {getGameTileInitials(game)}
                    </span>
                    <strong>{game}</strong>
                </div>
            ))}
        </div>
    );
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
    const [floatingPosition, setFloatingPosition] = useState(null);
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
    const profileBio = String(currentUser?.profileDescription || "").trim();
    const profileGames = useMemo(
        () => normalizeProfileGames(currentUser?.profileGames),
        [currentUser?.profileGames]
    );

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

        function handleKeyDown(event) {
            if (event.key === "Escape") {
                setIsCardOpen(false);
                setContextMenuOpen(false);
            }
        }

        window.addEventListener("click", handleWindowClick);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("click", handleWindowClick);
            window.removeEventListener("keydown", handleKeyDown);
        };
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

    useLayoutEffect(() => {
        if (!isCardOpen && !contextMenuOpen) {
            setFloatingPosition(null);
            return undefined;
        }

        function updateFloatingPosition() {
            const anchorRect = getElementViewportRect(buttonRef.current);

            if (!anchorRect) {
                return;
            }

            const floatingNode = isCardOpen ? cardRef.current : contextMenuRef.current;
            const floatingRect = floatingNode?.getBoundingClientRect();
            const nextPosition = resolveAnchoredPopoverPosition({
                anchorRect,
                popoverWidth: floatingRect?.width || (isCardOpen ? 404 : 180),
                popoverHeight: floatingRect?.height || (isCardOpen ? 640 : 220),
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
                preferredPlacement: isCardOpen ? "top" : "top-start"
            });

            setFloatingPosition((prev) => (
                prev
                && prev.left === nextPosition.left
                && prev.top === nextPosition.top
                && prev.width === nextPosition.width
                && prev.maxHeight === nextPosition.maxHeight
                    ? prev
                    : nextPosition
            ));
        }

        updateFloatingPosition();
        window.addEventListener("resize", updateFloatingPosition);
        window.addEventListener("scroll", updateFloatingPosition, true);

        return () => {
            window.removeEventListener("resize", updateFloatingPosition);
            window.removeEventListener("scroll", updateFloatingPosition, true);
        };
    }, [
        contextMenuOpen,
        isCardOpen,
        isEditingServerDescription,
        presenceStatus,
        profileBio,
        profileGames.length,
        serverProfile,
        serverProfileStatus
    ]);

    const floatingStyle = floatingPosition ? {
        left: `${floatingPosition.left}px`,
        top: `${floatingPosition.top}px`,
        maxHeight: `${floatingPosition.maxHeight}px`
    } : {
        left: "12px",
        top: "12px",
        maxHeight: "calc(100vh - 24px)"
    };

    return (
        <div className="profile-dock">
            {typeof document !== "undefined" ? createPortal(
                <>
            {isCardOpen ? (
                <div
                    ref={cardRef}
                    className="profile-dock-card"
                    style={floatingStyle}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div
                        className="profile-dock-card-banner"
                        style={bannerUrl ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                    >
                        <div className="profile-dock-card-banner-overlay" />
                    </div>

                    <div className="profile-dock-card-body">
                        <section className="profile-shared-hero profile-shared-hero-self">
                            <div className="profile-shared-hero-media">
                                <div className="profile-dock-avatar profile-dock-card-avatar">
                                    {avatarUrl ? <img src={avatarUrl} alt={userLabel} className="profile-dock-avatar-image" /> : initials}
                                </div>
                                <span className={`profile-dock-card-status-dot is-${presenceStatus}`.trim()} />
                            </div>

                            <div className="profile-shared-hero-copy">
                                <span className="profile-shared-eyebrow">Your profile</span>
                                <strong>{userLabel}</strong>
                                <span className="profile-shared-handle">{userHandle}</span>
                                <div className="profile-shared-status-row">
                                    <span className={`profile-dock-status-pill is-${presenceStatus}`.trim()}>
                                        {presenceMeta.label}
                                    </span>
                                    <small>{presenceMeta.detail}</small>
                                </div>
                            </div>

                            <div className="profile-dock-card-actions">
                                <button
                                    type="button"
                                    title="Copy handle"
                                    onClick={handleCopyHandle}
                                >
                                    #
                                </button>
                                <button
                                    type="button"
                                    title="Client settings"
                                    onClick={() => {
                                        setIsCardOpen(false);
                                        onOpenClientSettings?.();
                                    }}
                                >
                                    o
                                </button>
                            </div>
                        </section>

                        <section className="profile-shared-section">
                            <div className="profile-shared-section-header">
                                <div>
                                    <strong>Bio</strong>
                                    <span>Default profile description shown in DMs.</span>
                                </div>
                            </div>
                            <div className="profile-shared-section-panel">
                                <p className="profile-shared-copy">
                                    {profileBio || "Add a short bio in Client Settings so friends can download it in DMs."}
                                </p>
                            </div>
                        </section>

                        <section className="profile-shared-section">
                            <div className="profile-shared-section-header">
                                <div>
                                    <strong>Games</strong>
                                    <span>The titles you want people to notice first.</span>
                                </div>
                            </div>
                            <ProfileGamesRow games={profileGames} emptyLabel="No games added yet." />
                        </section>

                        <div className="profile-dock-status-panel">
                            <div className="profile-dock-status-summary">
                                <span className="profile-shared-eyebrow">Presence</span>
                                <small>Desktop notifications still honor your busy status.</small>
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
                            Edit your bio, games, avatar, and background from Client Settings, Profile.
                        </div>

                        {hasServerProfile ? (
                            <div className="profile-dock-server-description">
                                <div className="profile-dock-server-description-header">
                                    <div>
                                        <strong>Server description</strong>
                                        <span>This stays specific to the current server.</span>
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
                                        o
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
                    style={floatingStyle}
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
                </>,
                document.body
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
                <div className="profile-dock-button-media">
                    <div className="profile-dock-avatar">
                        {avatarUrl ? <img src={avatarUrl} alt={userLabel} className="profile-dock-avatar-image" /> : initials}
                    </div>
                    <span className={`profile-dock-card-status-dot profile-dock-button-status-dot is-${presenceStatus}`.trim()} />
                </div>
                <div className="profile-dock-meta">
                    <strong>{userLabel}</strong>
                    <span className="profile-dock-meta-handle">{userHandle}</span>
                    <span className="profile-dock-meta-status">{presenceMeta.label}</span>
                </div>
                <div className="profile-dock-button-chevron" aria-hidden="true">
                    {isCardOpen ? "^" : ">"}
                </div>
            </button>
        </div>
    );
}
