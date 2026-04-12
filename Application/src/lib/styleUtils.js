export function parseStyleString(styleText) {
    if (!styleText || typeof styleText !== "string") return {};

    return styleText
        .split(";")
        .map((rule) => rule.trim())
        .filter(Boolean)
        .reduce((acc, rule) => {
            const colonIndex = rule.indexOf(":");
            if (colonIndex === -1) return acc;

            const rawKey = rule.slice(0, colonIndex).trim();
            const rawValue = rule.slice(colonIndex + 1).trim();

            if (!rawKey || !rawValue) return acc;

            const jsKey = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            acc[jsKey] = rawValue;
            return acc;
        }, {});
}
