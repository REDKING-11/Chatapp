import { useEffect } from "react";
import { SHORTCUT_GROUPS } from "../lib/shortcuts";

export default function ShortcutInfoModal({
    onClose
}) {
    useEffect(() => {
        function handleKeyDown(event) {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose?.();
            }
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    return (
        <div className="shortcut-info-overlay" onClick={onClose}>
            <div className="shortcut-info-window panel-card" onClick={(event) => event.stopPropagation()}>
                <div className="shortcut-info-header">
                    <div>
                        <h2>Shortcuts</h2>
                        <p>Keyboard shortcuts, stacked for quick scanning.</p>
                    </div>
                    <button type="button" className="shortcut-info-close" onClick={onClose}>
                        Close
                    </button>
                </div>

                <div className="shortcut-info-groups">
                    {SHORTCUT_GROUPS.map((group) => (
                        <section key={group.title} className="shortcut-info-group">
                            <div className="shortcut-info-group-header">
                                <h3>{group.title}</h3>
                            </div>
                            <div className="shortcut-info-list">
                                {group.items.map((item) => (
                                    <div key={`${group.title}-${item.keys}`} className="shortcut-info-item">
                                        <div className="shortcut-info-keys">{item.keys}</div>
                                        <p>{item.description}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}
