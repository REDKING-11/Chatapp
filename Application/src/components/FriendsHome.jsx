import { useEffect, useMemo, useRef, useState } from "react";
import FriendContextMenu from "./friends/FriendContextMenu";
import FriendsAddFriendModal from "./friends/FriendsAddFriendModal";
import FriendConversationSettingsModal from "./friends/FriendConversationSettingsModal";
import FriendsConversationPanel from "./friends/FriendsConversationPanel";
import FriendsCreateGroupModal from "./friends/FriendsCreateGroupModal";
import FriendsHeader from "./friends/FriendsHeader";
import FriendsRail from "./friends/FriendsRail";
import { formatAppError, isDebugModeEnabled } from "../lib/debug";
import { loadClientSettings, saveClientSettings } from "../features/clientSettings";
import {
    acceptFriendRequest,
    acceptFriendRelayRetention,
    approveFriendConversationHistory,
    declineFriendConversationHistory,
    fetchFriends,
    fetchHistoryAccessStatus,
    initializeFriendDirectConversation,
    importPendingHistoryTransfers,
    openFriendConversation,
    removeFriend,
    requestFriendConversationHistory,
    requestFriendRelayRetention,
    sendFriendDirectMessage,
    sendFriendRequest
} from "../features/friends/actions";
import { RELAY_RETENTION_OPTIONS } from "../features/dm/actions";
import {
    createGroupConversation,
    fetchPendingGroupInvites,
    fetchGroupConversations,
    openGroupConversation,
    sendGroupConversationMessage,
    acceptGroupInvite,
    declineGroupInvite
} from "../features/groups/actions";

export default function FriendsHome({
    currentUser,
    profileMediaHostUrl,
    clientSettings,
    onActivityChange,
    onOpenClientSettings,
    onLogout
}) {
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
    const [groupConversationMeta, setGroupConversationMeta] = useState(null);
    const [conversationPreviews, setConversationPreviews] = useState({});
    const [activeView, setActiveView] = useState("friend");
    const [composer, setComposer] = useState("");
    const [friendUsername, setFriendUsername] = useState("");
    const [showAddFriendModal, setShowAddFriendModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [errorDebugDetails, setErrorDebugDetails] = useState("");
    const [selectedRelayTtlSeconds, setSelectedRelayTtlSeconds] = useState(86400);
    const [conversationMeta, setConversationMeta] = useState(null);
    const [hasLocalConversationAccess, setHasLocalConversationAccess] = useState(true);
    const [showConversationSettings, setShowConversationSettings] = useState(false);
    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
    const [historyAccessRequest, setHistoryAccessRequest] = useState(null);
    const [collapsedFriendFolders, setCollapsedFriendFolders] = useState({});
    const [clientSettingsSnapshot, setClientSettingsSnapshot] = useState(() => loadClientSettings());
    const [forgottenConversationIds, setForgottenConversationIds] = useState({});
    const [friendContextMenu, setFriendContextMenu] = useState(null);
    const [lockPhase, setLockPhase] = useState("hidden");
    const [isEncryptingChat, setIsEncryptingChat] = useState(false);
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
    const [groupTitle, setGroupTitle] = useState("");
    const [groupMemberIds, setGroupMemberIds] = useState([]);
    const [groupCreateError, setGroupCreateError] = useState("");
    const [syncState, setSyncState] = useState({
        status: "idle",
        importedCount: 0,
        source: null
    });
    const [conversationSeenTimestamps, setConversationSeenTimestamps] = useState({});
    const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== "hidden");
    const [previewRefreshNonce, setPreviewRefreshNonce] = useState(0);
    const messageListRef = useRef(null);
    const secureStatusRef = useRef(null);
    const lockCloseTimeoutRef = useRef(null);
    const lockHideTimeoutRef = useRef(null);
    const viewAcknowledgeTimeoutRef = useRef(null);
    const groupConversationsRef = useRef([]);
    const selectedGroupConversationIdRef = useRef(null);
    const hasInitializedSeenBaselineRef = useRef(false);
    const sessionStartedAtRef = useRef(Date.now());

    const legacyFriendTagsStorageKey = `friendTags:${currentUser.id}`;
    const collapsedFriendFoldersStorageKey = `collapsedFriendFolders:${currentUser.id}`;
    const forgottenConversationsStorageKey = `forgottenFriendConversations:${currentUser.id}`;
    const conversationSeenStorageKey = `conversationSeenTimestamps:${currentUser.id}`;
    const debugModeEnabled = Boolean(clientSettingsSnapshot.debugMode);

    function clearErrorState() {
        setError("");
        setErrorDebugDetails("");
    }

    function showError(errorValue, options = {}) {
        const formatted = formatAppError(errorValue, {
            fallbackMessage: "Something went wrong in Friends.",
            context: "Friends",
            ...options
        });
        setError(formatted.message);
        setErrorDebugDetails(formatted.debugMode ? formatted.debugDetails : "");
    }

    function showStaticError(message, debugDetails = "") {
        setError(message);
        setErrorDebugDetails(isDebugModeEnabled() ? debugDetails : "");
    }

    function truncatePreview(text, maxLength = 16) {
        const trimmed = String(text || "").trim();

        if (!trimmed) {
            return "";
        }

        if (trimmed.length <= maxLength) {
            return trimmed;
        }

        return `${trimmed.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
    }

    function truncateNotificationBody(text, maxLength = 80) {
        const trimmed = String(text || "").trim();

        if (!trimmed) {
            return "";
        }

        if (trimmed.length <= maxLength) {
            return trimmed;
        }

        return `${trimmed.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
    }

    async function maybeShowDesktopNotification({ conversationId, message }) {
        if (!window.desktopNotifications || !message || message.direction !== "incoming") {
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
            await window.desktopNotifications.show({
                title: matchingFriend.friendUsername,
                body: truncateNotificationBody(message.body || "New message")
            });
            return;
        }

        const matchingGroup = groupConversations.find(
            (conversation) => String(conversation.id) === String(conversationId)
        );

        if (matchingGroup) {
            await window.desktopNotifications.show({
                title: matchingGroup.title || "Group chat",
                body: truncateNotificationBody(message.body || "New group message")
            });
        }
    }

    async function loadFriends() {
        setLoading(true);
        clearErrorState();

        try {
            const data = await fetchFriends();
            setFriendsState(data);

            if (!selectedFriendId && data.friends.length > 0) {
                setSelectedFriendId(data.friends[0].friendUserId);
            }
        } catch (err) {
            showError(err);
        } finally {
            setLoading(false);
        }
    }

    async function loadGroupConversationList(preferredConversationId = null) {
        try {
            const conversations = await fetchGroupConversations();
            const existingConversations = groupConversationsRef.current;
            const fetchedIds = new Set(conversations.map((conversation) => String(conversation.id)));
            const mergedConversations = [
                ...conversations,
                ...existingConversations.filter(
                    (conversation) => !fetchedIds.has(String(conversation.id))
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
            showError(err);
        }
    }

    async function loadGroupInvites() {
        try {
            setGroupInvites(await fetchPendingGroupInvites());
        } catch (err) {
            showError(err);
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
        hasInitializedSeenBaselineRef.current = false;
        sessionStartedAtRef.current = Date.now();
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
        function handleClientSettingsChanged(event) {
            setClientSettingsSnapshot(event.detail || loadClientSettings());
        }

        window.addEventListener("clientSettingsChanged", handleClientSettingsChanged);
        return () => window.removeEventListener("clientSettingsChanged", handleClientSettingsChanged);
    }, []);

    useEffect(() => {
        if (!debugModeEnabled && errorDebugDetails) {
            setErrorDebugDetails("");
        }
    }, [debugModeEnabled, errorDebugDetails]);

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
        localStorage.setItem(
            conversationSeenStorageKey,
            JSON.stringify(conversationSeenTimestamps)
        );
    }, [conversationSeenStorageKey, conversationSeenTimestamps]);

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
            showError(err);
        });
    }, [currentUser]);

    useEffect(() => {
        if (!autoRefreshEnabled) {
            return undefined;
        }

        const intervalId = window.setInterval(() => {
            loadFriends();
            loadGroupConversationList();
            loadGroupInvites();
        }, 15000);

        function handleWindowFocus() {
            loadFriends();
            loadGroupConversationList();
            loadGroupInvites();
        }

        window.addEventListener("focus", handleWindowFocus);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener("focus", handleWindowFocus);
        };
    }, [autoRefreshEnabled]);

    const selectedFriend = useMemo(() => (
        friendsState.friends.find(
            (friend) => String(friend.friendUserId) === String(selectedFriendId)
        ) || null
    ), [friendsState.friends, selectedFriendId]);
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
        async function loadConversation() {
            if (!effectiveSelectedFriend) {
                setMessages([]);
                setConversationMeta(null);
                setHasLocalConversationAccess(true);
                setShowConversationSettings(false);
                setHistoryAccessRequest(null);
                return;
            }

            try {
                const data = await openFriendConversation({
                    currentUser,
                    friend: effectiveSelectedFriend
                });

                setMessages(data.messages);
                setConversationMeta(data.conversation);
                setHasLocalConversationAccess(data.hasLocalAccess !== false);
                setSelectedRelayTtlSeconds(data.conversation?.relayPolicy?.currentSeconds ?? 0);

                if (effectiveSelectedFriend.conversationId) {
                    const historyStatus = await fetchHistoryAccessStatus({
                        friendUserId: effectiveSelectedFriend.friendUserId,
                        conversationId: effectiveSelectedFriend.conversationId
                    });
                    setHistoryAccessRequest(historyStatus.request);
                } else {
                    setHistoryAccessRequest(null);
                }
            } catch (err) {
                setHasLocalConversationAccess(true);
                showError(err);
            }
        }

        loadConversation();
    }, [selectedFriendId, friendsState.friends, currentUser, effectiveSelectedFriend]);

    useEffect(() => {
        async function loadSelectedGroupConversation() {
            if (!selectedGroupConversationId) {
                setGroupMessages([]);
                setGroupConversationMeta(null);
                return;
            }

            try {
                const data = await openGroupConversation({
                    currentUser,
                    conversationId: selectedGroupConversationId
                });
                setGroupMessages(data.messages);
                setGroupConversationMeta(data.conversation);
            } catch (err) {
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
                    const data = await openGroupConversation({
                        currentUser,
                        conversationId: selectedGroupConversationId
                    });

                    setGroupMessages(data.messages);
                    setGroupConversationMeta(data.conversation);
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
                const data = await openFriendConversation({
                    currentUser,
                    friend: effectiveSelectedFriend
                });

                setMessages(data.messages);
                setConversationMeta(data.conversation);
                setHasLocalConversationAccess(data.hasLocalAccess !== false);

                if (effectiveSelectedFriend.conversationId) {
                    const historyStatus = await fetchHistoryAccessStatus({
                        friendUserId: effectiveSelectedFriend.friendUserId,
                        conversationId: effectiveSelectedFriend.conversationId
                    });
                    setHistoryAccessRequest(historyStatus.request);
                }
            } catch (err) {
                setHasLocalConversationAccess(true);
                showError(err);
            }
        }

        window.addEventListener("secureDmMessage", handleSecureDmMessage);
        return () => window.removeEventListener("secureDmMessage", handleSecureDmMessage);
    }, [activeView, currentUser, effectiveSelectedFriend, friendsState.friends, groupConversations, selectedGroupConversationId]);

    useEffect(() => {
        function handleConversationAccessRequired(event) {
            const conversationId = event.detail?.conversationId;

            if (
                selectedFriend?.conversationId
                && String(selectedFriend.conversationId) === String(conversationId)
            ) {
                setHasLocalConversationAccess(false);
            }
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
        function handleRelayQueueState(event) {
            const detail = event.detail || {};
            if ((detail.droppedRecipients || []).length > 0) {
                showStaticError("Your friend is offline and this chat is set to no relay, so the message was not queued.", "Friends relay queue: dropped recipients while relay was disabled.");
            }
        }

        window.addEventListener("secureDmRelayQueueState", handleRelayQueueState);
        return () => window.removeEventListener("secureDmRelayQueueState", handleRelayQueueState);
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

        async function loadConversationPreviews() {
            if (!window.secureDm || !currentUser) {
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
                    const localMessages = await window.secureDm.listMessages({
                        userId: currentUser.id,
                        conversationId
                    });
                    const latestMessage = localMessages[localMessages.length - 1];

                    nextPreviews[conversationId] = latestMessage?.body
                        ? {
                            text: truncatePreview(latestMessage.body),
                            hasMessage: true,
                            timestamp: latestMessage.createdAt || null,
                            direction: latestMessage.direction || null
                        }
                        : {
                            text: "No messages yet",
                            hasMessage: false,
                            timestamp: null,
                            direction: null
                        };
                } catch {
                    nextPreviews[conversationId] = {
                        text: "Encrypted chat",
                        hasMessage: false,
                        timestamp: null,
                        direction: null
                    };
                }
            }

            if (!cancelled) {
                setConversationPreviews(nextPreviews);

                if (!hasInitializedSeenBaselineRef.current) {
                    const baselineSeenTimestamps = {};

                    Object.entries(nextPreviews).forEach(([conversationId, preview]) => {
                        const latestTimestamp = getPreviewTimestamp(preview);
                        if (latestTimestamp != null) {
                            baselineSeenTimestamps[String(conversationId)] = latestTimestamp;
                        }
                    });

                    setConversationSeenTimestamps((prev) => ({
                        ...prev,
                        ...baselineSeenTimestamps
                    }));
                    hasInitializedSeenBaselineRef.current = true;
                }
            }
        }

        loadConversationPreviews();

        return () => {
            cancelled = true;
        };
    }, [currentUser, friendsState.friends, groupConversations, messages, groupMessages, previewRefreshNonce]);

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
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    function handleSelectFriend(friendUserId) {
        setActiveView("friend");
        setSelectedFriendId(friendUserId);
    }

    function handleSelectGroupConversation(conversationId) {
        setActiveView("group");
        setSelectedGroupConversationId(conversationId);
        setShowConversationSettings(false);
        setFriendContextMenu(null);
    }

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

        if (!effectiveSelectedFriend || !composer.trim()) {
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            const result = await sendFriendDirectMessage({
                currentUser,
                friend: effectiveSelectedFriend,
                body: composer.trim(),
                relayTtlSeconds: selectedRelayTtlSeconds
            });

            setForgottenConversationIds((prev) => {
                const next = { ...prev };
                delete next[String(effectiveSelectedFriend.friendUserId)];
                return next;
            });
            setComposer("");
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
                relayTtlSeconds: selectedRelayTtlSeconds
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
            showError(err);
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
            setGroupMessages(opened.messages);
            setGroupConversationMeta(opened.conversation || result.conversation);
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

        if (!selectedGroupConversationId || !groupComposer.trim()) {
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            const opened = await sendGroupConversationMessage({
                currentUser,
                conversationId: selectedGroupConversationId,
                body: groupComposer.trim()
            });

            setGroupComposer("");
            setGroupMessages(opened.messages);
            setGroupConversationMeta((prev) => ({
                ...(prev || {}),
                ...(opened.conversation || {})
            }));
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
            setGroupMessages(accepted.messages);
            setGroupConversationMeta(accepted.conversation);
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
            const relayPolicy = await requestFriendRelayRetention({
                conversationId: effectiveSelectedFriend.conversationId,
                relayTtlSeconds: selectedRelayTtlSeconds
            });

            setConversationMeta((prev) => ({
                ...(prev || {}),
                relayPolicy
            }));
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
            const relayPolicy = await acceptFriendRelayRetention({
                conversationId: effectiveSelectedFriend.conversationId
            });

            setConversationMeta((prev) => ({
                ...(prev || {}),
                relayPolicy
            }));
            setSelectedRelayTtlSeconds(relayPolicy?.currentSeconds ?? 0);
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

    async function handleRemoveFriend(friend) {
        setFriendContextMenu(null);

        const confirmed = window.confirm(
            `Remove ${friend.friendUsername} from your friends list? Re-adding the same friend later will restore this hidden conversation.`
        );
        if (!confirmed) {
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            await removeFriend(friend.friendshipId);
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
            }

            await loadFriends();
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleHardDeleteFriend(friend) {
        setFriendContextMenu(null);

        const confirmed = window.confirm(
            `Hard delete ${friend.friendUsername} and remove your local conversation history on this device? This cannot delete copies on other devices.`
        );
        if (!confirmed) {
            return;
        }

        setSubmitting(true);
        clearErrorState();

        try {
            if (friend.conversationId) {
                await window.secureDm.deleteConversation({
                    userId: currentUser.id,
                    conversationId: friend.conversationId
                });
            }

            await removeFriend(friend.friendshipId, { hardDelete: true });
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

            await loadFriends();
        } catch (err) {
            showError(err);
        } finally {
            setSubmitting(false);
        }
    }

    const relayPolicy = conversationMeta?.relayPolicy || null;
    const pendingRelayRequest = relayPolicy?.pendingSeconds != null ? relayPolicy : null;
    const pendingRequestedByFriend = Boolean(
        pendingRelayRequest
        && pendingRelayRequest.pendingRequestedByUserId !== Number(currentUser.id)
    );
    const currentRelayLabel = RELAY_RETENTION_OPTIONS.find(
        (option) => option.seconds === (relayPolicy?.currentSeconds ?? selectedRelayTtlSeconds)
    )?.label || "No relay";
    const pendingRelayLabel = pendingRelayRequest
        ? RELAY_RETENTION_OPTIONS.find((option) => option.seconds === pendingRelayRequest.pendingSeconds)?.label
        || `${pendingRelayRequest.pendingHours} hours`
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
    const incomingHistoryRequest = historyAccessRequest
        && historyAccessRequest.status === "pending"
        && Number(historyAccessRequest.approverUserId) === Number(currentUser.id);
    const outgoingHistoryRequest = historyAccessRequest
        && historyAccessRequest.status === "pending"
        && Number(historyAccessRequest.requesterUserId) === Number(currentUser.id);
    const isDirectConversationEncrypted = Boolean(effectiveSelectedFriend?.conversationId);
    const showEncryptionStage = lockPhase !== "hidden";
    const canComposeDirectMessage = isDirectConversationEncrypted && hasLocalConversationAccess && !submitting && !isEncryptingChat && !showEncryptionStage;
    const activeGroupParticipantNames = (selectedGroupConversation?.participants || [])
        .filter((participant) => Number(participant.userId) !== Number(currentUser.id))
        .map((participant) => participant.username);
    const activeConversationId = activeView === "group"
        ? selectedGroupConversationId
        : effectiveSelectedFriend?.conversationId || null;

    function getPreviewTimestamp(preview) {
        if (!preview?.timestamp) {
            return null;
        }

        const timestamp = new Date(preview.timestamp).getTime();
        return Number.isNaN(timestamp) ? null : timestamp;
    }

    function conversationHasUnreadActivity(conversationId) {
        if (!conversationId) {
            return false;
        }

        const preview = conversationPreviews[String(conversationId)];
        if (!preview?.hasMessage || preview.direction !== "incoming") {
            return false;
        }

        const latestTimestamp = getPreviewTimestamp(preview);
        if (latestTimestamp == null) {
            return false;
        }

        const seenTimestamp = Number(conversationSeenTimestamps[String(conversationId)] || 0);
        return latestTimestamp > seenTimestamp;
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
            const latestTimestamp = getPreviewTimestamp(preview);

            if (latestTimestamp == null) {
                return;
            }

            setConversationSeenTimestamps((prev) => ({
                ...prev,
                [String(activeConversationId)]: latestTimestamp
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
                    <FriendsHeader
                        autoRefreshEnabled={autoRefreshEnabled}
                        onRefresh={() => {
                            loadFriends();
                            loadGroupConversationList(selectedGroupConversationId);
                            loadGroupInvites();
                        }}
                        onToggleAutoRefresh={setAutoRefreshEnabled}
                    />

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
                    loading={loading}
                    friendsState={friendsState}
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
                    selectedFriend={selectedFriend}
                    effectiveSelectedFriend={effectiveSelectedFriend}
                    secureStatusRef={secureStatusRef}
                    canRequestOldConversation={canRequestOldConversation}
                    isForgettingOldConversation={isForgettingOldConversation}
                    shouldShowConversationRestartNotice={shouldShowConversationRestartNotice}
                    shouldShowMissingConversationAccessNotice={shouldShowMissingConversationAccessNotice}
                    incomingHistoryRequest={incomingHistoryRequest}
                    outgoingHistoryRequest={outgoingHistoryRequest}
                    pendingRequestedByFriend={pendingRequestedByFriend}
                    historyAccessRequest={historyAccessRequest}
                    pendingRelayLabel={pendingRelayLabel}
                    submitting={submitting}
                    showEncryptionStage={showEncryptionStage}
                    lockPhase={lockPhase}
                    messages={messages}
                    composer={composer}
                    isDirectConversationEncrypted={isDirectConversationEncrypted}
                    canComposeDirectMessage={canComposeDirectMessage}
                    messageListRef={messageListRef}
                    onGroupComposerChange={setGroupComposer}
                    onSendGroupMessage={handleSendGroupMessage}
                    onOpenConversationSettings={() => setShowConversationSettings(true)}
                    onForgetOldConversation={handleForgetOldConversation}
                    onHistoryRequest={handleHistoryRequest}
                    onHistoryDecline={handleHistoryDecline}
                    onHistoryApprove={handleHistoryApprove}
                    onRetentionAccept={handleRetentionAccept}
                    onEncryptChat={handleEncryptChat}
                    onComposerChange={setComposer}
                    onSendMessage={handleSendMessage}
                />
            </div>

            {showConversationSettings && selectedFriend ? (
                <FriendConversationSettingsModal
                    selectedFriend={selectedFriend}
                    effectiveSelectedFriend={effectiveSelectedFriend}
                    selectedRelayTtlSeconds={selectedRelayTtlSeconds}
                    relayPolicy={relayPolicy}
                    pendingRelayRequest={pendingRelayRequest}
                    pendingRequestedByFriend={pendingRequestedByFriend}
                    pendingRelayLabel={pendingRelayLabel}
                    currentRelayLabel={currentRelayLabel}
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
                    onRetentionRequest={handleRetentionRequest}
                    onRetentionAccept={handleRetentionAccept}
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

            <FriendContextMenu
                contextMenu={friendContextMenu}
                friendTagFolders={friendTagFolders}
                onOpenDm={() => {
                    setSelectedFriendId(friendContextMenu.friend.friendUserId);
                    setFriendContextMenu(null);
                }}
                onApplyTag={(tagId) => applyFriendTag(friendContextMenu.friend.friendUserId, tagId)}
                onClearTag={() => clearFriendTag(friendContextMenu.friend.friendUserId)}
                onRemoveFriend={() => handleRemoveFriend(friendContextMenu.friend)}
                onHardDeleteFriend={() => handleHardDeleteFriend(friendContextMenu.friend)}
            />
        </main>
    );
}



