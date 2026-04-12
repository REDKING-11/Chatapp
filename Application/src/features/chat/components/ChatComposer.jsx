import { useEffect, useMemo, useRef, useState } from "react";
import ComposerTools from "../../../components/ComposerTools";
import ComposerEntitySuggestions from "../../../components/ComposerEntitySuggestions";
import MarkdownPreview from "../../../components/MarkdownPreview";
import { applyComposerEntitySuggestion, getComposerEntitySuggestions } from "../../../lib/composerEntities";

export default function ChatComposer({
    input,
    onInputChange,
    onSend,
    sending,
    replyTo,
    editingMessageId,
    shortcutScope = "chat",
    openFileSignal = 0,
    linkContext = null
}) {
    const inputRef = useRef(null);
    const [cursorPosition, setCursorPosition] = useState(0);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
    const placeholder = editingMessageId
        ? "Edit message..."
        : replyTo
            ? "Write reply..."
            : "Type a message...";

    const buttonText = sending
        ? editingMessageId
            ? "Saving..."
            : "Sending..."
        : editingMessageId
            ? "Save"
            : "Send";
    const entitySuggestions = useMemo(
        () => getComposerEntitySuggestions(input, cursorPosition, linkContext),
        [cursorPosition, input, linkContext]
    );

    useEffect(() => {
        setActiveSuggestionIndex(0);
    }, [entitySuggestions?.token, entitySuggestions?.items?.length]);

    useEffect(() => {
        function handleShortcut(event) {
            const action = event.detail?.action;
            const scope = event.detail?.scope;

            if (scope && scope !== shortcutScope) {
                return;
            }

            if (action === "focusComposer") {
                inputRef.current?.focus();
            }

            if (action === "editLastMessage" && !input.trim()) {
                inputRef.current?.focus();
            }
        }

        window.addEventListener("chatapp-shortcut", handleShortcut);
        return () => window.removeEventListener("chatapp-shortcut", handleShortcut);
    }, [input, shortcutScope]);

    return (
        <div className="chat-composer-stack">
            <MarkdownPreview value={input} label="Message preview" linkContext={linkContext} />
            <div className="chat-compose-row">
                <ComposerTools
                    value={input}
                    onChange={onInputChange}
                    inputRef={inputRef}
                    disabled={sending}
                    tools={["file"]}
                    iconOnly
                    className="composer-tools-left"
                    shortcutScope={shortcutScope}
                    openFileSignal={openFileSignal}
                />

                <div className="chat-input-shell">
                    <ComposerEntitySuggestions
                        suggestions={entitySuggestions}
                        activeIndex={activeSuggestionIndex}
                        onSelect={(item) => {
                            const next = applyComposerEntitySuggestion({
                                value: input,
                                selectionStart: inputRef.current?.selectionStart ?? cursorPosition,
                                selectionEnd: inputRef.current?.selectionEnd ?? cursorPosition,
                                suggestion: item,
                                tokenRange: entitySuggestions
                            });
                            onInputChange(next.value);
                            window.requestAnimationFrame(() => {
                                inputRef.current?.focus();
                                inputRef.current?.setSelectionRange(next.cursorPosition, next.cursorPosition);
                                setCursorPosition(next.cursorPosition);
                            });
                        }}
                    />
                    <input
                        ref={inputRef}
                        className="chat-input"
                        type="text"
                        value={input}
                        placeholder={placeholder}
                        onChange={(e) => {
                            onInputChange(e.target.value);
                            setCursorPosition(e.target.selectionStart ?? e.target.value.length);
                        }}
                        onClick={(e) => setCursorPosition(e.currentTarget.selectionStart ?? 0)}
                        onKeyUp={(e) => setCursorPosition(e.currentTarget.selectionStart ?? 0)}
                        onKeyDown={(e) => {
                            if (entitySuggestions?.items?.length) {
                                if (e.key === "ArrowDown") {
                                    e.preventDefault();
                                    setActiveSuggestionIndex((prev) => (prev + 1) % entitySuggestions.items.length);
                                    return;
                                }

                                if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    setActiveSuggestionIndex((prev) => (prev - 1 + entitySuggestions.items.length) % entitySuggestions.items.length);
                                    return;
                                }

                                if (e.key === "Tab" || e.key === "Enter") {
                                    e.preventDefault();
                                    const item = entitySuggestions.items[activeSuggestionIndex] || entitySuggestions.items[0];
                                    if (item) {
                                        const next = applyComposerEntitySuggestion({
                                            value: input,
                                            selectionStart: e.currentTarget.selectionStart ?? cursorPosition,
                                            selectionEnd: e.currentTarget.selectionEnd ?? cursorPosition,
                                            suggestion: item,
                                            tokenRange: entitySuggestions
                                        });
                                        onInputChange(next.value);
                                        window.requestAnimationFrame(() => {
                                            inputRef.current?.focus();
                                            inputRef.current?.setSelectionRange(next.cursorPosition, next.cursorPosition);
                                            setCursorPosition(next.cursorPosition);
                                        });
                                    }
                                    return;
                                }
                            }

                            if (e.key === "ArrowUp" && !input.trim()) {
                                window.dispatchEvent(new CustomEvent("chatapp-shortcut", {
                                    detail: {
                                        action: "editLastMessage",
                                        scope: shortcutScope
                                    }
                                }));
                                return;
                            }

                            if ((e.key === "Enter" || (e.ctrlKey && e.key === "Enter")) && input.trim()) {
                                e.preventDefault();
                                onSend();
                            }
                        }}
                    />
                    <ComposerTools
                        value={input}
                        onChange={onInputChange}
                        inputRef={inputRef}
                        disabled={sending}
                        tools={["emoji"]}
                        iconOnly
                        className="composer-tools-inline"
                        shortcutScope={shortcutScope}
                    />
                </div>

                <button className="chat-send-button is-compact" onClick={onSend} disabled={sending}>
                    {buttonText}
                </button>
            </div>
        </div>
    );
}
