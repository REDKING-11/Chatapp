import React, { useEffect, useMemo, useRef, useState } from "react";
import { layoutWithLines, prepareWithSegments } from "@chenglou/pretext";

function useElementWidth(ref) {
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const element = ref.current;
        if (!element || typeof ResizeObserver === "undefined") {
            return undefined;
        }

        const observer = new ResizeObserver((entries) => {
            const nextWidth = entries[0]?.contentRect?.width ?? 0;
            setWidth((prev) => (Math.abs(prev - nextWidth) < 0.5 ? prev : nextWidth));
        });

        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);

    return width;
}

export default function PretextTextRenderer({
    as: Tag = "p",
    className,
    text,
    style,
    font,
    lineHeight,
    whiteSpace = "normal",
    wordBreak = "normal",
    ...restProps
}) {
    const containerRef = useRef(null);
    const width = useElementWidth(containerRef);
    const safeText = String(text || "");
    const safeLineHeight = Number(lineHeight) > 0 ? Number(lineHeight) : 24;
    const safeFont = String(font || "400 16px sans-serif");

    const prepared = useMemo(() => (
        prepareWithSegments(safeText, safeFont, {
            whiteSpace,
            wordBreak
        })
    ), [font, safeFont, safeText, whiteSpace, wordBreak]);

    const laidOut = useMemo(() => {
        if (!width || width <= 0) {
            return null;
        }

        return layoutWithLines(prepared, width, safeLineHeight);
    }, [prepared, safeLineHeight, width]);

    const inlineStyle = {
        ...style,
        font: safeFont,
        lineHeight: `${safeLineHeight}px`
    };

    return (
        <Tag
            ref={containerRef}
            className={className}
            style={inlineStyle}
            {...restProps}
        >
            {laidOut
                ? laidOut.lines.map((line, index) => (
                    <span
                        key={`${index}-${line.start.segmentIndex}-${line.start.graphemeIndex}`}
                        style={{ display: "block", whiteSpace: "pre" }}
                    >
                        {line.text || "\u00A0"}
                    </span>
                ))
                : safeText}
        </Tag>
    );
}
