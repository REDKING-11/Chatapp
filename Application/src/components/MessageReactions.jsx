import { useEffect, useMemo, useRef, useState } from "react";
import emojiData from "@emoji-mart/data";
import { Picker, init } from "emoji-mart";
import {
    getReactionCount,
    normalizeReactionEntries
} from "../features/reactions/catalog";

init({ data: emojiData });

function extractNativeEmoji(payload) {
    if (!payload) {
        return "";
    }

    if (typeof payload === "string") {
        return payload;
    }

    if (typeof payload.native === "string" && payload.native) {
        return payload.native;
    }

    if (typeof payload.detail?.native === "string" && payload.detail.native) {
        return payload.detail.native;
    }

    return "";
}

export default function MessageReactions({
    reactions,
    currentUserId,
    onToggleReaction,
    className = "",
    showEntries = true,
    showAddButton = true,
    openPickerSignal = 0
}) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const rootRef = useRef(null);
    const pickerHostRef = useRef(null);
    const entries = useMemo(
        () => normalizeReactionEntries(reactions).filter((entry) => getReactionCount(entry) > 0),
        [reactions]
    );

    useEffect(() => {
        if (!pickerOpen) {
            return undefined;
        }

        function handleKeyDown(event) {
            if (event.key === "Escape") {
                setPickerOpen(false);
            }
        }

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [pickerOpen]);

    useEffect(() => {
        if (!pickerOpen || !pickerHostRef.current) {
            return undefined;
        }

        const handleSelect = (payload) => {
            const nativeEmoji = extractNativeEmoji(payload);

            if (nativeEmoji) {
                onToggleReaction?.(nativeEmoji);
            }

            setPickerOpen(false);
        };

        const picker = new Picker({
            data: emojiData,
            autoFocus: true,
            previewPosition: "none",
            skinTonePosition: "none",
            theme: "dark",
            navPosition: "top",
            searchPosition: "sticky",
            emojiButtonRadius: "12px",
            emojiButtonSize: 40,
            emojiSize: 24,
            perLine: 9,
            maxFrequentRows: 1,
            categories: ["frequent", "people", "nature", "foods", "activity", "objects", "symbols", "flags"],
            onEmojiSelect: handleSelect
        });

        pickerHostRef.current.replaceChildren(picker);

        return () => {
            picker.remove();
            if (pickerHostRef.current) {
                pickerHostRef.current.replaceChildren();
            }
        };
    }, [onToggleReaction, pickerOpen]);

    useEffect(() => {
        if (openPickerSignal) {
            setPickerOpen(true);
        }
    }, [openPickerSignal]);

    if (!showAddButton && (!showEntries || entries.length === 0)) {
        return null;
    }

    return (
        <div ref={rootRef} className={`message-reactions-row ${className}`.trim()}>
            {showEntries ? entries.map((entry) => {
                const userIds = Array.isArray(entry.userIds) ? entry.userIds.map(String) : [];
                const active = currentUserId != null && userIds.includes(String(currentUserId));

                return (
                    <button
                        key={entry.emoji}
                        type="button"
                        className={`message-reaction-chip ${active ? "is-active" : ""}`}
                        onClick={() => onToggleReaction?.(entry.emoji)}
                    >
                        <span className="message-reaction-emoji">{entry.emoji}</span>
                        <span className="message-reaction-count">{getReactionCount(entry)}</span>
                    </button>
                );
            }) : null}

            {showAddButton ? (
                <div className="message-reaction-picker-shell">
                    <button
                        type="button"
                        className={`message-reaction-add ${pickerOpen ? "is-open" : ""}`}
                        onClick={() => setPickerOpen((prev) => !prev)}
                        aria-label="Add reaction"
                    >
                        +
                    </button>

                    {pickerOpen ? (
                        <div className="message-reaction-picker-overlay">
                            <button
                                type="button"
                                className="message-reaction-picker-backdrop"
                                aria-label="Close emoji picker"
                                onClick={() => setPickerOpen(false)}
                            />
                            <div className="message-reaction-picker">
                                <div ref={pickerHostRef} className="message-reaction-picker-host" />
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
