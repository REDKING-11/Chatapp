export const SHORTCUT_GROUPS = [
    {
        title: "Messaging",
        items: [
            { keys: "Ctrl + Enter", description: "Send the current message from the composer." },
            { keys: "Ctrl + Shift + E", description: "Focus the active message composer." },
            { keys: "Ctrl + Shift + .", description: "Open the active emoji picker." },
            { keys: "Ctrl + Shift + F", description: "Open the active file picker." },
            { keys: "Ctrl + Shift + R", description: "Open reactions for the selected or latest message." },
            { keys: "Up", description: "Edit your last message when the composer is empty." }
        ]
    },
    {
        title: "Windows",
        items: [
            { keys: "Alt + S", description: "Open conversation settings in the current DM." },
            { keys: "Ctrl + ,", description: "Open Client Settings from anywhere in the app." },
            { keys: "Ctrl + K", description: "Open the quick switcher for friends, groups, servers, and channels." },
            { keys: "Esc", description: "Close open popouts, pickers, modals, and menus." }
        ]
    },
    {
        title: "Server Navigation",
        items: [
            { keys: "Alt + Enter", description: "Open Server Settings for the current server." },
            { keys: "Ctrl + Shift + S", description: "Alternative shortcut for Server Settings." }
        ]
    }
];
