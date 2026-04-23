const DEFAULT_MARGIN = 12;
const DEFAULT_GAP = 10;
const MIN_POPOVER_HEIGHT = 120;

function clamp(value, min, max) {
    if (max < min) {
        return min;
    }

    return Math.min(Math.max(value, min), max);
}

function normalizeRect(rect) {
    const left = Number(rect?.left) || 0;
    const top = Number(rect?.top) || 0;
    const width = Number(rect?.width) || Math.max(0, (Number(rect?.right) || left) - left);
    const height = Number(rect?.height) || Math.max(0, (Number(rect?.bottom) || top) - top);

    return {
        left,
        top,
        right: Number(rect?.right) || left + width,
        bottom: Number(rect?.bottom) || top + height,
        width,
        height
    };
}

export function getElementViewportRect(element) {
    if (!element?.getBoundingClientRect) {
        return null;
    }

    const rect = element.getBoundingClientRect();

    return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
    };
}

export function resolveAnchoredPopoverPosition({
    anchorRect,
    popoverWidth,
    popoverHeight,
    viewportWidth,
    viewportHeight,
    margin = DEFAULT_MARGIN,
    gap = DEFAULT_GAP,
    preferredPlacement = "bottom-start"
}) {
    const anchor = normalizeRect(anchorRect);
    const preferredPlacementValue = String(preferredPlacement || "");
    const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
    const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
    const safeMargin = Math.max(0, Number(margin) || 0);
    const safeGap = Math.max(0, Number(gap) || 0);
    const width = Math.min(
        Math.max(0, Number(popoverWidth) || 0),
        Math.max(0, safeViewportWidth - safeMargin * 2)
    );
    const measuredHeight = Math.max(0, Number(popoverHeight) || 0);
    const viewportMaxHeight = Math.max(
        MIN_POPOVER_HEIGHT,
        safeViewportHeight - safeMargin * 2
    );
    const heightForPlacement = Math.min(measuredHeight || viewportMaxHeight, viewportMaxHeight);
    const availableAbove = Math.max(0, anchor.top - safeGap - safeMargin);
    const availableBelow = Math.max(0, safeViewportHeight - safeMargin - anchor.bottom - safeGap);
    const wantsAbove = preferredPlacementValue.startsWith("top");
    const isStartAligned = preferredPlacementValue.endsWith("-start");
    const placement = wantsAbove
        ? (availableAbove >= Math.min(heightForPlacement, availableBelow) ? "top" : "bottom")
        : (availableBelow >= Math.min(heightForPlacement, availableAbove) ? "bottom" : "top");
    const rawTop = placement === "top"
        ? anchor.top - safeGap - heightForPlacement
        : anchor.bottom + safeGap;
    const maxTop = safeViewportHeight - safeMargin - heightForPlacement;
    const top = clamp(rawTop, safeMargin, maxTop);
    const rawLeft = isStartAligned
        ? anchor.left
        : anchor.left + (anchor.width / 2) - (width / 2);
    const left = clamp(
        rawLeft,
        safeMargin,
        safeViewportWidth - safeMargin - width
    );
    const maxHeight = Math.max(
        MIN_POPOVER_HEIGHT,
        safeViewportHeight - top - safeMargin
    );

    return {
        left,
        top,
        width,
        maxHeight,
        placement
    };
}

export function resolvePointPopoverPosition({
    x,
    y,
    popoverWidth,
    popoverHeight,
    viewportWidth,
    viewportHeight,
    margin = DEFAULT_MARGIN
}) {
    const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
    const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
    const safeMargin = Math.max(0, Number(margin) || 0);
    const width = Math.min(
        Math.max(0, Number(popoverWidth) || 0),
        Math.max(0, safeViewportWidth - safeMargin * 2)
    );
    const height = Math.min(
        Math.max(0, Number(popoverHeight) || 0),
        Math.max(MIN_POPOVER_HEIGHT, safeViewportHeight - safeMargin * 2)
    );
    const left = clamp(Number(x) || 0, safeMargin, safeViewportWidth - safeMargin - width);
    const top = clamp(Number(y) || 0, safeMargin, safeViewportHeight - safeMargin - height);

    return {
        left,
        top,
        width,
        maxHeight: Math.max(MIN_POPOVER_HEIGHT, safeViewportHeight - top - safeMargin)
    };
}
