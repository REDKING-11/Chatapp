import DOMPurify from "dompurify";
import { marked } from "marked";

function encodePayload(value) {
    return encodeURIComponent(value);
}

function createEnhancedBlock(kind, payload, label) {
    return `<div class="md-enhanced-block md-${kind}" data-md-kind="${kind}" data-md-source="${encodePayload(payload)}"><div class="md-enhanced-fallback">${label}</div></div>`;
}

const renderer = new marked.Renderer();
const defaultCodeRenderer = renderer.code.bind(renderer);
const defaultHeadingRenderer = renderer.heading.bind(renderer);

function slugifyHeading(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

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

marked.setOptions({
    renderer,
    gfm: true,
    breaks: true
});

function buildAllowedTags({ inline = false } = {}) {
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

    if (inline) {
        return base.filter((tag) => ![
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

    return base;
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
    const source = String(value || "");
    const rendered = inline ? marked.parseInline(source) : marked.parse(source);
    const sanitized = DOMPurify.sanitize(rendered, {
        USE_PROFILES: { html: true },
        ALLOWED_TAGS: buildAllowedTags({ inline }),
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
