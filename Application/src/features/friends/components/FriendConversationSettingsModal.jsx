import { useEffect, useRef } from "react";
import { DISAPPEARING_MESSAGE_OPTIONS, RELAY_RETENTION_OPTIONS } from "../../dm/actions";

function WheelSelect({ options, value, disabled, onChange, ariaLabel }) {
    const selectRef = useRef(null);
    const selectedIndex = Math.max(0, options.findIndex((option) => option.seconds === value));
    const visibleOffsets = [-1, 0, 1];

    function moveSelection(direction) {
        if (disabled || options.length === 0) {
            return;
        }

        const nextIndex = Math.max(0, Math.min(options.length - 1, selectedIndex + direction));
        const nextValue = options[nextIndex]?.seconds;

        if (nextValue != null && nextValue !== value) {
            onChange(nextValue);
        }
    }

    useEffect(() => {
        const node = selectRef.current;

        if (!node) {
            return undefined;
        }

        function handleWheel(event) {
            event.preventDefault();
            moveSelection(event.deltaY > 0 ? 1 : -1);
        }

        node.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
            node.removeEventListener("wheel", handleWheel);
        };
    }, [selectedIndex, disabled, options, value]);

    return (
        <div
            ref={selectRef}
            className={`friends-wheel-select ${disabled ? "is-disabled" : ""}`.trim()}
            role="listbox"
            aria-label={ariaLabel}
            aria-activedescendant={`${ariaLabel}-${value}`}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                    event.preventDefault();
                    moveSelection(1);
                } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    moveSelection(-1);
                }
            }}
        >
            <div className="friends-wheel-select-viewport">
                <div className="friends-wheel-select-highlight" aria-hidden="true" />
                <div className="friends-wheel-track">
                    {visibleOffsets.map((offset) => {
                        const option = options[selectedIndex + offset] || null;
                        const distance = Math.abs(offset);
                        const toneClass = distance === 0
                            ? "is-active"
                            : distance === 1
                                ? "is-near"
                                : "is-far";

                        if (!option) {
                            return (
                                <div
                                    key={`empty-${offset}`}
                                    className={`friends-wheel-spacer ${toneClass}`.trim()}
                                    aria-hidden="true"
                                />
                            );
                        }

                        return (
                            <div
                                key={option.seconds}
                                id={`${ariaLabel}-${option.seconds}`}
                                role="option"
                                aria-selected={option.seconds === value}
                                className={`friends-wheel-option ${toneClass}`.trim()}
                                aria-disabled={disabled}
                                onClick={() => {
                                    if (!disabled) {
                                        onChange(option.seconds);
                                    }
                                }}
                            >
                                <span>{option.label}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default function FriendConversationSettingsModal({
    selectedFriend,
    effectiveSelectedFriend,
    selectedRelayTtlSeconds,
    selectedDisappearingTtlSeconds,
    relayPolicy,
    disappearingPolicy,
    pendingRelayRequest,
    pendingDisappearingRequest,
    pendingRequestedByFriend,
    pendingDisappearingRequestedByFriend,
    pendingRelayLabel,
    pendingDisappearingLabel,
    currentRelayLabel,
    currentDisappearingLabel,
    submitting,
    onClose,
    onUndoForget,
    onRelayTtlChange,
    onDisappearingTtlChange,
    onRetentionRequest,
    onRetentionAccept,
    onDisappearingRequest,
    onDisappearingAccept
}) {
    if (!selectedFriend) {
        return null;
    }

    return (
        <div className="friends-settings-overlay" onClick={onClose}>
            <div className="friends-settings-popout panel-card" onClick={(event) => event.stopPropagation()}>
                <div className="friends-settings-header">
                    <div>
                        <h2>Conversation settings</h2>
                        <p>Manage relay and disappearing-message behavior for this DM.</p>
                    </div>

                    <button
                        type="button"
                        className="friends-settings-close"
                        onClick={onClose}
                    >
                        x
                    </button>
                </div>

                <div className="friends-retention-copy">
                    <strong>Offline relay window</strong>
                    <span>Current policy: {currentRelayLabel}</span>
                </div>

                {selectedFriend?.conversationId && !effectiveSelectedFriend?.conversationId ? (
                    <div className="friends-retention-pending">
                        <span>This device is set to forget the older conversation and start fresh.</span>
                        <button type="button" onClick={onUndoForget}>Undo</button>
                    </div>
                ) : null}

                <form className="friends-retention-controls" onSubmit={onRetentionRequest}>
                    <WheelSelect
                        options={RELAY_RETENTION_OPTIONS}
                        value={selectedRelayTtlSeconds}
                        onChange={onRelayTtlChange}
                        disabled={submitting}
                        ariaLabel="Offline relay window"
                    />

                    <button
                        type="submit"
                        disabled={
                            submitting ||
                            (effectiveSelectedFriend?.conversationId
                                ? selectedRelayTtlSeconds === (relayPolicy?.currentSeconds ?? 86400) &&
                                  relayPolicy?.pendingSeconds == null
                                : false)
                        }
                    >
                        {effectiveSelectedFriend?.conversationId ? "Request change" : "Use for first DM"}
                    </button>
                </form>

                {pendingRelayRequest ? (
                    <div className="friends-retention-pending">
                        <span>Pending change: {pendingRelayLabel}</span>

                        {pendingRequestedByFriend ? (
                            <button type="button" onClick={onRetentionAccept} disabled={submitting}>
                                Accept change
                            </button>
                        ) : (
                            <small>Waiting for your friend to accept.</small>
                        )}
                    </div>
                ) : (
                    <small className="friends-retention-note">
                        Both people must agree before the offline relay window changes.
                    </small>
                )}

                <div className="friends-retention-copy">
                    <strong>Disappearing messages</strong>
                    <span>Current policy: {currentDisappearingLabel}</span>
                </div>

                <form className="friends-retention-controls" onSubmit={onDisappearingRequest}>
                    <WheelSelect
                        options={DISAPPEARING_MESSAGE_OPTIONS}
                        value={selectedDisappearingTtlSeconds}
                        onChange={onDisappearingTtlChange}
                        disabled={submitting}
                        ariaLabel="Disappearing messages"
                    />

                    <button
                        type="submit"
                        disabled={
                            submitting ||
                            (effectiveSelectedFriend?.conversationId
                                ? selectedDisappearingTtlSeconds === (disappearingPolicy?.currentSeconds ?? 0) &&
                                  disappearingPolicy?.pendingSeconds == null
                                : false)
                        }
                    >
                        {effectiveSelectedFriend?.conversationId ? "Request change" : "Use for first DM"}
                    </button>
                </form>

                {pendingDisappearingRequest ? (
                    <div className="friends-retention-pending">
                        <span>Pending change: {pendingDisappearingLabel}</span>

                        {pendingDisappearingRequestedByFriend ? (
                            <button type="button" onClick={onDisappearingAccept} disabled={submitting}>
                                Accept change
                            </button>
                        ) : (
                            <small>Waiting for your friend to accept.</small>
                        )}
                    </div>
                ) : (
                    <small className="friends-retention-note">
                        Both people must agree before disappearing-message timers change.
                    </small>
                )}
            </div>
        </div>
    );
}
