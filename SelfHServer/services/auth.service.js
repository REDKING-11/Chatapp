function normalizeCoreApiBase(baseUrl, label = "CORE_API_BASE") {
    let url;

    try {
        url = new URL(String(baseUrl || "").trim());
    } catch {
        throw new Error(`${label} must be a valid https:// URL`);
    }

    if (url.protocol !== "https:") {
        throw new Error(`${label} must use https://`);
    }

    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
}

const configuredCoreApiBase = process.env.CORE_API_BASE
    ? normalizeCoreApiBase(process.env.CORE_API_BASE)
    : null;

const CORE_API_BASES = Array.from(
    new Set(
        [
            configuredCoreApiBase,
            "https://core.localhost",
            "https://56.228.2.7",
            "https://core.samlam24.treok.io"
        ].filter(Boolean)
    )
);

async function verifyUser(req) {
    const auth = req.headers.authorization || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);

    if (!match) return null;

    const token = match[1].trim();
    if (!token) return null;

    for (const baseUrl of CORE_API_BASES) {
        try {
            const res = await fetch(`${baseUrl}/auth/me.php`, {
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
                console.error("verifyUser: invalid JSON from core auth:", baseUrl, raw);
                continue;
            }

            if (!res.ok) {
                console.error("verifyUser failed:", baseUrl, res.status, data);
                continue;
            }

            return data?.user || null;
        } catch (err) {
            console.error("verifyUser request error:", baseUrl, err);
        }
    }

    return null;
}

module.exports = {
    verifyUser,
    CORE_API_BASES
};
