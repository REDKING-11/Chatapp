import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resolvePointPopoverPosition } from "../../../lib/popoverPosition.js";

export default function ChatUserContextMenu({
    contextMenu,
    onOpenProfile,
    onClose
}) {
    const menuRef = useRef(null);
    const [position, setPosition] = useState(null);
    const userId = String(contextMenu?.userId || "").trim();

    useLayoutEffect(() => {
        if (!contextMenu) {
            setPosition(null);
            return undefined;
        }

        function updatePosition() {
            const rect = menuRef.current?.getBoundingClientRect();
            const nextPosition = resolvePointPopoverPosition({
                x: contextMenu.x,
                y: contextMenu.y,
                popoverWidth: rect?.width || 220,
                popoverHeight: rect?.height || 240,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight
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
    }, [contextMenu]);

    useEffect(() => {
        if (!contextMenu) {
            return undefined;
        }

        function handleWindowClick(event) {
            if (menuRef.current?.contains(event.target)) {
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
    }, [contextMenu, onClose]);

    async function handleCopyUserId() {
        if (!userId) {
            return;
        }

        try {
            await navigator.clipboard.writeText(userId);
        } catch {
            // ignore clipboard failures for now
        }

        onClose?.();
    }

    if (!contextMenu || typeof document === "undefined") {
        return null;
    }

    return createPortal(
        <div
            ref={menuRef}
            className="server-context-menu chat-user-context-menu"
            style={{
                left: `${position?.left ?? contextMenu.x}px`,
                top: `${position?.top ?? contextMenu.y}px`,
                width: position?.width ? `${position.width}px` : undefined,
                maxHeight: position?.maxHeight ? `${position.maxHeight}px` : "calc(100vh - 24px)"
            }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
        >
            <button
                type="button"
                className="server-context-item"
                onClick={() => onOpenProfile?.(contextMenu)}
            >
                Profile
            </button>
            <button
                type="button"
                className="server-context-item"
                onClick={handleCopyUserId}
                disabled={!userId}
            >
                Copy user ID
            </button>
            <button type="button" className="server-context-item" disabled>
                Message
            </button>
            <button type="button" className="server-context-item" disabled>
                Mention
            </button>
            <button type="button" className="server-context-item" disabled>
                Add friend
            </button>
        </div>,
        document.body
    );
}
