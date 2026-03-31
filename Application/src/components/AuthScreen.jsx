import { useState } from "react";

const CORE_API_BASE = import.meta.env.VITE_CORE_API_BASE;

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
            const endpoint =
                mode === "login"
                    ? `${CORE_API_BASE}/auth/login.php`
                    : `${CORE_API_BASE}/auth/register.php`;

            const body =
                mode === "login"
                    ? { username, password }
                    : { username, password, email, phone };

            const res = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            });

            const raw = await res.text();

            let data;
            try {
                data = JSON.parse(raw);
            } catch {
                throw new Error(`Server returned invalid JSON: ${raw || "[empty response]"}`);
            }

            if (!res.ok) {
                throw new Error(data.error || "Request failed");
            }

            if (mode === "register") {
                const loginRes = await fetch(`${CORE_API_BASE}/auth/login.php`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ username, password })
                });

                const loginRaw = await loginRes.text();

                let loginData;
                try {
                    loginData = JSON.parse(loginRaw);
                } catch {
                    throw new Error(`Auto-login returned invalid JSON: ${loginRaw || "[empty response]"}`);
                }

                if (!loginRes.ok) {
                    throw new Error(loginData.error || "Auto-login failed");
                }

                localStorage.setItem("authToken", loginData.token);
                localStorage.setItem("authUser", JSON.stringify(loginData.user));
                onAuthSuccess(loginData.user, loginData.token);
            } else {
                localStorage.setItem("authToken", data.token);
                localStorage.setItem("authUser", JSON.stringify(data.user));
                onAuthSuccess(data.user, data.token);
            }
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