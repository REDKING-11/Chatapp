import { useMemo, useState } from "react";
import MarkdownContent from "./MarkdownContent";

function slugifyHeading(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function buildPolicyContents(markdown) {
    const lines = String(markdown || "").split(/\r?\n/);
    const entries = [];

    lines.forEach((line) => {
        const match = line.match(/^(#{2,3})\s+(.+)$/);
        if (!match) {
            return;
        }

        const level = match[1].length;
        const title = match[2].trim();
        entries.push({
            level,
            title
        });
    });

    return entries;
}

function normalizeHeadingLabel(value) {
    return String(value || "")
        .replace(/^\d+\.\s*/, "")
        .trim();
}

function linkifyPolicyContents(markdown) {
    const lines = String(markdown || "").split(/\r?\n/);
    const headings = buildPolicyContents(markdown);
    const levelTwoHeadings = headings.filter((entry) => entry.level === 2);
    const headingByNormalizedTitle = Object.fromEntries(
        headings.map((entry) => [normalizeHeadingLabel(entry.title).toLowerCase(), entry])
    );
    const nextLines = [...lines];
    const firstLevelTwoIndex = lines.findIndex((line) => /^##\s+/.test(line));

    for (let index = 0; index < lines.length; index += 1) {
        if (firstLevelTwoIndex !== -1 && index >= firstLevelTwoIndex) {
            break;
        }

        const numberedLineMatch = lines[index].match(/^(\d+)\.\s*(.+)$/);
        if (numberedLineMatch) {
            const number = Number(numberedLineMatch[1]);
            const label = numberedLineMatch[2].trim();
            const targetHeading = levelTwoHeadings[number - 1];

            if (targetHeading && label) {
                nextLines[index] = `${number}. [${label}](#${slugifyHeading(targetHeading.title)})`;
            }

            continue;
        }

        const numberOnlyMatch = lines[index].match(/^(\d+)\.\s*$/);
        if (numberOnlyMatch) {
            const number = Number(numberOnlyMatch[1]);
            const label = String(lines[index + 1] || "").trim();
            const targetHeading = levelTwoHeadings[number - 1];

            if (targetHeading && label) {
                nextLines[index] = `${number}. [${label}](#${slugifyHeading(targetHeading.title)})`;
                nextLines[index + 1] = "";
            }

            continue;
        }

        const bulletMatch = lines[index].match(/^(\s*[-*•]\s+)(.+)$/);
        if (bulletMatch) {
            const prefix = bulletMatch[1];
            const label = bulletMatch[2].trim();
            const targetHeading = headingByNormalizedTitle[label.toLowerCase()];

            if (targetHeading) {
                nextLines[index] = `${prefix}[${label}](#${slugifyHeading(targetHeading.title)})`;
            }
        }
    }

    return nextLines.join("\n");
}

export default function PolicyDocumentModal({
    title,
    markdown,
    onClose,
    overlayMode = "standalone"
}) {
    const [fontScale, setFontScale] = useState(1);
    const [theme, setTheme] = useState("dark");
    const processedMarkdown = useMemo(() => linkifyPolicyContents(markdown), [markdown]);
    const contents = useMemo(() => buildPolicyContents(processedMarkdown), [processedMarkdown]);

    return (
        <div className={`policy-document-overlay is-${overlayMode}`} onClick={onClose}>
            <div
                className={`policy-document-window is-${theme}`}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="policy-document-header">
                    <div>
                        <h2>{title}</h2>
                        <p>Readable document mode for longer policy pages.</p>
                    </div>
                    <button type="button" className="secondary" onClick={onClose}>
                        Close
                    </button>
                </div>

                <div className="policy-document-toolbar">
                    <label className="policy-document-control">
                        <span>Font size</span>
                        <input
                            type="range"
                            min="0.9"
                            max="1.35"
                            step="0.05"
                            value={fontScale}
                            onChange={(event) => setFontScale(Number(event.target.value))}
                        />
                    </label>

                    <button
                        type="button"
                        className={`policy-document-theme-toggle is-${theme}`}
                        onClick={() => setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"))}
                        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                        aria-pressed={theme === "light"}
                    >
                        <span className="policy-document-theme-toggle-track" aria-hidden="true">
                            <span className="policy-document-theme-toggle-thumb" />
                        </span>
                        <span className="policy-document-theme-toggle-label">
                            {theme === "dark" ? "Dark mode" : "Light mode"}
                        </span>
                    </button>
                </div>

                <div className="policy-document-layout">
                    <aside className="policy-document-contents">
                        <h3>Contents</h3>
                        <div className="policy-document-contents-list">
                            {contents.map((entry) => (
                                <a
                                    key={`${entry.level}:${entry.title}`}
                                    href={`#${slugifyHeading(entry.title)}`}
                                    className={`policy-document-contents-link level-${entry.level}`}
                                >
                                    {entry.title}
                                </a>
                            ))}
                        </div>
                    </aside>

                    <div className="policy-document-body" style={{ "--policy-font-scale": String(fontScale) }}>
                        <MarkdownContent
                            as="article"
                            className="markdown-body policy-document-markdown"
                            value={processedMarkdown}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
