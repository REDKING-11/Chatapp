import { useEffect, useMemo, useRef, useState } from "react";
import FriendContextMenu from "../components/FriendContextMenu";
import FriendsAddFriendModal from "../components/FriendsAddFriendModal";
import FriendRemovalConfirmModal from "../components/FriendRemovalConfirmModal";
import FriendConversationSettingsModal from "../components/FriendConversationSettingsModal";
import FriendsConversationPanel from "../components/FriendsConversationPanel";
import FriendsCreateGroupModal from "../components/FriendsCreateGroupModal";
import FriendsHeader from "../components/FriendsHeader";
import FriendsRail from "../components/FriendsRail";
import { formatAppError, isDebugModeEnabled } from "../../../lib/debug";
import {
    createAppDiagnosticError,
    normalizeAppDiagnosticError,
    recordAppDiagnostic
} from "../../../lib/diagnostics.js";
import { loadClientSettings, saveClientSettings } from "../../clientSettings";
import {
    acceptFriendDisappearingMessages,
    acceptFriendRequest,
    acceptFriendRelayRetention,
    approveFriendConversationHistory,
    declineFriendConversationHistory,
    fetchFriends,
    fetchHistoryAccessStatus,
    deleteFriendDirectMessage,
    editFriendDirectMessage,
    initializeFriendDirectConversation,
    importPendingHistoryTransfers,
    openFriendConversation,
    removeFriend,
    requestFriendConversationHistory,
    requestFriendDisappearingMessages,
    requestFriendRelayRetention,
    sendFriendDirectMessage,
    sendFriendRequest,
    toggleFriendDirectReaction
} from "../actions";
import {
    DISAPPEARING_MESSAGE_OPTIONS,
    RELAY_RETENTION_OPTIONS,
    getSecureDmConversationAccess,
    importRemoteConversation,
    isRealtimeConnectionUnavailableError,
    sendSecureDmRealtimeEvent,
    subscribeSecureDmPresence
} from "../../dm/actions";
import {
    canReadConversationLocally,
    isConversationMissingKey,
    isConversationMissingLocal
} from "../../dm/conversationAccess.js";
import { createBackgroundConversationImportTracker } from "../../dm/backgroundConversationImportTracker.js";
import {
    applyOutgoingDeliveryStateUpdate,
    indexOutgoingDeliveryStates
} from "../../dm/deliveryState.js";
import {
    buildInlineImageEmbedFromFile,
    classifyInlineImageEmbedCandidate,
    filterReferencedInlineImageEmbeds,
    insertInlineImageEmbedMarkdownReference,
    removeInlineImageEmbedReferences
} from "../../dm/inlineEmbeds.js";
import { inspectInlineImageEmbedRenderable } from "../../dm/inlineEmbedContracts.js";
import { traceInlineImageDiagnostic } from "../../dm/inlineEmbedTracing.js";
import { getStoredAuthToken } from "../../session/actions";
import {
    createGroupConversation,
    fetchPendingGroupInvites,
    fetchGroupConversations,
    openGroupConversation,
    sendGroupConversationMessage,
    editGroupConversationMessage,
    deleteGroupConversationMessage,
    toggleGroupConversationReaction,
    acceptGroupInvite,
    declineGroupInvite
} from "../../groups/actions";
import {
    getMessagePreviewText,
    getLatestIncomingMessageByTimestamp,
    getLatestMessageByTimestamp,
    getMessageTimestamp,
    getPreviewIncomingTimestamp,
    getPreviewTimestamp,
    truncateNotificationBody,
    truncatePreview
} from "../utils/messagePreviews";
import { normalizeExternalPresence } from "../../presence";

export default function FriendsHome({
    currentUser,
    profileMediaHostUrl,
    clientSettings,
    onChangeClientSetting,
    onActivityChange,
    onOpenClientSettings,
    onLogout
}) {
    const FILE_TRANSFER_CHUNK_BYTES = 64 * 1024;
    const PRESENCE_RESUBSCRIBE_DELAY_MS = 60000;
    const [friendsState, setFriendsState] = useState({
        friends: [],
        incomingRequests: [],
        outgoingRequests: []
    });
    const [selectedFriendId, setSelectedFriendId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [groupConversations, setGroupConversations] = useState([]);
    const [groupInvites, setGroupInvites] = useState([]);
    const [selectedGroupConversationId, setSelectedGroupConversationId] = useState(null);
    const [groupMessages, setGroupMessages] = useState([]);
    const [groupComposer, setGroupComposer] = useState("");
    const [groupReplyTo, setGroupReplyTo] = useState(null);
    const [groupEditingMessage, setGroupEditingMessage] = useState(null);
    const [groupConversationMeta, setGroupConversationMeta] = useState(null);
    const [conversationPreviews, setConversationPreviews] = useState({});
    const [activeView, setActiveView] = useState("friend");
    const [composer, setComposer] = useState("");
    const [directReplyTo, setDirectReplyTo] = useState(null);
    const [directEditingMessage, setDirectEditingMessage] = useState(null);
    const [friendUsername, setFriendUsername] = useState("");
    const [showAddFriendModal, setShowAddFriendModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [errorCode, setErrorCode] = useState("");
    const [errorTraceId, setErrorTraceId] = useState("");
    const [errorDebugDetails, setErrorDebugDetails] = useState("");
    const [encryptChatError, setEncryptChatError] = useState("");
    const [selectedRelayTtlSeconds, setSelectedRelayTtlSeconds] = useState(86400);
    const [selectedDisappearingTtlSeconds, setSelectedDisappearingTtlSeconds] = useState(0);
    const [conversationMeta, setConversationMeta] = useState(null);
    const [hasLocalConversationAccess, setHasLocalConversationAccess] = useState(true);
    const [hasLocalGroupConversationAccess, setHasLocalGroupConversationAccess] = useState(true);
    const [showConversationSettings, setShowConversationSettings] = useState(false);
    const [historyAccessRequest, setHistoryAccessRequest] = useState(null);
    const [collapsedFriendFolders, setCollapsedFriendFolders] = useState({});
    const [clientSettingsSnapshot, setClientSettingsSnapshot] = useState(() => loadClientSettings());
    const [forgottenConversationIds, setForgottenConversationIds] = useState({});
    const [friendContextMenu, setFriendContextMenu] = useState(null);
    const [lockPhase, setLockPhase] = useState("hidden");
    const [isEncryptingChat, setIsEncryptingChat] = useState(false);
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
    const [friendRemovalConfirm, setFriendRemovalConfirm] = useState(null);
    const [groupTitle, setGroupTitle] = useState("");
    const [groupMemberIds, setGroupMemberIds] = useState([]);
    const [groupCreateError, setGroupCreateError] = useState("");
    const [syncState, setSyncState] = useState({
        status: "idle",
        importedCount: 0,
        source: null
    });
    const [conversationSeenTimestamps, setConversationSeenTimestamps] = useState({});
    const [hasLoadedConversationSeenTimestamps, setHasLoadedConversationSeenTimestamps] = useState(false);
    const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== "hidden");
    const [previewRefreshNonce, setPreviewRefreshNonce] = useState(0);
    const [directAttachments, setDirectAttachments] = useState([]);
    const [directInlineEmbeds, setDirectInlineEmbeds] = useState([]);
    const [groupAttachments, setGroupAttachments] = useState([]);
    const [attachmentTransferStates, setAttachmentTransferStates] = useState({});
    const [presenceByUserId, setPresenceByUserId] = useState({});
    const [presenceSubscriptionNonce, setPresenceSubscriptionNonce] = useState(0);
    const [messageDeliveryById, setMessageDeliveryById] = useState({});
    const messageListRef = useRef(null);
    const secureStatusRef = useRef(null);
    const lockCloseTimeoutRef = useRef(null);
    const lockHideTimeoutRef = useRef(null);
    const viewAcknowledgeTimeoutRef = useRef(null);
    const groupConversationsRef = useRef([]);
    const selectedGroupConversationIdRef = useRef(null);
    const selectedFriendIdRef = useRef(null);
    const hasInitializedSeenBaselineRef = useRef(false);
    const sessionStartedAtRef = useRef(Date.now());
    const incomingDownloadTargetsRef = useRef({});
    const presenceSubscriptionKeyRef = useRef("");
    const presenceSubscriptionFailureRef = useRef({
        key: "",
        retryAt: 0
    });
    const backgroundConversationImportTrackerRef = useRef(createBackgroundConversationImportTracker());

    const legacyFriendTagsStorageKey = `friendTags:${currentUser.id}`;
    const collapsedFriendFoldersStorageKey = `collapsedFriendFolders:${currentUser.id}`;
    const forgottenConversationsStorageKey = `forgottenFriendConversations:${currentUser.id}`;
    const conversationSeenStorageKey = `conversationSeenTimestamps:${currentUser.id}`;
    const debugModeEnabled = Boolean(clientSettingsSnapshot.debugMode);

    function clearErrorState() {
        setError("");
        setErrorCode("");
        setErrorTraceId("");
        setErrorDebugDetails("");
        setEncryptChatError("");
    }

    function showError(errorValue, options = {}) {
        recordAppDiagnostic(errorValue, {
            source: options.source || errorValue?.source || "friends",
            operation: options.operation || errorValue?.operation || "ui.error",
            severity: options.severity || errorValue?.severity || "error"
        });
        const formatted = formatAppError(errorValue, {
            fallbackMessage: "Something went wrong in Friends.",
            context: "Friends",
            ...options
        });
        setError(formatted.message);
        setErrorCode(formatted.code || "");
        setErrorTraceId(formatted.traceId || "");
        setErrorDebugDetails(formatted.debugMode ? formatted.debugDetails : "");
    }

    function showEncryptChatError(errorValue) {
        recordAppDiagnostic(errorValue, {
            source: errorValue?.source || "friends",
            operation: errorValue?.operation || "encryptChat",
            severity: errorValue?.severity || "error"
        });
        const formatted = formatAppError(errorValue, {
            fallbackMessage: "Could not start the encrypted chat.",
            context: "Friends"
        });
        setError(formatted.message);
        setErrorCode(formatted.code || "");
        setErrorTraceId(formatted.traceId || "");
        setErrorDebugDetails(formatted.debugMode ? formatted.debugDetails : "");
        setEncryptChatError(formatted.message);
    }

    function showStaticError(message, debugDetails = "", options = {}) {
        setError(message);
        setErrorCode(options.code || "");
        setErrorTraceId(options.traceId || "");
        setErrorDebugDetails(isDebugModeEnabled() ? debugDetails : "");
    }

    function updateAttachmentTransferState(transferId, patch) {
        if (!transferId) {
            return;
        }

        setAttachmentTransferStates((prev) => ({
            ...prev,
            [String(transferId)]: {
                ...(prev[String(transferId)] || { status: "idle", progress: 0 }),
                ...(patch || {})
            }
        }));
    }

    function clearComposerAttachments() {
        setDirectAttachments([]);
        setDirectInlineEmbeds([]);
        setGroupAttachments([]);
    }

    function mergeOrderedById(existingItems, incomingItems, getId) {
        const incomingMap = new Map(
            (incomingItems || []).map((item) => [String(getId(item)), item])
        );
        const merged = [];

        (existingItems || []).forEach((item) => {
            const key = String(getId(item));

            if (incomingMap.has(key)) {
                merged.push(incomingMap.get(key));
                incomingMap.delete(key);
            }
        });

        incomingMap.forEach((item) => {
            merged.push(item);
        });

        return merged;
    }

    function applyOpenedFriendConversation(friendToLoad, data) {
        setMessages(data?.messages || []);
        setConversationMeta(data?.conversation || null);
        setHasLocalConversationAccess(data?.hasLocalAccess !== false);
        setSelectedRelayTtlSeconds(data?.conversation?.relayPolicy?.currentSeconds ?? 86400);
        setSelectedDisappearingTtlSeconds(data?.conversation?.disappearingPolicy?.currentSeconds ?? 0);
    }

    function applyOpenedGroupConversation(data) {
        setGroupMessages(data?.messages || []);
        setGroupConversationMeta(data?.conversation || null);
        setHasLocalGroupConversationAccess(data?.hasLocalAccess !== false);

        if (data?.conversation?.id) {
            upsertGroupConversation(data.conversation);
        }
    }

    async function refreshFriendHistoryStatus(friendToLoad) {
        if (friendToLoad?.conversationId) {
            const historyStatus = await fetchHistoryAccessStatus({
                friendUserId: friendToLoad.friendUserId,
                conversationId: friendToLoad.conversationId
            });
            setHistoryAccessRequest(historyStatus.request);
            return;
        }

        setHistoryAccessRequest(null);
    }

    async function loadFriendConversationForFriend(friendToLoad) {
        if (!friendToLoad) {
            setMessages([]);
            setConversationMeta(null);
            setHasLocalConversationAccess(true);
            setShowConversationSettings(false);
            setHistoryAccessRequest(null);
            return null;
        }

        const data = await openFriendConversation({
            currentUser,
            friend: friendToLoad
        });

        applyOpenedFriendConversation(friendToLoad, data);
        await refreshFriendHistoryStatus(friendToLoad);
        return data;
    }

    async function loadGroupConversationForId(conversationId) {
        if (!conversationId) {
            setGroupMessages([]);
            setGroupConversationMeta(null);
            setHasLocalGroupConversationAccess(true);
            return null;
        }

        const data = await openGroupConversation({
            currentUser,
            conversationId
        });

        applyOpenedGroupConversation(data);
        return data;
    }

    async function maybeShowDesktopNotification({ conversationId, message }) {
        if (!window.desktopNotifications || !message || message.direction !== "incoming") {
            return;
        }

        if (message.kind && message.kind !== "message") {
            return;
        }

        if (message.imported !== true) {
            return;
        }

        const messageTimestamp = message?.createdAt ? new Date(message.createdAt).getTime() : null;
        if (
            messageTimestamp != null
            && !Number.isNaN(messageTimestamp)
            && messageTimestamp < sessionStartedAtRef.current - 5000
        ) {
            return;
        }

        if (document.hasFocus()) {
            return;
        }

        const matchingFriend = friendsState.friends.find(
            (friend) => String(friend.conversationId || "") === String(conversationId)
        );

        if (matchingFriend) {
            const previewBody = getMessagePreviewText(message) || "New message";
            await window.desktopNotifications.show({
                title: matchingFriend.friendUsername,
                body: truncateNotificationBody(previewBody)
            });
            return;
        }

        const matchingGroup = groupConversations.find(
            (conversation) => String(conversation.id) === String(conversationId)
        );

        if (matchingGroup) {
            const previewBody = getMessagePreviewText(message) || "New message";
            await window.desktopNotifications.show({
                title: matchingGroup.title || "Group chat",
                body: truncateNotificationBody(previewBody)
            });
        }
    }

    async function loadFriends({ preserveOrder = false, background = false } = {}) {
        if (!background) {
            setLoading(true);
            clearErrorState();
        }

        try {
            const data = await fetchFriends();
            setFriendsState((prev) => ({
                incomingRequests: data.incomingRequests || [],
                outgoingRequests: data.outgoingRequests || [],
                friends: preserveOrder
                    ? mergeOrderedById(prev.friends, data.friends || [], (friend) => friend.friendUserId)
                    : (data.friends || [])
            }));

            if (!selectedFriendIdRef.current && (data.friends || []).length > 0) {
                setSelectedFriendId(data.friends[0].friendUserId);
            }
        } catch (err) {
            if (!background) {
                showError(err, {
                    operation: "friends.load"
                });
            } else {
                recordAppDiagnostic(err, {
                    code: "FRIENDS_LOAD_FAILED",
                    source: "friends",
                    operation: "friends.load.background",
                    severity: "warning"
                });
                console.warn("Background friends refresh failed:", err);
            }
        } finally {
            if (!background) {
                setLoading(false);
            }
        }
    }

    async function loadGroupConversationList(preferredConversationId = null, { preserveOrder = false, background = false } = {}) {
        try {
            const conversations = await fetchGroupConversations();
            const existingConversations = groupConversationsRef.current;
            const mergedConversations = preserveOrder
                ? mergeOrderedById(existingConversations, conversations || [], (conversation) => conversation.id)
                : [
                    ...(conversations || []),
                    ...existingConversations.filter(
                        (conversation) => !(conversations || []).some((entry) => String(entry.id) === String(conversation.id))
                    )
                ];

            setGroupConversations(mergedConversations);
            setSelectedGroupConversationId((prev) => {
                const desiredId = preferredConversationId || prev || selectedGroupConversationIdRef.current;

                if (
                    desiredId
                    && mergedConversations.some((conversation) => String(conversation.id) === String(desiredId))
                ) {
                    return desiredId;
                }

                return mergedConversations[0]?.id ?? null;
            });
        } catch (err) {
            if (!background) {
                showError(err, {
                    operation: "groups.load"
                });
            } else {
                recordAppDiagnostic(err, {
                    source: "friends",
                    operation: "groups.load.background",
                    severity: "warning"
                });
                console.warn("Background group refresh failed:", err);
            }
        }
    }

    async function loadGroupInvites({ background = false } = {}) {
        try {
            setGroupInvites(await fetchPendingGroupInvites());
        } catch (err) {
            if (!background) {
                showError(err, {
                    operation: "groupInvites.load"
                });
            } else {
                recordAppDiagnostic(err, {
                    source: "friends",
                    operation: "groupInvites.load.background",
                    severity: "warning"
                });
                console.warn("Background group invite refresh failed:", err);
            }
        }
    }

    function upsertGroupConversation(conversation) {
        if (!conversation?.id) {
            return;
        }

        setGroupConversations((prev) => {
            const next = prev.filter((entry) => String(entry.id) !== String(conversation.id));
            return [conversation, ...next];
        });
    }

    useEffect(() => {
        groupConversationsRef.current = groupConversations;
    }, [groupConversations]);

    useEffect(() => {
        selectedGroupConversationIdRef.current = selectedGroupConversationId;
    }, [selectedGroupConversationId]);

    useEffect(() => {
        selectedFriendIdRef.current = selectedFriendId;
    }, [selectedFriendId]);

    useEffect(() => {
        hasInitializedSeenBaselineRef.current = false;
        sessionStartedAtRef.current = Date.now();
        setHasLoadedConversationSeenTimestamps(false);
    }, [currentUser?.id]);

    useEffect(() => {
        loadFriends();
    }, []);

    useEffect(() => {
        loadGroupConversationList();
    }, []);

    useEffect(() => {
        loadGroupInvites();
    }, []);

    useEffect(() => {
        clearComposerAttachments();
    }, [activeView, selectedFriendId, selectedGroupConversationId]);

    useEffect(() => {
        function handleClientSettingsChanged(event) {
            setClientSettingsSnapshot(event.detail || loadClientSettings());
        }

        window.addEventListener("clientSettingsChanged", handleClientSettingsChanged);
        return () => window.removeEventListener("clientSettingsChanged", handleClientSettingsChanged);
    }, []);

    useEffect(() => {
        setPresenceByUserId({});
        presenceSubscriptionKeyRef.current = "";
        presenceSubscriptionFailureRef.current = {
            key: "",
            retryAt: 0
        };
        setPresenceSubscriptionNonce(0);
    }, [currentUser?.id]);

    useEffect(() => {
        backgroundConversationImportTrackerRef.current = createBackgroundConversationImportTracker();
        setHasLocalGroupConversationAccess(true);
    }, [currentUser?.id]);

    useEffect(() => {
        function handleRealtimeConnected() {
            presenceSubscriptionKeyRef.current = "";
            presenceSubscriptionFailureRef.current = {
                key: "",
                retryAt: 0
            };
            setPresenceSubscriptionNonce((prev) => prev + 1);
        }

        function handleRealtimeDisconnected() {
            presenceSubscriptionKeyRef.current = "";
        }

        window.addEventListener("secureDmRealtimeConnected", handleRealtimeConnected);
        window.addEventListener("secureDmRealtimeDisconnected", handleRealtimeDisconnected);
        return () => {
            window.removeEventListener("secureDmRealtimeConnected", handleRealtimeConnected);
            window.removeEventListener("secureDmRealtimeDisconnected", handleRealtimeDisconnected);
        };
    }, []);

    useEffect(() => {
        function handlePresenceSnapshot(event) {
            const items = Array.isArray(event.detail?.items) ? event.detail.items : [];

            setPresenceByUserId((prev) => {
                const next = { ...prev };
                items.forEach((item) => {
                    const userId = String(item?.userId || "");
                    if (!userId) {
                        return;
                    }

                    next[userId] = normalizeExternalPresence(item);
                });
                return next;
            });
        }

        function handlePresenceUpdate(event) {
            const userId = String(event.detail?.userId || "");
            if (!userId) {
                return;
            }

            setPresenceByUserId((prev) => ({
                ...prev,
                [userId]: normalizeExternalPresence(event.detail)
            }));
        }

        window.addEventListener("secureDmPresenceSnapshot", handlePresenceSnapshot);
        window.addEventListener("secureDmPresenceUpdate", handlePresenceUpdate);
        return () => {
            window.removeEventListener("secureDmPresenceSnapshot", handlePresenceSnapshot);
            window.removeEventListener("secureDmPresenceUpdate", handlePresenceUpdate);
        };
    }, []);

    useEffect(() => {
        const token = getStoredAuthToken();
        const friendUserIds = (friendsState.friends || [])
            .map((friend) => Number(friend.friendUserId))
            .filter((userId) => Number.isInteger(userId) && userId > 0)
            .sort((left, right) => left - right);
        const subscriptionKey = friendUserIds.join(",");

        if (!currentUser?.id || !token || friendUserIds.length === 0) {
            return;
        }

        if (presenceSubscriptionKeyRef.current === subscriptionKey) {
            return;
        }

        if (
            presenceSubscriptionFailureRef.current.key === subscriptionKey
            && Date.now() < presenceSubscriptionFailureRef.current.retryAt
        ) {
            return;
        }

        subscribeSecureDmPresence({
            token,
            currentUser,
            userIds: friendUserIds
        }).then(() => {
            presenceSubscriptionKeyRef.current = subscriptionKey;
            presenceSubscriptionFailureRef.current = {
                key: "",
                retryAt: 0
            };
        }).catch((error) => {
            if (isRealtimeConnectionUnavailableError(error)) {
                presenceSubscriptionFailureRef.current = {
                    key: subscriptionKey,
                    retryAt: Math.max(
                        Number(error?.retryAt) || 0,
                        Date.now() + PRESENCE_RESUBSCRIBE_DELAY_MS
                    )
                };
                recordAppDiagnostic(error, {
                    code: String(error?.code || "") || "FRIENDS_PRESENCE_SUBSCRIBE_FAILED",
                    source: "friends",
                    operation: "presence.subscribe",
                    severity: "warning",
                    details: {
                        subscriptionKey,
                        friendUserIds
                    }
                });
                return;
            }

            recordAppDiagnostic(
                normalizeAppDiagnosticError(error, {
                    code: "FRIENDS_PRESENCE_SUBSCRIBE_FAILED",
                    userMessage: "Could not subscribe to friend presence updates.",
                    source: "friends",
                    operation: "presence.subscribe",
                    severity: "warning",
                    details: {
                        subscriptionKey,
                        friendUserIds
                    }
                })
            );
            console.warn("Failed to subscribe to friend presence updates:", error);
        });
    }, [currentUser, friendsState.friends, presenceSubscriptionNonce]);

    useEffect(() => {
        if (!debugModeEnabled && errorDebugDetails) {
            setErrorDebugDetails("");
        }
    }, [debugModeEnabled, errorDebugDetails]);

    useEffect(() => {
        setEncryptChatError("");
    }, [selectedFriendId]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(collapsedFriendFoldersStorageKey);
            setCollapsedFriendFolders(raw ? JSON.parse(raw) : {});
        } catch {
            setCollapsedFriendFolders({});
        }
    }, [collapsedFriendFoldersStorageKey]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(forgottenConversationsStorageKey);
            setForgottenConversationIds(raw ? JSON.parse(raw) : {});
        } catch {
            setForgottenConversationIds({});
        }
    }, [forgottenConversationsStorageKey]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(conversationSeenStorageKey);
            setConversationSeenTimestamps(raw ? JSON.parse(raw) : {});
        } catch {
            setConversationSeenTimestamps({});
        } finally {
            setHasLoadedConversationSeenTimestamps(true);
        }
    }, [conversationSeenStorageKey]);

    useEffect(() => {
        localStorage.setItem(collapsedFriendFoldersStorageKey, JSON.stringify(collapsedFriendFolders));
    }, [collapsedFriendFolders, collapsedFriendFoldersStorageKey]);

    const friendTagFolders = clientSettingsSnapshot.friendTagFolders || [];
    const friendTags = clientSettingsSnapshot.friendTagAssignments || {};
    const friendTagLookup = useMemo(() => {
        const next = {};
        friendTagFolders.forEach((folder) => {
            folder.tags.forEach((tag) => {
                next[String(tag.id)] = {
                    ...tag,
                    folderId: folder.id,
                    folderLabel: folder.label
                };
            });
        });
        return next;
    }, [friendTagFolders]);

    useEffect(() => {
        const nextAssignments = Object.entries(friendTags).reduce((next, [friendId, tagId]) => {
            if (friendTagLookup[String(tagId)]) {
                next[friendId] = tagId;
            }

            return next;
        }, {});

        if (JSON.stringify(nextAssignments) === JSON.stringify(friendTags)) {
            return;
        }

        const nextSettings = saveClientSettings({
            ...clientSettingsSnapshot,
            friendTagAssignments: nextAssignments
        });
        setClientSettingsSnapshot(nextSettings);
    }, [clientSettingsSnapshot, friendTagLookup, friendTags]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(legacyFriendTagsStorageKey);
            if (!raw) {
                return;
            }

            const legacyAssignments = JSON.parse(raw);
            if (!legacyAssignments || typeof legacyAssignments !== "object" || Array.isArray(legacyAssignments)) {
                localStorage.removeItem(legacyFriendTagsStorageKey);
                return;
            }

            const mergedAssignments = {
                ...legacyAssignments,
                ...friendTags
            };

            if (JSON.stringify(mergedAssignments) !== JSON.stringify(friendTags)) {
                const nextSettings = saveClientSettings({
                    ...clientSettingsSnapshot,
                    friendTagAssignments: mergedAssignments
                });
                setClientSettingsSnapshot(nextSettings);
            }

            localStorage.removeItem(legacyFriendTagsStorageKey);
        } catch {
            localStorage.removeItem(legacyFriendTagsStorageKey);
        }
    }, [clientSettingsSnapshot, friendTags, legacyFriendTagsStorageKey]);

    useEffect(() => {
        setCollapsedFriendFolders((prev) => {
            const validFolderIds = new Set(friendTagFolders.map((folder) => String(folder.id)));
            const next = {};
            let changed = false;

            Object.entries(prev).forEach(([folderId, collapsed]) => {
                if (validFolderIds.has(String(folderId))) {
                    next[folderId] = collapsed;
                } else {
                    changed = true;
                }
            });

            if (!changed && Object.keys(next).length === Object.keys(prev).length) {
                return prev;
            }

            return next;
        });
    }, [friendTagFolders]);

    useEffect(() => {
        localStorage.setItem(
            forgottenConversationsStorageKey,
            JSON.stringify(forgottenConversationIds)
        );
    }, [forgottenConversationIds, forgottenConversationsStorageKey]);

    useEffect(() => {
        if (!hasLoadedConversationSeenTimestamps) {
            return;
        }

        localStorage.setItem(
            conversationSeenStorageKey,
            JSON.stringify(conversationSeenTimestamps)
        );
    }, [conversationSeenStorageKey, conversationSeenTimestamps, hasLoadedConversationSeenTimestamps]);

    useEffect(() => {
        setForgottenConversationIds((prev) => {
            const next = { ...prev };
            let changed = false;

            friendsState.friends.forEach((friend) => {
                const key = String(friend.friendUserId);
                if (next[key] && String(next[key]) !== String(friend.conversationId || "")) {
                    delete next[key];
                    changed = true;
                }
            });

            return changed ? next : prev;
        });
    }, [friendsState.friends]);

    useEffect(() => {
        importPendingHistoryTransfers({ currentUser }).catch((err) => {
            showError(err, {
                operation: "history.import"
            });
        });
    }, [currentUser]);

    useEffect(() => {
        async function refreshSidebarState() {
            await Promise.all([
                loadFriends({ preserveOrder: true, background: true }),
                loadGroupConversationList(null, { preserveOrder: true, background: true }),
                loadGroupInvites({ background: true })
            ]);
        }

        const intervalId = window.setInterval(() => {
            refreshSidebarState();
        }, 15000);

        function handleWindowFocus() {
            refreshSidebarState();
        }

        window.addEventListener("focus", handleWindowFocus);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener("focus", handleWindowFocus);
        };
    }, []);

    const selectedFriend = useMemo(() => (
        friendsState.friends.find(
            (friend) => String(friend.friendUserId) === String(selectedFriendId)
        ) || null
    ), [friendsState.friends, selectedFriendId]);
    useEffect(() => {
        function handleShortcut(event) {
            const action = event.detail?.action;

            if (action === "openConversationSettings") {
                if (activeView === "friend" && selectedFriend) {
                    setShowConversationSettings(true);
                }
                return;
            }

            if (action === "closeOverlay") {
                if (friendContextMenu) {
                    setFriendContextMenu(null);
                    return;
                }

                if (showConversationSettings) {
                    setShowConversationSettings(false);
                    return;
                }

                if (showAddFriendModal) {
                    setShowAddFriendModal(false);
                    return;
                }

                if (showCreateGroupModal) {
                    setShowCreateGroupModal(false);
                    return;
                }

                if (friendRemovalConfirm) {
                    setFriendRemovalConfirm(null);
                }
            }
        }

        window.addEventListener("chatapp-shortcut", handleShortcut);
        return () => window.removeEventListener("chatapp-shortcut", handleShortcut);
    }, [
        activeView,
        friendContextMenu,
        friendRemovalConfirm,
        selectedFriend,
        showAddFriendModal,
        showConversationSettings,
        showCreateGroupModal
    ]);
    const selectedGroupConversation = useMemo(() => (
        groupConversations.find(
            (conversation) => String(conversation.id) === String(selectedGroupConversationId)
        ) || null
    ), [groupConversations, selectedGroupConversationId]);
    const selectedFriendForgottenConversationId = selectedFriend
        ? forgottenConversationIds[String(selectedFriend.friendUserId)] || null
        : null;
    const effectiveSelectedFriend = useMemo(() => {
        if (!selectedFriend) {
            return null;
        }

        if (
            selectedFriendForgottenConversationId
            && String(selectedFriend.conversationId) === String(selectedFriendForgottenConversationId)
        ) {
            return { ...selectedFriend, conversationId: null };
        }

        return selectedFriend;
    }, [selectedFriend, selectedFriendForgottenConversationId]);

    useEffect(() => {
        const switcherItems = [
            ...friendsState.friends.map((friend) => ({
                id: `friend:${friend.friendUserId}`,
                group: "friend",
                scope: "friend",
                targetId: friend.friendUserId,
                label: friend.friendUsername,
                subtitle: friend.friendDisplayName || "Direct message"
            })),
            ...groupConversations.map((conversation) => ({
                id: `group:${conversation.id}`,
                group: "group",
                scope: "group",
                targetId: conversation.id,
                label: conversation.title || "Group chat",
                subtitle: `${(conversation.participants || []).length} members`
            }))
        ];

        window.dispatchEvent(new CustomEvent("chatapp-switcher-items", {
            detail: switcherItems
        }));
    }, [friendsState.friends, groupConversations]);

    useEffect(() => {
        async function loadConversation() {
            if (!selectedFriend) {
                setMessages([]);
                setConversationMeta(null);
                setHasLocalConversationAccess(true);
                setShowConversationSettings(false);
                setHistoryAccessRequest(null);
                return;
            }

            const friendToLoad = (
                selectedFriendForgottenConversationId
                && String(selectedFriend.conversationId) === String(selectedFriendForgottenConversationId)
            )
                ? { ...selectedFriend, conversationId: null }
                : selectedFriend;

            try {
                await loadFriendConversationForFriend(friendToLoad);
            } catch (err) {
                setHasLocalConversationAccess(true);
                showError(err);
            }
        }

        loadConversation();
    }, [
        currentUser,
        selectedFriend?.friendUserId,
        selectedFriend?.conversationId,
        selectedFriend?.friendUsername,
        selectedFriendForgottenConversationId
    ]);

    useEffect(() => {
        async function loadSelectedGroupConversation() {
            try {
                await loadGroupConversationForId(selectedGroupConversationId);
            } catch (err) {
                setHasLocalGroupConversationAccess(true);
                showError(err);
            }
        }

        loadSelectedGroupConversation();
    }, [currentUser, selectedGroupConversationId]);

    useEffect(() => {
        async function handleSecureDmMessage(event) {
            const incomingConversationId = event?.detail?.conversationId;
            const incomingMessage = event?.detail?.message || null;

            maybeShowDesktopNotification({
                conversationId: incomingConversationId,
                message: incomingMessage
            }).catch((notificationError) => {
                console.error("Failed to show desktop notification:", notificationError);
            });

            setPreviewRefreshNonce((prev) => prev + 1);

            if (
                activeView === "group"
                && selectedGroupConversationId
                && String(selectedGroupConversationId) === String(incomingConversationId)
            ) {
                try {
                    await loadGroupConversationForId(selectedGroupConversationId);
                    await loadGroupConversationList(selectedGroupConversationId);
                } catch (err) {
                    showError(err);
                }

                return;
            }

            if (
                !effectiveSelectedFriend
                || !effectiveSelectedFriend.conversationId
                || String(effectiveSelectedFriend.conversationId) !== String(incomingConversationId)
            ) {
                return;
            }

            try {
                await loadFriendConversationForFriend(effectiveSelectedFriend);
            } catch (err) {
                setHasLocalConversationAccess(true);
                showError(err);
            }
        }

        window.addEventListener("secureDmMessage", handleSecureDmMessage);
        return () => window.removeEventListener("secureDmMessage", handleSecureDmMessage);
    }, [activeView, currentUser, effectiveSelectedFriend, friendsState.friends, groupConversations, selectedGroupConversationId]);

    useEffect(() => {
        async function handleSecureDmFileSignal(event) {
            const detail = event.detail || {};
            const transferId = String(detail.transferId || "");

            if (!transferId) {
                return;
            }

            try {
                if (detail.type === "dm:file:request") {
                    const attachmentInfo = await window.attachmentTransfers.getOutgoingInfo({ transferId });

                    if (!attachmentInfo) {
                        await sendSecureDmRealtimeEvent({
                            token: getStoredAuthToken(),
                            currentUser,
                            payload: {
                                type: "dm:file:error",
                                targetDeviceId: detail.senderDeviceId,
                                transferId,
                                error: "That file is no longer available on the sender device"
                            }
                        });
                        return;
                    }

                    updateAttachmentTransferState(transferId, {
                        status: "uploading",
                        progress: 0,
                        fileName: attachmentInfo.fileName
                    });

                    await sendSecureDmRealtimeEvent({
                        token: getStoredAuthToken(),
                        currentUser,
                        payload: {
                            type: "dm:file:ready",
                            targetDeviceId: detail.senderDeviceId,
                            transferId
                        }
                    });

                    let offset = 0;

                    while (true) {
                        const chunk = await window.attachmentTransfers.readOutgoingChunk({
                            transferId,
                            offset,
                            length: FILE_TRANSFER_CHUNK_BYTES
                        });

                        await sendSecureDmRealtimeEvent({
                            token: getStoredAuthToken(),
                            currentUser,
                            payload: {
                                type: "dm:file:chunk",
                                targetDeviceId: detail.senderDeviceId,
                                transferId,
                                chunkBase64: chunk.chunkBase64,
                                ivBase64: chunk.ivBase64,
                                tagBase64: chunk.tagBase64,
                                nextOffset: chunk.nextOffset,
                                fileSize: chunk.fileSize
                            }
                        });

                        updateAttachmentTransferState(transferId, {
                            status: "uploading",
                            progress: chunk.fileSize > 0 ? (chunk.nextOffset / chunk.fileSize) * 100 : 100
                        });

                        if (chunk.done) {
                            break;
                        }

                        offset = chunk.nextOffset;
                    }

                    await sendSecureDmRealtimeEvent({
                        token: getStoredAuthToken(),
                        currentUser,
                        payload: {
                            type: "dm:file:complete",
                            targetDeviceId: detail.senderDeviceId,
                            transferId
                        }
                    });

                    updateAttachmentTransferState(transferId, {
                        status: "complete",
                        progress: 100
                    });
                    return;
                }

                if (detail.type === "dm:file:ready") {
                    updateAttachmentTransferState(transferId, {
                        status: "downloading",
                        progress: 0,
                        fileName: attachmentTransferStates[String(transferId)]?.fileName || "file"
                    });
                    return;
                }

                if (detail.type === "dm:file:chunk") {
                    await window.attachmentTransfers.appendIncomingChunk({
                        transferId,
                        chunkBase64: detail.chunkBase64,
                        ivBase64: detail.ivBase64,
                        tagBase64: detail.tagBase64
                    });

                    updateAttachmentTransferState(transferId, {
                        status: "downloading",
                        progress: Number(detail.fileSize) > 0
                            ? (Number(detail.nextOffset || 0) / Number(detail.fileSize)) * 100
                            : 0
                    });
                    return;
                }

                if (detail.type === "dm:file:complete") {
                    await window.attachmentTransfers.finishIncomingDownload({ transferId });
                    delete incomingDownloadTargetsRef.current[transferId];
                    updateAttachmentTransferState(transferId, {
                        status: "complete",
                        progress: 100
                    });
                    return;
                }

                if (detail.type === "dm:file:error") {
                    if (incomingDownloadTargetsRef.current[transferId]) {
                        await window.attachmentTransfers.cancelIncomingDownload({
                            transferId,
                            removePartial: true
                        });
                        delete incomingDownloadTargetsRef.current[transferId];
                    }

                    updateAttachmentTransferState(transferId, {
                        status: "error",
                        error: detail.error || "Transfer failed"
                    });
                }
            } catch (transferError) {
                console.error("Attachment transfer failed:", transferError);
                updateAttachmentTransferState(transferId, {
                    status: "error",
                    error: transferError?.message || "Transfer failed"
                });
            }
        }

        window.addEventListener("secureDmFileSignal", handleSecureDmFileSignal);
        return () => window.removeEventListener("secureDmFileSignal", handleSecureDmFileSignal);
    }, [FILE_TRANSFER_CHUNK_BYTES, attachmentTransferStates, currentUser]);

    useEffect(() => {
        function handleConversationAccessRequired(event) {
            const conversationId = event.detail?.conversationId;

            if (
                selectedFriend?.conversationId
                && String(selectedFriend.conversationId) === String(conversationId)
            ) {
                setHasLocalConversationAccess(false);
            }

            if (
                selectedGroupConversationIdRef.current
                && String(selectedGroupConversationIdRef.current) === String(conversationId)
            ) {
                setHasLocalGroupConversationAccess(false);
            }

            setPreviewRefreshNonce((prev) => prev + 1);
        }

        window.addEventListener("secureDmConversationAccessRequired", handleConversationAccessRequired);
        return () => window.removeEventListener("secureDmConversationAccessRequired", handleConversationAccessRequired);
    }, [selectedFriend]);

    useEffect(() => {
        function handleSyncState(event) {
            const detail = event.detail || {};
            const importedCount = Number(detail.importedCount ?? 0);
            const safeImportedCount = Number.isNaN(importedCount) ? 0 : importedCount;
            const status = detail.status === "complete" && safeImportedCount <= 0
                ? "idle"
                : detail.status || "idle";

            setSyncState({
                status,
                importedCount: safeImportedCount,
                source: detail.source || null
            });
        }

        window.addEventListener("secureDmSyncState", handleSyncState);
        return () => window.removeEventListener("secureDmSyncState", handleSyncState);
    }, []);

    useEffect(() => {
        if (syncState.status !== "complete" || syncState.importedCount <= 0) {
            return undefined;
        }

        const timeoutId = window.setTimeout(() => {
            setSyncState({
                status: "idle",
                importedCount: 0,
                source: null
            });
        }, 5000);

        return () => window.clearTimeout(timeoutId);
    }, [syncState]);

    useEffect(() => {
        setSyncState({
            status: "idle",
            importedCount: 0,
            source: null
        });
    }, [currentUser?.id]);

    useEffect(() => {
        setMessageDeliveryById({});
    }, [currentUser?.id]);

    useEffect(() => {
        const persistedDeliveryStates = {
            ...indexOutgoingDeliveryStates(messages),
            ...indexOutgoingDeliveryStates(groupMessages)
        };
        const persistedEntries = Object.entries(persistedDeliveryStates);

        if (persistedEntries.length === 0) {
            return;
        }

        setMessageDeliveryById((prev) => {
            let changed = false;
            const next = { ...prev };

            persistedEntries.forEach(([messageId, deliveryState]) => {
                if (next[messageId] !== deliveryState) {
                    next[messageId] = deliveryState;
                    changed = true;
                }
            });

            return changed ? next : prev;
        });
    }, [messages, groupMessages]);

    useEffect(() => {
        function handleRelayQueueState(event) {
            const detail = event.detail || {};
            setMessageDeliveryById((prev) => applyOutgoingDeliveryStateUpdate(prev, detail));

            if ((detail.droppedRecipients || []).length > 0) {
                showStaticError("Your friend is offline and this chat is set to no relay, so the message was not queued.", "Friends relay queue: dropped recipients while relay was disabled.");
            }
        }

        window.addEventListener("secureDmRelayQueueState", handleRelayQueueState);
        return () => window.removeEventListener("secureDmRelayQueueState", handleRelayQueueState);
    }, []);

    useEffect(() => {
        function handleDeliveryUpdate(event) {
            const detail = event.detail || {};
            setMessageDeliveryById((prev) => applyOutgoingDeliveryStateUpdate(prev, detail));
        }

        window.addEventListener("secureDmDeliveryUpdate", handleDeliveryUpdate);
        return () => window.removeEventListener("secureDmDeliveryUpdate", handleDeliveryUpdate);
    }, []);

    useEffect(() => {
        if (!messageListRef.current) {
            return;
        }

        messageListRef.current.scrollTo({
            top: messageListRef.current.scrollHeight,
            behavior: "smooth"
        });
    }, [messages, selectedFriendId, groupMessages, selectedGroupConversationId, activeView]);

    useEffect(() => {
        let cancelled = false;

        async function repairMissingLocalConversation(conversationId) {
            return backgroundConversationImportTrackerRef.current.run(conversationId, async () => {
                try {
                    const imported = await importRemoteConversation({
                        token: getStoredAuthToken(),
                        currentUser,
                        conversationId
                    });

                    if (imported?.conversation?.id && imported.conversation.kind === "group") {
                        upsertGroupConversation(imported.conversation);
                    }

                    if (!cancelled) {
                        setPreviewRefreshNonce((prev) => prev + 1);
                    }

                    return imported;
                } catch (error) {
                    console.warn("Failed to repair local secure DM conversation preview:", error);
                    return null;
                }
            });
        }

        async function loadConversationPreviews() {
            if (!window.secureDm || !currentUser || !hasLoadedConversationSeenTimestamps) {
                return;
            }

            const conversationIds = [
                ...friendsState.friends
                    .map((friend) => friend.conversationId)
                    .filter(Boolean),
                ...groupConversations
                    .map((conversation) => conversation.id)
                    .filter(Boolean)
            ];

            const uniqueConversationIds = Array.from(
                new Set(conversationIds.map((value) => String(value)))
            );

            const nextPreviews = {};

            for (const conversationId of uniqueConversationIds) {
                try {
                    const access = await getSecureDmConversationAccess({
                        currentUser,
                        conversationId
                    });

                    if (!canReadConversationLocally(access)) {
                        if (isConversationMissingLocal(access)) {
                            repairMissingLocalConversation(conversationId);
                            nextPreviews[conversationId] = {
                                text: "Syncing encrypted chat",
                                hasMessage: false,
                                timestamp: null,
                                direction: null,
                                latestIncomingTimestamp: null
                            };
                            continue;
                        }

                        if (isConversationMissingKey(access)) {
                            nextPreviews[conversationId] = {
                                text: "Encrypted chat",
                                hasMessage: false,
                                timestamp: null,
                                direction: null,
                                latestIncomingTimestamp: null
                            };
                            continue;
                        }
                    }

                    const localMessages = await window.secureDm.listMessages({
                        userId: currentUser.id,
                        conversationId
                    });
                    const latestMessage = getLatestMessageByTimestamp(localMessages);
                    const latestIncomingMessage = getLatestIncomingMessageByTimestamp(localMessages);
                    const latestPreviewText = getMessagePreviewText(latestMessage);

                    nextPreviews[conversationId] = latestPreviewText
                        ? {
                            text: truncatePreview(latestPreviewText),
                            hasMessage: true,
                            timestamp: latestMessage.createdAt || null,
                            direction: latestMessage.direction || null,
                            latestIncomingTimestamp: latestIncomingMessage?.createdAt || null
                        }
                        : {
                            text: "No messages yet",
                            hasMessage: false,
                            timestamp: null,
                            direction: null,
                            latestIncomingTimestamp: null
                        };
                } catch (error) {
                    console.warn("Failed to load local secure DM preview:", error);
                    nextPreviews[conversationId] = {
                        text: "Encrypted chat",
                        hasMessage: false,
                        timestamp: null,
                        direction: null,
                        latestIncomingTimestamp: null
                    };
                }
            }

            if (!cancelled) {
                setConversationPreviews(nextPreviews);

                if (!hasInitializedSeenBaselineRef.current) {
                    const baselineSeenTimestamps = {};

                    Object.entries(nextPreviews).forEach(([conversationId, preview]) => {
                        const latestIncomingTimestamp = getPreviewIncomingTimestamp(preview);
                        if (latestIncomingTimestamp != null) {
                            baselineSeenTimestamps[String(conversationId)] = latestIncomingTimestamp;
                        }
                    });

                    setConversationSeenTimestamps((prev) => {
                        const next = { ...prev };

                        Object.entries(baselineSeenTimestamps).forEach(([conversationId, timestamp]) => {
                            if (next[conversationId] == null) {
                                next[conversationId] = timestamp;
                            }
                        });

                        return next;
                    });
                    hasInitializedSeenBaselineRef.current = true;
                }
            }
        }

        loadConversationPreviews();

        return () => {
            cancelled = true;
        };
    }, [currentUser, friendsState.friends, groupConversations, messages, groupMessages, previewRefreshNonce, hasLoadedConversationSeenTimestamps]);

    useEffect(() => {
        function handleVisibilityChange() {
            setPageVisible(document.visibilityState !== "hidden");
        }

        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, []);

    useEffect(() => {
        return () => {
            if (lockCloseTimeoutRef.current) {
                window.clearTimeout(lockCloseTimeoutRef.current);
            }
            if (lockHideTimeoutRef.current) {
                window.clearTimeout(lockHideTimeoutRef.current);
            }
            if (viewAcknowledgeTimeoutRef.current) {
                window.clearTimeout(viewAcknowledgeTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        function handleGlobalClick() {
            setFriendContextMenu(null);
        }

        window.addEventListener("click", handleGlobalClick);
        return () => window.removeEventListener("click", handleGlobalClick);
    }, []);

    async function handleSendRequest(event) {
        event.preventDefault();
        setSubmitting(true);
        clearErrorState();

        try {
            await sendFriendRequest(friendUsername);
            setFriendUsername("");
            setShowAddFriendModal(false);
            await loadFriends();
        } catch (err) {
            showError(err, {
                operation: "dm.send"
            });
        } finally {
            setSubmitting(false);
        }
    }

    function handleSelectFriend(friendUserId) {
        setActiveView("friend");
        setSelectedFriendId(friendUserId);
        setDirectReplyTo(null);
        setDirectEditingMessage(null);
    }

    function handleSelectGroupConversation(conversationId) {
        setActiveView("group");
        setSelectedGroupConversationId(conversationId);
        setHasLocalGroupConversationAccess(true);
        setShowConversationSettings(false);
        setFriendContextMenu(null);
        setGroupReplyTo(null);
        setGroupEditingMessage(null);
    }

    useEffect(() => {
        function handleSwitcherSelect(event) {
            const detail = event.detail || {};

            if (detail.scope === "friend" && detail.targetId != null) {
                handleSelectFriend(detail.targetId);
            }

            if (detail.scope === "group" && detail.targetId != null) {
                handleSelectGroupConversation(detail.targetId);
            }
        }

        window.addEventListener("chatapp-switcher-select", handleSwitcherSelect);
        return () => window.removeEventListener("chatapp-switcher-select", handleSwitcherSelect);
    }, []);

    async function handleAccept(friendshipId) {
        setSubmitting(true);
        clearErrorState();

        try {
            await acceptFriendRequest(friendshipId);
            await loadFriends();
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleSendMessage(event) {
        event.preventDefault();
        const referencedDirectInlineEmbeds = filterReferencedInlineImageEmbeds(composer, directInlineEmbeds);

        if (
            !effectiveSelectedFriend
            || (
                !composer.trim()
                && directAttachments.length === 0
                && referencedDirectInlineEmbeds.length === 0
            )
        ) {
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            const result = directEditingMessage
                ? await editFriendDirectMessage({
                    currentUser,
                    friend: effectiveSelectedFriend,
                    messageId: directEditingMessage.messageId,
                    body: composer.trim(),
                    embeds: referencedDirectInlineEmbeds
                })
                : await sendFriendDirectMessage({
                    currentUser,
                    friend: effectiveSelectedFriend,
                    body: composer.trim(),
                    relayTtlSeconds: selectedRelayTtlSeconds,
                    messageTtlSeconds: selectedDisappearingTtlSeconds,
                    attachments: directAttachments,
                    embeds: referencedDirectInlineEmbeds,
                    replyTo: directReplyTo ? {
                        messageId: directReplyTo.messageId,
                        body: directReplyTo.body,
                        author: directReplyTo.author
                    } : null
                });

            const conversationId = result.conversationId || effectiveSelectedFriend.conversationId;

            setForgottenConversationIds((prev) => {
                const next = { ...prev };
                delete next[String(effectiveSelectedFriend.friendUserId)];
                return next;
            });
            setComposer("");
            setDirectAttachments([]);
            setDirectInlineEmbeds([]);
            setDirectReplyTo(null);
            setDirectEditingMessage(null);
            setMessages(result.messages);
            setConversationMeta(result.conversation);
            setHasLocalConversationAccess(true);
            if (result.outboundMessageId) {
                setMessageDeliveryById((prev) => ({
                    ...prev,
                    [String(result.outboundMessageId)]: prev[String(result.outboundMessageId)] || "sent"
                }));
            }
            setFriendsState((prev) => ({
                ...prev,
                friends: prev.friends.map((friend) =>
                    friend.friendUserId === effectiveSelectedFriend.friendUserId
                        ? { ...friend, conversationId }
                        : friend
                )
            }));
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    function clearLockTimers() {
        if (lockCloseTimeoutRef.current) {
            window.clearTimeout(lockCloseTimeoutRef.current);
            lockCloseTimeoutRef.current = null;
        }

        if (lockHideTimeoutRef.current) {
            window.clearTimeout(lockHideTimeoutRef.current);
            lockHideTimeoutRef.current = null;
        }
    }

    function scheduleLockCloseSequence() {
        clearLockTimers();
        setLockPhase("closing");

        lockCloseTimeoutRef.current = window.setTimeout(() => {
            setLockPhase("closed");
        }, 900);

        lockHideTimeoutRef.current = window.setTimeout(() => {
            setLockPhase("hidden");
        }, 5000);
    }

    function resetLockForSelectedConversation(nextIsEncrypted) {
        clearLockTimers();
        setLockPhase(nextIsEncrypted ? "hidden" : "open");
    }

    useEffect(() => {
        if (!selectedFriend) {
            clearLockTimers();
            setLockPhase("hidden");
            return;
        }

        if (lockPhase === "closing" || lockPhase === "closed") {
            return;
        }

        resetLockForSelectedConversation(Boolean(effectiveSelectedFriend?.conversationId));
    }, [selectedFriendId, selectedFriend?.friendUserId, effectiveSelectedFriend?.conversationId]);

    function playEncryptAnimation() {
        scheduleLockCloseSequence();
    }

    async function handleEncryptChat() {
        if (!effectiveSelectedFriend) {
            return;
        }

        const forgottenKey = String(effectiveSelectedFriend.friendUserId);
        const previousForgottenConversationId = forgottenConversationIds[forgottenKey] || null;

        setSubmitting(true);
        setIsEncryptingChat(true);
        clearErrorState();
        scheduleLockCloseSequence();

        try {
            if (previousForgottenConversationId) {
                setForgottenConversationIds((prev) => {
                    const next = { ...prev };
                    delete next[forgottenKey];
                    return next;
                });
            }

            const result = await initializeFriendDirectConversation({
                currentUser,
                friend: effectiveSelectedFriend,
                relayTtlSeconds: selectedRelayTtlSeconds,
                messageTtlSeconds: selectedDisappearingTtlSeconds
            });

            setForgottenConversationIds((prev) => {
                const next = { ...prev };
                delete next[String(effectiveSelectedFriend.friendUserId)];
                return next;
            });
            setMessages(result.messages);
            setConversationMeta(result.conversation);
            setHasLocalConversationAccess(true);
            setFriendsState((prev) => ({
                ...prev,
                friends: prev.friends.map((friend) =>
                    friend.friendUserId === effectiveSelectedFriend.friendUserId
                        ? { ...friend, conversationId: result.conversationId }
                        : friend
                )
            }));

        } catch (err) {
            clearLockTimers();
            setLockPhase("open");
            if (previousForgottenConversationId) {
                setForgottenConversationIds((prev) => ({
                    ...prev,
                    [forgottenKey]: previousForgottenConversationId
                }));
            }
            showEncryptChatError(err);
        } finally {
            setIsEncryptingChat(false);
            setSubmitting(false);
        }
    }

    async function handleCreateGroup(event) {
        event.preventDefault();
        setGroupCreateError("");

        if (!groupTitle.trim() || groupMemberIds.length < 2) {
            setGroupCreateError("Choose a group name and at least two friends for a group chat.");
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            const participantUsers = friendsState.friends
                .filter((friend) => groupMemberIds.includes(String(friend.friendUserId)))
                .map((friend) => ({
                    id: friend.friendUserId,
                    username: friend.friendUsername
                }));

            if (participantUsers.length < 2) {
                setGroupCreateError("Select at least two friends from the list before creating the group.");
                return;
            }

            const result = await createGroupConversation({
                currentUser,
                title: groupTitle.trim(),
                participantUsers,
                relayTtlSeconds: selectedRelayTtlSeconds
            });
            const opened = await openGroupConversation({
                currentUser,
                conversationId: result.conversation.id
            });

            upsertGroupConversation(result.conversation);
            applyOpenedGroupConversation({
                ...opened,
                conversation: opened.conversation || result.conversation
            });
            setGroupComposer("");
            setShowCreateGroupModal(false);
            setGroupTitle("");
            setGroupMemberIds([]);
            setGroupCreateError("");
            setActiveView("group");
            setSelectedGroupConversationId(result.conversation.id);
            await loadGroupConversationList(result.conversation.id);
            await loadGroupInvites();
        } catch (err) {
            setGroupCreateError(String(err?.message || err || "Could not create the group chat."));
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleSendGroupMessage(event) {
        event.preventDefault();

        if (
            !selectedGroupConversationId
            || !hasLocalGroupConversationAccess
            || (!groupComposer.trim() && groupAttachments.length === 0)
        ) {
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            const opened = groupEditingMessage
                ? await editGroupConversationMessage({
                    currentUser,
                    conversationId: selectedGroupConversationId,
                    messageId: groupEditingMessage.messageId,
                    body: groupComposer.trim()
                })
                : await sendGroupConversationMessage({
                    currentUser,
                    conversationId: selectedGroupConversationId,
                    body: groupComposer.trim(),
                    attachments: groupAttachments,
                    replyTo: groupReplyTo ? {
                        messageId: groupReplyTo.messageId,
                        body: groupReplyTo.body,
                        author: groupReplyTo.author
                    } : null
                });

            setGroupComposer("");
            setGroupAttachments([]);
            setGroupReplyTo(null);
            setGroupEditingMessage(null);
            applyOpenedGroupConversation({
                ...opened,
                conversation: {
                    ...(groupConversationMeta || {}),
                    ...(opened.conversation || {})
                }
            });
            await loadGroupConversationList(selectedGroupConversationId);
            await loadGroupInvites();
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleAcceptGroupInvite(inviteId) {
        setSubmitting(true);
        clearErrorState();

        try {
            const accepted = await acceptGroupInvite({
                currentUser,
                inviteId
            });
            upsertGroupConversation(accepted.conversation);
            applyOpenedGroupConversation({
                ...accepted,
                hasLocalAccess: accepted.hasLocalAccess !== false
            });
            setActiveView("group");
            setSelectedGroupConversationId(accepted.conversation.id);
            setGroupInvites((prev) => prev.filter((invite) => String(invite.id) !== String(inviteId)));
            await loadGroupConversationList(accepted.conversation.id);
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDeclineGroupInvite(inviteId) {
        setSubmitting(true);
        clearErrorState();

        try {
            await declineGroupInvite(inviteId);
            setGroupInvites((prev) => prev.filter((invite) => String(invite.id) !== String(inviteId)));
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    function toggleGroupMemberSelection(friendUserId) {
        const key = String(friendUserId);

        setGroupMemberIds((prev) =>
            prev.includes(key)
                ? prev.filter((value) => value !== key)
                : [...prev, key]
        );
    }

    async function handleRetentionRequest(event) {
        event.preventDefault();

        if (!effectiveSelectedFriend?.conversationId) {
            setShowConversationSettings(false);
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            const conversation = await requestFriendRelayRetention({
                conversationId: effectiveSelectedFriend.conversationId,
                relayTtlSeconds: selectedRelayTtlSeconds
            });

            setConversationMeta(conversation);
            setSelectedRelayTtlSeconds(conversation?.relayPolicy?.currentSeconds ?? selectedRelayTtlSeconds);
            if (window.secureDm?.syncConversationMetadata) {
                await window.secureDm.syncConversationMetadata({
                    userId: currentUser.id,
                    username: currentUser.username,
                    conversation
                });
            }
            setShowConversationSettings(false);
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleRetentionAccept() {
        if (!effectiveSelectedFriend?.conversationId) {
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            const conversation = await acceptFriendRelayRetention({
                conversationId: effectiveSelectedFriend.conversationId
            });

            setConversationMeta(conversation);
            setSelectedRelayTtlSeconds(conversation?.relayPolicy?.currentSeconds ?? 86400);
            setSelectedDisappearingTtlSeconds(conversation?.disappearingPolicy?.currentSeconds ?? selectedDisappearingTtlSeconds);
            if (window.secureDm?.syncConversationMetadata) {
                await window.secureDm.syncConversationMetadata({
                    userId: currentUser.id,
                    username: currentUser.username,
                    conversation
                });
            }
            setShowConversationSettings(false);
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDisappearingRequest(event) {
        event.preventDefault();

        if (!effectiveSelectedFriend?.conversationId) {
            setShowConversationSettings(false);
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            const conversation = await requestFriendDisappearingMessages({
                currentUser,
                conversationId: effectiveSelectedFriend.conversationId,
                messageTtlSeconds: selectedDisappearingTtlSeconds
            });

            setConversationMeta(conversation);
            setSelectedDisappearingTtlSeconds(conversation?.disappearingPolicy?.currentSeconds ?? selectedDisappearingTtlSeconds);
            if (window.secureDm?.syncConversationMetadata) {
                await window.secureDm.syncConversationMetadata({
                    userId: currentUser.id,
                    username: currentUser.username,
                    conversation
                });
            }
            await loadFriendConversationForFriend(effectiveSelectedFriend);
            setShowConversationSettings(false);
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDisappearingAccept() {
        if (!effectiveSelectedFriend?.conversationId) {
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            const conversation = await acceptFriendDisappearingMessages({
                currentUser,
                conversationId: effectiveSelectedFriend.conversationId
            });

            setConversationMeta(conversation);
            setSelectedDisappearingTtlSeconds(conversation?.disappearingPolicy?.currentSeconds ?? 0);
            if (window.secureDm?.syncConversationMetadata) {
                await window.secureDm.syncConversationMetadata({
                    userId: currentUser.id,
                    username: currentUser.username,
                    conversation
                });
            }
            await loadFriendConversationForFriend(effectiveSelectedFriend);
            setShowConversationSettings(false);
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleHistoryRequest() {
        if (!effectiveSelectedFriend?.conversationId) {
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            const data = await requestFriendConversationHistory({
                currentUser,
                friend: effectiveSelectedFriend
            });
            setHistoryAccessRequest(data.request);
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleHistoryApprove() {
        if (!effectiveSelectedFriend?.conversationId || !historyAccessRequest) {
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            await approveFriendConversationHistory({
                currentUser,
                friend: effectiveSelectedFriend,
                request: historyAccessRequest
            });
            setHistoryAccessRequest((prev) => prev ? { ...prev, status: "approved" } : prev);
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleHistoryDecline() {
        if (!historyAccessRequest) {
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            await declineFriendConversationHistory({
                requestId: historyAccessRequest.id,
                currentUser
            });
            setHistoryAccessRequest((prev) => prev ? { ...prev, status: "declined" } : prev);
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    function openFriendContextMenu(event, friend) {
        event.preventDefault();

        setFriendContextMenu({
            friend,
            x: event.clientX + 10,
            y: event.clientY
        });
    }

    function applyFriendTag(friendUserId, tag) {
        setFriendContextMenu(null);
        const nextSettings = saveClientSettings({
            ...clientSettingsSnapshot,
            friendTagAssignments: {
                ...friendTags,
                [String(friendUserId)]: String(tag)
            }
        });
        setClientSettingsSnapshot(nextSettings);
    }

    function clearFriendTag(friendUserId) {
        setFriendContextMenu(null);
        const nextAssignments = { ...friendTags };
        delete nextAssignments[String(friendUserId)];

        const nextSettings = saveClientSettings({
            ...clientSettingsSnapshot,
            friendTagAssignments: nextAssignments
        });
        setClientSettingsSnapshot(nextSettings);
    }

    function toggleFriendFolder(folderId) {
        setCollapsedFriendFolders((prev) => ({
            ...prev,
            [String(folderId)]: !prev[String(folderId)]
        }));
    }

    function handleForgetOldConversation() {
        if (!selectedFriend?.conversationId) {
            return;
        }

        setForgottenConversationIds((prev) => ({
            ...prev,
            [String(selectedFriend.friendUserId)]: selectedFriend.conversationId
        }));
        setMessages([]);
        setConversationMeta(null);
        setHasLocalConversationAccess(false);
        setHistoryAccessRequest(null);
        setShowConversationSettings(false);
        clearErrorState();
    }

    function requestRemoveFriend(friend, hardDelete = false) {
        setFriendContextMenu(null);
        setFriendRemovalConfirm({ friend, hardDelete });
    }

    async function handleConfirmRemoveFriend() {
        if (!friendRemovalConfirm) {
            return;
        }

        const { friend, hardDelete } = friendRemovalConfirm;
        setSubmitting(true);
        clearErrorState();

        try {
            if (hardDelete && friend.conversationId) {
                await window.secureDm.deleteConversation({
                    userId: currentUser.id,
                    conversationId: friend.conversationId
                });
            }

            await removeFriend(friend.friendshipId, hardDelete ? { hardDelete: true } : {});
            const nextAssignments = { ...friendTags };
            delete nextAssignments[String(friend.friendUserId)];
            setClientSettingsSnapshot(saveClientSettings({
                ...clientSettingsSnapshot,
                friendTagAssignments: nextAssignments
            }));

            if (String(selectedFriendId) === String(friend.friendUserId)) {
                setSelectedFriendId(null);
                setMessages([]);
                setConversationMeta(null);
                setHistoryAccessRequest(null);
                setShowConversationSettings(false);
            }

            setFriendRemovalConfirm(null);
            await loadFriends();
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDeleteDirectMessage(message) {
        if (!effectiveSelectedFriend?.conversationId || !message?.messageId || message.isDeleted) {
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            const opened = await deleteFriendDirectMessage({
                currentUser,
                friend: effectiveSelectedFriend,
                messageId: message.messageId
            });
            setMessages(opened.messages);
            setConversationMeta(opened.conversation);
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function registerComposerAttachment(file, arrayBufferOverride = null) {
        const transferId = `file_${crypto.randomUUID()}`;
        const arrayBuffer = arrayBufferOverride instanceof ArrayBuffer
            ? arrayBufferOverride
            : await file.arrayBuffer();
        const registered = await window.attachmentTransfers.registerOutgoing({
            transferId,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            arrayBuffer
        });

        return {
            transferId: registered.transferId,
            fileName: registered.fileName,
            mimeType: registered.mimeType,
            fileSize: registered.fileSize
        };
    }

    async function registerDirectComposerMedia(file, selection = null) {
        const arrayBuffer = await file.arrayBuffer();
        const debugMode = isDebugModeEnabled();
        const candidate = classifyInlineImageEmbedCandidate({
            mimeType: file.type,
            byteLength: arrayBuffer.byteLength
        });

        if (candidate.kind === "inline") {
            try {
                const embed = await buildInlineImageEmbedFromFile({
                    fileName: file.name,
                    mimeType: file.type,
                    arrayBuffer,
                    alt: file.name
                });
                const renderability = inspectInlineImageEmbedRenderable(embed);

                if (!renderability.ok) {
                    traceInlineImageDiagnostic({
                        level: "warning",
                        stage: "composer.embed",
                        reason: "invalid-embed",
                        message: "Built a DM inline image embed that is not renderable.",
                        body: composer,
                        embeds: [embed],
                        embed,
                        embedId: embed?.id,
                        conversationId: effectiveSelectedFriend?.conversationId || "",
                        surface: "composer",
                        extraDetails: {
                            candidateKind: candidate.kind,
                            candidateReason: candidate.reason,
                            renderabilityReason: renderability.reason,
                            fileName: String(file?.name || ""),
                            fileType: String(file?.type || ""),
                            fileSize: Number(file?.size || arrayBuffer.byteLength || 0)
                        }
                    });
                    throw new Error("Inline image embed was created without a usable preview source.");
                }

                traceInlineImageDiagnostic({
                    level: "info",
                    debugMode,
                    onceKey: `composer.embed:${String(embed?.id || "")}`,
                    stage: "composer.embed",
                    reason: "trace",
                    message: "Created a renderable DM inline image embed.",
                    body: composer,
                    embeds: [embed],
                    embed,
                    embedId: embed?.id,
                    conversationId: effectiveSelectedFriend?.conversationId || "",
                    surface: "composer",
                    extraDetails: {
                        fileName: String(file?.name || ""),
                        fileType: String(file?.type || ""),
                        fileSize: Number(file?.size || arrayBuffer.byteLength || 0)
                    }
                });

                const nextComposer = insertInlineImageEmbedMarkdownReference({
                    value: composer,
                    embed,
                    selectionStart: selection?.selectionStart ?? null,
                    selectionEnd: selection?.selectionEnd ?? null
                });
                setComposer(nextComposer.value);
                setDirectInlineEmbeds((prev) => [...prev, embed]);
                traceInlineImageDiagnostic({
                    level: "info",
                    debugMode,
                    onceKey: `composer.reference:${String(embed?.id || "")}`,
                    stage: "composer.reference",
                    reason: "trace",
                    message: "Inserted a DM inline image markdown reference into the composer.",
                    body: nextComposer.value,
                    embeds: [embed],
                    embed,
                    embedId: embed?.id,
                    conversationId: effectiveSelectedFriend?.conversationId || "",
                    surface: "composer"
                });
                return {
                    kind: "embed",
                    embed,
                    selectionStart: nextComposer.selectionStart,
                    selectionEnd: nextComposer.selectionEnd
                };
            } catch (inlineError) {
                console.warn("Falling back to attachment path for inline image candidate:", inlineError);
            }
        }

        const attachment = await registerComposerAttachment(file, arrayBuffer);
        setDirectAttachments((prev) => [...prev, attachment]);
        return {
            kind: "attachment",
            attachment
        };
    }

    async function handlePickDirectAttachment(file, selection = null) {
        if (directEditingMessage) {
            return;
        }

        return registerDirectComposerMedia(file, selection);
    }

    async function handlePickGroupAttachment(file) {
        if (groupEditingMessage) {
            return;
        }

        const attachment = await registerComposerAttachment(file);
        setGroupAttachments((prev) => [...prev, attachment]);
    }

    function handleRemoveDirectAttachment(transferId) {
        setDirectAttachments((prev) => prev.filter((entry) => String(entry.transferId) !== String(transferId)));
    }

    function handleRemoveDirectInlineEmbed(embedId) {
        setComposer((prev) => removeInlineImageEmbedReferences(prev, embedId));
        setDirectInlineEmbeds((prev) => prev.filter((entry) => String(entry.id || "") !== String(embedId || "")));
    }

    async function handleDirectComposerPaste(event, selection = null) {
        if (directEditingMessage) {
            return;
        }

        const clipboardItems = Array.from(event?.clipboardData?.items || []);
        const imageFile = clipboardItems.find((item) => String(item?.type || "").startsWith("image/"))?.getAsFile?.() || null;

        if (!imageFile) {
            return;
        }

        event.preventDefault();

        try {
            return await registerDirectComposerMedia(imageFile, selection);
        } catch (pasteError) {
            showError(pasteError, {
                operation: "dm.inlineImage.paste"
            });
        }
    }

    function handleRemoveGroupAttachment(transferId) {
        setGroupAttachments((prev) => prev.filter((entry) => String(entry.transferId) !== String(transferId)));
    }

    async function requestAttachmentDownload({ conversationId, senderDeviceId, attachment }) {
        if (!conversationId || !senderDeviceId || !attachment?.transferId) {
            return;
        }

        const saveResult = await window.attachmentTransfers.chooseSavePath({
            defaultName: attachment.fileName
        });

        if (saveResult?.canceled || !saveResult?.filePath) {
            return;
        }

        await window.attachmentTransfers.beginIncomingDownload({
            transferId: attachment.transferId,
            filePath: saveResult.filePath
        });

        incomingDownloadTargetsRef.current[String(attachment.transferId)] = {
            filePath: saveResult.filePath,
            fileName: attachment.fileName,
            expectedBytes: attachment.fileSize
        };

        updateAttachmentTransferState(attachment.transferId, {
            status: "requesting",
            progress: 0,
            fileName: attachment.fileName
        });

        await sendSecureDmRealtimeEvent({
            token: getStoredAuthToken(),
            currentUser,
            payload: {
                type: "dm:file:request",
                conversationId,
                targetDeviceId: senderDeviceId,
                transferId: attachment.transferId
            }
        });
    }

    async function handleDownloadDirectAttachment(message, attachment) {
        await requestAttachmentDownload({
            conversationId: effectiveSelectedFriend?.conversationId,
            senderDeviceId: message?.senderDeviceId,
            attachment
        });
    }

    async function handleDownloadGroupAttachment(message, attachment) {
        await requestAttachmentDownload({
            conversationId: selectedGroupConversationId,
            senderDeviceId: message?.senderDeviceId,
            attachment
        });
    }

    async function handleToggleDirectReaction(message, emoji) {
        if (!effectiveSelectedFriend?.conversationId || !message?.messageId || !emoji || message.isDeleted) {
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            const opened = await toggleFriendDirectReaction({
                currentUser,
                friend: effectiveSelectedFriend,
                messageId: message.messageId,
                emoji
            });
            setMessages(opened.messages);
            setConversationMeta(opened.conversation);
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDeleteGroupMessage(message) {
        if (!selectedGroupConversationId || !message?.messageId || message.isDeleted) {
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            const opened = await deleteGroupConversationMessage({
                currentUser,
                conversationId: selectedGroupConversationId,
                messageId: message.messageId
            });
            applyOpenedGroupConversation({
                ...opened,
                conversation: {
                    ...(groupConversationMeta || {}),
                    ...(opened.conversation || {})
                }
            });
            await loadGroupConversationList(selectedGroupConversationId);
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleToggleGroupReaction(message, emoji) {
        if (!selectedGroupConversationId || !message?.messageId || !emoji || message.isDeleted) {
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            const opened = await toggleGroupConversationReaction({
                currentUser,
                conversationId: selectedGroupConversationId,
                messageId: message.messageId,
                emoji
            });
            applyOpenedGroupConversation({
                ...opened,
                conversation: {
                    ...(groupConversationMeta || {}),
                    ...(opened.conversation || {})
                }
            });
            await loadGroupConversationList(selectedGroupConversationId);
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    const relayPolicy = conversationMeta?.relayPolicy || null;
    const disappearingPolicy = conversationMeta?.disappearingPolicy || null;
    const pendingRelayRequest = relayPolicy?.pendingSeconds != null ? relayPolicy : null;
    const pendingDisappearingRequest = disappearingPolicy?.pendingSeconds != null ? disappearingPolicy : null;
    const pendingRequestedByFriend = Boolean(
        pendingRelayRequest
        && pendingRelayRequest.pendingRequestedByUserId !== Number(currentUser.id)
    );
    const pendingDisappearingRequestedByFriend = Boolean(
        pendingDisappearingRequest
        && pendingDisappearingRequest.pendingRequestedByUserId !== Number(currentUser.id)
    );
    const currentRelayLabel = RELAY_RETENTION_OPTIONS.find(
        (option) => option.seconds === (relayPolicy?.currentSeconds ?? selectedRelayTtlSeconds ?? 86400)
    )?.label || "24 hours";
    const pendingRelayLabel = pendingRelayRequest
        ? RELAY_RETENTION_OPTIONS.find((option) => option.seconds === pendingRelayRequest.pendingSeconds)?.label
        || `${pendingRelayRequest.pendingHours} hours`
        : null;
    const currentDisappearingLabel = DISAPPEARING_MESSAGE_OPTIONS.find(
        (option) => option.seconds === (disappearingPolicy?.currentSeconds ?? selectedDisappearingTtlSeconds)
    )?.label || "Off";
    const pendingDisappearingLabel = pendingDisappearingRequest
        ? DISAPPEARING_MESSAGE_OPTIONS.find((option) => option.seconds === pendingDisappearingRequest.pendingSeconds)?.label
            || `${pendingDisappearingRequest.pendingDays} days`
        : null;
    const isForgettingOldConversation = !isEncryptingChat && Boolean(
        selectedFriend
        && selectedFriendForgottenConversationId
        && String(selectedFriend.conversationId) === String(selectedFriendForgottenConversationId)
    );
    const hasExistingConversation = Boolean(effectiveSelectedFriend?.conversationId);
    const canRequestOldConversation = Boolean(
        hasExistingConversation &&
        !hasLocalConversationAccess &&
        !isForgettingOldConversation &&
        (!historyAccessRequest || historyAccessRequest.status === "declined") &&
        messages.length === 0
    );
    const shouldShowConversationRestartNotice = Boolean(
        selectedFriend?.conversationId
        && !effectiveSelectedFriend?.conversationId
        && !isForgettingOldConversation
        && !isEncryptingChat
    );
    const shouldShowMissingConversationAccessNotice = Boolean(
        effectiveSelectedFriend?.conversationId
        && !hasLocalConversationAccess
        && !isEncryptingChat
    );
    const shouldShowMissingGroupConversationAccessNotice = Boolean(
        selectedGroupConversationId
        && !hasLocalGroupConversationAccess
    );
    const incomingHistoryRequest = historyAccessRequest
        && historyAccessRequest.status === "pending"
        && Number(historyAccessRequest.approverUserId) === Number(currentUser.id);
    const outgoingHistoryRequest = historyAccessRequest
        && historyAccessRequest.status === "pending"
        && Number(historyAccessRequest.requesterUserId) === Number(currentUser.id);
    const isDirectConversationEncrypted = Boolean(effectiveSelectedFriend?.conversationId);
    const showEncryptionStage = lockPhase !== "hidden";
    const canComposeDirectMessage = isDirectConversationEncrypted && hasLocalConversationAccess && !submitting && !isEncryptingChat && !showEncryptionStage;
    const canComposeGroupMessage = Boolean(
        selectedGroupConversationId
        && hasLocalGroupConversationAccess
        && !submitting
    );
    const activeGroupParticipantNames = (selectedGroupConversation?.participants || [])
        .filter((participant) => Number(participant.userId) !== Number(currentUser.id))
        .map((participant) => participant.username);
    const activeConversationId = activeView === "group"
        ? selectedGroupConversationId
        : effectiveSelectedFriend?.conversationId || null;

    function conversationHasUnreadActivity(conversationId) {
        if (!conversationId) {
            return false;
        }

        const preview = conversationPreviews[String(conversationId)];
        if (!preview?.hasMessage) {
            return false;
        }

        const latestIncomingTimestamp = getPreviewIncomingTimestamp(preview);
        if (latestIncomingTimestamp == null) {
            return false;
        }

        const seenTimestamp = Number(conversationSeenTimestamps[String(conversationId)] || 0);
        return latestIncomingTimestamp > seenTimestamp;
    }

    const hasUnreadActivity = useMemo(() => {
        return Object.keys(conversationPreviews).some((conversationId) => {
            return conversationHasUnreadActivity(conversationId);
        });
    }, [conversationPreviews, conversationSeenTimestamps]);

    useEffect(() => {
        onActivityChange?.(hasUnreadActivity);
    }, [hasUnreadActivity, onActivityChange]);

    useEffect(() => {
        if (viewAcknowledgeTimeoutRef.current) {
            window.clearTimeout(viewAcknowledgeTimeoutRef.current);
            viewAcknowledgeTimeoutRef.current = null;
        }

        if (!activeConversationId || !pageVisible) {
            return undefined;
        }

        if (!conversationHasUnreadActivity(activeConversationId)) {
            return undefined;
        }

        viewAcknowledgeTimeoutRef.current = window.setTimeout(() => {
            const preview = conversationPreviews[String(activeConversationId)];
            const latestIncomingTimestamp = getPreviewIncomingTimestamp(preview);

            if (latestIncomingTimestamp == null) {
                return;
            }

            setConversationSeenTimestamps((prev) => ({
                ...prev,
                [String(activeConversationId)]: latestIncomingTimestamp
            }));
            viewAcknowledgeTimeoutRef.current = null;
        }, 800);

        return () => {
            if (viewAcknowledgeTimeoutRef.current) {
                window.clearTimeout(viewAcknowledgeTimeoutRef.current);
                viewAcknowledgeTimeoutRef.current = null;
            }
        };
    }, [activeConversationId, conversationPreviews, pageVisible]);

    return (
        <main className="main friends-main">
            <div className="friends-top-chrome">
                    <FriendsHeader />

                {syncState.status === "syncing" ? (
                    <div className="friends-sync-banner syncing">
                        <span className="friends-sync-spinner" />
                        <span>Syncing encrypted messages...</span>
                    </div>
                ) : null}

                {syncState.status === "complete" && syncState.importedCount > 0 ? (
                    <div className="friends-sync-banner success">
                        Loaded {syncState.importedCount} encrypted {syncState.importedCount === 1 ? "message" : "messages"} while you were away.
                    </div>
                ) : null}

                {error ? (
                    <div className="friends-error-block">
                        <p className="friends-error">{error}</p>
                        {errorCode ? (
                            <p className="friends-error-code">
                                Code: <code>{errorCode}</code>
                                {errorTraceId ? <> · Trace {errorTraceId}</> : null}
                            </p>
                        ) : null}
                        {debugModeEnabled && errorDebugDetails ? (
                            <pre className="friends-debug-details">{errorDebugDetails}</pre>
                        ) : null}
                    </div>
                ) : null}
            </div>

            <div className="friends-layout">
                <FriendsRail
                    currentUser={currentUser}
                    profileMediaHostUrl={profileMediaHostUrl}
                    clientSettings={clientSettings}
                    onChangeClientSetting={onChangeClientSetting}
                    loading={loading}
                    friendsState={friendsState}
                    hasPendingIncomingFriendRequests={(friendsState.incomingRequests || []).length > 0}
                    groupInvites={groupInvites}
                    groupConversations={groupConversations}
                    selectedFriendId={selectedFriendId}
                    selectedGroupConversationId={selectedGroupConversationId}
                    activeView={activeView}
                    friendTags={friendTags}
                    friendTagFolders={friendTagFolders}
                    friendTagLookup={friendTagLookup}
                    collapsedFriendFolders={collapsedFriendFolders}
                    conversationPreviews={conversationPreviews}
                    presenceByUserId={presenceByUserId}
                    conversationHasUnreadActivity={conversationHasUnreadActivity}
                    onOpenAddFriend={() => setShowAddFriendModal(true)}
                    onCreateGroup={() => setShowCreateGroupModal(true)}
                    onAcceptGroupInvite={handleAcceptGroupInvite}
                    onDeclineGroupInvite={handleDeclineGroupInvite}
                    onSelectGroupConversation={handleSelectGroupConversation}
                    onSelectFriend={handleSelectFriend}
                    onOpenFriendContextMenu={openFriendContextMenu}
                    onToggleFriendFolder={toggleFriendFolder}
                    onOpenClientSettings={onOpenClientSettings}
                    onLogout={onLogout}
                />

                <FriendsConversationPanel
                    currentUser={currentUser}
                    profileMediaHostUrl={profileMediaHostUrl}
                    clientSettings={clientSettingsSnapshot}
                    activeView={activeView}
                    selectedGroupConversation={selectedGroupConversation}
                    activeGroupParticipantNames={activeGroupParticipantNames}
                    groupMessages={groupMessages}
                    groupComposer={groupComposer}
                    groupAttachments={groupAttachments}
                    groupReplyTo={groupReplyTo}
                    groupEditingMessage={groupEditingMessage}
                    selectedFriend={selectedFriend}
                    effectiveSelectedFriend={effectiveSelectedFriend}
                    presenceByUserId={presenceByUserId}
                    secureStatusRef={secureStatusRef}
                    shouldShowMissingGroupConversationAccessNotice={shouldShowMissingGroupConversationAccessNotice}
                    canRequestOldConversation={canRequestOldConversation}
                    isForgettingOldConversation={isForgettingOldConversation}
                    shouldShowConversationRestartNotice={shouldShowConversationRestartNotice}
                    shouldShowMissingConversationAccessNotice={shouldShowMissingConversationAccessNotice}
                    incomingHistoryRequest={incomingHistoryRequest}
                    outgoingHistoryRequest={outgoingHistoryRequest}
                    pendingRequestedByFriend={pendingRequestedByFriend}
                    pendingDisappearingRequestedByFriend={pendingDisappearingRequestedByFriend}
                    historyAccessRequest={historyAccessRequest}
                    pendingRelayLabel={pendingRelayLabel}
                    pendingDisappearingLabel={pendingDisappearingLabel}
                    submitting={submitting}
                    showEncryptionStage={showEncryptionStage}
                    lockPhase={lockPhase}
                    encryptChatError={encryptChatError}
                    messages={messages}
                    composer={composer}
                    directAttachments={directAttachments}
                    directInlineEmbeds={directInlineEmbeds}
                    directReplyTo={directReplyTo}
                    directEditingMessage={directEditingMessage}
                    isDirectConversationEncrypted={isDirectConversationEncrypted}
                    canComposeDirectMessage={canComposeDirectMessage}
                    canComposeGroupMessage={canComposeGroupMessage}
                    transferStates={attachmentTransferStates}
                    messageListRef={messageListRef}
                    onGroupComposerChange={setGroupComposer}
                    onSendGroupMessage={handleSendGroupMessage}
                    onGroupPickAttachment={handlePickGroupAttachment}
                    onGroupRemoveAttachment={handleRemoveGroupAttachment}
                    onGroupDownloadAttachment={handleDownloadGroupAttachment}
                    onGroupReply={(message) => {
                        setGroupEditingMessage(null);
                        setGroupReplyTo(message);
                    }}
                    onGroupEdit={(message) => {
                        setGroupReplyTo(null);
                        setGroupEditingMessage(message);
                        setGroupComposer(message.body || "");
                        setGroupAttachments([]);
                    }}
                    onGroupDelete={handleDeleteGroupMessage}
                    onGroupToggleReaction={handleToggleGroupReaction}
                    onCancelGroupAction={() => {
                        setGroupReplyTo(null);
                        setGroupEditingMessage(null);
                        setGroupComposer("");
                        setGroupAttachments([]);
                    }}
                    onOpenConversationSettings={() => setShowConversationSettings(true)}
                    onForgetOldConversation={handleForgetOldConversation}
                    onHistoryRequest={handleHistoryRequest}
                    onHistoryDecline={handleHistoryDecline}
                    onHistoryApprove={handleHistoryApprove}
                    onRetentionAccept={handleRetentionAccept}
                    onDisappearingAccept={handleDisappearingAccept}
                    onEncryptChat={handleEncryptChat}
                    onComposerChange={setComposer}
                    onSendMessage={handleSendMessage}
                    onDirectPickAttachment={handlePickDirectAttachment}
                    onDirectRemoveAttachment={handleRemoveDirectAttachment}
                    onDirectRemoveInlineEmbed={handleRemoveDirectInlineEmbed}
                    onDirectDownloadAttachment={handleDownloadDirectAttachment}
                    onDirectComposerPaste={handleDirectComposerPaste}
                    onDirectReply={(message) => {
                        setDirectEditingMessage(null);
                        setDirectReplyTo(message);
                    }}
                    onDirectEdit={(message) => {
                        setDirectReplyTo(null);
                        setDirectEditingMessage(message);
                        setComposer(message.body || "");
                        setDirectAttachments([]);
                        setDirectInlineEmbeds(Array.isArray(message.embeds) ? message.embeds : []);
                    }}
                    onDirectDelete={handleDeleteDirectMessage}
                    onDirectToggleReaction={handleToggleDirectReaction}
                    messageDeliveryById={messageDeliveryById}
                    onCancelDirectAction={() => {
                        setDirectReplyTo(null);
                        setDirectEditingMessage(null);
                        setComposer("");
                        setDirectAttachments([]);
                        setDirectInlineEmbeds([]);
                    }}
                />
            </div>

            {showConversationSettings && selectedFriend ? (
                <FriendConversationSettingsModal
                    currentUser={currentUser}
                    selectedFriend={selectedFriend}
                    effectiveSelectedFriend={effectiveSelectedFriend}
                    selectedRelayTtlSeconds={selectedRelayTtlSeconds}
                    selectedDisappearingTtlSeconds={selectedDisappearingTtlSeconds}
                    relayPolicy={relayPolicy}
                    disappearingPolicy={disappearingPolicy}
                    pendingRelayRequest={pendingRelayRequest}
                    pendingDisappearingRequest={pendingDisappearingRequest}
                    pendingRequestedByFriend={pendingRequestedByFriend}
                    pendingDisappearingRequestedByFriend={pendingDisappearingRequestedByFriend}
                    pendingRelayLabel={pendingRelayLabel}
                    pendingDisappearingLabel={pendingDisappearingLabel}
                    currentRelayLabel={currentRelayLabel}
                    currentDisappearingLabel={currentDisappearingLabel}
                    submitting={submitting}
                    onClose={() => setShowConversationSettings(false)}
                    onUndoForget={() => {
                        setForgottenConversationIds((prev) => {
                            const next = { ...prev };
                            delete next[String(selectedFriend.friendUserId)];
                            return next;
                        });
                        setShowConversationSettings(false);
                    }}
                    onRelayTtlChange={setSelectedRelayTtlSeconds}
                    onDisappearingTtlChange={setSelectedDisappearingTtlSeconds}
                    onRetentionRequest={handleRetentionRequest}
                    onRetentionAccept={handleRetentionAccept}
                    onDisappearingRequest={handleDisappearingRequest}
                    onDisappearingAccept={handleDisappearingAccept}
                />
            ) : null}

            {showAddFriendModal ? (
                <FriendsAddFriendModal
                    friendUsername={friendUsername}
                    submitting={submitting}
                    friendsState={friendsState}
                    onClose={() => setShowAddFriendModal(false)}
                    onFriendUsernameChange={setFriendUsername}
                    onSubmit={handleSendRequest}
                    onAccept={handleAccept}
                />
            ) : null}

            {showCreateGroupModal ? (
                <FriendsCreateGroupModal
                    friends={friendsState.friends}
                    groupTitle={groupTitle}
                    groupMemberIds={groupMemberIds}
                    selectedRelayTtlSeconds={selectedRelayTtlSeconds}
                    errorMessage={groupCreateError}
                    submitting={submitting}
                    onClose={() => {
                        setShowCreateGroupModal(false);
                        setGroupCreateError("");
                    }}
                    onGroupTitleChange={setGroupTitle}
                    onRelayTtlChange={setSelectedRelayTtlSeconds}
                    onToggleGroupMember={toggleGroupMemberSelection}
                    onCreateGroup={handleCreateGroup}
                />
            ) : null}

            <FriendRemovalConfirmModal
                confirmation={friendRemovalConfirm}
                submitting={submitting}
                onCancel={() => setFriendRemovalConfirm(null)}
                onConfirm={handleConfirmRemoveFriend}
            />

            <FriendContextMenu
                contextMenu={friendContextMenu}
                friendTagFolders={friendTagFolders}
                onOpenDm={() => {
                    setSelectedFriendId(friendContextMenu.friend.friendUserId);
                    setFriendContextMenu(null);
                }}
                onApplyTag={(tagId) => applyFriendTag(friendContextMenu.friend.friendUserId, tagId)}
                onClearTag={() => clearFriendTag(friendContextMenu.friend.friendUserId)}
                onRemoveFriend={() => requestRemoveFriend(friendContextMenu.friend)}
                onHardDeleteFriend={() => requestRemoveFriend(friendContextMenu.friend, true)}
            />
        </main>
    );
}



