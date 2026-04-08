import { useEffect, useRef, useState } from "react";

export default function useCanvasPanZoom(enabled = true) {
    const viewportRef = useRef(null);

    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 80, y: 80 });
    const [isPanning, setIsPanning] = useState(false);

    const panRef = useRef({ x: 80, y: 80 });
    const zoomRef = useRef(1);
    const spacePressedRef = useRef(false);
    const pointerRef = useRef({
        active: false,
        id: null,
        startX: 0,
        startY: 0,
        startPanX: 0,
        startPanY: 0
    });

    useEffect(() => {
        panRef.current = pan;
    }, [pan]);

    useEffect(() => {
        zoomRef.current = zoom;
    }, [zoom]);

    useEffect(() => {
        function handleKeyDown(e) {
            if (e.code === "Space") {
                spacePressedRef.current = true;
            }
        }

        function handleKeyUp(e) {
            if (e.code === "Space") {
                spacePressedRef.current = false;
            }
        }

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    useEffect(() => {
        if (!enabled) return;

        const el = viewportRef.current;
        if (!el) return;

        function clampZoom(value) {
            return Math.max(0.2, Math.min(3, value));
        }

        function handleWheel(e) {
            e.preventDefault();

            if (e.ctrlKey || e.metaKey) {
                const rect = el.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                const prevZoom = zoomRef.current;
                const nextZoom = clampZoom(prevZoom * Math.exp(-e.deltaY * 0.0015));

                const worldX = (mouseX - panRef.current.x) / prevZoom;
                const worldY = (mouseY - panRef.current.y) / prevZoom;

                const nextPan = {
                    x: mouseX - worldX * nextZoom,
                    y: mouseY - worldY * nextZoom
                };

                zoomRef.current = nextZoom;
                panRef.current = nextPan;
                setZoom(nextZoom);
                setPan(nextPan);
                return;
            }

            const nextPan = {
                x: panRef.current.x - e.deltaX * 1.2,
                y: panRef.current.y - e.deltaY * 1.2
            };

            panRef.current = nextPan;
            setPan(nextPan);
        }

        function handlePointerDown(e) {
            const isMiddleMouse = e.button === 1;
            const isSpaceDrag = e.button === 0 && spacePressedRef.current;

            if (!isMiddleMouse && !isSpaceDrag) {
                return;
            }

            pointerRef.current = {
                active: true,
                id: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                startPanX: panRef.current.x,
                startPanY: panRef.current.y
            };

            setIsPanning(true);

            try {
                el.setPointerCapture(e.pointerId);
            } catch {}

            e.preventDefault();
        }

        function handlePointerMove(e) {
            const p = pointerRef.current;
            if (!p.active || p.id !== e.pointerId) return;

            const dx = e.clientX - p.startX;
            const dy = e.clientY - p.startY;

            const nextPan = {
                x: p.startPanX + dx,
                y: p.startPanY + dy
            };

            panRef.current = nextPan;
            setPan(nextPan);
        }

        function endPan(e) {
            const p = pointerRef.current;
            if (!p.active) return;
            if (e && p.id !== e.pointerId) return;

            pointerRef.current.active = false;
            pointerRef.current.id = null;
            setIsPanning(false);

            try {
                if (e) el.releasePointerCapture(e.pointerId);
            } catch {}
        }

        el.addEventListener("wheel", handleWheel, { passive: false });
        el.addEventListener("pointerdown", handlePointerDown);
        el.addEventListener("pointermove", handlePointerMove);
        el.addEventListener("pointerup", endPan);
        el.addEventListener("pointercancel", endPan);

        return () => {
            el.removeEventListener("wheel", handleWheel);
            el.removeEventListener("pointerdown", handlePointerDown);
            el.removeEventListener("pointermove", handlePointerMove);
            el.removeEventListener("pointerup", endPan);
            el.removeEventListener("pointercancel", endPan);
        };
    }, [enabled]);

    function resetView() {
        const nextPan = { x: 80, y: 80 };
        panRef.current = nextPan;
        zoomRef.current = 1;
        setPan(nextPan);
        setZoom(1);
        setIsPanning(false);
    }

    return {
        viewportRef,
        zoom,
        pan,
        isPanning,
        resetView
    };
}
//normal left click = select nodes
//middle mouse drag = pan
//Space + left drag = pan
//wheel = pan
//Ctrl/Cmd + wheel = zoom