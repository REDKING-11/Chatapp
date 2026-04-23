import { useLayoutEffect, useRef, useState } from "react";

export default function FriendContextMenu({
    contextMenu,
    isMuted,
    friendTagFolders,
    onOpenDm,
    onOpenSettings,
    onToggleMute,
    onApplyTag,
    onClearTag
}) {
    const menuRef = useRef(null);
    const [position, setPosition] = useState(null);

    useLayoutEffect(() => {
        if (!contextMenu) {
            setPosition(null);
            return;
        }

        const margin = 12;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const menuRect = menuRef.current?.getBoundingClientRect();
        const menuWidth = menuRect?.width || 280;
        const menuHeight = menuRect?.height || 320;
        const nextLeft = Math.min(
            Math.max(contextMenu.x, margin),
            Math.max(margin, viewportWidth - menuWidth - margin)
        );
        const nextTop = Math.min(
            Math.max(contextMenu.y, margin),
            Math.max(margin, viewportHeight - menuHeight - margin)
        );

        setPosition((prev) => {
            if (prev && prev.x === nextLeft && prev.y === nextTop) {
                return prev;
            }

            return {
                x: nextLeft,
                y: nextTop
            };
        });
    }, [contextMenu, friendTagFolders]);

    if (!contextMenu) {
        return null;
    }

    return (
        <div
            ref={menuRef}
            className="server-context-menu friend-context-menu"
            style={{
                top: `${(position?.y ?? contextMenu.y)}px`,
                left: `${(position?.x ?? contextMenu.x)}px`
            }}
            onClick={(event) => event.stopPropagation()}
        >
            <button className="server-context-item" onClick={onOpenDm}>
                Open DM
            </button>

            <button className="server-context-item" onClick={onOpenSettings}>
                Profile
            </button>

            <button className="server-context-item" onClick={onToggleMute}>
                {isMuted ? "Unmute notifications" : "Mute notifications"}
            </button>

            {friendTagFolders.map((folder) => (
                <div key={folder.id} className="friend-context-section">
                    <span className="friend-context-label">{folder.label}</span>
                    <div className="friend-context-tag-list">
                        {folder.tags.map((tag) => (
                            <button
                                key={tag.id}
                                className="server-context-item friend-context-tag-button"
                                onClick={() => onApplyTag(tag.id)}
                            >
                                {tag.label}
                            </button>
                        ))}
                    </div>
                </div>
            ))}

            <div className="friend-context-section">
                <span className="friend-context-label">Tag</span>
                <div className="friend-context-tag-list">
                    <button
                        className="server-context-item friend-context-tag-button"
                        onClick={onClearTag}
                    >
                        Clear tag
                    </button>
                </div>
            </div>

        </div>
    );
}
