import assert from "node:assert/strict";
import {
  INLINE_IMAGE_EMBED_MAX_BYTES,
  buildInlineImageMarkdownReference,
  buildInlineImageDataUrl,
  classifyInlineImageEmbedCandidate,
  extractReferencedInlineImageEmbedIds,
  filterReferencedInlineImageEmbeds,
  getMarkdownInlineImageMatches,
  insertInlineImageEmbedMarkdownReference,
  normalizeInlineImageEmbeds,
  parseInlineImageMarkdownSizeToken,
  removeInlineImageEmbedReferences,
  replaceInlineImageMarkdownWithPlainText
} from "../src/features/dm/inlineEmbeds.js";
import {
  getLatestMessageByTimestamp,
  getMessagePreviewText
} from "../src/features/friends/utils/messagePreviews.js";

assert.deepEqual(
  classifyInlineImageEmbedCandidate({
    mimeType: "image/png",
    byteLength: 1024
  }),
  {
    kind: "inline",
    reason: "ok"
  }
);

assert.equal(
  classifyInlineImageEmbedCandidate({
    mimeType: "image/gif",
    byteLength: 1024
  }).kind,
  "attachment"
);

assert.equal(
  classifyInlineImageEmbedCandidate({
    mimeType: "image/png",
    byteLength: INLINE_IMAGE_EMBED_MAX_BYTES + 1
  }).reason,
  "too-large"
);

assert.deepEqual(
  normalizeInlineImageEmbeds([{
    id: "img-1",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 96,
    byteLength: 999999,
    dataBase64: "AQID",
    alt: "  Screenshot.png  "
  }]),
  [{
    id: "img-1",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 96,
    byteLength: 3,
    dataBase64: "AQID",
    alt: "Screenshot.png"
  }]
);

assert.equal(
  buildInlineImageDataUrl({
    mimeType: "image/png",
    dataBase64: "AQID"
  }),
  "data:image/png;base64,AQID"
);

assert.equal(
  buildInlineImageDataUrl({
    mimeType: "image/gif",
    dataBase64: "AQID"
  }),
  ""
);

const oversizeBase64 = Buffer.alloc(INLINE_IMAGE_EMBED_MAX_BYTES + 1, 1).toString("base64");

assert.deepEqual(
  normalizeInlineImageEmbeds([{
    id: "img-oversize",
    kind: "image",
    mimeType: "image/png",
    width: 40,
    height: 40,
    dataBase64: oversizeBase64,
    alt: "Large"
  }]),
  []
);

assert.deepEqual(
  normalizeInlineImageEmbeds([{
    id: "img-gif",
    kind: "image",
    mimeType: "image/gif",
    width: 40,
    height: 40,
    dataBase64: "AQID",
    alt: "Animated"
  }]),
  []
);

const markdownReference = buildInlineImageMarkdownReference({
  embedId: "img-1",
  alt: "Screenshot.png"
});

assert.equal(markdownReference, "![Screenshot.png](dm-embed://img-1)");

assert.deepEqual(
  parseInlineImageMarkdownSizeToken("{25x25}"),
  {
    widthPx: 250,
    heightPx: 250,
    token: "{25x25}"
  }
);

assert.deepEqual(
  parseInlineImageMarkdownSizeToken("{250pxx180px}"),
  {
    widthPx: 250,
    heightPx: 180,
    token: "{250pxx180px}"
  }
);

assert.equal(parseInlineImageMarkdownSizeToken("{oops}"), null);

assert.deepEqual(
  getMarkdownInlineImageMatches(`Start ![Sized](dm-embed://img-1){25x25} end`),
  [{
    fullMatch: "![Sized](dm-embed://img-1){25x25}",
    alt: "Sized",
    href: "dm-embed://img-1",
    size: {
      widthPx: 250,
      heightPx: 250,
      token: "{25x25}"
    },
    index: 6
  }]
);

assert.deepEqual(
  extractReferencedInlineImageEmbedIds(`Start ${markdownReference} middle ![Other](dm-embed://img-2) end ${markdownReference}`),
  ["img-1", "img-2"]
);

const referencedEmbeds = filterReferencedInlineImageEmbeds(
  `Alpha ${markdownReference} omega`,
  [
    { id: "img-1", alt: "Screenshot.png" },
    { id: "img-2", alt: "Unused" }
  ]
);

assert.deepEqual(
  referencedEmbeds,
  [{ id: "img-1", alt: "Screenshot.png" }]
);

assert.equal(
  replaceInlineImageMarkdownWithPlainText(`Before ${markdownReference}{25x25} after`),
  "Before Screenshot.png after"
);

assert.equal(
  getMessagePreviewText({
    body: markdownReference,
    embeds: [{ id: "img-1" }]
  }),
  "Screenshot.png"
);

assert.equal(
  removeInlineImageEmbedReferences(`A ${markdownReference}{25x25} B`, "img-1").trim(),
  "A B"
);

assert.deepEqual(
  insertInlineImageEmbedMarkdownReference({
    value: "Hello ",
    embed: {
      id: "img-3",
      alt: "Preview image"
    },
    selectionStart: 6,
    selectionEnd: 6
  }),
  {
    value: "Hello ![Preview image](dm-embed://img-3)",
    reference: "![Preview image](dm-embed://img-3)",
    selectionStart: 40,
    selectionEnd: 40
  }
);

assert.equal(
  getMessagePreviewText({
    body: "  Hello there  "
  }),
  "Hello there"
);

assert.equal(
  getMessagePreviewText({
    embeds: [{ id: "img-1" }]
  }),
  "Photo"
);

assert.equal(
  getMessagePreviewText({
    attachments: [{ fileName: "receipt.pdf" }]
  }),
  "receipt.pdf"
);

const latestMessage = getLatestMessageByTimestamp([
  {
    createdAt: "2026-04-18T11:00:00.000Z",
    body: "Earlier"
  },
  {
    createdAt: "2026-04-18T11:05:00.000Z",
    body: "",
    embeds: [{ id: "img-2" }]
  }
]);

assert.equal(latestMessage?.createdAt, "2026-04-18T11:05:00.000Z");

console.log("dm-inline-embeds.test.mjs: ok");
