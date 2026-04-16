import { useEffect, useMemo, useRef, useState } from "react";
import {
    CLIENT_SETTINGS_TAB_KEYS,
    downloadClientSettings,
    importClientSettingsFromFile,
    THEME_PRESETS
} from "../features/clientSettings";
import {
    beginMfaSetup,
    disableMfa,
    enableMfa,
    fetchMfaStatus,
    fetchSessions,
    revokeSession,
    updateUserProfile
} from "../features/auth/actions";
import {
    deleteProfileAsset,
    fetchProfileAssetBlobUrl,
    fetchProfileAssetManifest,
    uploadProfileAssets
} from "../features/profile/actions";
import {
    approvePendingDmDevice,
    fetchUserDmDevices,
    fetchPendingDmDeviceApprovals,
    recoverMissingConversationKeys,
    revokeDmDeviceAndRewrapConversations,
    rotateCurrentDmDeviceKeys
} from "../features/dm/actions";
import { getStoredAuthToken } from "../features/session/actions";
import { formatAppError } from "../lib/debug";
import { SHORTCUT_GROUPS } from "../lib/shortcuts";
import PolicyDocumentModal from "./PolicyDocumentModal";
import privacyPolicyMarkdown from "../assets/PP.md?raw";
import termsOfServiceMarkdown from "../assets/TOS.md?raw";

const FONT_SCALE_OPTIONS = [
    { value: 0.9, label: "Compact" },
    { value: 1, label: "Default" },
    { value: 1.1, label: "Large" },
    { value: 1.25, label: "Extra large" }
];

const LINE_HEIGHT_OPTIONS = [
    { value: 1.4, label: "Tight" },
    { value: 1.5, label: "Default" },
    { value: 1.7, label: "Relaxed" }
];

const DENSITY_OPTIONS = [
    { value: "compact", label: "Compact" },
    { value: "comfortable", label: "Comfortable" },
    { value: "spacious", label: "Spacious" }
];

const COLOR_BLIND_OPTIONS = [
    { value: "none", label: "None" },
    { value: "protanopia", label: "Protanopia friendly" },
    { value: "deuteranopia", label: "Deuteranopia friendly" },
    { value: "tritanopia", label: "Tritanopia friendly" },
    { value: "monochrome", label: "Monochrome" }
];

const HIT_TARGET_OPTIONS = [
    { value: "default", label: "Default" },
    { value: "large", label: "Large" },
    { value: "xlarge", label: "Extra large" },
    { value: "max", label: "Maximum" }
];

const CHAT_IDENTITY_STYLE_OPTIONS = [
    { value: "profileMedia", label: "Profile images" },
    { value: "minimal", label: "Minimal letters" }
];

const CHAT_NAME_MODE_OPTIONS = [
    { value: "displayName", label: "Display names" },
    { value: "username", label: "Username tags" }
];

const CHAT_MESSAGE_ALIGNMENT_OPTIONS = [
    { value: "split", label: "Others left, you right" },
    { value: "allLeft", label: "Everyone left" },
    { value: "allRight", label: "Everyone right" },
    { value: "mineLeft", label: "You left, others right" }
];

const SETTINGS_TABS = [
    { id: "general", label: "General" },
    { id: "profile", label: "Profile" },
    { id: "advanced", label: "Advanced" },
    { id: "more", label: "More" }
];

const PROFILE_MEDIA_LIMITS = {
    avatar: {
        label: "avatar",
        sourceMaxBytes: 8 * 1024 * 1024,
        uploadMaxBytes: 512 * 1024,
        outputWidth: 512,
        outputHeight: 512,
        previewClassName: "is-avatar",
        helpText: "PNG, JPG, or WEBP. Pick any image up to 8 MB; Chatapp outputs a 512 x 512 square and compresses it to 512 KB or less."
    },
    banner: {
        label: "background",
        sourceMaxBytes: 12 * 1024 * 1024,
        uploadMaxBytes: 1024 * 1024,
        outputWidth: 1200,
        outputHeight: 400,
        previewClassName: "is-banner",
        helpText: "PNG, JPG, or WEBP. Pick any image up to 12 MB; Chatapp outputs a 1200 x 400 banner and compresses it to 1 MB or less."
    }
};

function formatBytes(bytes) {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`;
    }

    return `${Math.ceil(bytes / 1024)} KB`;
}

function formatDeviceTimestamp(value) {
    if (!value) {
        return "Unknown time";
    }

    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
        return "Unknown time";
    }

    return timestamp.toLocaleString();
}

function loadImageFromObjectUrl(objectUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not load that image."));
        image.src = objectUrl;
    });
}

async function createCroppedProfileDataUrl({ editor }) {
    const limits = PROFILE_MEDIA_LIMITS[editor.assetType];
    const image = await loadImageFromObjectUrl(editor.objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = limits.outputWidth;
    canvas.height = limits.outputHeight;

    const context = canvas.getContext("2d");
    const baseScale = Math.max(
        limits.outputWidth / image.naturalWidth,
        limits.outputHeight / image.naturalHeight
    );
    const scale = baseScale * editor.zoom;
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const extraX = Math.max(0, drawWidth - limits.outputWidth);
    const extraY = Math.max(0, drawHeight - limits.outputHeight);
    const drawX = -extraX * (editor.x / 100);
    const drawY = -extraY * (editor.y / 100);

    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

    for (const quality of [0.92, 0.84, 0.76, 0.68, 0.6]) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const approximateBytes = Math.ceil((dataUrl.length - "data:image/jpeg;base64,".length) * 0.75);

        if (approximateBytes <= limits.uploadMaxBytes || quality === 0.6) {
            if (approximateBytes > limits.uploadMaxBytes) {
                throw new Error(`${limits.label} is still too large after cropping. Try a simpler or smaller image.`);
            }

            return dataUrl;
        }
    }

    throw new Error("Could not prepare that image.");
}

function CollapsibleSection({
    title,
    description,
    isOpen,
    onToggle,
    children
}) {
    return (
        <section className={`client-settings-section ${isOpen ? "is-open" : "is-collapsed"}`}>
            <button
                type="button"
                className="client-settings-section-toggle"
                onClick={onToggle}
            >
                <div className="client-settings-section-heading">
                    <h3>{title}</h3>
                    <p>{description}</p>
                </div>
                <span className="client-settings-section-chevron" aria-hidden="true">
                    {isOpen ? "v" : ">"}
                </span>
            </button>

            {isOpen ? <div className="client-settings-section-body">{children}</div> : null}
        </section>
    );
}

export default function ClientSettingsModal({
    settings,
    currentUser,
    profileMediaHostUrl,
    onChange,
    onImport,
    onUserUpdated,
    onTabReset,
    onLogout,
    onClose
}) {
    const importInputRef = useRef(null);
    const avatarInputRef = useRef(null);
    const bannerInputRef = useRef(null);
    const [importError, setImportError] = useState("");
    const [profileError, setProfileError] = useState("");
    const [profileSuccess, setProfileSuccess] = useState("");
    const [activeTab, setActiveTab] = useState("general");
    const [displayName, setDisplayName] = useState(currentUser?.displayName || "");
    const [profileManifest, setProfileManifest] = useState(null);
    const [avatarUrl, setAvatarUrl] = useState(null);
    const [bannerUrl, setBannerUrl] = useState(null);
    const [profileSaving, setProfileSaving] = useState(false);
    const [mediaUploading, setMediaUploading] = useState(false);
    const [mediaEditor, setMediaEditor] = useState(null);
    const [openPolicy, setOpenPolicy] = useState("");
    const [accountNotice, setAccountNotice] = useState("");
    const [missingKeyConversations, setMissingKeyConversations] = useState(null);
    const [recoveryStatus, setRecoveryStatus] = useState("");
    const [transferImportJson, setTransferImportJson] = useState("");
    const [transferImportStatus, setTransferImportStatus] = useState("");
    const [transferImportError, setTransferImportError] = useState("");
    const [mfaStatus, setMfaStatus] = useState({ enabled: false, enabledAt: null, pendingSetup: false, available: true });
    const [mfaSetup, setMfaSetup] = useState(null);
    const [mfaCode, setMfaCode] = useState("");
    const [sessions, setSessions] = useState([]);
    const [sessionActionId, setSessionActionId] = useState("");
    const [dmDevices, setDmDevices] = useState([]);
    const [dmDevicesLoading, setDmDevicesLoading] = useState(false);
    const [deviceActionId, setDeviceActionId] = useState("");
    const [currentDmDeviceId, setCurrentDmDeviceId] = useState("");
    const [pendingDmDevices, setPendingDmDevices] = useState([]);
    const [seenTrustedDeviceIds, setSeenTrustedDeviceIds] = useState({});
    const [newTrustedDeviceIds, setNewTrustedDeviceIds] = useState({});
    const [collapsedSections, setCollapsedSections] = useState({
        identity: false,
        theme: false,
        readability: false,
        accessibility: false,
        profileMedia: false,
        friendTags: false,
        account: false,
        keyHealth: true,
        developer: true,
        preview: true,
        shortcuts: false,
        policies: false
    });
    const userLabel = currentUser?.displayName || currentUser?.usernameBase || currentUser?.username || "User";
    const userHandle = currentUser?.handle || currentUser?.username || "unknown";
    const userInitial = useMemo(() => userLabel.trim().slice(0, 1).toUpperCase() || "?", [userLabel]);
    const activeTabLabel = SETTINGS_TABS.find((tab) => tab.id === activeTab)?.label || "tab";
    const canResetActiveTab = (CLIENT_SETTINGS_TAB_KEYS[activeTab] || []).length > 0;
    const trustedDeviceSeenStorageKey = `trustedDmDevicesSeen:${currentUser?.id || "guest"}`;

    useEffect(() => {
        setDisplayName(currentUser?.displayName || "");
    }, [currentUser?.displayName]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(trustedDeviceSeenStorageKey);
            setSeenTrustedDeviceIds(raw ? JSON.parse(raw) : {});
        } catch {
            setSeenTrustedDeviceIds({});
        }
    }, [trustedDeviceSeenStorageKey]);

    useEffect(() => {
        localStorage.setItem(trustedDeviceSeenStorageKey, JSON.stringify(seenTrustedDeviceIds));
    }, [seenTrustedDeviceIds, trustedDeviceSeenStorageKey]);

    useEffect(() => () => {
        if (mediaEditor?.objectUrl) {
            URL.revokeObjectURL(mediaEditor.objectUrl);
        }
    }, [mediaEditor?.objectUrl]);

    useEffect(() => {
        async function loadManifest() {
            if (!profileMediaHostUrl || !currentUser?.id) {
                setProfileManifest(null);
                return;
            }

            try {
                setProfileManifest(await fetchProfileAssetManifest({
                    backendUrl: profileMediaHostUrl,
                    userId: currentUser.id
                }));
            } catch {
                setProfileManifest(null);
            }
        }

        loadManifest();
    }, [currentUser?.id, profileMediaHostUrl]);

    useEffect(() => {
        let cancelled = false;

        async function loadDmDevices() {
            if (!currentUser?.id || !window.secureDm) {
                setDmDevices([]);
                setCurrentDmDeviceId("");
                return;
            }

            const token = getStoredAuthToken();

            if (!token) {
                setDmDevices([]);
                setCurrentDmDeviceId("");
                return;
            }

            try {
                setDmDevicesLoading(true);
                const bundle = await window.secureDm.getDeviceBundle({
                    userId: currentUser.id,
                    username: currentUser.username
                });
                const data = await fetchUserDmDevices({
                    token,
                    userId: currentUser.id,
                    includeRevoked: true
                });
                const pending = await fetchPendingDmDeviceApprovals({
                    token
                });

                if (!cancelled) {
                    setCurrentDmDeviceId(String(bundle?.deviceId || ""));
                    setDmDevices(data.devices || []);
                    setPendingDmDevices(pending.pendingDevices || []);
                    setNewTrustedDeviceIds((prev) => {
                        const next = {};
                        (data.devices || []).forEach((device) => {
                            const deviceId = String(device.deviceId);
                            if (!seenTrustedDeviceIds[deviceId]) {
                                next[deviceId] = true;
                            } else if (prev[deviceId]) {
                                next[deviceId] = true;
                            }
                        });
                        return next;
                    });
                    setSeenTrustedDeviceIds((prev) => {
                        const next = { ...(prev || {}) };
                        (data.devices || []).forEach((device) => {
                            if (!next[String(device.deviceId)]) {
                                next[String(device.deviceId)] = new Date().toISOString();
                            }
                        });
                        return next;
                    });
                }
            } catch {
                if (!cancelled) {
                    setCurrentDmDeviceId("");
                    setDmDevices([]);
                    setPendingDmDevices([]);
                }
            } finally {
                if (!cancelled) {
                    setDmDevicesLoading(false);
                }
            }
        }

        loadDmDevices();

        return () => {
            cancelled = true;
        };
    }, [currentUser?.id, currentUser?.username, seenTrustedDeviceIds]);

    useEffect(() => {
        let cancelled = false;

        async function loadAccountSecurity() {
            if (!currentUser?.id) {
                setMfaStatus({ enabled: false, enabledAt: null, pendingSetup: false, available: true });
                setSessions([]);
                return;
            }

            const token = getStoredAuthToken();
            if (!token) {
                setMfaStatus({ enabled: false, enabledAt: null, pendingSetup: false, available: true });
                setSessions([]);
                return;
            }

            try {
                const [mfaData, sessionsData] = await Promise.all([
                    fetchMfaStatus({ token }),
                    fetchSessions({ token })
                ]);

                if (!cancelled) {
                    setMfaStatus(mfaData.mfa || { enabled: false, enabledAt: null, pendingSetup: false, available: true });
                    setSessions(sessionsData.sessions || []);
                }
            } catch {
                if (!cancelled) {
                    setMfaStatus({ enabled: false, enabledAt: null, pendingSetup: false, available: true });
                    setSessions([]);
                }
            }
        }

        loadAccountSecurity();

        return () => {
            cancelled = true;
        };
    }, [currentUser?.id]);

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
            if (revokedUrl) URL.revokeObjectURL(revokedUrl);
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
            if (revokedUrl) URL.revokeObjectURL(revokedUrl);
        };
    }, [currentUser?.id, profileManifest?.banner?.hasAsset, profileMediaHostUrl]);

    function toggleSection(sectionId) {
        setCollapsedSections((prev) => ({
            ...prev,
            [sectionId]: !prev[sectionId]
        }));
    }

    function updateFriendTagFolders(nextFolders) {
        onChange("friendTagFolders", nextFolders);
    }

    function handleFolderLabelChange(folderId, label) {
        updateFriendTagFolders(settings.friendTagFolders.map((folder) => (
            folder.id === folderId ? { ...folder, label } : folder
        )));
    }

    function handleTagLabelChange(folderId, tagId, label) {
        updateFriendTagFolders(settings.friendTagFolders.map((folder) => (
            folder.id === folderId
                ? {
                    ...folder,
                    tags: folder.tags.map((tag) => (
                        tag.id === tagId ? { ...tag, label } : tag
                    ))
                }
                : folder
        )));
    }

    function handleAddFolder() {
        updateFriendTagFolders([
            ...settings.friendTagFolders,
            {
                id: `folder-${Date.now()}`,
                label: "New folder",
                tags: [
                    {
                        id: `tag-${Date.now()}`,
                        label: "New tag"
                    }
                ]
            }
        ]);
    }

    function handleAddTag(folderId) {
        updateFriendTagFolders(settings.friendTagFolders.map((folder) => (
            folder.id === folderId
                ? {
                    ...folder,
                    tags: [
                        ...folder.tags,
                        {
                            id: `tag-${Date.now()}-${folder.tags.length}`,
                            label: "New tag"
                        }
                    ]
                }
                : folder
        )));
    }

    function handleRemoveFolder(folderId) {
        if (settings.friendTagFolders.length <= 1) {
            return;
        }

        updateFriendTagFolders(settings.friendTagFolders.filter((folder) => folder.id !== folderId));
    }

    function handleRemoveTag(folderId, tagId) {
        updateFriendTagFolders(
            settings.friendTagFolders
                .map((folder) => (
                    folder.id === folderId
                        ? {
                            ...folder,
                            tags: folder.tags.filter((tag) => tag.id !== tagId)
                        }
                        : folder
                ))
                .filter((folder) => folder.tags.length > 0)
        );
    }

    async function handleImportFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const imported = await importClientSettingsFromFile(file);
            setImportError("");
            onImport(imported);
        } catch (error) {
            setImportError(formatAppError(error, {
                fallbackMessage: "Could not import that settings file.",
                context: "Client settings import"
            }).message);
        } finally {
            event.target.value = "";
        }
    }

    async function refreshManifest() {
        if (!profileMediaHostUrl || !currentUser?.id) {
            setProfileManifest(null);
            return;
        }

        setProfileManifest(await fetchProfileAssetManifest({
            backendUrl: profileMediaHostUrl,
            userId: currentUser.id
        }));
    }

    async function handleSaveDisplayName() {
        try {
            setProfileSaving(true);
            setProfileError("");
            setProfileSuccess("");
            const data = await updateUserProfile({ displayName });
            onUserUpdated?.(data.user);
            setProfileSuccess("Profile name saved.");
        } catch (error) {
            setProfileError(formatAppError(error, {
                fallbackMessage: "Could not save that display name.",
                context: "Profile update"
            }).message);
        } finally {
            setProfileSaving(false);
        }
    }

    function handleImageUpload(event, assetType) {
        const file = event.target.files?.[0];
        event.target.value = "";

        if (!file) {
            return;
        }

        const limits = PROFILE_MEDIA_LIMITS[assetType];
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
            setProfileError("Only PNG, JPG, and WEBP profile images are supported.");
            return;
        }

        if (file.size > limits.sourceMaxBytes) {
            setProfileError(`That ${limits.label} file is too large. Choose one under ${formatBytes(limits.sourceMaxBytes)}.`);
            return;
        }

        setProfileError("");
        setProfileSuccess("");
        setMediaEditor((prev) => {
            if (prev?.objectUrl) {
                URL.revokeObjectURL(prev.objectUrl);
            }

            return {
                assetType,
                file,
                objectUrl: URL.createObjectURL(file),
                x: 50,
                y: 50,
                zoom: 1
            };
        });
    }

    async function handleApplyMediaCrop() {
        if (!mediaEditor) {
            return;
        }

        try {
            setMediaUploading(true);
            setProfileError("");
            setProfileSuccess("");
            const croppedDataUrl = await createCroppedProfileDataUrl({ editor: mediaEditor });

            await uploadProfileAssets({
                backendUrl: profileMediaHostUrl,
                avatarDataUrl: mediaEditor.assetType === "avatar" ? croppedDataUrl : null,
                bannerDataUrl: mediaEditor.assetType === "banner" ? croppedDataUrl : null
            });
            await refreshManifest();
            window.dispatchEvent(new CustomEvent("profileMediaUpdated"));
            setProfileSuccess(mediaEditor.assetType === "avatar" ? "Avatar updated." : "Profile background updated.");
            setMediaEditor((prev) => {
                if (prev?.objectUrl) {
                    URL.revokeObjectURL(prev.objectUrl);
                }
                return null;
            });
        } catch (error) {
            setProfileError(formatAppError(error, {
                fallbackMessage: "Could not update that profile image.",
                context: "Profile media"
            }).message);
        } finally {
            setMediaUploading(false);
        }
    }

    function handleCancelMediaEditor() {
        setMediaEditor((prev) => {
            if (prev?.objectUrl) {
                URL.revokeObjectURL(prev.objectUrl);
            }
            return null;
        });
    }

    async function handleRemoveAsset(assetType) {
        try {
            setMediaUploading(true);
            setProfileError("");
            setProfileSuccess("");
            await deleteProfileAsset({
                backendUrl: profileMediaHostUrl,
                assetType
            });
            await refreshManifest();
            window.dispatchEvent(new CustomEvent("profileMediaUpdated"));
            setProfileSuccess(assetType === "avatar" ? "Avatar removed." : "Profile background removed.");
        } catch (error) {
            setProfileError(formatAppError(error, {
                fallbackMessage: "Could not remove that profile image.",
                context: "Profile media"
            }).message);
        } finally {
            setMediaUploading(false);
        }
    }

    async function handleRevokeDevice(deviceId) {
        if (!currentUser?.id || !deviceId) {
            return;
        }

        const token = getStoredAuthToken();

        if (!token) {
            setAccountNotice("Your session expired before that device could be revoked.");
            return;
        }

        try {
            setDeviceActionId(String(deviceId));
            setAccountNotice("");
            const data = await revokeDmDeviceAndRewrapConversations({
                token,
                currentUser,
                deviceId
            });
            const refreshed = await fetchUserDmDevices({
                token,
                userId: currentUser.id,
                includeRevoked: true
            });
            const pending = await fetchPendingDmDeviceApprovals({
                token
            });
            setDmDevices(refreshed.devices || []);
            setPendingDmDevices(pending.pendingDevices || []);
            setAccountNotice("Trusted device revoked. Future DM keys will no longer be delivered to it.");
        } catch (error) {
            setAccountNotice(formatAppError(error, {
                fallbackMessage: "Could not revoke that device right now.",
                context: "DM device revoke"
            }).message);
        } finally {
            setDeviceActionId("");
        }
    }

    async function handleRotateDeviceKeys() {
        if (!currentUser?.id) {
            return;
        }

        const token = getStoredAuthToken();
        if (!token) {
            setAccountNotice("Your session expired before this device could rotate its DM keys.");
            return;
        }

        try {
            setDeviceActionId(String(currentDmDeviceId || "rotate-current"));
            setAccountNotice("");
            const refreshed = await rotateCurrentDmDeviceKeys({
                token,
                currentUser
            });
            const pending = await fetchPendingDmDeviceApprovals({
                token
            });
            setDmDevices(refreshed.devices || []);
            setPendingDmDevices(pending.pendingDevices || []);
            setAccountNotice("This device rotated its DM keys and rekeyed active conversations for future messages.");
        } catch (error) {
            setAccountNotice(formatAppError(error, {
                fallbackMessage: "Could not rotate this device's DM keys right now.",
                context: "DM device rotation"
            }).message);
        } finally {
            setDeviceActionId("");
        }
    }

    async function handleApprovePendingDevice(requestId) {
        if (!currentUser?.id || !currentDmDeviceId) {
            return;
        }

        const token = getStoredAuthToken();
        if (!token) {
            setAccountNotice("Your session expired before that device could be approved.");
            return;
        }

        try {
            setDeviceActionId(`approve:${requestId}`);
            setAccountNotice("");
            const approved = await approvePendingDmDevice({
                token,
                currentUser,
                requestId,
                approverDeviceId: currentDmDeviceId
            });
            setDmDevices(approved.devices || []);
            setPendingDmDevices(approved.pendingDevices || []);
            setAccountNotice("Pending DM device approved. It can now receive future direct-message keys.");
        } catch (error) {
            setAccountNotice(formatAppError(error, {
                fallbackMessage: "Could not approve that pending device right now.",
                context: "DM device approval"
            }).message);
        } finally {
            setDeviceActionId("");
        }
    }

    async function handleCheckKeyHealth() {
        if (!currentUser?.id) return;
        try {
            const diagnosis = await window.secureDm.diagnoseMissingKeys({
                userId: currentUser.id,
                username: currentUser.username
            });
            setMissingKeyConversations(diagnosis.missing || []);
            setRecoveryStatus("");
        } catch (error) {
            setRecoveryStatus(formatAppError(error, {
                fallbackMessage: "Could not check key health right now.",
                context: "Key health check"
            }).message);
        }
    }

    async function handleRecoverMissingKeys() {
        const token = getStoredAuthToken();
        if (!token) {
            setRecoveryStatus("Your session has expired. Sign in again before recovering keys.");
            return;
        }
        try {
            setRecoveryStatus("Recovering…");
            const result = await recoverMissingConversationKeys({ token, currentUser });
            const nOk = result.recovered?.length ?? 0;
            const nBad = result.unrecoverable?.length ?? 0;
            if (nBad === 0) {
                setRecoveryStatus(`Recovered ${nOk} conversation${nOk !== 1 ? "s" : ""} successfully.`);
            } else {
                setRecoveryStatus(
                    `Recovered ${nOk} conversation${nOk !== 1 ? "s" : ""}. ` +
                    `${nBad} could not be recovered from the server — ` +
                    `import a transfer package from your other device.`
                );
            }
            const diagnosis = await window.secureDm.diagnoseMissingKeys({
                userId: currentUser.id,
                username: currentUser.username
            });
            setMissingKeyConversations(diagnosis.missing || []);
        } catch (error) {
            setRecoveryStatus(formatAppError(error, {
                fallbackMessage: "Recovery failed. Try again or use a device transfer package.",
                context: "Key recovery"
            }).message);
        }
    }

    async function handleImportTransferPackage() {
        setTransferImportError("");
        setTransferImportStatus("");
        if (!transferImportJson.trim()) {
            setTransferImportError("Paste a device transfer package first.");
            return;
        }
        let transferPackage;
        try {
            transferPackage = JSON.parse(transferImportJson.trim());
        } catch {
            setTransferImportError("The pasted text is not valid JSON. Make sure you copied the full package.");
            return;
        }
        try {
            setTransferImportStatus("Importing…");
            const result = await window.secureDm.importDeviceTransfer({
                userId: currentUser.id,
                username: currentUser.username,
                transferPackage
            });
            const n = result.installedConversationCount;
            setTransferImportStatus(
                `Imported ${n} conversation${n !== 1 ? "s" : ""} from device ${result.sourceDeviceId}.`
            );
            setTransferImportJson("");
            const diagnosis = await window.secureDm.diagnoseMissingKeys({
                userId: currentUser.id,
                username: currentUser.username
            });
            setMissingKeyConversations(diagnosis.missing || []);
        } catch (error) {
            setTransferImportError(formatAppError(error, {
                fallbackMessage: "Import failed. Check that the package is valid and addressed to this device.",
                context: "Device transfer import"
            }).message);
            setTransferImportStatus("");
        }
    }

    async function refreshAccountSecurityState(token) {
        const [mfaData, sessionsData] = await Promise.all([
            fetchMfaStatus({ token }),
            fetchSessions({ token })
        ]);

        setMfaStatus(mfaData.mfa || { enabled: false, enabledAt: null, pendingSetup: false, available: true });
        setSessions(sessionsData.sessions || []);
    }

    async function handleBeginMfaSetup() {
        if (mfaStatus.available === false) {
            setAccountNotice("MFA setup is not available on this server until the auth schema upgrade is applied.");
            return;
        }

        const token = getStoredAuthToken();
        if (!token) {
            setAccountNotice("Your session expired before MFA setup could start.");
            return;
        }

        try {
            setSessionActionId("mfa:setup");
            setAccountNotice("");
            const data = await beginMfaSetup({ token });
            setMfaSetup(data.setup || null);
            setMfaCode("");
            await refreshAccountSecurityState(token);
            setAccountNotice("Authenticator setup created. Scan the key and confirm with a code to finish enabling MFA.");
        } catch (error) {
            setAccountNotice(formatAppError(error, {
                fallbackMessage: "Could not start MFA setup right now.",
                context: "MFA setup"
            }).message);
        } finally {
            setSessionActionId("");
        }
    }

    async function handleEnableMfa() {
        const token = getStoredAuthToken();
        if (!token) {
            setAccountNotice("Your session expired before MFA could be enabled.");
            return;
        }

        try {
            setSessionActionId("mfa:enable");
            setAccountNotice("");
            await enableMfa({ token, totpCode: mfaCode });
            setMfaSetup(null);
            setMfaCode("");
            await refreshAccountSecurityState(token);
            setAccountNotice("MFA is now enabled for this account.");
        } catch (error) {
            setAccountNotice(formatAppError(error, {
                fallbackMessage: "Could not enable MFA right now.",
                context: "MFA enable"
            }).message);
        } finally {
            setSessionActionId("");
        }
    }

    async function handleDisableMfa() {
        const token = getStoredAuthToken();
        if (!token) {
            setAccountNotice("Your session expired before MFA could be disabled.");
            return;
        }

        try {
            setSessionActionId("mfa:disable");
            setAccountNotice("");
            await disableMfa({ token, totpCode: mfaCode });
            setMfaSetup(null);
            setMfaCode("");
            await refreshAccountSecurityState(token);
            setAccountNotice("MFA has been disabled for this account.");
        } catch (error) {
            setAccountNotice(formatAppError(error, {
                fallbackMessage: "Could not disable MFA right now.",
                context: "MFA disable"
            }).message);
        } finally {
            setSessionActionId("");
        }
    }

    async function handleRevokeSession(publicId) {
        if (!publicId) {
            return;
        }

        const token = getStoredAuthToken();
        if (!token) {
            setAccountNotice("Your session expired before that session could be revoked.");
            return;
        }

        try {
            setSessionActionId(`session:${publicId}`);
            setAccountNotice("");
            await revokeSession({ token, publicId });
            await refreshAccountSecurityState(token);
            setAccountNotice("Session revoked. That device will need to sign in again.");
        } catch (error) {
            setAccountNotice(formatAppError(error, {
                fallbackMessage: "Could not revoke that session right now.",
                context: "Session revoke"
            }).message);
        } finally {
            setSessionActionId("");
        }
    }

    return (
        <div className="client-settings-overlay" onClick={onClose}>
            <div
                className="client-settings-window"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="client-settings-header">
                    <div>
                        <h2>Client Settings</h2>
                        <p>Theme, accessibility, readability, and visual comfort for this device.</p>
                    </div>

                    <div className="client-settings-header-actions">
                        <button type="button" className="secondary" onClick={() => downloadClientSettings(settings)}>
                            Export
                        </button>
                        <button
                            type="button"
                            className="secondary"
                            onClick={() => importInputRef.current?.click()}
                        >
                            Import
                        </button>
                        {canResetActiveTab ? (
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => onTabReset?.(activeTab)}
                            >
                                Reset {activeTabLabel}
                            </button>
                        ) : null}
                        <button type="button" className="secondary" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>

                <div className="client-settings-body">
                    <aside className="client-settings-sidebar">
                        <div className="client-settings-user-card">
                            <div className="client-settings-user-avatar">
                                {avatarUrl ? <img src={avatarUrl} alt={userLabel} /> : userInitial}
                            </div>
                            <div>
                                <strong>{userLabel}</strong>
                                <span>{userHandle}</span>
                            </div>
                        </div>

                        <div className="client-settings-tabs" role="tablist" aria-label="Client settings tabs">
                            {SETTINGS_TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === tab.id}
                                    className={`client-settings-tab ${activeTab === tab.id ? "active" : ""}`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </aside>

                <div className="client-settings-content">
                    <input
                        ref={importInputRef}
                        type="file"
                        accept=".json,application/json"
                        className="client-hidden-input"
                        onChange={handleImportFile}
                    />

                    {importError ? (
                        <p className="client-settings-error">{importError}</p>
                    ) : null}

                    {activeTab === "general" ? (
                        <>
                    <CollapsibleSection
                        title="Theme"
                        description="Apply a client-wide palette across the shell, friends view, auth, and utilities."
                        isOpen={!collapsedSections.theme}
                        onToggle={() => toggleSection("theme")}
                    >
                        <div className="client-theme-grid">
                            {Object.entries(THEME_PRESETS).map(([key, preset]) => (
                                <button
                                    key={key}
                                    type="button"
                                    className={`client-theme-card ${settings.themePreset === key ? "selected" : ""}`}
                                    onClick={() => onChange("themePreset", key)}
                                >
                                    <span className="client-theme-card-title">{preset.label}</span>
                                    <span className="client-theme-swatches">
                                        <span style={{ background: preset.shell.bg }} />
                                        <span style={{ background: preset.shell.surface }} />
                                        <span style={{ background: preset.shell.accent }} />
                                        <span style={{ background: preset.server.accent }} />
                                    </span>
                                </button>
                            ))}
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="Readability"
                        description="Adjust type, spacing, and target sizes for longer sessions."
                        isOpen={!collapsedSections.readability}
                        onToggle={() => toggleSection("readability")}
                    >
                        <div className="client-settings-grid">
                            <label className="client-settings-field">
                                <span>Text size</span>
                                <select
                                    value={settings.fontScale}
                                    onChange={(event) => onChange("fontScale", Number(event.target.value))}
                                >
                                    {FONT_SCALE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="client-settings-field">
                                <span>Line height</span>
                                <select
                                    value={settings.lineHeight}
                                    onChange={(event) => onChange("lineHeight", Number(event.target.value))}
                                >
                                    {LINE_HEIGHT_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="client-settings-field">
                                <span>UI density</span>
                                <select
                                    value={settings.uiDensity}
                                    onChange={(event) => onChange("uiDensity", event.target.value)}
                                >
                                    {DENSITY_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="client-settings-field">
                                <span>Color vision mode</span>
                                <select
                                    value={settings.colorBlindMode}
                                    onChange={(event) => onChange("colorBlindMode", event.target.value)}
                                >
                                    {COLOR_BLIND_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="Chat Identity"
                        description="Choose how DMs and group chats show who sent each message."
                        isOpen={!collapsedSections.chatIdentity}
                        onToggle={() => toggleSection("chatIdentity")}
                    >
                        <div className="client-settings-grid">
                            <label className="client-settings-field">
                                <span>Message markers</span>
                                <select
                                    value={settings.chatIdentityStyle}
                                    onChange={(event) => onChange("chatIdentityStyle", event.target.value)}
                                >
                                    {CHAT_IDENTITY_STYLE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="client-settings-field">
                                <span>Chat names</span>
                                <select
                                    value={settings.chatNameMode}
                                    onChange={(event) => onChange("chatNameMode", event.target.value)}
                                >
                                    {CHAT_NAME_MODE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="client-settings-field">
                                <span>Message alignment</span>
                                <select
                                    value={settings.chatMessageAlignment}
                                    onChange={(event) => onChange("chatMessageAlignment", event.target.value)}
                                >
                                    {CHAT_MESSAGE_ALIGNMENT_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <p className="client-settings-muted">
                            Minimal letters auto-expand in group chats when two people would share the same letter. Server chats keep their full names.
                        </p>
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="Accessibility"
                        description="Reduce strain, boost contrast, and make controls easier to use."
                        isOpen={!collapsedSections.accessibility}
                        onToggle={() => toggleSection("accessibility")}
                    >
                        <div className="client-accessibility-grid">
                            <label className="client-toggle-card">
                                <div className="client-toggle-copy">
                                    <strong>Reduced motion</strong>
                                    <p>Turns off non-essential animation and smooth scrolling.</p>
                                </div>
                                <div className="client-toggle-control">
                                    <input
                                        type="checkbox"
                                        checked={settings.reducedMotion}
                                        onChange={(event) => onChange("reducedMotion", event.target.checked)}
                                    />
                                </div>
                            </label>

                            <label className="client-toggle-card">
                                <div className="client-toggle-copy">
                                    <strong>High contrast</strong>
                                    <p>Boosts outlines, border visibility, and focus treatment.</p>
                                </div>
                                <div className="client-toggle-control">
                                    <input
                                        type="checkbox"
                                        checked={settings.highContrast}
                                        onChange={(event) => onChange("highContrast", event.target.checked)}
                                    />
                                </div>
                            </label>

                            <label className="client-toggle-card">
                                <div className="client-toggle-copy">
                                    <strong>Dyslexia-friendly font stack</strong>
                                    <p>Uses a more readable fallback chain with stronger letter separation.</p>
                                </div>
                                <div className="client-toggle-control">
                                    <input
                                        type="checkbox"
                                        checked={settings.dyslexicFont}
                                        onChange={(event) => onChange("dyslexicFont", event.target.checked)}
                                    />
                                </div>
                            </label>

                            <label className="client-toggle-card">
                                <div className="client-toggle-copy">
                                    <strong>Hit target size</strong>
                                    <p>Choose how much larger buttons, fields, toggles, and taps should feel.</p>
                                </div>
                                <div className="client-toggle-control">
                                    <select
                                        value={settings.hitTargetSize}
                                        onChange={(event) => onChange("hitTargetSize", event.target.value)}
                                    >
                                        {HIT_TARGET_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </label>
                        </div>
                    </CollapsibleSection>

                        </>
                    ) : null}

                    {activeTab === "advanced" ? (
                        <>
                    <CollapsibleSection
                        title="Account"
                        description="Session and account actions for this device."
                        isOpen={!collapsedSections.account}
                        onToggle={() => toggleSection("account")}
                    >
                        <div className="client-settings-inline-actions">
                            <button
                                type="button"
                                className="secondary"
                                disabled={Boolean(deviceActionId)}
                                onClick={handleRotateDeviceKeys}
                            >
                                {deviceActionId === String(currentDmDeviceId || "rotate-current") ? "Rotating DM keys..." : "Rotate DM keys"}
                            </button>
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => {
                                    setAccountNotice("");
                                    onClose?.();
                                    onLogout?.();
                                }}
                            >
                                Logout
                            </button>
                            <button
                                type="button"
                                className="danger"
                                onClick={() => setAccountNotice("Delete account is WIP right now.")}
                            >
                                Delete account
                            </button>
                        </div>
                        <p className="client-settings-muted">
                            Trusted DM devices can decrypt future direct messages. Review new devices, revoke old ones, and confirm bundle integrity here.
                        </p>
                        {pendingDmDevices.some((device) => String(device.deviceId) === String(currentDmDeviceId)) ? (
                            <p className="client-settings-muted">
                                This device is waiting for approval from an already trusted device before it can receive DM keys.
                            </p>
                        ) : null}
                        <div className="client-settings-stack">
                            <div className="client-settings-security-card">
                                <div className="client-settings-security-copy">
                                    <strong>Multi-factor authentication</strong>
                                    <p>
                                        {mfaStatus.enabled
                                            ? `Enabled${mfaStatus.enabledAt ? ` on ${formatDeviceTimestamp(mfaStatus.enabledAt)}` : ""}.`
                                            : mfaStatus.available === false
                                                ? "This server has not applied the auth schema upgrade yet, so MFA setup is temporarily unavailable."
                                                : "Add a TOTP authenticator code to protect logins if your password is ever exposed."}
                                    </p>
                                </div>
                                <div className="client-settings-inline-actions">
                                    {!mfaStatus.enabled ? (
                                        <button
                                            type="button"
                                            className="secondary"
                                            disabled={Boolean(sessionActionId) || mfaStatus.available === false}
                                            onClick={handleBeginMfaSetup}
                                        >
                                            {sessionActionId === "mfa:setup" ? "Preparing..." : "Set up MFA"}
                                        </button>
                                    ) : null}
                                    {mfaStatus.enabled ? (
                                        <button
                                            type="button"
                                            className="danger"
                                            disabled={Boolean(sessionActionId) || mfaCode.length !== 6}
                                            onClick={handleDisableMfa}
                                        >
                                            {sessionActionId === "mfa:disable" ? "Disabling..." : "Disable MFA"}
                                        </button>
                                    ) : null}
                                </div>
                                {mfaSetup ? (
                                    <div className="client-settings-code-block">
                                        <span>Manual entry key</span>
                                        <code>{mfaSetup.manualEntryKey}</code>
                                        <span className="client-settings-muted">Authenticator URI: {mfaSetup.otpauthUri}</span>
                                    </div>
                                ) : null}
                                {(mfaSetup || mfaStatus.enabled) ? (
                                    <label className="client-settings-field">
                                        <span>{mfaStatus.enabled ? "Authentication code to disable MFA" : "Authentication code to enable MFA"}</span>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            placeholder="123456"
                                            value={mfaCode}
                                            onChange={(event) => setMfaCode(event.target.value.replace(/\D+/g, "").slice(0, 6))}
                                        />
                                    </label>
                                ) : null}
                                {mfaSetup && !mfaStatus.enabled ? (
                                    <button
                                        type="button"
                                        className="secondary"
                                        disabled={Boolean(sessionActionId) || mfaCode.length !== 6}
                                        onClick={handleEnableMfa}
                                    >
                                        {sessionActionId === "mfa:enable" ? "Enabling..." : "Confirm and enable MFA"}
                                    </button>
                                ) : null}
                            </div>

                            <div className="client-settings-security-card">
                                <div className="client-settings-security-copy">
                                    <strong>Sessions</strong>
                                    <p>Review signed-in devices and revoke anything you no longer trust.</p>
                                </div>
                                <div className="client-device-list">
                                    {sessions.length > 0 ? (
                                        sessions.map((session) => {
                                            const isRevokingSession = sessionActionId === `session:${session.publicId}`;

                                            return (
                                                <div key={session.publicId} className="client-device-row">
                                                    <div className="client-device-meta">
                                                        <div className="client-device-heading">
                                                            <strong>{session.sessionName || "Desktop app"}</strong>
                                                            <div className="client-device-badges">
                                                                {session.isCurrent ? <span className="client-device-badge">Current</span> : null}
                                                                {session.mfaCompleted ? <span className="client-device-badge">MFA</span> : null}
                                                            </div>
                                                        </div>
                                                        <span>{session.publicId}</span>
                                                        <span>Created: {formatDeviceTimestamp(session.createdAt)}</span>
                                                        <span>Last seen: {formatDeviceTimestamp(session.lastSeenAt)}</span>
                                                        <span>Expires: {formatDeviceTimestamp(session.expiresAt)}</span>
                                                        {session.userAgent ? <span>{session.userAgent}</span> : null}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="danger"
                                                        disabled={Boolean(sessionActionId) || session.isCurrent}
                                                        onClick={() => handleRevokeSession(session.publicId)}
                                                    >
                                                        {isRevokingSession ? "Revoking..." : session.isCurrent ? "Current session" : "Revoke session"}
                                                    </button>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <p className="client-settings-muted">No active sessions are visible for this account yet.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="client-device-list">
                            {dmDevicesLoading ? (
                                <p className="client-settings-muted">Loading trusted DM devices...</p>
                            ) : dmDevices.length > 0 ? (
                                dmDevices.map((device) => {
                                    const isCurrentDevice = String(device.deviceId) === String(currentDmDeviceId);
                                    const isRevoking = String(device.deviceId) === String(deviceActionId);
                                    const isRevoked = Boolean(device.revokedAt);
                                    const isNewDevice = Boolean(newTrustedDeviceIds[String(device.deviceId)]);
                                    const statusBadges = [
                                        isCurrentDevice ? "Current" : null,
                                        isRevoked ? "Revoked" : "Active",
                                        isNewDevice ? "New" : null,
                                        device.signatureVerified ? "Signature verified" : "Unverified bundle"
                                    ].filter(Boolean);

                                    return (
                                        <div key={device.deviceId} className="client-device-row">
                                            <div className="client-device-meta">
                                                <div className="client-device-heading">
                                                    <strong>{device.deviceName || "Desktop"}</strong>
                                                    <div className="client-device-badges">
                                                        {statusBadges.map((badge) => (
                                                            <span
                                                                key={badge}
                                                                className={`client-device-badge ${badge === "Revoked" ? "is-revoked" : badge === "New" ? "is-new" : ""}`.trim()}
                                                            >
                                                                {badge}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <span>{device.deviceId}</span>
                                                <span>Registered: {formatDeviceTimestamp(device.createdAt)}</span>
                                                <span>Updated: {formatDeviceTimestamp(device.updatedAt)}</span>
                                                {device.revokedAt ? (
                                                    <span>Revoked: {formatDeviceTimestamp(device.revokedAt)}</span>
                                                ) : null}
                                            </div>
                                            <button
                                                type="button"
                                                className="danger"
                                                disabled={isCurrentDevice || isRevoked || Boolean(deviceActionId)}
                                                onClick={() => handleRevokeDevice(device.deviceId)}
                                            >
                                                {isRevoking ? "Revoking..." : isCurrentDevice ? "Current device" : isRevoked ? "Revoked" : "Revoke device"}
                                            </button>
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="client-settings-muted">No DM-capable devices are registered on this account yet.</p>
                            )}
                        </div>
                        {pendingDmDevices.length > 0 ? (
                            <div className="client-device-list">
                                {pendingDmDevices.map((device) => {
                                    const isApproving = String(deviceActionId) === `approve:${device.requestId}`;
                                    const isCurrentPendingDevice = String(device.deviceId) === String(currentDmDeviceId);

                                    return (
                                        <div key={`pending-${device.requestId}`} className="client-device-row">
                                            <div className="client-device-meta">
                                                <div className="client-device-heading">
                                                    <strong>{device.deviceName || "Pending device"}</strong>
                                                    <div className="client-device-badges">
                                                        <span className="client-device-badge is-new">Pending approval</span>
                                                    </div>
                                                </div>
                                                <span>{device.deviceId}</span>
                                                <span>Requested: {formatDeviceTimestamp(device.requestedAt)}</span>
                                            </div>
                                            <button
                                                type="button"
                                                className="secondary"
                                                disabled={Boolean(deviceActionId) || isCurrentPendingDevice || !dmDevices.some((entry) => String(entry.deviceId) === String(currentDmDeviceId) && !entry.revokedAt)}
                                                onClick={() => handleApprovePendingDevice(device.requestId)}
                                            >
                                                {isApproving ? "Approving..." : isCurrentPendingDevice ? "Waiting for another device" : "Approve device"}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}
                        {accountNotice ? <p className="client-settings-muted">{accountNotice}</p> : null}
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="Conversation Key Health"
                        description="Check whether this device holds a decryption key for every conversation, and recover any that are missing."
                        isOpen={!collapsedSections.keyHealth}
                        onToggle={() => toggleSection("keyHealth")}
                    >
                        <div className="client-settings-inline-actions">
                            <button
                                className="secondary"
                                onClick={handleCheckKeyHealth}
                            >
                                Check key health
                            </button>
                            {missingKeyConversations !== null && (
                                missingKeyConversations.length === 0 ? (
                                    <span className="client-settings-muted">All conversations have a valid key on this device.</span>
                                ) : (
                                    <button
                                        onClick={handleRecoverMissingKeys}
                                        disabled={recoveryStatus === "Recovering…"}
                                    >
                                        Recover {missingKeyConversations.length} missing key{missingKeyConversations.length !== 1 ? "s" : ""} from server
                                    </button>
                                )
                            )}
                        </div>
                        {recoveryStatus ? (
                            <p className="client-settings-muted" style={{ marginTop: "8px" }}>{recoveryStatus}</p>
                        ) : null}

                        <div className="client-settings-stack" style={{ marginTop: "18px" }}>
                            <div>
                                <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: "0.9em" }}>
                                    Import device transfer package
                                </p>
                                <p className="client-settings-muted" style={{ marginBottom: "10px" }}>
                                    If conversations can&apos;t be recovered from the server, export a transfer package from your other device and paste it here.
                                </p>
                            </div>
                            <textarea
                                style={{
                                    width: "100%",
                                    boxSizing: "border-box",
                                    padding: "10px 12px",
                                    border: "1px solid color-mix(in srgb, var(--shell-border) 88%, transparent)",
                                    borderRadius: "calc(10px * var(--client-radius-multiplier))",
                                    background: "var(--shell-surface-alt)",
                                    color: "var(--shell-text)",
                                    fontFamily: "monospace",
                                    fontSize: "0.8em",
                                    resize: "vertical",
                                    minHeight: "90px"
                                }}
                                placeholder="Paste the JSON transfer package here…"
                                value={transferImportJson}
                                onChange={(e) => {
                                    setTransferImportJson(e.target.value);
                                    setTransferImportError("");
                                    setTransferImportStatus("");
                                }}
                            />
                            <div className="client-settings-inline-actions">
                                <button
                                    onClick={handleImportTransferPackage}
                                    disabled={!transferImportJson.trim() || transferImportStatus === "Importing…"}
                                >
                                    Import package
                                </button>
                            </div>
                            {transferImportError ? (
                                <p className="client-settings-error">{transferImportError}</p>
                            ) : null}
                            {transferImportStatus ? (
                                <p className="client-settings-muted">{transferImportStatus}</p>
                            ) : null}
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="Developer"
                        description="Control whether raw technical errors and extra diagnostics are shown on this device."
                        isOpen={!collapsedSections.developer}
                        onToggle={() => toggleSection("developer")}
                    >
                        <div className="client-accessibility-grid">
                            <label className="client-toggle-card">
                                <div className="client-toggle-copy">
                                    <strong>Debug mode</strong>
                                    <p>Shows raw fetch errors, extra technical details, and diagnostic hints in the UI.</p>
                                </div>
                                <div className="client-toggle-control">
                                    <input
                                        type="checkbox"
                                        checked={settings.debugMode}
                                        onChange={(event) => onChange("debugMode", event.target.checked)}
                                    />
                                </div>
                            </label>
                        </div>
                    </CollapsibleSection>
                        </>
                    ) : null}

                    {activeTab === "profile" ? (
                        <>
                    <CollapsibleSection
                        title="Profile"
                        description="Set your display name and preview how your profile appears."
                        isOpen={!collapsedSections.identity}
                        onToggle={() => toggleSection("identity")}
                    >
                        <div className="client-profile-card">
                            <div
                                className="client-profile-banner"
                                style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined}
                            />
                            <div className="client-profile-card-body">
                                <div className="client-profile-avatar">
                                    {avatarUrl ? <img src={avatarUrl} alt={userLabel} /> : userInitial}
                                </div>
                                <div className="client-profile-name-stack">
                                    <strong className="client-profile-name">{displayName.trim() || currentUser?.usernameBase || currentUser?.username}</strong>
                                    <span>{userHandle}</span>
                                </div>
                            </div>
                        </div>

                        {profileError ? <p className="client-settings-error">{profileError}</p> : null}
                        {profileSuccess ? <p className="client-settings-success">{profileSuccess}</p> : null}

                        <label className="client-settings-field">
                            <span>Display name</span>
                            <input
                                type="text"
                                value={displayName}
                                placeholder={currentUser?.usernameBase || currentUser?.username || "Display name"}
                                maxLength={64}
                                onChange={(event) => setDisplayName(event.target.value)}
                            />
                        </label>

                        <div className="client-settings-inline-actions">
                            <button type="button" onClick={handleSaveDisplayName} disabled={profileSaving}>
                                {profileSaving ? "Saving..." : "Save display name"}
                            </button>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="Profile Media"
                        description="Upload your avatar and profile background, and control how media loads."
                        isOpen={!collapsedSections.profileMedia}
                        onToggle={() => toggleSection("profileMedia")}
                    >
                        <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="client-hidden-input"
                            onChange={(event) => handleImageUpload(event, "avatar")}
                        />
                        <input
                            ref={bannerInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="client-hidden-input"
                            onChange={(event) => handleImageUpload(event, "banner")}
                        />

                        <div className="client-profile-media-actions">
                            <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={mediaUploading || !profileMediaHostUrl}>
                                {profileManifest?.avatar?.hasAsset ? "Change avatar" : "Upload avatar"}
                            </button>
                            <button type="button" onClick={() => bannerInputRef.current?.click()} disabled={mediaUploading || !profileMediaHostUrl}>
                                {profileManifest?.banner?.hasAsset ? "Change background" : "Upload background"}
                            </button>
                            {profileManifest?.avatar?.hasAsset ? (
                                <button type="button" className="secondary" onClick={() => handleRemoveAsset("avatar")} disabled={mediaUploading}>
                                    Remove avatar
                                </button>
                            ) : null}
                            {profileManifest?.banner?.hasAsset ? (
                                <button type="button" className="secondary" onClick={() => handleRemoveAsset("banner")} disabled={mediaUploading}>
                                    Remove background
                                </button>
                            ) : null}
                        </div>

                        {!profileMediaHostUrl ? (
                            <p className="client-settings-muted">
                                Join an online server first to host profile images.
                            </p>
                        ) : null}

                        <div className="client-settings-muted">
                            <p>{PROFILE_MEDIA_LIMITS.avatar.helpText}</p>
                            <p>{PROFILE_MEDIA_LIMITS.banner.helpText}</p>
                        </div>

                        <div className="client-accessibility-grid">
                            <label className="client-toggle-card">
                                <div className="client-toggle-copy">
                                    <strong>Load profile pictures</strong>
                                    <p>Downloads avatars from shared servers when available.</p>
                                </div>
                                <div className="client-toggle-control">
                                    <input
                                        type="checkbox"
                                        checked={settings.autoLoadProfileAvatars}
                                        onChange={(event) => onChange("autoLoadProfileAvatars", event.target.checked)}
                                    />
                                </div>
                            </label>

                            <label className="client-toggle-card">
                                <div className="client-toggle-copy">
                                    <strong>Load profile backgrounds</strong>
                                    <p>Downloads larger banner images only if you want them.</p>
                                </div>
                                <div className="client-toggle-control">
                                    <input
                                        type="checkbox"
                                        checked={settings.autoLoadProfileBanners}
                                        onChange={(event) => onChange("autoLoadProfileBanners", event.target.checked)}
                                    />
                                </div>
                            </label>

                            <label className="client-toggle-card">
                                <div className="client-toggle-copy">
                                    <strong>Shared servers only</strong>
                                    <p>Keeps profile media loading limited to servers you already share.</p>
                                </div>
                                <div className="client-toggle-control">
                                    <input
                                        type="checkbox"
                                        checked={settings.sharedServerProfileMediaOnly}
                                        onChange={(event) => onChange("sharedServerProfileMediaOnly", event.target.checked)}
                                    />
                                </div>
                            </label>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="Friend Tags"
                        description="Organize DM tags into folders. These definitions are exported with client settings."
                        isOpen={!collapsedSections.friendTags}
                        onToggle={() => toggleSection("friendTags")}
                    >
                        <div className="client-tag-folder-list">
                            {settings.friendTagFolders.map((folder) => (
                                <div key={folder.id} className="client-tag-folder-card">
                                    <div className="client-tag-folder-header">
                                        <input
                                            type="text"
                                            value={folder.label}
                                            onChange={(event) => handleFolderLabelChange(folder.id, event.target.value)}
                                            placeholder="Folder name"
                                        />
                                        <button
                                            type="button"
                                            className="secondary client-tag-action-button client-tag-remove-folder-button"
                                            onClick={() => handleRemoveFolder(folder.id)}
                                            disabled={settings.friendTagFolders.length <= 1}
                                        >
                                            Remove folder
                                        </button>
                                    </div>

                                    <div className="client-tag-list">
                                        {folder.tags.map((tag) => (
                                            <div key={tag.id} className="client-tag-row">
                                                <input
                                                    type="text"
                                                    value={tag.label}
                                                    onChange={(event) => handleTagLabelChange(folder.id, tag.id, event.target.value)}
                                                    placeholder="Tag name"
                                                />
                                                <button
                                                    type="button"
                                                    className="secondary client-tag-action-button client-tag-remove-button"
                                                    onClick={() => handleRemoveTag(folder.id, tag.id)}
                                                    disabled={folder.tags.length <= 1}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    <button
                                        type="button"
                                        className="secondary client-tag-add-button"
                                        onClick={() => handleAddTag(folder.id)}
                                    >
                                        Add tag
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            type="button"
                            className="secondary client-tag-add-folder-button"
                            onClick={handleAddFolder}
                        >
                            Add folder
                        </button>
                    </CollapsibleSection>
                        </>
                    ) : null}

                    {activeTab === "general" ? (
                    <CollapsibleSection
                        title="Preview"
                        description="These changes apply instantly and stay on this device."
                        isOpen={!collapsedSections.preview}
                        onToggle={() => toggleSection("preview")}
                    >
                        <div className="client-preview-card">
                            <h4>Client shell preview</h4>
                            <p>
                                Theme and accessibility settings affect the auth screen, top bar,
                                settings windows, friends view, and client-owned controls.
                            </p>
                            <div className="client-preview-actions">
                                <button type="button">Primary action</button>
                                <button type="button" className="secondary">Secondary action</button>
                            </div>
                        </div>
                    </CollapsibleSection>
                    ) : null}

                    {activeTab === "more" ? (
                        <>
                    <CollapsibleSection
                        title="Shortcuts"
                        description="Keyboard shortcuts you can learn now, with room for more later."
                        isOpen={!collapsedSections.shortcuts}
                        onToggle={() => toggleSection("shortcuts")}
                    >
                        <div className="client-shortcut-groups">
                            {SHORTCUT_GROUPS.map((group) => (
                                <section key={group.title} className="client-shortcut-card">
                                    <h4>{group.title}</h4>
                                    <div className="client-shortcut-list">
                                        {group.items.map((item) => (
                                            <div key={item.keys} className="client-shortcut-row">
                                                <span className="client-shortcut-keys">{item.keys}</span>
                                                <p>{item.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="Policies"
                        description="Your current privacy policy and terms documents, kept easy to find after onboarding."
                        isOpen={!collapsedSections.policies}
                        onToggle={() => toggleSection("policies")}
                    >
                        <div className="client-policy-grid">
                            <button type="button" className="client-policy-card client-policy-launch" onClick={() => setOpenPolicy("privacy")}>
                                <h4 className="policy-h4">Privacy Policy</h4>
                                <p>Open the full privacy policy in a plain reading page with its own controls.</p>
                            </button>
                            <button type="button" className="client-policy-card client-policy-launch" onClick={() => setOpenPolicy("terms")}>
                                <h4 className="policy-h4">Terms Of Service</h4>
                                <p>Open the full terms document in a plain reading page with chapter navigation.</p>
                            </button>
                        </div>
                        <p className="client-settings-muted">
                            This page is meant to grow over time with more shortcuts, helper docs, and policy details.
                        </p>
                    </CollapsibleSection>
                        </>
                    ) : null}
                </div>
                </div>

                {mediaEditor ? (
                    <div className="client-media-editor-overlay" onClick={handleCancelMediaEditor}>
                        <div className="client-media-editor" onClick={(event) => event.stopPropagation()}>
                            <div className="client-media-editor-header">
                                <div>
                                    <h3>Choose {PROFILE_MEDIA_LIMITS[mediaEditor.assetType].label} crop</h3>
                                    <p>{PROFILE_MEDIA_LIMITS[mediaEditor.assetType].helpText}</p>
                                </div>
                                <button type="button" className="secondary" onClick={handleCancelMediaEditor}>
                                    Close
                                </button>
                            </div>

                            <div
                                className={`client-media-crop-preview ${PROFILE_MEDIA_LIMITS[mediaEditor.assetType].previewClassName}`}
                                style={{
                                    backgroundImage: `url(${mediaEditor.objectUrl})`,
                                    backgroundPosition: `${mediaEditor.x}% ${mediaEditor.y}%`,
                                    backgroundSize: `${Math.round(mediaEditor.zoom * 100)}% auto`
                                }}
                            />

                            <div className="client-media-editor-controls">
                                <label>
                                    <span>Horizontal position</span>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={mediaEditor.x}
                                        onChange={(event) => setMediaEditor((prev) => ({ ...prev, x: Number(event.target.value) }))}
                                    />
                                </label>
                                <label>
                                    <span>Vertical position</span>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={mediaEditor.y}
                                        onChange={(event) => setMediaEditor((prev) => ({ ...prev, y: Number(event.target.value) }))}
                                    />
                                </label>
                                <label>
                                    <span>Zoom</span>
                                    <input
                                        type="range"
                                        min="1"
                                        max="3"
                                        step="0.05"
                                        value={mediaEditor.zoom}
                                        onChange={(event) => setMediaEditor((prev) => ({ ...prev, zoom: Number(event.target.value) }))}
                                    />
                                </label>
                            </div>

                            <div className="client-media-editor-actions">
                                <button type="button" className="secondary" onClick={handleCancelMediaEditor}>
                                    Cancel
                                </button>
                                <button type="button" onClick={handleApplyMediaCrop} disabled={mediaUploading}>
                                    {mediaUploading ? "Uploading..." : "Use image"}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}

                {openPolicy === "privacy" ? (
                    <PolicyDocumentModal
                        title="Privacy Policy"
                        markdown={privacyPolicyMarkdown}
                        overlayMode="nested"
                        onClose={() => setOpenPolicy("")}
                    />
                ) : null}

                {openPolicy === "terms" ? (
                    <PolicyDocumentModal
                        title="Terms Of Service"
                        markdown={termsOfServiceMarkdown}
                        overlayMode="nested"
                        onClose={() => setOpenPolicy("")}
                    />
                ) : null}
            </div>
        </div>
    );
}

export function resetClientSettings() {
    return { ...CLIENT_SETTINGS_DEFAULTS };
}
