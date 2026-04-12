function normalizeEntityKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^[@#]+/, "")
        .replace(/\s+/g, "");
}

function buildUserLink(user) {
    if (!user || user.scope === "self" || user.scope === "special" || user.targetId == null) {
        return "";
    }

    return `chatapp://friend/${encodeURIComponent(String(user.targetId))}`;
}

function buildChannelLink(channel, currentServerId) {
    const serverId = channel?.serverId ?? currentServerId;

    if (channel?.id == null || serverId == null) {
        return "";
    }

    return `chatapp://server/${encodeURIComponent(String(serverId))}/channel/${encodeURIComponent(String(channel.id))}`;
}

function makeMentionAnchor(token, href) {
    if (!href) {
        const span = document.createElement("span");
        span.className = "markdown-app-link markdown-app-link-mention is-static";
        span.textContent = token;
        return span;
    }

    const anchor = document.createElement("a");
    anchor.className = "markdown-app-link markdown-app-link-mention";
    anchor.href = href;
    anchor.textContent = token;
    return anchor;
}

function makeChannelAnchor(token, href) {
    if (!href) {
        return document.createTextNode(token);
    }

    const anchor = document.createElement("a");
    anchor.className = "markdown-app-link markdown-app-link-channel";
    anchor.href = href;
    anchor.textContent = token;
    return anchor;
}

function makeAppUrlAnchor(token) {
    const anchor = document.createElement("a");
    anchor.className = "markdown-app-link markdown-app-link-deep";
    anchor.href = token;
    anchor.textContent = token;
    return anchor;
}

function replaceTextNodeWithEntities(node, linkContext) {
    const text = String(node.nodeValue || "");
    const matcher = /chatapp:\/\/server\/[^\s<>"')]+|@[a-zA-Z0-9._-]+|#[a-zA-Z0-9_-]+/g;
    let lastIndex = 0;
    let match = null;
    let changed = false;
    const fragment = document.createDocumentFragment();

    while ((match = matcher.exec(text)) !== null) {
        const token = match[0];
        const index = match.index;

        if (index > lastIndex) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
        }

        let replacement = null;

        if (token.startsWith("@")) {
            const mention = linkContext?.mentions?.[normalizeEntityKey(token)];
            replacement = makeMentionAnchor(token, buildUserLink(mention));
        } else if (token.startsWith("#")) {
            const channel = linkContext?.channels?.[normalizeEntityKey(token)];
            replacement = makeChannelAnchor(token, buildChannelLink(channel, linkContext?.currentServerId));
        } else if (token.startsWith("chatapp://")) {
            replacement = makeAppUrlAnchor(token);
        }

        if (replacement) {
            fragment.appendChild(replacement);
            changed = true;
        } else {
            fragment.appendChild(document.createTextNode(token));
        }

        lastIndex = index + token.length;
    }

    if (!changed) {
        return;
    }

    if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    node.replaceWith(fragment);
}

export function buildAppLinkContext({
    currentUser = null,
    users = [],
    channels = [],
    currentServerId = null,
    currentServerName = "",
    includeEveryone = false
} = {}) {
    const mentionEntries = {};
    const mentionSuggestions = [];
    const normalizedUsers = [
        currentUser ? {
            id: currentUser.id,
            targetId: currentUser.id,
            scope: "self",
            username: currentUser.username,
            usernameBase: currentUser.usernameBase,
            handle: currentUser.handle,
            displayName: currentUser.displayName || currentUser.displayLabel
        } : null,
        ...users
    ].filter(Boolean);

    if (includeEveryone) {
        const everyoneUser = {
            id: "__everyone__",
            targetId: null,
            scope: "special",
            username: "everyone",
            label: "everyone",
            displayName: "Everyone"
        };
        mentionEntries.everyone = everyoneUser;
        mentionSuggestions.push({
            id: "__everyone__",
            token: "@everyone",
            label: "everyone",
            description: "Mention everyone here",
            sortLabel: "",
            scope: "special"
        });
    }

    const seenSuggestionIds = new Set();
    normalizedUsers.forEach((user) => {
        [
            user.handle,
            user.username,
            user.usernameBase,
            user.displayName,
            user.label
        ].forEach((candidate) => {
            const key = normalizeEntityKey(candidate);
            if (key) {
                mentionEntries[key] = user;
            }
        });

        const suggestionId = String(user.targetId ?? user.id ?? user.username ?? user.label ?? "");
        if (suggestionId && !seenSuggestionIds.has(suggestionId)) {
            seenSuggestionIds.add(suggestionId);
            mentionSuggestions.push({
                id: suggestionId,
                token: `@${user.handle || user.username || user.usernameBase || user.label || user.displayName || "user"}`,
                label: user.handle || user.username || user.usernameBase || user.label || user.displayName || "user",
                description: user.displayName && user.displayName !== (user.handle || user.username)
                    ? user.displayName
                    : "",
                sortLabel: String(user.handle || user.username || user.usernameBase || user.label || user.displayName || "user").toLowerCase(),
                scope: user.scope || "friend"
            });
        }
    });
    mentionSuggestions.sort((left, right) => String(left.sortLabel || left.label).localeCompare(String(right.sortLabel || right.label)));

    const channelEntries = {};
    const channelSuggestions = [];
    (channels || []).forEach((channel) => {
        const key = normalizeEntityKey(channel?.name);
        if (!key) {
            return;
        }

        channelEntries[key] = {
            ...channel,
            serverId: channel?.serverId ?? currentServerId,
            serverName: channel?.serverName ?? currentServerName
        };

        channelSuggestions.push({
            id: String(channel.id),
            token: `#${channel.name}`,
            label: channel.name,
            sortLabel: String(channel.name || "").toLowerCase(),
            description: channel?.serverName ?? currentServerName ?? ""
        });
    });
    channelSuggestions.sort((left, right) => String(left.sortLabel || left.label).localeCompare(String(right.sortLabel || right.label)));

    return {
        mentions: mentionEntries,
        mentionSuggestions,
        channels: channelEntries,
        channelSuggestions,
        currentServerId,
        currentServerName
    };
}

export function enhanceAppLinks(container, linkContext) {
    if (!container || !linkContext) {
        return;
    }

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;

            if (!parent) {
                return NodeFilter.FILTER_REJECT;
            }

            if (parent.closest("a, code, pre, kbd, samp, input, textarea, button")) {
                return NodeFilter.FILTER_REJECT;
            }

            if (!node.nodeValue || !/[@#]|chatapp:\/\//.test(node.nodeValue)) {
                return NodeFilter.FILTER_REJECT;
            }

            return NodeFilter.FILTER_ACCEPT;
        }
    });

    const nodes = [];
    let current = walker.nextNode();
    while (current) {
        nodes.push(current);
        current = walker.nextNode();
    }

    nodes.forEach((node) => replaceTextNodeWithEntities(node, linkContext));
}

export function parseChatappHref(href) {
    const directFriendMatch = String(href || "").match(/^chatapp:\/\/friend\/([^/?#]+)$/i);
    if (directFriendMatch) {
        return {
            scope: "friend",
            targetId: decodeURIComponent(directFriendMatch[1])
        };
    }

    const messageMatch = String(href || "").match(/^chatapp:\/\/server\/([^/?#]+)\/channel\/([^/?#]+)\/message\/([^/?#]+)$/i);
    if (messageMatch) {
        return {
            scope: "message",
            serverId: decodeURIComponent(messageMatch[1]),
            channelId: decodeURIComponent(messageMatch[2]),
            messageId: decodeURIComponent(messageMatch[3])
        };
    }

    const channelMatch = String(href || "").match(/^chatapp:\/\/server\/([^/?#]+)\/channel\/([^/?#]+)$/i);
    if (channelMatch) {
        return {
            scope: "channel",
            serverId: decodeURIComponent(channelMatch[1]),
            channelId: decodeURIComponent(channelMatch[2])
        };
    }

    return null;
}
