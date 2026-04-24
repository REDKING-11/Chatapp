export function collectShareIdsFromMessageCollections(...messageCollections) {
    const shareIds = new Set();

    messageCollections.forEach((messages) => {
        (Array.isArray(messages) ? messages : []).forEach((message) => {
            (Array.isArray(message?.attachments) ? message.attachments : []).forEach((attachment) => {
                const shareId = String(attachment?.shareId || "").trim();

                if (shareId) {
                    shareIds.add(shareId);
                }
            });
        });
    });

    return Array.from(shareIds);
}

export function createRequestedAttachmentTransferState(fileName) {
    return {
        status: "requesting",
        progress: 0,
        fileName: String(fileName || "file"),
        error: ""
    };
}
