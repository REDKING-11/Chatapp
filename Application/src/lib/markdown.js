import DOMPurify from "dompurify";
import { marked } from "marked";
import {
    getMarkdownInlineImageMatches,
    parseInlineImageEmbedUri
} from "../features/dm/inlineEmbeds";

function encodePayload(value) {
    return encodeURIComponent(value);
}

function createEnhancedBlock(kind, payload, label) {
    return `<div class="md-enhanced-block md-${kind}" data-md-kind="${kind}" data-md-source="${encodePayload(payload)}"><div class="md-enhanced-fallback">${label}</div></div>`;
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function createSecureDmImagePlaceholder(embedId, alt, size = null) {
    return `<span class="md-secure-dm-image" data-md-kind="secure-dm-image" data-md-source="${encodePayload(JSON.stringify({
        embedId,
        alt: String(alt || "Image"),
        widthPx: Number(size?.widthPx) || 0,
        heightPx: Number(size?.heightPx) || 0
    }))}"></span>`;
}

function rewriteSecureDmMarkdownImages(value) {
    const source = String(value || "");

    return getMarkdownInlineImageMatches(source).reduce((currentValue, match) => {
        const alt = String(match.alt || "");
        const href = String(match.href || "");
        const embedId = parseInlineImageEmbedUri(href);
        const normalizedAlt = String(alt || "").trim() || "Image";
        const normalizedHref = String(href || "").trim();

        if (embedId) {
            return currentValue.replace(match.fullMatch, createSecureDmImagePlaceholder(embedId, normalizedAlt, match.size));
        }

        if (!normalizedHref) {
            return currentValue.replace(match.fullMatch, escapeHtml(normalizedAlt));
        }

        return currentValue.replace(match.fullMatch, `[${normalizedAlt}](${normalizedHref})`);
    }, source);
}

function slugifyHeading(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function createMarkdownRenderer({ allowImages = true, secureDmImageMode = false } = {}) {
    const renderer = new marked.Renderer();
    const defaultCodeRenderer = renderer.code.bind(renderer);
    const defaultHeadingRenderer = renderer.heading.bind(renderer);
    const defaultImageRenderer = renderer.image.bind(renderer);

    renderer.code = (token) => {
        const lang = String(token.lang || "").trim().toLowerCase();
        const text = String(token.text || "");

        if (lang === "mermaid") {
            return createEnhancedBlock("mermaid", text, "Mermaid diagram");
        }

        if (["chart", "chartjs", "chart-json", "bar", "line", "pie", "doughnut"].includes(lang)) {
            const payload = JSON.stringify({ lang, text });
            return createEnhancedBlock("chart", payload, "Chart");
        }

        return defaultCodeRenderer(token);
    };

    renderer.heading = (token) => {
        const rawText = String(token.text || "");
        const id = slugifyHeading(rawText);
        const html = defaultHeadingRenderer(token);

        if (!id) {
            return html;
        }

        return html.replace(/^<h([1-6])>/, `<h$1 id="${id}">`);
    };

    renderer.image = (token) => {
        const href = String(token?.href || "").trim();
        const alt = String(token?.text || token?.title || "Image").trim() || "Image";
        const secureDmEmbedId = secureDmImageMode ? parseInlineImageEmbedUri(href) : "";

        if (secureDmEmbedId) {
            return createSecureDmImagePlaceholder(secureDmEmbedId, alt);
        }

        if (!allowImages) {
            return href
                ? `<a href="${escapeHtml(href)}">${escapeHtml(alt || href)}</a>`
                : escapeHtml(alt);
        }

        return defaultImageRenderer(token);
    };

    return renderer;
}

function buildAllowedTags({ inline = false, allowImages = true } = {}) {
    const base = [
        "a",
        "abbr",
        "b",
        "blockquote",
        "br",
        "code",
        "del",
        "div",
        "em",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "i",
        "img",
        "input",
        "kbd",
        "li",
        "ol",
        "p",
        "pre",
        "s",
        "span",
        "strong",
        "sub",
        "sup",
        "table",
        "tbody",
        "td",
        "th",
        "thead",
        "tr",
        "ul"
    ];

    const filteredBase = allowImages ? base : base.filter((tag) => tag !== "img");

    if (inline) {
        return filteredBase.filter((tag) => ![
            "blockquote",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "hr",
            "img",
            "input",
            "li",
            "ol",
            "p",
            "pre",
            "table",
            "tbody",
            "td",
            "th",
            "thead",
            "tr",
            "ul"
        ].includes(tag));
    }

    return filteredBase;
}

function normalizeAnchors(container) {
    container.querySelectorAll("a").forEach((anchor) => {
        const href = String(anchor.getAttribute("href") || "");

        if (href.startsWith("#")) {
            return;
        }

        if (href.startsWith("chatapp://")) {
            return;
        }

        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noreferrer noopener");
    });
}

function normalizeImages(container) {
    container.querySelectorAll("img").forEach((image) => {
        image.setAttribute("loading", "lazy");
        image.setAttribute("decoding", "async");
        image.setAttribute("referrerpolicy", "no-referrer");
    });
}

function normalizeTaskListInputs(container) {
    container.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.setAttribute("disabled", "");
        input.setAttribute("readonly", "");
        input.setAttribute("tabindex", "-1");
    });
}

export function renderMarkdownToHtml(value, options = {}) {
    const inline = options.inline === true;
    const allowImages = options.allowImages !== false;
    const secureDmImageMode = options.secureDmImageMode === true;
    const source = secureDmImageMode
        ? rewriteSecureDmMarkdownImages(value)
        : String(value || "");
    const renderer = createMarkdownRenderer({
        allowImages,
        secureDmImageMode
    });
    const rendered = inline
        ? marked.parseInline(source, { renderer, gfm: true, breaks: true })
        : marked.parse(source, { renderer, gfm: true, breaks: true });
    const sanitized = DOMPurify.sanitize(rendered, {
        USE_PROFILES: { html: true },
        ALLOWED_TAGS: buildAllowedTags({ inline, allowImages }),
        ALLOWED_ATTR: [
            "alt",
            "checked",
            "class",
            "decoding",
            "disabled",
            "href",
            "loading",
            "readonly",
            "referrerpolicy",
            "rel",
            "src",
            "tabindex",
            "target",
            "title",
            "type",
            "data-md-kind",
            "data-md-source",
            "id"
        ]
    });

    const template = document.createElement("template");
    template.innerHTML = sanitized;
    normalizeAnchors(template.content);
    normalizeImages(template.content);
    normalizeTaskListInputs(template.content);
    return template.innerHTML;
}
