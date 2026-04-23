import { useEffect, useRef, useState } from "react";
import { DISAPPEARING_MESSAGE_OPTIONS, RELAY_RETENTION_OPTIONS } from "../../dm/actions";
import { fetchUserDmDevices } from "../../dm/actions";
import { getStoredAuthToken } from "../../session/actions";

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
    currentUser,
    selectedFriend,
    effectiveSelectedFriend,
    clientSettings,
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
    onDisappearingAccept,
    onIgnoreVerificationDevice
}) {
    const [verification, setVerification] = useState(null);
    const [verificationLoading, setVerificationLoading] = useState(false);
    const [verificationError, setVerificationError] = useState("");
    const [verificationActionId, setVerificationActionId] = useState("");

    useEffect(() => {
        let cancelled = false;

        async function loadVerification() {
            if (!window.secureDm || !currentUser?.id || !effectiveSelectedFriend?.conversationId || !selectedFriend?.friendUserId) {
                setVerification(null);
                setVerificationError("");
                return;
            }

            const token = getStoredAuthToken();
            if (!token) {
                setVerification(null);
                setVerificationError("");
                return;
            }

            try {
                setVerificationLoading(true);
                setVerificationError("");
                const data = await fetchUserDmDevices({
                    token,
                    userId: selectedFriend.friendUserId
                });
                const nextVerification = await window.secureDm.getConversationVerification({
                    userId: currentUser.id,
                    username: currentUser.username,
                    conversationId: effectiveSelectedFriend.conversationId,
                    remoteUsername: selectedFriend.friendUsername,
                    remoteDevices: data.devices || []
                });

                if (!cancelled) {
                    setVerification(nextVerification);
                }
            } catch (error) {
                if (!cancelled) {
                    setVerification(null);
                    setVerificationError(String(error?.message || error || "Could not load safety details."));
                }
            } finally {
                if (!cancelled) {
                    setVerificationLoading(false);
                }
            }
        }

        loadVerification();

        return () => {
            cancelled = true;
        };
    }, [
        currentUser?.id,
        currentUser?.username,
        effectiveSelectedFriend?.conversationId,
        selectedFriend?.friendUserId,
        selectedFriend?.friendUsername
    ]);

    async function handleToggleDeviceVerification(deviceId, nextVerified) {
        if (!window.secureDm || !effectiveSelectedFriend?.conversationId) {
            return;
        }

        try {
            setVerificationActionId(String(deviceId));
            const result = await window.secureDm.setConversationDeviceVerified({
                userId: currentUser.id,
                username: currentUser.username,
                conversationId: effectiveSelectedFriend.conversationId,
                deviceId,
                verified: nextVerified
            });

            setVerification((prev) => (
                prev
                    ? {
                        ...prev,
                        remoteDevices: (prev.remoteDevices || []).map((device) => (
                            String(device.deviceId) === String(deviceId)
                                ? {
                                    ...device,
                                    isVerified: Boolean(result.verified),
                                    verifiedAt: result.verifiedAt || null
                                }
                                : device
                        ))
                    }
                    : prev
            ));
        } catch (error) {
            setVerificationError(String(error?.message || error || "Could not update verification."));
        } finally {
            setVerificationActionId("");
        }
    }

    function handleDoNotVerify(deviceId) {
        if (!selectedFriend?.friendUserId || !deviceId) {
            return;
        }

        onIgnoreVerificationDevice?.(selectedFriend.friendUserId, deviceId);
        setVerification((prev) => (
            prev
                ? {
                    ...prev,
                    remoteDevices: (prev.remoteDevices || []).filter((device) => String(device.deviceId) !== String(deviceId))
                }
                : prev
        ));
    }

    if (!selectedFriend) {
        return null;
    }

    const ignoredVerificationDeviceIds = Array.isArray(clientSettings?.ignoredVerificationDevicesByFriend?.[String(selectedFriend.friendUserId)])
        ? clientSettings.ignoredVerificationDevicesByFriend[String(selectedFriend.friendUserId)].map((deviceId) => String(deviceId))
        : [];
    const visibleRemoteDevices = (verification?.remoteDevices || []).filter(
        (device) => !ignoredVerificationDeviceIds.includes(String(device.deviceId))
    );
    const hiddenRemoteDeviceCount = Math.max(0, (verification?.remoteDevices || []).length - visibleRemoteDevices.length);

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

                <div className="friends-retention-copy friends-verification-copy">
                    <strong>Device verification</strong>
                    <span>Compare this safety number with {selectedFriend.friendUsername} on another channel.</span>
                </div>

                <div className="friends-verification-panel">
                    {verificationLoading ? (
                        <small className="friends-retention-note">Loading safety details...</small>
                    ) : verification ? (
                        <>
                            <div className="friends-safety-number-card">
                                <span className="friends-safety-number-label">Safety number</span>
                                <code>{verification.safetyNumber}</code>
                            </div>

                            <div className="friends-verification-device-list">
                                <div className="friends-verification-device friends-verification-device-local">
                                    <div className="friends-verification-device-local-meta">
                                        <strong>This device</strong>
                                        <span>{verification.localDevice?.deviceName || "Current device"}</span>
                                    </div>
                                    <code>{verification.localDevice?.fingerprint || "Unavailable"}</code>
                                </div>

                                {visibleRemoteDevices.map((device) => (
                                    <div key={device.deviceId} className="friends-verification-device">
                                        <div className="friends-verification-device-meta">
                                            <div>
                                                <strong>{device.deviceName || "Friend device"}</strong>
                                                <span>
                                                    {device.isVerified
                                                        ? `Verified${device.verifiedAt ? ` on ${new Date(device.verifiedAt).toLocaleDateString()}` : ""}`
                                                        : "Not verified"}
                                                </span>
                                            </div>

                                            <div className="friends-verification-device-actions">
                                                <button
                                                    type="button"
                                                    disabled={verificationActionId === String(device.deviceId)}
                                                    onClick={() => handleToggleDeviceVerification(device.deviceId, !device.isVerified)}
                                                >
                                                    {device.isVerified ? "Unverify" : "Mark verified"}
                                                </button>

                                                <button
                                                    type="button"
                                                    className="friends-secondary-button"
                                                    disabled={verificationActionId === String(device.deviceId)}
                                                    onClick={() => handleDoNotVerify(device.deviceId)}
                                                >
                                                    Do not verify
                                                </button>
                                            </div>
                                        </div>

                                        <code>{device.fingerprint}</code>
                                    </div>
                                ))}
                            </div>

                            {hiddenRemoteDeviceCount > 0 ? (
                                <small className="friends-retention-note">
                                    Hidden from verification list: {hiddenRemoteDeviceCount}
                                </small>
                            ) : null}
                        </>
                    ) : (
                        <small className="friends-retention-note">
                            Open an encrypted conversation first to compare device fingerprints.
                        </small>
                    )}

                    {verificationError ? (
                        <small className="friends-retention-note">{verificationError}</small>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
