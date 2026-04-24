import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resolveAnchoredPopoverPosition } from "../../../lib/popoverPosition.js";
import {
    fetchProfileAssetBlobUrl,
    fetchProfileAssetManifest
} from "../../profile/actions";
import {
    getConfiguredPresenceMeta,
    resolvePresenceMeta
} from "../../presence";
import { fetchFriendProfileDescription } from "../actions";

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
    }, []).slice(0, 4);
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

function getSelfHandle(currentUser) {
    if (currentUser?.usernameTag && currentUser?.usernameBase) {
        return `${currentUser.usernameBase}#${currentUser.usernameTag}`;
    }

    return currentUser?.handle || currentUser?.username || "unknown";
}

function ProfileGamesRow({ games }) {
    if (!games.length) {
        return null;
    }

    return (
        <div className="chat-user-profile-games">
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

export default function ChatUserProfilePopover({
    target,
    currentUser,
    friend,
    presence,
    profileMediaHostUrl,
    clientSettings,
    onClose,
    onOpenFullProfile
}) {
    const popoverRef = useRef(null);
    const [position, setPosition] = useState(null);
    const [profileManifest, setProfileManifest] = useState(null);
    const [avatarUrl, setAvatarUrl] = useState(null);
    const [bannerUrl, setBannerUrl] = useState(null);
    const [friendProfileDescription, setFriendProfileDescription] = useState("");
    const [friendProfileGames, setFriendProfileGames] = useState([]);
    const [profileStatus, setProfileStatus] = useState("");
    const userId = String(target?.userId || "").trim();
    const isSelf = Boolean(userId && String(userId) === String(currentUser?.id)) || target?.source === "self";
    const isKnownFriend = Boolean(friend?.friendUserId);
    const displayName = isSelf
        ? (currentUser?.displayName || currentUser?.displayLabel || currentUser?.usernameBase || currentUser?.username || target?.displayName || "You")
        : (target?.displayName || friend?.friendDisplayName || friend?.friendUsernameBase || friend?.friendUsername || "User");
    const handle = isSelf
        ? getSelfHandle(currentUser)
        : (target?.handle || friend?.friendHandle || friend?.friendUsername || "unknown");
    const initials = useMemo(() => getInitials(displayName), [displayName]);
    const canLoadAvatar = isSelf || clientSettings?.autoLoadProfileAvatars !== false;
    const canLoadBanner = isSelf || clientSettings?.autoLoadProfileBanners !== false;
    const canLoadFriendProfile = isKnownFriend && clientSettings?.autoLoadFriendProfileDetails === true;
    const resolvedPresence = isSelf
        ? {
            ...getConfiguredPresenceMeta(clientSettings?.presenceStatus || "online"),
            tone: getConfiguredPresenceMeta(clientSettings?.presenceStatus || "online").id
        }
        : resolvePresenceMeta(presence);
    const presenceTone = resolvedPresence.tone === "offline" ? "off" : (resolvedPresence.tone || "off");
    const profileDescription = isSelf
        ? String(currentUser?.profileDescription || "").trim()
        : String(friendProfileDescription || "").trim();
    const profileGames = useMemo(
        () => normalizeProfileGames(isSelf ? currentUser?.profileGames : friendProfileGames),
        [currentUser?.profileGames, friendProfileGames, isSelf]
    );
    const effectiveAvatarUrl = avatarUrl || target?.avatarUrl || "";
    const eyebrow = isSelf ? "Your profile" : isKnownFriend ? "Friend profile" : "User profile";

    useLayoutEffect(() => {
        if (!target?.anchorRect) {
            setPosition(null);
            return undefined;
        }

        function updatePosition() {
            const rect = popoverRef.current?.getBoundingClientRect();
            const nextPosition = resolveAnchoredPopoverPosition({
                anchorRect: target.anchorRect,
                popoverWidth: rect?.width || 340,
                popoverHeight: rect?.height || 420,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
                preferredPlacement: "bottom-start"
            });

            setPosition((prev) => (
                prev
                && prev.left === nextPosition.left
                && prev.top === nextPosition.top
                && prev.width === nextPosition.width
                && prev.maxHeight === nextPosition.maxHeight
                    ? prev
                    : nextPosition
            ));
        }

        updatePosition();
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);

        return () => {
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    }, [
        avatarUrl,
        bannerUrl,
        friendProfileDescription,
        friendProfileGames,
        profileStatus,
        target
    ]);

    useEffect(() => {
        if (!target) {
            return undefined;
        }

        function handleWindowClick(event) {
            if (popoverRef.current?.contains(event.target)) {
                return;
            }

            onClose?.();
        }

        function handleKeyDown(event) {
            if (event.key === "Escape") {
                onClose?.();
            }
        }

        window.addEventListener("click", handleWindowClick);
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("click", handleWindowClick);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose, target]);

    useEffect(() => {
        setProfileManifest(null);
        setAvatarUrl(null);
        setBannerUrl(null);
        setFriendProfileDescription("");
        setFriendProfileGames([]);
        setProfileStatus("");
    }, [userId]);

    useEffect(() => {
        let cancelled = false;

        async function loadManifest() {
            if (!profileMediaHostUrl || !userId || (!canLoadAvatar && !canLoadBanner)) {
                setProfileManifest(null);
                return;
            }

            try {
                const manifest = await fetchProfileAssetManifest({
                    backendUrl: profileMediaHostUrl,
                    userId
                });

                if (!cancelled) {
                    setProfileManifest(manifest);
                }
            } catch {
                if (!cancelled) {
                    setProfileManifest(null);
                }
            }
        }

        loadManifest();

        return () => {
            cancelled = true;
        };
    }, [canLoadAvatar, canLoadBanner, profileMediaHostUrl, userId]);

    useEffect(() => {
        let revokedUrl = null;

        async function loadAvatar() {
            if (!profileMediaHostUrl || !userId || !canLoadAvatar || !profileManifest?.avatar?.hasAsset) {
                setAvatarUrl(null);
                return;
            }

            try {
                const objectUrl = await fetchProfileAssetBlobUrl({
                    backendUrl: profileMediaHostUrl,
                    userId,
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
    }, [canLoadAvatar, profileManifest?.avatar?.hasAsset, profileMediaHostUrl, userId]);

    useEffect(() => {
        let revokedUrl = null;

        async function loadBanner() {
            if (!profileMediaHostUrl || !userId || !canLoadBanner || !profileManifest?.banner?.hasAsset) {
                setBannerUrl(null);
                return;
            }

            try {
                const objectUrl = await fetchProfileAssetBlobUrl({
                    backendUrl: profileMediaHostUrl,
                    userId,
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
    }, [canLoadBanner, profileManifest?.banner?.hasAsset, profileMediaHostUrl, userId]);

    useEffect(() => {
        let cancelled = false;

        async function loadFriendProfile() {
            if (!canLoadFriendProfile || !friend?.friendUserId) {
                return;
            }

            setProfileStatus("Loading profile...");

            try {
                const data = await fetchFriendProfileDescription({
                    friendUserId: friend.friendUserId
                });

                if (cancelled) {
                    return;
                }

                setFriendProfileDescription(data?.profile?.profileDescription || "");
                setFriendProfileGames(data?.profile?.profileGames || []);
                setProfileStatus("");
            } catch {
                if (!cancelled) {
                    setProfileStatus("Profile details unavailable.");
                }
            }
        }

        loadFriendProfile();

        return () => {
            cancelled = true;
        };
    }, [canLoadFriendProfile, friend?.friendUserId]);

    if (!target || typeof document === "undefined") {
        return null;
    }

    return createPortal(
        <div
            ref={popoverRef}
            className="chat-user-profile-popover"
            style={{
                left: `${position?.left ?? target.anchorRect?.left ?? 12}px`,
                top: `${position?.top ?? target.anchorRect?.bottom ?? 12}px`,
                width: position?.width ? `${position.width}px` : undefined,
                maxHeight: position?.maxHeight ? `${position.maxHeight}px` : "calc(100vh - 24px)"
            }}
            onClick={(event) => event.stopPropagation()}
        >
            <div
                className="chat-user-profile-banner"
                style={bannerUrl ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
            >
                <div className="profile-shared-banner-overlay" />
            </div>

            <div className="chat-user-profile-body">
                <div className="chat-user-profile-hero">
                    <div className="chat-user-profile-avatar-wrap">
                        <div className="chat-user-profile-avatar" aria-hidden="true">
                            {effectiveAvatarUrl ? (
                                <img src={effectiveAvatarUrl} alt="" />
                            ) : (
                                initials
                            )}
                        </div>
                        <span className={`profile-shared-presence-dot is-${presenceTone}`.trim()} />
                    </div>

                    <div className="chat-user-profile-copy">
                        <span className="profile-shared-eyebrow">{eyebrow}</span>
                        <strong>{displayName}</strong>
                        <span>{handle}</span>
                        <div className="profile-shared-status-row">
                            <span className={`profile-dock-status-pill is-${presenceTone}`.trim()}>
                                {resolvedPresence.label}
                            </span>
                            <small>{resolvedPresence.detail}</small>
                        </div>
                    </div>
                </div>

                <section className="profile-shared-section">
                    <div className="profile-shared-section-panel">
                        <p className="profile-shared-copy">
                            {profileDescription || profileStatus || "Profile details unavailable."}
                        </p>
                    </div>
                </section>

                <ProfileGamesRow games={profileGames} />

                {isKnownFriend ? (
                    <button
                        type="button"
                        className="chat-user-profile-action"
                        onClick={() => onOpenFullProfile?.(friend)}
                    >
                        Open full profile
                    </button>
                ) : null}
            </div>
        </div>,
        document.body
    );
}
