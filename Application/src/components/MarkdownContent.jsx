import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { renderMarkdownToHtml } from "../lib/markdown";
import { enhanceAppLinks, parseChatappHref } from "../lib/appLinks";
import { isDebugModeEnabled } from "../lib/debug";
import {
    createInlineImageEmbedMap,
    resolveInlineImageEmbedReference
} from "../features/dm/inlineEmbedContracts.js";
import { traceInlineImageDiagnostic } from "../features/dm/inlineEmbedTracing.js";
import mermaid from "mermaid";
import Chart from "chart.js/auto";

let mermaidInitialized = false;
let mermaidRenderNonce = 0;

function decodePayload(value) {
    return decodeURIComponent(String(value || ""));
}

function getStableJsonSignature(value) {
    if (!value) {
        return "";
    }

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function buildChartConfig(rawPayload) {
    const payload = JSON.parse(rawPayload);
    const lang = String(payload.lang || "chart").toLowerCase();
    const parsed = JSON.parse(String(payload.text || "{}"));

    if (lang === "chart" || lang === "chartjs" || lang === "chart-json") {
        return parsed;
    }

    return {
        type: lang,
        data: parsed.data || {
            labels: parsed.labels || [],
            datasets: parsed.datasets || []
        },
        options: parsed.options || {}
    };
}

function appendSecureDmImageFallback(node, label, detail) {
    const fallback = document.createElement("span");
    fallback.className = "inline-image-embed-fallback";

    const title = document.createElement("strong");
    title.textContent = String(label || "Image");
    fallback.appendChild(title);

    const description = document.createElement("span");
    description.textContent = String(detail || "Could not render image.");
    fallback.appendChild(description);

    node.appendChild(fallback);
}

function renderEnhancedError(node, error, fallbackMessage) {
    const message = String(error?.message || error || fallbackMessage || "Could not render content.");
    const pre = document.createElement("pre");
    pre.className = "md-enhanced-error";
    pre.textContent = message;
    node.replaceChildren(pre);
}

export default function MarkdownContent({
    as: Tag = "div",
    className,
    value,
    inline = false,
    allowImages = true,
    secureDmImageMode = false,
    secureDmEmbeds = null,
    secureDmDiagnosticContext = null,
    linkContext = null,
    ...restProps
}) {
    const containerRef = useRef(null);
    const debugMode = isDebugModeEnabled();
    const secureDmEmbedMap = useMemo(
        () => createInlineImageEmbedMap(secureDmEmbeds),
        [secureDmEmbeds]
    );
    const linkContextSignature = useMemo(
        () => getStableJsonSignature(linkContext),
        [linkContext]
    );
    const secureDmDiagnosticSignature = useMemo(
        () => getStableJsonSignature(secureDmDiagnosticContext),
        [secureDmDiagnosticContext]
    );
    const html = useMemo(
        () => renderMarkdownToHtml(value, {
            inline,
            allowImages,
            secureDmImageMode
        }),
        [allowImages, inline, secureDmImageMode, value]
    );

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return undefined;
        }

        container.innerHTML = html;

        const chartInstances = [];
        let disposed = false;

        function isEnhancementNodeActive(node) {
            return !disposed && container.isConnected && node?.isConnected && container.contains(node);
        }

        function handleContainerClick(event) {
            const anchor = event.target instanceof HTMLElement
                ? event.target.closest("a[href]")
                : null;

            if (!anchor) {
                return;
            }

            const href = String(anchor.getAttribute("href") || "");
            const destination = parseChatappHref(href);

            if (!destination) {
                return;
            }

            event.preventDefault();
            window.dispatchEvent(new CustomEvent("chatapp-navigate", {
                detail: destination
            }));
        }

        function enhanceSecureDmImages() {
            if (!secureDmImageMode) {
                return;
            }

            const imageNodes = Array.from(container.querySelectorAll('[data-md-kind="secure-dm-image"]'));

            if (!imageNodes.length) {
                return;
            }

            imageNodes.forEach((node) => {
                let payload;

                try {
                    payload = JSON.parse(decodePayload(node.getAttribute("data-md-source")));
                } catch {
                    payload = null;
                }

                const embedId = String(payload?.embedId || "").trim();
                const altText = String(payload?.alt || "Image").trim() || "Image";
                const widthPx = Math.max(0, Math.round(Number(payload?.widthPx) || 0));
                const heightPx = Math.max(0, Math.round(Number(payload?.heightPx) || 0));
                const renderToken = `secure-dm-image:${embedId || "missing"}:${Math.random().toString(36).slice(2)}`;
                const resolved = resolveInlineImageEmbedReference({
                    embedId,
                    alt: altText,
                    embeds: Array.from(secureDmEmbedMap.values())
                });

                node.replaceChildren();
                node.className = "inline-image-embed markdown-secure-dm-image";
                node.setAttribute("data-secure-dm-render-token", renderToken);

                if (!resolved.ok) {
                    traceInlineImageDiagnostic({
                        level: "warning",
                        stage: "markdown.resolve",
                        reason: resolved.reason,
                        message: resolved.reason === "missing-embed"
                            ? "Secure DM markdown referenced an inline image that is not present on the message."
                            : "Secure DM markdown could not resolve an inline image into a renderable source.",
                        body: value,
                        embeds: Array.from(secureDmEmbedMap.values()),
                        embed: resolved.embed,
                        embedId,
                        conversationId: secureDmDiagnosticContext?.conversationId || "",
                        messageId: secureDmDiagnosticContext?.messageId || "",
                        surface: secureDmDiagnosticContext?.surface || "markdown",
                        extraDetails: {
                            altText,
                            widthPx,
                            heightPx
                        }
                    });
                    appendSecureDmImageFallback(
                        node,
                        altText,
                        resolved.reason === "missing-embed"
                            ? "Missing encrypted image."
                            : "Could not decode image."
                    );
                    return;
                }

                const image = document.createElement("img");
                image.src = resolved.imageSrc;
                image.alt = resolved.altText || String(resolved.embed?.alt || "Image");
                image.loading = "lazy";
                image.decoding = "async";
                image.referrerPolicy = "no-referrer";
                if (widthPx > 0) {
                    node.style.width = `${widthPx}px`;
                    node.style.maxWidth = `min(100%, ${widthPx}px)`;
                    image.style.width = "100%";
                }
                if (heightPx > 0) {
                    image.style.height = `${heightPx}px`;
                    image.style.maxHeight = `${heightPx}px`;
                    image.style.objectFit = "contain";
                }
                traceInlineImageDiagnostic({
                    level: "info",
                    debugMode,
                    onceKey: `markdown.resolve:${secureDmDiagnosticContext?.messageId || "preview"}:${embedId}`,
                    stage: "markdown.resolve",
                    reason: "trace",
                    message: "Secure DM markdown resolved an inline image reference into a local render source.",
                    body: value,
                    embeds: Array.from(secureDmEmbedMap.values()),
                    embed: resolved.embed,
                    embedId,
                    conversationId: secureDmDiagnosticContext?.conversationId || "",
                    messageId: secureDmDiagnosticContext?.messageId || "",
                    surface: secureDmDiagnosticContext?.surface || "markdown",
                    extraDetails: {
                        altText,
                        widthPx,
                        heightPx
                    }
                });
                image.addEventListener("error", () => {
                    if (node.getAttribute("data-secure-dm-render-token") !== renderToken || !node.contains(image)) {
                        return;
                    }
                    traceInlineImageDiagnostic({
                        level: "warning",
                        stage: "markdown.render",
                        reason: "render-error",
                        message: "Secure DM inline image failed during browser rendering.",
                        body: value,
                        embeds: Array.from(secureDmEmbedMap.values()),
                        embed: resolved.embed,
                        embedId,
                        conversationId: secureDmDiagnosticContext?.conversationId || "",
                        messageId: secureDmDiagnosticContext?.messageId || "",
                        surface: secureDmDiagnosticContext?.surface || "markdown",
                        extraDetails: {
                            altText,
                            widthPx,
                            heightPx
                        }
                    });
                    node.replaceChildren();
                    appendSecureDmImageFallback(node, altText, "Could not render image.");
                }, { once: true });
                node.appendChild(image);
            });
        }

        async function enhanceContent() {
            enhanceAppLinks(container, linkContext);
            enhanceSecureDmImages();
            const mermaidNodes = Array.from(container.querySelectorAll('[data-md-kind="mermaid"]'));
            const chartNodes = Array.from(container.querySelectorAll('[data-md-kind="chart"]'));

            if (mermaidNodes.length > 0) {
                if (!mermaidInitialized) {
                    mermaid.initialize({
                        startOnLoad: false,
                        securityLevel: "strict"
                    });
                    mermaidInitialized = true;
                }

                for (const node of mermaidNodes) {
                    if (!isEnhancementNodeActive(node)) {
                        continue;
                    }

                    const source = decodePayload(node.getAttribute("data-md-source"));
                    const renderToken = `markdown-mermaid:${++mermaidRenderNonce}`;
                    node.setAttribute("data-mermaid-render-token", renderToken);

                    try {
                        const { svg, bindFunctions } = await mermaid.render(
                            `markdown-mermaid-${mermaidRenderNonce}`,
                            source
                        );

                        if (
                            !isEnhancementNodeActive(node)
                            || node.getAttribute("data-mermaid-render-token") !== renderToken
                        ) {
                            continue;
                        }

                        node.innerHTML = svg;
                        bindFunctions?.(node);
                    } catch (error) {
                        if (
                            isEnhancementNodeActive(node)
                            && node.getAttribute("data-mermaid-render-token") === renderToken
                        ) {
                            renderEnhancedError(node, error, "Could not render Mermaid diagram.");
                        }
                    }
                }
            }

            for (const node of chartNodes) {
                if (!isEnhancementNodeActive(node)) {
                    continue;
                }

                try {
                    const config = buildChartConfig(decodePayload(node.getAttribute("data-md-source")));
                    node.replaceChildren();
                    const canvas = document.createElement("canvas");
                    node.appendChild(canvas);
                    const context = canvas.getContext("2d");

                    if (!context) {
                        throw new Error("Canvas not available");
                    }

                    const chart = new Chart(context, config);
                    chartInstances.push(chart);
                } catch (error) {
                    if (isEnhancementNodeActive(node)) {
                        renderEnhancedError(node, error, "Invalid chart config");
                    }
                }
            }
        }

        enhanceContent().catch((error) => {
            if (!disposed) {
                console.warn("Failed to enhance markdown content:", error);
            }
        });
        container.addEventListener("click", handleContainerClick);

        return () => {
            disposed = true;
            container.removeEventListener("click", handleContainerClick);
            chartInstances.forEach((chart) => chart.destroy());
        };
    }, [debugMode, html, linkContextSignature, secureDmDiagnosticSignature, secureDmEmbedMap, secureDmImageMode, value]);

    return (
        <Tag
            ref={containerRef}
            className={className}
            {...restProps}
        />
    );
}
