const CORE_API_BASE =
    process.env.CORE_API_BASE ||
    "http://56.228.2.7";

async function verifyUser(req) {
    const auth = req.headers.authorization || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);

    if (!match) return null;

    const token = match[1].trim();
    if (!token) return null;

    try {
        const res = await fetch(`${CORE_API_BASE}/auth/me.php`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json"
            }
        });

        const raw = await res.text();

        let data = null;
        try {
            data = raw ? JSON.parse(raw) : null;
        } catch {
            console.error("verifyUser: invalid JSON from core auth:", raw);
            return null;
        }

        if (!res.ok) {
            console.error("verifyUser failed:", res.status, data);
            return null;
        }

        return data?.user || null;
    } catch (err) {
        console.error("verifyUser request error:", err);
        return null;
    }
}

module.exports = {
    verifyUser,
    CORE_API_BASE
};
