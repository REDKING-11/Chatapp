import { useState } from "react";
import { submitAuth } from "../features/auth/actions";

export default function AuthScreen({ onAuthSuccess }) {
    const [mode, setMode] = useState("login");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(e) {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const data = await submitAuth({
                mode,
                username,
                password,
                email,
                phone
            });

            onAuthSuccess(data.user, data.token);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-screen">
            <div className="auth-card">
                <h1>{mode === "login" ? "Login" : "Register"}</h1>

                <form onSubmit={handleSubmit} className="auth-form">
                    <input
                        type="text"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                    />

                    {mode === "register" && (
                        <>
                            <input
                                type="email"
                                placeholder="Email (optional)"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                            <input
                                type="text"
                                placeholder="Phone (optional)"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                            />
                        </>
                    )}

                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />

                    {error && <p className="auth-error">{error}</p>}

                    <button type="submit" disabled={loading}>
                        {loading
                            ? "Please wait..."
                            : mode === "login"
                                ? "Login"
                                : "Register"}
                    </button>
                </form>

                <button
                    className="auth-switch"
                    onClick={() => setMode(mode === "login" ? "register" : "login")}
                >
                    {mode === "login"
                        ? "Need an account? Register"
                        : "Already have an account? Login"}
                </button>
            </div>
        </div>
    );
}