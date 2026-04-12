export const MAX_COMPOSER_ATTACHMENT_BYTES = 1024 * 1024;

function escapeMarkdownLabel(value) {
    return String(value || "file").replace(/[[\]\\]/g, "\\$&");
}

function escapeMarkdownDestination(value) {
    return String(value || "").replace(/[()\\\s]/g, (character) => {
        if (character === " ") {
            return "%20";
        }

        return `\\${character}`;
    });
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.readAsDataURL(file);
    });
}

export function insertTextAtCursor(element, currentValue, insertedText) {
    const baseValue = String(currentValue || "");
    const nextText = String(insertedText || "");

    if (!nextText) {
        return {
            value: baseValue,
            selectionStart: null,
            selectionEnd: null
        };
    }

    if (!element || typeof element.selectionStart !== "number" || typeof element.selectionEnd !== "number") {
        return {
            value: `${baseValue}${nextText}`,
            selectionStart: null,
            selectionEnd: null
        };
    }

    const start = element.selectionStart;
    const end = element.selectionEnd;
    const value = `${baseValue.slice(0, start)}${nextText}${baseValue.slice(end)}`;
    const caret = start + nextText.length;

    return {
        value,
        selectionStart: caret,
        selectionEnd: caret
    };
}

export async function fileToComposerMarkdown(file) {
    if (!file) {
        throw new Error("No file selected.");
    }

    if (file.size > MAX_COMPOSER_ATTACHMENT_BYTES) {
        throw new Error("That file is too large. Keep shared files at 1 MB or smaller for now.");
    }

    const dataUrl = await readFileAsDataUrl(file);
    const label = escapeMarkdownLabel(file.name || "file");
    const destination = escapeMarkdownDestination(dataUrl);
    const prefix = file.type?.startsWith("image/") ? "!" : "";

    return `${prefix}[${label}](${destination})`;
}
