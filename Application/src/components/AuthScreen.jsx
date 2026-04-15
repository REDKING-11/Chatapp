import { useState } from "react";
import { completeMfaLogin, submitAuth } from "../features/auth/actions";
import { formatAppError } from "../lib/debug";

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

function validateAuthSubmission({ mode, username, password, totpCode, isMfaStep }) {
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

        if (String(password || "").length < 4) {
            return "Password must be at least 4 characters.";
        }
    }

    return "";
}

function formatAuthSubmitError(error, { isMfaStep, mode }) {
    const rawMessage = String(error?.userMessage || error?.message || error || "").trim();

    if (/username|password|taken|already|required|authentication code|challenge expired|name#1234|invalid username or password/i.test(rawMessage)) {
        return rawMessage;
    }

    return formatAppError(error, {
        fallbackMessage: isMfaStep
            ? "Could not verify your sign-in code right now."
            : mode === "register"
                ? "Could not create your account right now."
                : "Could not sign you in right now.",
        context: "Auth"
    }).message;
}

export default function AuthScreen({ onAuthSuccess }) {
    const [mode, setMode] = useState("login");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [totpCode, setTotpCode] = useState("");
    const [mfaChallenge, setMfaChallenge] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const isMfaStep = Boolean(mfaChallenge);

    function resetTransientState() {
        setError("");
    }

    function handleUsernameChange(event) {
        setUsername(event.target.value);
        resetTransientState();
    }

    function handlePasswordChange(event) {
        setPassword(event.target.value);
        resetTransientState();
    }

    function handleTotpCodeChange(event) {
        setTotpCode(event.target.value.replace(/\D+/g, "").slice(0, 6));
        resetTransientState();
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");

        const validationError = validateAuthSubmission({
            mode,
            username,
            password,
            totpCode,
            isMfaStep
        });

        if (validationError) {
            setError(validationError);
            return;
        }

        setLoading(true);

        try {
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
                    email: "",
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
            setError(formatAuthSubmitError(err, { isMfaStep, mode }));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-screen">
            <div className="auth-card">
                <div className="auth-header">
                    <h1>{isMfaStep ? "Two-step verification" : mode === "login" ? "Login" : "Register"}</h1>
                    <p>
                        {isMfaStep
                            ? "Finish signing in with the 6-digit code from your authenticator app."
                            : mode === "login"
                                ? "Sign in to Chatapp on this device."
                                : "Create your account and then sign in on this device."}
                    </p>
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

                    {mode === "register" && (
                        <p className="auth-muted-note">
                            Email and phone registration are temporarily disabled.
                        </p>
                    )}

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

                    {mode === "register" && !isMfaStep ? (
                        <p className="auth-muted-note">
                            Usernames must be 3 to 24 characters. Passwords must be at least 4 characters.
                        </p>
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

                    {error && <p className="auth-error">{error}</p>}

                    <button type="submit" disabled={loading || (isMfaStep && totpCode.length !== 6)}>
                        {loading
                            ? "Please wait..."
                            : isMfaStep
                                ? "Verify code"
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

                <button
                    type="button"
                    className="auth-switch"
                    disabled={loading}
                    onClick={() => {
                        setMode(mode === "login" ? "register" : "login");
                        setMfaChallenge(null);
                        setTotpCode("");
                        setError("");
                    }}
                >
                    {mode === "login"
                        ? "Need an account? Register"
                        : "Already have an account? Login"}
                </button>
            </div>
        </div>
    );
}
