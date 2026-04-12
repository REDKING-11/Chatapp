import { useEffect, useRef, useState } from "react";
import emojiData from "@emoji-mart/data";
import { Picker, init } from "emoji-mart";
import {
    fileToComposerMarkdown,
    insertTextAtCursor
} from "../lib/composerTools";

init({ data: emojiData });

const COMPOSER_EMOJI_CYCLE = [
    "\u{1F642}",
    "\u{1F60E}",
    "\u{1F916}",
    "\u{1F973}",
    "\u{1F63A}",
    "\u{1F47E}",
    "\u{2728}",
    "\u{1F635}\u{200D}\u{1F4AB}"
];

function updateSelection(element, selectionStart, selectionEnd) {
    if (!element || selectionStart == null || selectionEnd == null) {
        return;
    }

    window.requestAnimationFrame(() => {
        element.focus();
        element.setSelectionRange(selectionStart, selectionEnd);
    });
}

export default function ComposerTools({
    value,
    onChange,
    inputRef,
    disabled = false,
    className = "",
    tools = ["emoji", "file"],
    iconOnly = false,
    onPickFile = null,
    shortcutScope = "",
    openFileSignal = 0
}) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const [error, setError] = useState("");
    const [emojiIcon, setEmojiIcon] = useState(() => (
        COMPOSER_EMOJI_CYCLE[Math.floor(Math.random() * COMPOSER_EMOJI_CYCLE.length)]
    ));
    const pickerHostRef = useRef(null);
    const fileInputRef = useRef(null);

    function insertSnippet(snippet) {
        const element = inputRef?.current || null;
        const next = insertTextAtCursor(element, value, snippet);
        onChange(next.value);
        setError("");
        updateSelection(element, next.selectionStart, next.selectionEnd);
    }

    useEffect(() => {
        if (!pickerOpen || !pickerHostRef.current) {
            return undefined;
        }

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
            onEmojiSelect: (payload) => {
                const emoji = payload?.native || payload?.detail?.native || "";

                if (emoji) {
                    insertSnippet(emoji);
                }
            }
        });

        pickerHostRef.current.replaceChildren(picker);

        function handleKeyDown(event) {
            if (event.key === "Escape") {
                setPickerOpen(false);
            }
        }

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            picker.remove();
            if (pickerHostRef.current) {
                pickerHostRef.current.replaceChildren();
            }
        };
    }, [pickerOpen, value]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setEmojiIcon((current) => {
                const options = COMPOSER_EMOJI_CYCLE.filter((entry) => entry !== current);
                return options[Math.floor(Math.random() * options.length)] || current;
            });
        }, 20000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, []);

    useEffect(() => {
        if (!openFileSignal || disabled || !tools.includes("file")) {
            return;
        }

        fileInputRef.current?.click();
    }, [disabled, openFileSignal, tools]);

    useEffect(() => {
        function handleShortcut(event) {
            const { action, scope } = event.detail || {};

            if (scope && shortcutScope && scope !== shortcutScope) {
                return;
            }

            if (action === "openEmojiPicker" && tools.includes("emoji") && !disabled) {
                setPickerOpen(true);
                inputRef?.current?.focus?.();
            }
        }

        window.addEventListener("chatapp-shortcut", handleShortcut);
        return () => window.removeEventListener("chatapp-shortcut", handleShortcut);
    }, [disabled, inputRef, shortcutScope, tools]);

    async function handleFileChange(event) {
        const [file] = Array.from(event.target.files || []);
        event.target.value = "";

        if (!file) {
            return;
        }

        try {
            if (typeof onPickFile === "function") {
                await onPickFile(file);
            } else {
                const markdown = await fileToComposerMarkdown(file);
                const prefix = value && !/\s$/.test(value) ? "\n" : "";
                const suffix = file.type?.startsWith("image/") ? "\n" : " ";
                insertSnippet(`${prefix}${markdown}${suffix}`);
            }
        } catch (attachmentError) {
            setError(String(attachmentError?.message || attachmentError || "Could not attach that file."));
        }
    }

    return (
        <div className={`composer-tools ${className}`.trim()}>
            <div className="composer-tools-row">
                {tools.includes("emoji") ? (
                    <button
                        type="button"
                        className={`composer-tool-button ${iconOnly ? "is-icon-only" : ""} ${pickerOpen ? "is-open" : ""}`.trim()}
                        onClick={() => setPickerOpen(true)}
                        disabled={disabled}
                        aria-label="Open emoji picker"
                        title="Open emoji picker"
                    >
                        <span className="composer-tool-emoji-icon-shell">
                            <span className={`composer-tool-emoji-icon ${iconOnly ? "is-rotating" : ""}`}>{emojiIcon}</span>
                        </span>
                        {!iconOnly ? <span>Emoji</span> : null}
                    </button>
                ) : null}
                {tools.includes("file") ? (
                    <button
                        type="button"
                        className={`composer-tool-button ${iconOnly ? "is-icon-only" : ""}`.trim()}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={disabled}
                        aria-label="Attach file"
                        title="Attach file"
                    >
                        <span className="composer-tool-file-icon">📎</span>
                        {!iconOnly ? <span>File</span> : null}
                    </button>
                ) : null}
                <input
                    ref={fileInputRef}
                    type="file"
                    className="composer-tools-file-input"
                    onChange={handleFileChange}
                    tabIndex={-1}
                />
            </div>

            {error ? <p className="composer-tools-error">{error}</p> : null}

            {pickerOpen ? (
                <div className="message-reaction-picker-overlay">
                    <button
                        type="button"
                        className="message-reaction-picker-backdrop"
                        aria-label="Close emoji picker"
                        onClick={() => setPickerOpen(false)}
                    />
                    <div className="message-reaction-picker composer-emoji-picker">
                        <div ref={pickerHostRef} className="message-reaction-picker-host" />
                    </div>
                </div>
            ) : null}
        </div>
    );
}
