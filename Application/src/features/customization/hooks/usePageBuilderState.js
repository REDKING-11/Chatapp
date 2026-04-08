import { useEffect, useMemo, useState } from "react";
import {
    addChildNode,
    createNode,
    deleteNode,
    ensureNodeIds,
    findNode,
    insertNodeRelative,
    moveNodeDown,
    moveNodeRelative,
    moveNodeUp,
    updateNode
} from "../utils/pageBuilder";

export default function usePageBuilderState({
    customization,
    setCustomization,
    channels
}) {
    const buildableChannels = useMemo(
        () => (channels || []).filter((channel) => channel.type !== "customization"),
        [channels]
    );

    const [selectedPageId, setSelectedPageId] = useState("");
    const [selectedNodeId, setSelectedNodeId] = useState("");

    useEffect(() => {
        if (!selectedPageId && buildableChannels.length > 0) {
            setSelectedPageId(buildableChannels[0].id);
        }
    }, [selectedPageId, buildableChannels]);

    const pageLayout = selectedPageId
        ? customization?.pages?.[selectedPageId]?.layout || null
        : null;

    const safeLayout = useMemo(() => {
        if (!pageLayout || typeof pageLayout !== "object") {
            return null;
        }

        return ensureNodeIds(pageLayout);
    }, [pageLayout]);

    useEffect(() => {
        if (!selectedNodeId && safeLayout?.id) {
            setSelectedNodeId(safeLayout.id);
        }
    }, [safeLayout, selectedNodeId]);

    function saveLayout(nextLayout) {
        if (!selectedPageId) return;

        setCustomization((prev) => ({
            ...prev,
            pages: {
                ...(prev.pages || {}),
                [selectedPageId]: {
                    ...(prev.pages?.[selectedPageId] || {}),
                    layout: nextLayout
                }
            }
        }));
    }

    function handleCreateRoot(type) {
        saveLayout(createNode(type));
    }

    function handleDropOnCanvasRoot(type) {
        if (!safeLayout) {
            saveLayout(createNode(type));
            return;
        }

        const next = insertNodeRelative(safeLayout, safeLayout.id, "inside", createNode(type));
        saveLayout(next);
    }

    function handleDropRelative(targetId, position, type) {
        if (!safeLayout) {
            saveLayout(createNode(type));
            return;
        }

        const nextLayout = insertNodeRelative(
            safeLayout,
            targetId,
            position,
            createNode(type)
        );

        saveLayout(nextLayout);
    }

    function handleMoveRelative(draggedNodeId, targetId, position) {
        if (!safeLayout) return;

        const nextLayout = moveNodeRelative(
            safeLayout,
            draggedNodeId,
            targetId,
            position
        );

        saveLayout(nextLayout);
        setSelectedNodeId(draggedNodeId);
    }

    function handleAddChild(type) {
        if (!safeLayout || !selectedNodeId) return;

        const selectedNode = findNode(safeLayout, selectedNodeId);
        if (!selectedNode || !Array.isArray(selectedNode.children)) return;

        saveLayout(addChildNode(safeLayout, selectedNodeId, createNode(type)));
    }

    function handleDeleteNode() {
        if (!safeLayout || !selectedNodeId) return;

        if (safeLayout.id === selectedNodeId) {
            saveLayout(null);
            setSelectedNodeId("");
            return;
        }

        saveLayout(deleteNode(safeLayout, selectedNodeId));
        setSelectedNodeId("");
    }

    function handleMoveUp() {
        if (!safeLayout || !selectedNodeId) return;
        saveLayout(moveNodeUp(safeLayout, selectedNodeId));
    }

    function handleMoveDown() {
        if (!safeLayout || !selectedNodeId) return;
        saveLayout(moveNodeDown(safeLayout, selectedNodeId));
    }

    function patchSelectedNode(patchFn) {
        if (!safeLayout || !selectedNodeId) return;
        saveLayout(updateNode(safeLayout, selectedNodeId, patchFn));
    }

    const selectedNode =
        safeLayout && selectedNodeId ? findNode(safeLayout, selectedNodeId) : null;

    return {
        buildableChannels,
        selectedPageId,
        setSelectedPageId,
        selectedNodeId,
        setSelectedNodeId,
        safeLayout,
        selectedNode,
        handleCreateRoot,
        handleDropOnCanvasRoot,
        handleDropRelative,
        handleMoveRelative,
        handleAddChild,
        handleDeleteNode,
        handleMoveUp,
        handleMoveDown,
        patchSelectedNode
    };
}