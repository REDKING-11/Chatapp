import React, { useEffect, useMemo, useRef } from "react";
import { renderMarkdownToHtml } from "../lib/markdown";
import { enhanceAppLinks, parseChatappHref } from "../lib/appLinks";
import mermaid from "mermaid";
import Chart from "chart.js/auto";

let mermaidInitialized = false;

function decodePayload(value) {
    return decodeURIComponent(String(value || ""));
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

export default function MarkdownContent({
    as: Tag = "div",
    className,
    value,
    inline = false,
    linkContext = null,
    ...restProps
}) {
    const containerRef = useRef(null);
    const html = useMemo(
        () => renderMarkdownToHtml(value, { inline }),
        [inline, value]
    );

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return undefined;
        }

        const chartInstances = [];

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

        async function enhanceContent() {
            enhanceAppLinks(container, linkContext);
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
                    const source = decodePayload(node.getAttribute("data-md-source"));
                    node.textContent = source;
                }

                await mermaid.run({
                    nodes: mermaidNodes
                });
            }

            for (const node of chartNodes) {
                try {
                    const config = buildChartConfig(decodePayload(node.getAttribute("data-md-source")));
                    node.innerHTML = "";
                    const canvas = document.createElement("canvas");
                    node.appendChild(canvas);
                    const context = canvas.getContext("2d");

                    if (!context) {
                        throw new Error("Canvas not available");
                    }

                    const chart = new Chart(context, config);
                    chartInstances.push(chart);
                } catch (error) {
                    node.innerHTML = `<pre class="md-enhanced-error">${String(error?.message || error || "Invalid chart config")}</pre>`;
                }
            }
        }

        enhanceContent();
        container.addEventListener("click", handleContainerClick);

        return () => {
            container.removeEventListener("click", handleContainerClick);
            chartInstances.forEach((chart) => chart.destroy());
        };
    }, [html, linkContext]);

    return (
        <Tag
            ref={containerRef}
            className={className}
            dangerouslySetInnerHTML={{ __html: html }}
            {...restProps}
        />
    );
}
