import { useEffect, useState } from "react";
import { SHORTCUT_GROUPS } from "../lib/shortcuts";

const FEATURE_TABS = [
    {
        id: "overview",
        label: "Overview",
        description: "A small feature hub that can grow over time."
    },
    {
        id: "shortcuts",
        label: "Shortcuts",
        description: "Keyboard moves for fast navigation and sending."
    },
    {
        id: "dmHidden",
        label: "DM Hidden Features",
        description: "Inline embeds, relay behavior, and DM-only controls."
    }
];

const DM_HIDDEN_FEATURE_CARDS = [
    {
        title: "Inline markdown images",
        description: "Small PNG, JPG, and WEBP images in direct messages can live inside the encrypted message itself instead of only going out as separate file attachments.",
        bullets: [
            "Paste or pick a small image in a DM and Chatapp inserts a secure dm-embed reference into the draft for you.",
            "Large images and normal files still fall back to the regular attachment flow.",
            "Remote image URLs stay blocked in secure DMs, so only encrypted inline embeds render as images there."
        ],
        example: "![face.jpg](dm-embed://dmimg_12345678)"
    },
    {
        title: "Resize images inside the message",
        description: "You can keep the image in the markdown flow and control its size with an extra suffix.",
        bullets: [
            "Use a size token like {25x25} after the dm-embed reference.",
            "Bare numbers are shorthand units where 1 equals 10px, so {25x25} becomes 250px by 250px.",
            "If you want to be explicit, pixel syntax like {250pxx180px} also works."
        ],
        example: "![face.jpg](dm-embed://dmimg_12345678){25x25}"
    },
    {
        title: "Offline relay is part of the same DM flow",
        description: "Direct messages can queue through encrypted offline relay when the other device is away, then upgrade once that relay is consumed in the same live session.",
        bullets: [
            "\"Offline relay\" means the message was queued for pickup instead of landing on a live websocket immediately.",
            "A relayed message can later upgrade to \"Sent securely\" after the other device consumes it while the sender is still connected.",
            "Inline DM images ride through the same secure message and relay flow as the message body."
        ]
    },
    {
        title: "Conversation settings hide extra DM controls",
        description: "There are DM-specific controls tucked behind the conversation settings popout.",
        bullets: [
            "Press Alt + S inside an active DM to open conversation settings quickly.",
            "You can change the offline relay window and request disappearing-message timers there.",
            "Both people have to agree before relay-retention or disappearing-message changes take effect."
        ]
    },
    {
        title: "Trusted DM devices live in client settings",
        description: "When you want the deeper safety tools, they are already in the client settings flow.",
        bullets: [
            "Client Settings includes DM device approvals, key rotation, and recovery helpers.",
            "That is where you can reauthorize or revoke trusted devices if something gets out of sync.",
            "This General Features page is meant for discovery, while the heavy controls stay in settings."
        ]
    }
];

function ShortcutInfoPageHeader({
    title,
    description
}) {
    return (
        <div className="shortcut-info-page-header">
            <h3>{title}</h3>
            <p>{description}</p>
        </div>
    );
}

function ShortcutOverviewPage({
    onSelectPage
}) {
    return (
        <>
            <ShortcutInfoPageHeader
                title="General Features"
                description="Shortcuts now live beside DM-only power tools, and this menu has room for more pages later."
            />

            <div className="shortcut-info-overview-grid">
                <button
                    type="button"
                    className="shortcut-info-overview-card"
                    onClick={() => onSelectPage("shortcuts")}
                >
                    <span className="shortcut-info-card-eyebrow">Keyboard</span>
                    <strong>Shortcuts got their own page</strong>
                    <p>Open the full shortcut list in its own section instead of squeezing it into a single flat popout.</p>
                </button>

                <button
                    type="button"
                    className="shortcut-info-overview-card"
                    onClick={() => onSelectPage("dmHidden")}
                >
                    <span className="shortcut-info-card-eyebrow">Direct messages</span>
                    <strong>DM hidden features</strong>
                    <p>Inline markdown images, custom DM image sizing, relay behavior, and the quieter settings that are easy to miss.</p>
                </button>

                <div className="shortcut-info-overview-card is-static">
                    <span className="shortcut-info-card-eyebrow">Later on</span>
                    <strong>More feature pages can slot in here</strong>
                    <p>This layout is ready for more tabs whenever you want to surface extra tools without rebuilding the whole menu again.</p>
                </div>
            </div>

            <div className="shortcut-info-note">
                <strong>Quick tip</strong>
                <p>
                    This hub is for discovery. The actual controls still live where they belong, like DM conversation settings and the main client settings window.
                </p>
            </div>
        </>
    );
}

function ShortcutListPage() {
    return (
        <>
            <ShortcutInfoPageHeader
                title="Shortcuts"
                description="Keyboard shortcuts, stacked for quick scanning and kept on their own page."
            />

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
        </>
    );
}

function DmHiddenFeaturesPage() {
    return (
        <>
            <ShortcutInfoPageHeader
                title="DM Hidden Features"
                description="The quieter direct-message tricks that make secure DMs feel much more flexible once you know they exist."
            />

            <div className="shortcut-info-feature-grid">
                {DM_HIDDEN_FEATURE_CARDS.map((card) => (
                    <section key={card.title} className="shortcut-info-feature-card">
                        <h3>{card.title}</h3>
                        <p>{card.description}</p>
                        {card.example ? (
                            <pre className="shortcut-info-code-block">
                                <code>{card.example}</code>
                            </pre>
                        ) : null}
                        <ul className="shortcut-info-feature-list">
                            {card.bullets.map((bullet) => (
                                <li key={`${card.title}-${bullet}`}>{bullet}</li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </>
    );
}

export default function ShortcutInfoModal({
    onClose
}) {
    const [activeTab, setActiveTab] = useState("overview");

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
                        <h2>General Features</h2>
                        <p>Shortcuts, DM power tools, and a little room to grow.</p>
                    </div>
                    <button type="button" className="shortcut-info-close" onClick={onClose}>
                        Close
                    </button>
                </div>

                <div className="shortcut-info-body">
                    <aside className="shortcut-info-sidebar">
                        <div className="shortcut-info-sidebar-card">
                            <span className="shortcut-info-card-eyebrow">Feature hub</span>
                            <strong>Small sidebar, bigger surface area</strong>
                            <p>Shortcuts no longer have to share one flat list. This space can hold DM-only tips and more pages later.</p>
                        </div>

                        <div className="shortcut-info-nav" role="tablist" aria-label="General feature pages">
                            {FEATURE_TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === tab.id}
                                    className={`shortcut-info-tab ${activeTab === tab.id ? "active" : ""}`.trim()}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    <strong>{tab.label}</strong>
                                    <span>{tab.description}</span>
                                </button>
                            ))}
                        </div>
                    </aside>

                    <div className="shortcut-info-content">
                        {activeTab === "overview" ? <ShortcutOverviewPage onSelectPage={setActiveTab} /> : null}
                        {activeTab === "shortcuts" ? <ShortcutListPage /> : null}
                        {activeTab === "dmHidden" ? <DmHiddenFeaturesPage /> : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
