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
            props: {
                gap: 16,
                padding: 0,
                style: ""
            },
            children: []
        };
    }

    if (type === "text") {
        return {
            id: makeId("text"),
            type: "text",
            props: {
                text: "New text",
                markdown: true,
                layoutEngine: "browser",
                font: '400 16px "Segoe UI"',
                lineHeight: 24,
                whiteSpace: "normal",
                wordBreak: "normal",
                style: ""
            }
        };
    }

    if (type === "heading") {
        return {
            id: makeId("heading"),
            type: "heading",
            props: {
                text: "New heading",
                level: 2,
                markdown: true,
                layoutEngine: "browser",
                font: '700 32px "Segoe UI"',
                lineHeight: 40,
                whiteSpace: "normal",
                wordBreak: "normal",
                style: ""
            }
        };
    }

    if (type === "button") {
        return {
            id: makeId("button"),
            type: "button",
            props: {
                text: "Button",
                markdown: true,
                style: ""
            }
        };
    }

    if (type === "input") {
        return {
            id: makeId("input"),
            type: "input",
            props: {
                name: "field",
                placeholder: "Type here",
                style: ""
            }
        };
    }

    if (type === "textarea") {
        return {
            id: makeId("textarea"),
            type: "textarea",
            props: {
                name: "message",
                placeholder: "Write something",
                style: ""
            }
        };
    }

    if (type === "image") {
        return {
            id: makeId("image"),
            type: "image",
            props: {
                src: "",
                alt: "Image",
                style: ""
            }
        };
    }

    if (type === "chat") {
        return {
            id: makeId("chat"),
            type: "chat",
            props: {
                channelId: "",
                title: "Chat",
                style: ""
            }
        };
    }

    if (type === "spacer") {
        return {
            id: makeId("spacer"),
            type: "spacer",
            props: {
                height: 24,
                style: ""
            }
        };
    }

    return {
        id: makeId("node"),
        type,
        props: {
            style: ""
        }
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

function cloneNode(node) {
    return JSON.parse(JSON.stringify(node));
}

function wrapTogether(existingNode, incomingNode, wrapperType, incomingFirst = false) {
    return {
        id: makeId(wrapperType),
        type: wrapperType,
        props: {
            gap: 16,
            padding: 0,
            style: ""
        },
        children: incomingFirst
            ? [incomingNode, existingNode]
            : [existingNode, incomingNode]
    };
}

export function insertNodeRelative(tree, targetId, position, incomingNode) {
    if (!tree) return incomingNode;

    function visit(current) {
        if (!current || !Array.isArray(current.children)) return current;

        const childIndex = current.children.findIndex((child) => child.id === targetId);

        if (childIndex !== -1) {
            const targetChild = current.children[childIndex];
            const nextChildren = [...current.children];

            if (position === "inside") {
                if (!Array.isArray(targetChild.children)) return current;

                nextChildren[childIndex] = {
                    ...targetChild,
                    children: [...targetChild.children, incomingNode]
                };

                return {
                    ...current,
                    children: nextChildren
                };
            }

            if (position === "left" || position === "right") {
                if (current.type === "row") {
                    nextChildren.splice(
                        position === "left" ? childIndex : childIndex + 1,
                        0,
                        incomingNode
                    );

                    return {
                        ...current,
                        children: nextChildren
                    };
                }

                nextChildren[childIndex] = wrapTogether(
                    targetChild,
                    incomingNode,
                    "row",
                    position === "left"
                );

                return {
                    ...current,
                    children: nextChildren
                };
            }

            if (position === "top" || position === "bottom") {
                if (current.type === "column") {
                    nextChildren.splice(
                        position === "top" ? childIndex : childIndex + 1,
                        0,
                        incomingNode
                    );

                    return {
                        ...current,
                        children: nextChildren
                    };
                }

                nextChildren[childIndex] = wrapTogether(
                    targetChild,
                    incomingNode,
                    "column",
                    position === "top"
                );

                return {
                    ...current,
                    children: nextChildren
                };
            }
        }

        return {
            ...current,
            children: current.children.map((child) => visit(child))
        };
    }

    if (tree.id === targetId) {
        if (position === "inside") {
            if (!Array.isArray(tree.children)) return tree;
            return {
                ...tree,
                children: [...tree.children, incomingNode]
            };
        }

        if (position === "left") return wrapTogether(cloneNode(tree), incomingNode, "row", true);
        if (position === "right") return wrapTogether(cloneNode(tree), incomingNode, "row", false);
        if (position === "top") return wrapTogether(cloneNode(tree), incomingNode, "column", true);
        if (position === "bottom") return wrapTogether(cloneNode(tree), incomingNode, "column", false);
    }

    return visit(tree);
}

export function containsNode(node, targetId) {
    if (!node) return false;
    if (node.id === targetId) return true;

    if (!Array.isArray(node.children)) return false;
    return node.children.some((child) => containsNode(child, targetId));
}

export function detachNode(tree, targetId) {
    if (!tree) {
        return { nextTree: null, detachedNode: null };
    }

    if (!Array.isArray(tree.children)) {
        return { nextTree: tree, detachedNode: null };
    }

    let detachedNode = null;
    const nextChildren = [];

    for (const child of tree.children) {
        if (child.id === targetId) {
            detachedNode = child;
            continue;
        }

        const result = detachNode(child, targetId);

        if (result.detachedNode) {
            detachedNode = result.detachedNode;
        }

        nextChildren.push(result.nextTree ?? child);
    }

    return {
        nextTree: {
            ...tree,
            children: nextChildren
        },
        detachedNode
    };
}

export function moveNodeRelative(tree, draggedNodeId, targetId, position) {
    if (!tree) return tree;
    if (!draggedNodeId || !targetId) return tree;
    if (draggedNodeId === targetId) return tree;

    const draggedNode = findNode(tree, draggedNodeId);
    const targetNode = findNode(tree, targetId);

    if (!draggedNode || !targetNode) return tree;

    // prevent moving parent into its own child
    if (containsNode(draggedNode, targetId)) {
        return tree;
    }

    // prevent moving root directly with this logic
    if (tree.id === draggedNodeId) {
        return tree;
    }

    const { nextTree, detachedNode } = detachNode(tree, draggedNodeId);

    if (!nextTree || !detachedNode) {
        return tree;
    }

    return insertNodeRelative(nextTree, targetId, position, detachedNode);
}
