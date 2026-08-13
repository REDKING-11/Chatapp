import { useEffect, useMemo, useState } from "react";
import { resolvePresenceMeta } from "../../presence";
import {
    fetchProfileAssetBlobUrl,
    fetchProfileAssetManifest
} from "../../profile/actions";
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

export default function FriendSettingsModal({
    selectedFriend,
    friendPresence,
    friendNote,
    clientSettings,
    profileMediaHostUrl,
    onClose,
    onFriendNoteChange
}) {
    const [friendProfileDescription, setFriendProfileDescription] = useState("");
    const [friendProfileGames, setFriendProfileGames] = useState([]);
    const [friendProfileDescriptionLoading, setFriendProfileDescriptionLoading] = useState(false);
    const [friendProfileDescriptionError, setFriendProfileDescriptionError] = useState("");
    const [friendProfileDescriptionFetchedAt, setFriendProfileDescriptionFetchedAt] = useState(null);
    const [profileManifest, setProfileManifest] = useState(null);
    const [avatarUrl, setAvatarUrl] = useState(null);
    const [bannerUrl, setBannerUrl] = useState(null);
    const friendLabel = selectedFriend?.friendDisplayName || selectedFriend?.friendUsername || "Friend";
    const friendHandle = selectedFriend?.friendUsername || "unknown";
    const presenceMeta = resolvePresenceMeta(friendPresence);
    const presenceTone = presenceMeta.tone === "offline" ? "off" : (presenceMeta.tone || "off");
    const friendGames = useMemo(
        () => normalizeProfileGames(friendProfileGames),
        [friendProfileGames]
    );

    useEffect(() => {
        setFriendProfileDescription("");
        setFriendProfileGames([]);
        setFriendProfileDescriptionError("");
        setFriendProfileDescriptionFetchedAt(null);
    }, [selectedFriend?.friendUserId]);

    useEffect(() => {
        let cancelled = false;

        async function loadManifest() {
            if (
                !profileMediaHostUrl
                || !selectedFriend?.friendUserId
                || clientSettings?.autoLoadProfileAvatars === false && clientSettings?.autoLoadProfileBanners === false
            ) {
                setProfileManifest(null);
                return;
            }

            try {
                const manifest = await fetchProfileAssetManifest({
                    backendUrl: profileMediaHostUrl,
                    userId: selectedFriend.friendUserId
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
    }, [
        clientSettings?.autoLoadProfileAvatars,
        clientSettings?.autoLoadProfileBanners,
        profileMediaHostUrl,
        selectedFriend?.friendUserId
    ]);

    useEffect(() => {
        let revokedUrl = null;

        async function loadAvatar() {
            if (
                !profileMediaHostUrl
                || !selectedFriend?.friendUserId
                || !profileManifest?.avatar?.hasAsset
                || clientSettings?.autoLoadProfileAvatars === false
            ) {
                setAvatarUrl(null);
                return;
            }

            try {
                const objectUrl = await fetchProfileAssetBlobUrl({
                    backendUrl: profileMediaHostUrl,
                    userId: selectedFriend.friendUserId,
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
    }, [
        clientSettings?.autoLoadProfileAvatars,
        profileManifest?.avatar?.hasAsset,
        profileMediaHostUrl,
        selectedFriend?.friendUserId
    ]);

    useEffect(() => {
        let revokedUrl = null;

        async function loadBanner() {
            if (
                !profileMediaHostUrl
                || !selectedFriend?.friendUserId
                || !profileManifest?.banner?.hasAsset
                || clientSettings?.autoLoadProfileBanners === false
            ) {
                setBannerUrl(null);
                return;
            }

            try {
                const objectUrl = await fetchProfileAssetBlobUrl({
                    backendUrl: profileMediaHostUrl,
                    userId: selectedFriend.friendUserId,
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
    }, [
        clientSettings?.autoLoadProfileBanners,
        profileManifest?.banner?.hasAsset,
        profileMediaHostUrl,
        selectedFriend?.friendUserId
    ]);

    async function loadFriendProfileDescription() {
        if (!selectedFriend?.friendUserId) {
            return;
        }

        setFriendProfileDescriptionLoading(true);
        setFriendProfileDescriptionError("");

        try {
            const data = await fetchFriendProfileDescription({
                friendUserId: selectedFriend.friendUserId
            });

            setFriendProfileDescription(data?.profile?.profileDescription || "");
            setFriendProfileGames(data?.profile?.profileGames || []);
            setFriendProfileDescriptionFetchedAt(new Date().toISOString());
        } catch (error) {
            setFriendProfileDescriptionError(String(error?.message || error || "Could not load profile details."));
        } finally {
            setFriendProfileDescriptionLoading(false);
        }
    }

    useEffect(() => {
        if (!selectedFriend?.friendUserId || clientSettings?.autoLoadFriendProfileDetails !== true) {
            return;
        }

        loadFriendProfileDescription();
    // Deliberately tied only to friend change and opt-in setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFriend?.friendUserId, clientSettings?.autoLoadFriendProfileDetails]);

    if (!selectedFriend) {
        return null;
    }

    return (
        <div className="friends-settings-overlay friends-friend-settings-overlay" onClick={onClose}>
            <div className="friends-settings-popout friends-friend-settings-popout panel-card" onClick={(event) => event.stopPropagation()}>
                <div className="friends-settings-header">
                    <div>
                        <h2>Friend profile</h2>
                        <p>Shared profile details and your private note for {friendHandle}.</p>
                    </div>

                    <button
                        type="button"
                        className="friends-settings-close"
                        onClick={onClose}
                    >
                        x
                    </button>
                </div>

                <section className="friends-settings-profile-card profile-shared-card" aria-label={`${friendHandle} profile`}>
                    <div
                        className="friends-settings-profile-banner profile-shared-banner"
                        style={bannerUrl ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                    >
                        <div className="profile-shared-banner-overlay" />
                    </div>

                    <div className="friends-settings-profile-body">
                        <div className="profile-shared-hero">
                            <div className="profile-shared-hero-media">
                                <div className="friends-settings-profile-avatar profile-shared-avatar" aria-hidden="true">
                                    {avatarUrl ? <img src={avatarUrl} alt={friendLabel} className="profile-shared-avatar-image" /> : getInitials(friendLabel)}
                                </div>
                                <span className={`profile-shared-presence-dot is-${presenceTone}`.trim()} />
                            </div>

                            <div className="profile-shared-hero-copy">
                                <span className="profile-shared-eyebrow">Friend profile</span>
                                <strong>{friendLabel}</strong>
                                <span className="profile-shared-handle">{friendHandle}</span>
                                <div className="profile-shared-status-row">
                                    <span className={`profile-dock-status-pill is-${presenceTone}`.trim()}>
                                        {presenceMeta.label}
                                    </span>
                                    <small>{presenceMeta.detail}</small>
                                </div>
                            </div>

                            <div className="profile-shared-hero-actions friends-profile-download-action">
                                <button
                                    type="button"
                                    className="friends-secondary-button"
                                    onClick={loadFriendProfileDescription}
                                    disabled={friendProfileDescriptionLoading}
                                >
                                    {friendProfileDescriptionLoading ? "Downloading..." : "Download profile"}
                                </button>
                            </div>
                        </div>

                        <section className="profile-shared-section">
                            <div className="profile-shared-section-header">
                                <div>
                                    <strong>Bio</strong>
                                    <span>Default profile description shared in DMs.</span>
                                </div>
                            </div>
                            <div className="profile-shared-section-panel">
                                <p className="profile-shared-copy">
                                    {friendProfileDescription.trim() || "No default profile description yet."}
                                </p>
                            </div>
                            <div className="friends-profile-description-status">
                                {friendProfileDescriptionFetchedAt ? (
                                    <small className="friends-retention-note">
                                        Updated {new Date(friendProfileDescriptionFetchedAt).toLocaleString()}
                                    </small>
                                ) : null}
                                {friendProfileDescriptionError ? (
                                    <small className="friends-retention-note">{friendProfileDescriptionError}</small>
                                ) : null}
                            </div>
                        </section>

                        <section className="profile-shared-section">
                            <div className="profile-shared-section-header">
                                <div>
                                    <strong>Games</strong>
                                    <span>Manual titles this friend saved to their profile.</span>
                                </div>
                            </div>
                            <ProfileGamesRow games={friendGames} emptyLabel="No games added yet." />
                        </section>

                        <section className="profile-shared-section">
                            <div className="profile-shared-section-header">
                                <div>
                                    <strong>Private note</strong>
                                    <span>Only stored on this device. They cannot see it.</span>
                                </div>
                            </div>
                            <label className="friends-profile-note-field">
                                <textarea
                                    value={String(friendNote || "")}
                                    onChange={(event) => onFriendNoteChange?.(selectedFriend.friendUserId, event.target.value.slice(0, 500))}
                                    placeholder="Add a private note about this friend"
                                    maxLength={500}
                                />
                                <small>{String(friendNote || "").length}/500</small>
                            </label>
                        </section>
                    </div>
                </section>
            </div>
        </div>
    );
}
