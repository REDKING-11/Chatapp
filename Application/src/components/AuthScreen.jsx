import { useEffect, useMemo, useState } from "react";
import {
    checkCoreApiAvailability,
    completeMfaLogin,
    confirmPasswordReset,
    requestPasswordReset,
    submitAuth
} from "../features/auth/actions";
import { isApiNetworkUnavailableError } from "../lib/api";
import { formatAppError } from "../lib/debug";

const RESET_METHOD_OPTIONS = [
    { id: "email", label: "Email code" },
    { id: "mfa", label: "Authenticator" },
    { id: "recoveryKey", label: "Recovery key" }
];

function validateRegistrationUsername(username) {
    const trimmed = String(username || "").trim();

    if (!trimmed) {
        return "Username and password are required.";
    }

    const taggedMatch = trimmed.match(/^(.*)#(\d{1,4})$/);
    if (trimmed.includes("#") && !taggedMatch) {
        return "Username tags must look like name#1234.";
    }

    const usernameBase = taggedMatch
        ? taggedMatch[1].trim().replace(/\s+/g, " ")
        : trimmed.replace(/\s+/g, " ");

    if (usernameBase.length < 3) {
        return "Username must be at least 3 characters.";
    }

    if (!/^[A-Za-z0-9 _.-]{3,24}$/.test(usernameBase)) {
        return "Username can only use letters, numbers, spaces, ., _, and - and must be 3 to 24 characters.";
    }

    return "";
}

function validateEmailAddress(email) {
    if (!String(email || "").trim()) {
        return "";
    }

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())
        ? ""
        : "Enter a valid email address or leave it blank.";
}

function validateAuthSubmission({ mode, username, password, email, totpCode, isMfaStep }) {
    if (isMfaStep) {
        if (String(totpCode || "").trim().length !== 6) {
            return "Enter the 6-digit code from your authenticator app.";
        }

        return "";
    }

    if (!String(username || "").trim() || !String(password || "")) {
        return "Username and password are required.";
    }

    if (mode === "register") {
        const usernameValidationError = validateRegistrationUsername(username);
        if (usernameValidationError) {
            return usernameValidationError;
        }

        const emailValidationError = validateEmailAddress(email);
        if (emailValidationError) {
            return emailValidationError;
        }

        if (String(password || "").length < 4) {
            return "Password must be at least 4 characters.";
        }
    }

    return "";
}

function validatePasswordResetSubmission({
    username,
    resetMethod,
    resetCode,
    newPassword,
    confirmPassword,
    emailCodeRequested
}) {
    if (!String(username || "").trim()) {
        return "Username or handle is required.";
    }

    if (resetMethod === "email" && !emailCodeRequested) {
        return "Send an email reset code first.";
    }

    if (resetMethod === "recoveryKey") {
        if (!String(resetCode || "").trim()) {
            return "Enter one of your recovery keys.";
        }
    } else if (String(resetCode || "").trim().length !== 6) {
        return resetMethod === "mfa"
            ? "Enter the 6-digit code from your authenticator app."
            : "Enter the 6-digit reset code from your email.";
    }

    if (String(newPassword || "").length < 4) {
        return "Password must be at least 4 characters.";
    }

    if (String(newPassword || "") !== String(confirmPassword || "")) {
        return "New passwords do not match.";
    }

    return "";
}

function formatAuthSubmitError(error, { isMfaStep, isResetStep, mode }) {
    const rawMessage = String(error?.userMessage || error?.message || error || "").trim();

    if (/username|password|taken|already|required|authentication code|challenge expired|verification code|recovery key|name#1234|invalid username or password|valid email/i.test(rawMessage)) {
        return rawMessage;
    }

    return formatAppError(error, {
        fallbackMessage: isResetStep
            ? "Could not finish that password reset right now."
            : isMfaStep
                ? "Could not verify your sign-in code right now."
                : mode === "register"
                    ? "Could not create your account right now."
                    : "Could not sign you in right now.",
        context: "Auth"
    }).message;
}

function getEndpointOrigin(endpoint) {
    try {
        return new URL(String(endpoint || "")).origin;
    } catch {
        return "the backend";
    }
}

function createBackendStatus(result) {
    const origin = getEndpointOrigin(result?.endpoint);

    if (Number(result?.status) >= 500) {
        return {
            state: "degraded",
            title: "Backend answered with an error",
            message: `${origin} is reachable, but it returned a server error.`
        };
    }

    if (!result?.ok) {
        return {
            state: "offline",
            title: "Backend unavailable",
            message: `Chatapp could not reach ${origin}. Login and recovery need that server to answer first.`
        };
    }

    return {
        state: "online",
        title: "Backend reachable",
        message: `${origin} is answering auth requests.`
    };
}

export default function AuthScreen({ onAuthSuccess, noticeMessage = "" }) {
    const [mode, setMode] = useState("login");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [email, setEmail] = useState("");
    const [totpCode, setTotpCode] = useState("");
    const [mfaChallenge, setMfaChallenge] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [localNotice, setLocalNotice] = useState("");
    const [showPasswordReset, setShowPasswordReset] = useState(false);
    const [resetMethod, setResetMethod] = useState("email");
    const [resetCode, setResetCode] = useState("");
    const [resetPassword, setResetPassword] = useState("");
    const [resetConfirmPassword, setResetConfirmPassword] = useState("");
    const [emailCodeRequested, setEmailCodeRequested] = useState(false);
    const [backendStatus, setBackendStatus] = useState({
        state: "checking",
        title: "Checking backend",
        message: "Looking for the auth server..."
    });
    const isMfaStep = Boolean(mfaChallenge);
    const isResetStep = showPasswordReset && !isMfaStep;
    const activeNotice = showPasswordReset ? localNotice : (localNotice || noticeMessage);
    const resetCodeLabel = useMemo(() => {
        if (resetMethod === "mfa") {
            return "Authenticator code";
        }

        if (resetMethod === "recoveryKey") {
            return "Recovery key";
        }

        return "Email reset code";
    }, [resetMethod]);

    async function refreshBackendStatus() {
        setBackendStatus({
            state: "checking",
            title: "Checking backend",
            message: "Looking for the auth server..."
        });

        const result = await checkCoreApiAvailability();
        const nextStatus = createBackendStatus(result);

        setBackendStatus(nextStatus);
        return nextStatus;
    }

    useEffect(() => {
        let cancelled = false;

        async function checkBackend() {
            const result = await checkCoreApiAvailability();

            if (!cancelled) {
                setBackendStatus(createBackendStatus(result));
            }
        }

        checkBackend();

        return () => {
            cancelled = true;
        };
    }, []);

    function resetTransientState() {
        setError("");
    }

    function resetPasswordResetState({ preserveNotice = false } = {}) {
        setResetMethod("email");
        setResetCode("");
        setResetPassword("");
        setResetConfirmPassword("");
        setEmailCodeRequested(false);
        if (!preserveNotice) {
            setLocalNotice("");
        }
    }

    function handleUsernameChange(event) {
        setUsername(event.target.value);
        resetTransientState();
    }

    function handlePasswordChange(event) {
        setPassword(event.target.value);
        resetTransientState();
    }

    function handleEmailChange(event) {
        setEmail(event.target.value);
        resetTransientState();
    }

    function handleTotpCodeChange(event) {
        setTotpCode(event.target.value.replace(/\D+/g, "").slice(0, 6));
        resetTransientState();
    }

    function handleResetCodeChange(event) {
        const rawValue = event.target.value;
        setResetCode(resetMethod === "recoveryKey" ? rawValue.toUpperCase() : rawValue.replace(/\D+/g, "").slice(0, 6));
        resetTransientState();
    }

    function handleResetModeOpen() {
        setShowPasswordReset(true);
        setMfaChallenge(null);
        setTotpCode("");
        setPassword("");
        setError("");
        setLocalNotice("");
        resetPasswordResetState();
    }

    function handleResetModeClose() {
        setShowPasswordReset(false);
        setError("");
        setLocalNotice("");
        resetPasswordResetState();
    }

    async function ensureBackendAvailable() {
        if (backendStatus.state !== "offline" && backendStatus.state !== "degraded") {
            return true;
        }

        const nextStatus = await refreshBackendStatus();
        return nextStatus.state !== "offline" && nextStatus.state !== "degraded";
    }

    async function handleRequestEmailResetCode() {
        setError("");
        setLocalNotice("");

        if (!String(username || "").trim()) {
            setError("Username or handle is required.");
            return;
        }

        setLoading(true);

        try {
            if (!(await ensureBackendAvailable())) {
                setError(createBackendStatus({
                    ok: false,
                    endpoint: backendStatus?.endpoint
                }).message);
                return;
            }

            await requestPasswordReset({ username });
            setEmailCodeRequested(true);
            setLocalNotice("If that account has a verified recovery email, a reset code is on its way.");
        } catch (err) {
            if (isApiNetworkUnavailableError(err)) {
                const nextStatus = createBackendStatus({
                    ok: false,
                    endpoint: err?.endpoint || err?.requestUrl,
                    error: err
                });
                setBackendStatus(nextStatus);
                setError(nextStatus.message);
                return;
            }

            setError(formatAuthSubmitError(err, { isMfaStep: false, isResetStep: true, mode }));
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setError("");

        if (isResetStep) {
            const validationError = validatePasswordResetSubmission({
                username,
                resetMethod,
                resetCode,
                newPassword: resetPassword,
                confirmPassword: resetConfirmPassword,
                emailCodeRequested
            });

            if (validationError) {
                setError(validationError);
                return;
            }
        } else {
            const validationError = validateAuthSubmission({
                mode,
                username,
                password,
                email,
                totpCode,
                isMfaStep
            });

            if (validationError) {
                setError(validationError);
                return;
            }
        }

        setLoading(true);

        try {
            if (!(await ensureBackendAvailable())) {
                setError(backendStatus.message);
                return;
            }

            if (isResetStep) {
                await confirmPasswordReset({
                    username,
                    method: resetMethod,
                    code: resetCode,
                    newPassword: resetPassword
                });
                setMode("login");
                setShowPasswordReset(false);
                setPassword("");
                setError("");
                setLocalNotice("Password reset complete. Sign in with your new password.");
                resetPasswordResetState({ preserveNotice: true });
                return;
            }

            const data = mfaChallenge
                ? await completeMfaLogin({
                    username,
                    password,
                    challengeId: mfaChallenge.challengeId,
                    totpCode
                })
                : await submitAuth({
                    mode,
                    username,
                    password,
                    email,
                    phone: ""
                });

            if (data?.mfaRequired) {
                setMfaChallenge({
                    challengeId: data.challengeId,
                    expiresAt: data.expiresAt
                });
                setTotpCode("");
                return;
            }

            onAuthSuccess(data.user, data.token);
        } catch (err) {
            if (isApiNetworkUnavailableError(err)) {
                const nextStatus = createBackendStatus({
                    ok: false,
                    endpoint: err?.endpoint || err?.requestUrl,
                    error: err
                });
                setBackendStatus(nextStatus);
                setError(nextStatus.message);
                return;
            }

            if (Number(err?.status) >= 500) {
                const nextStatus = {
                    state: "degraded",
                    title: "Backend answered with an error",
                    message: "The backend is reachable, but auth is failing on the server side right now."
                };
                setBackendStatus(nextStatus);
                setError(nextStatus.message);
                return;
            }

            setError(formatAuthSubmitError(err, { isMfaStep, isResetStep, mode }));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-screen">
            <div className="auth-card">
                <div className="auth-header">
                    <h1>
                        {isMfaStep
                            ? "Two-step verification"
                            : isResetStep
                                ? "Reset password"
                                : mode === "login"
                                    ? "Login"
                                    : "Register"}
                    </h1>
                    <p>
                        {isMfaStep
                            ? "Finish signing in with the 6-digit code from your authenticator app."
                            : isResetStep
                                ? "Recover access with a verified email code, your authenticator, or a one-time recovery key."
                                : mode === "login"
                                    ? "Sign in to Chatapp on this device."
                                    : "Create your account and then sign in on this device."}
                    </p>
                </div>

                <div className={`auth-status-banner is-${backendStatus.state}`} role="status">
                    <span className="auth-status-dot" aria-hidden="true" />
                    <div>
                        <strong>{backendStatus.title}</strong>
                        <span>{backendStatus.message}</span>
                    </div>
                    {(backendStatus.state === "offline" || backendStatus.state === "degraded") ? (
                        <button
                            type="button"
                            onClick={refreshBackendStatus}
                            disabled={loading || backendStatus.state === "checking"}
                        >
                            Retry
                        </button>
                    ) : null}
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    <label className="auth-field">
                        <span>Username or handle</span>
                        <input
                            type="text"
                            placeholder="name or name#1234"
                            value={username}
                            onChange={handleUsernameChange}
                            required
                            disabled={isMfaStep}
                            autoComplete="username"
                        />
                    </label>

                    {mode === "register" && !isMfaStep && !isResetStep ? (
                        <label className="auth-field">
                            <span>Recovery email (optional)</span>
                            <input
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={handleEmailChange}
                                autoComplete="email"
                            />
                        </label>
                    ) : null}

                    {!isResetStep ? (
                        <label className="auth-field">
                            <span>Password</span>
                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={handlePasswordChange}
                                required
                                disabled={isMfaStep}
                                autoComplete={mode === "login" ? "current-password" : "new-password"}
                            />
                        </label>
                    ) : null}

                    {mode === "register" && !isMfaStep && !isResetStep ? (
                        <>
                            <p className="auth-muted-note">
                                Email stays optional, but only a verified address can be used for self-service password reset later.
                            </p>
                            <p className="auth-muted-note">
                                Usernames must be 3 to 24 characters. Passwords must be at least 4 characters.
                            </p>
                        </>
                    ) : null}

                    {isMfaStep ? (
                        <label className="auth-field">
                            <span>Authenticator code</span>
                            <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                placeholder="123456"
                                value={totpCode}
                                onChange={handleTotpCodeChange}
                                required
                                autoFocus
                            />
                        </label>
                    ) : null}

                    {isResetStep ? (
                        <>
                            <div className="auth-choice-row" role="tablist" aria-label="Password reset methods">
                                {RESET_METHOD_OPTIONS.map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        className={`auth-choice-button ${resetMethod === option.id ? "is-active" : ""}`.trim()}
                                        onClick={() => {
                                            setResetMethod(option.id);
                                            setResetCode("");
                                            setError("");
                                        }}
                                        aria-pressed={resetMethod === option.id}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>

                            {resetMethod === "email" ? (
                                <div className="auth-inline-actions">
                                    <button
                                        type="button"
                                        className="secondary"
                                        disabled={loading}
                                        onClick={handleRequestEmailResetCode}
                                    >
                                        {loading && !emailCodeRequested ? "Sending..." : "Send email code"}
                                    </button>
                                    <span className="auth-muted-note">
                                        We only send reset codes to verified recovery emails.
                                    </span>
                                </div>
                            ) : null}

                            <label className="auth-field">
                                <span>{resetCodeLabel}</span>
                                <input
                                    type="text"
                                    inputMode={resetMethod === "recoveryKey" ? "text" : "numeric"}
                                    autoComplete={resetMethod === "recoveryKey" ? "off" : "one-time-code"}
                                    placeholder={resetMethod === "recoveryKey" ? "XXXX-XXXX-XXXX" : "123456"}
                                    value={resetCode}
                                    onChange={handleResetCodeChange}
                                />
                            </label>

                            <label className="auth-field">
                                <span>New password</span>
                                <input
                                    type="password"
                                    placeholder="New password"
                                    value={resetPassword}
                                    onChange={(event) => {
                                        setResetPassword(event.target.value);
                                        resetTransientState();
                                    }}
                                    autoComplete="new-password"
                                />
                            </label>

                            <label className="auth-field">
                                <span>Confirm new password</span>
                                <input
                                    type="password"
                                    placeholder="Repeat new password"
                                    value={resetConfirmPassword}
                                    onChange={(event) => {
                                        setResetConfirmPassword(event.target.value);
                                        resetTransientState();
                                    }}
                                    autoComplete="new-password"
                                />
                            </label>
                        </>
                    ) : null}

                    {activeNotice ? <p className="auth-muted-note">{activeNotice}</p> : null}
                    {error ? <p className="auth-error">{error}</p> : null}

                    <button
                        type="submit"
                        disabled={
                            loading
                            || (isMfaStep && totpCode.length !== 6)
                        }
                    >
                        {loading
                            ? "Please wait..."
                            : isMfaStep
                                ? "Verify code"
                                : isResetStep
                                    ? "Reset password"
                                    : mode === "login"
                                        ? "Login"
                                        : "Register"}
                    </button>
                </form>

                {isMfaStep ? (
                    <button
                        type="button"
                        className="auth-switch"
                        disabled={loading}
                        onClick={() => {
                            setMfaChallenge(null);
                            setTotpCode("");
                            setError("");
                        }}
                    >
                        Back to password
                    </button>
                ) : null}

                {!isMfaStep && !showPasswordReset ? (
                    <button
                        type="button"
                        className="auth-switch"
                        disabled={loading || mode !== "login"}
                        onClick={handleResetModeOpen}
                    >
                        Forgot password?
                    </button>
                ) : null}

                {!isMfaStep && showPasswordReset ? (
                    <button
                        type="button"
                        className="auth-switch"
                        disabled={loading}
                        onClick={handleResetModeClose}
                    >
                        Back to login
                    </button>
                ) : null}

                {!isMfaStep && !showPasswordReset ? (
                    <button
                        type="button"
                        className="auth-switch"
                        disabled={loading}
                        onClick={() => {
                            setMode(mode === "login" ? "register" : "login");
                            setMfaChallenge(null);
                            setTotpCode("");
                            setEmail("");
                            setError("");
                            setLocalNotice("");
                        }}
                    >
                        {mode === "login"
                            ? "Need an account? Register"
                            : "Already have an account? Login"}
                    </button>
                ) : null}
            </div>
        </div>
    );
}
