import React from "react";
import MarkdownContent from "./MarkdownContent";
import { detectMarkdownSyntax } from "../lib/markdownPreview";

export default function MarkdownPreview({
    value,
    label = "Preview",
    allowImages = true,
    secureDmImageMode = false,
    secureDmEmbeds = null,
    secureDmDiagnosticContext = null,
    linkContext = null
}) {
    if (!detectMarkdownSyntax(value)) {
        return null;
    }

    return (
        <div className="markdown-preview panel-card">
            <div className="markdown-preview-label">{label}</div>
            <MarkdownContent
                as="div"
                className="markdown-body markdown-preview-body"
                value={value}
                allowImages={allowImages}
                secureDmImageMode={secureDmImageMode}
                secureDmEmbeds={secureDmEmbeds}
                secureDmDiagnosticContext={secureDmDiagnosticContext}
                linkContext={linkContext}
            />
        </div>
    );
}
