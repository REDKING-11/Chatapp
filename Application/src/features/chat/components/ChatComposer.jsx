export default function ChatComposer({
    input,
    onInputChange,
    onSend,
    sending,
    replyTo,
    editingMessageId
}) {
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

    return (
        <div className="chat-input-row">
            <input
                className="chat-input"
                type="text"
                value={input}
                placeholder={placeholder}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && input.trim()) {
                        onSend();
                    }
                }}
            />
            <button className="chat-send-button" onClick={onSend} disabled={sending}>
                {buttonText}
            </button>
        </div>
    );
}