function makeId(prefix = "node") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function ensureNodeIds(node) {
    if (!node || typeof node !== "object") return node;

    const next = {
        ...node,
        id: node.id || makeId(node.type || "node")
    };

    if (Array.isArray(node.children)) {
        next.children = node.children.map(ensureNodeIds);
    }

    return next;
}

export function createNode(type) {
    if (type === "row" || type === "column") {
        return {
            id: makeId(type),
            type,
            children: []
        };
    }

    if (type === "text") {
        return {
            id: makeId("text"),
            type: "text",
            props: {
                text: "New text"
            }
        };
    }

    if (type === "chat") {
        return {
            id: makeId("chat"),
            type: "chat"
        };
    }

    if (type === "spacer") {
        return {
            id: makeId("spacer"),
            type: "spacer",
            props: {
                height: 24
            }
        };
    }

    return {
        id: makeId("node"),
        type
    };
}

export function findNode(node, targetId) {
    if (!node) return null;
    if (node.id === targetId) return node;

    if (!Array.isArray(node.children)) return null;

    for (const child of node.children) {
        const found = findNode(child, targetId);
        if (found) return found;
    }

    return null;
}

export function updateNode(node, targetId, updater) {
    if (!node) return node;

    if (node.id === targetId) {
        return updater(node);
    }

    if (!Array.isArray(node.children)) return node;

    return {
        ...node,
        children: node.children.map((child) => updateNode(child, targetId, updater))
    };
}

export function addChildNode(node, parentId, childNode) {
    return updateNode(node, parentId, (current) => {
        if (!Array.isArray(current.children)) return current;

        return {
            ...current,
            children: [...current.children, childNode]
        };
    });
}

export function deleteNode(node, targetId) {
    if (!node) return node;
    if (node.id === targetId) return node;

    if (!Array.isArray(node.children)) return node;

    return {
        ...node,
        children: node.children
            .filter((child) => child.id !== targetId)
            .map((child) => deleteNode(child, targetId))
    };
}

export function moveNodeUp(node, targetId) {
    if (!node || !Array.isArray(node.children)) return node;

    const index = node.children.findIndex((child) => child.id === targetId);

    if (index > 0) {
        const nextChildren = [...node.children];
        [nextChildren[index - 1], nextChildren[index]] = [nextChildren[index], nextChildren[index - 1]];
        return { ...node, children: nextChildren };
    }

    return {
        ...node,
        children: node.children.map((child) => moveNodeUp(child, targetId))
    };
}

export function moveNodeDown(node, targetId) {
    if (!node || !Array.isArray(node.children)) return node;

    const index = node.children.findIndex((child) => child.id === targetId);

    if (index !== -1 && index < node.children.length - 1) {
        const nextChildren = [...node.children];
        [nextChildren[index], nextChildren[index + 1]] = [nextChildren[index + 1], nextChildren[index]];
        return { ...node, children: nextChildren };
    }

    return {
        ...node,
        children: node.children.map((child) => moveNodeDown(child, targetId))
    };
}