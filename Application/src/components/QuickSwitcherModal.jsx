import { useEffect, useMemo, useState } from "react";

function groupLabel(group) {
    switch (group) {
        case "friend":
            return "Direct messages";
        case "group":
            return "Groups";
        case "server":
            return "Servers";
        case "channel":
            return "Channels";
        case "special":
        default:
            return "Navigation";
    }
}

export default function QuickSwitcherModal({
    items,
    onSelect,
    onClose
}) {
    const [query, setQuery] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const normalizedQuery = query.trim().toLowerCase();
    const filteredItems = useMemo(() => {
        const nextItems = (items || []).filter((item) => {
            if (!normalizedQuery) {
                return true;
            }

            return [
                item.label,
                item.subtitle,
                groupLabel(item.group)
            ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
        });

        return nextItems;
    }, [items, normalizedQuery]);

    useEffect(() => {
        setHighlightedIndex(0);
    }, [normalizedQuery]);

    useEffect(() => {
        function handleKeyDown(event) {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose?.();
                return;
            }

            if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlightedIndex((prev) => (
                    filteredItems.length === 0 ? 0 : Math.min(prev + 1, filteredItems.length - 1)
                ));
                return;
            }

            if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlightedIndex((prev) => (
                    filteredItems.length === 0 ? 0 : Math.max(prev - 1, 0)
                ));
                return;
            }

            if (event.key === "Enter") {
                const item = filteredItems[highlightedIndex];
                if (item) {
                    event.preventDefault();
                    onSelect?.(item);
                }
            }
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [filteredItems, highlightedIndex, onClose, onSelect]);

    const groupedItems = useMemo(() => {
        return filteredItems.reduce((groups, item, index) => {
            const key = item.group || "special";
            if (!groups[key]) {
                groups[key] = [];
            }

            groups[key].push({ ...item, filteredIndex: index });
            return groups;
        }, {});
    }, [filteredItems]);

    return (
        <div className="quick-switcher-overlay" onClick={onClose}>
            <div className="quick-switcher-window" onClick={(event) => event.stopPropagation()}>
                <div className="quick-switcher-header">
                    <h2>Quick Switcher</h2>
                    <p>Jump between friends, groups, servers, and channels.</p>
                </div>

                <input
                    className="quick-switcher-input"
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search conversations, servers, or channels"
                    autoFocus
                />

                <div className="quick-switcher-results">
                    {filteredItems.length === 0 ? (
                        <p className="quick-switcher-empty">No matches yet.</p>
                    ) : (
                        Object.entries(groupedItems).map(([group, groupItems]) => (
                            <section key={group} className="quick-switcher-group">
                                <h3>{groupLabel(group)}</h3>
                                <div className="quick-switcher-list">
                                    {groupItems.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            className={`quick-switcher-item ${item.filteredIndex === highlightedIndex ? "is-highlighted" : ""}`}
                                            onMouseEnter={() => setHighlightedIndex(item.filteredIndex)}
                                            onClick={() => onSelect?.(item)}
                                        >
                                            <strong>{item.label}</strong>
                                            {item.subtitle ? <span>{item.subtitle}</span> : null}
                                        </button>
                                    ))}
                                </div>
                            </section>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
