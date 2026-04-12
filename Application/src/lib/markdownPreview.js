export function detectMarkdownSyntax(value) {
    const text = String(value || "");

    if (!text.trim()) {
        return false;
    }

    return [
        /(^|\n)\s{0,3}#{1,6}\s+\S+/,
        /(^|\n)\s*([-*+]|\d+\.)\s+\S+/,
        /(^|\n)\s*>\s+\S+/,
        /`[^`\n]+`/,
        /```[\s\S]*```/,
        /\*\*[^*\n]+\*\*/,
        /__[^_\n]+__/,
        /(^|[^\*])\*[^*\n]+\*(?!\*)/,
        /(^|[^_])_[^_\n]+_(?!_)/,
        /~~[^~\n]+~~/,
        /!\[[^\]]*\]\([^)]+\)/,
        /\[[^\]]+\]\([^)]+\)/,
        /(^|\n)\s*\|.+\|/,
        /(^|\n)\s*[-*_]\s*\[[ xX]\]\s+/,
        /(^|\n)\s*---+\s*($|\n)/
    ].some((pattern) => pattern.test(text));
}
