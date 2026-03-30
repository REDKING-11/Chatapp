export const defaultLayouts = {
    chat: {
        type: "column",
        children: [
            {
                type: "text",
                props: {
                    text: "Default chat header"
                }
            },
            {
                type: "chat"
            }
        ]
    },

    page: {
        type: "column",
        children: [
            {
                type: "text",
                props: {
                    text: "This is a default page layout"
                }
            }
        ]
    },

    dashboard: {
        type: "row",
        children: [
            {
                type: "column",
                children: [
                    {
                        type: "text",
                        props: { text: "Stats panel" }
                    }
                ]
            },
            {
                type: "column",
                children: [
                    {
                        type: "text",
                        props: { text: "Activity panel" }
                    }
                ]
            }
        ]
    }
};