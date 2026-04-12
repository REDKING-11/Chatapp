import hiddenHelloImage from "../assets/20260412_204038.jpg";

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

    customization: {
        type: "column",
        children: [
            {
                type: "heading",
                props: {
                    level: 2,
                    text: "You are not supposed to see this."
                }
            },
            {
                type: "text",
                props: {
                    text: "If you somehow found the hidden customize page anyway: hello. This is just a little easter egg for funzies."
                }
            },
            {
                type: "image",
                props: {
                    src: hiddenHelloImage,
                    alt: "A sleepy teddy bear saying hello",
                    style: "max-width: 280px; width: 100%; border-radius: 18px; overflow: hidden; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);"
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
