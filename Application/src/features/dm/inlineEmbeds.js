export const INLINE_IMAGE_EMBED_KIND = "image";
export const INLINE_IMAGE_EMBED_MAX_BYTES = 256 * 1024;
export const INLINE_IMAGE_EMBED_URI_SCHEME = "dm-embed://";
export const INLINE_IMAGE_EMBED_MARKDOWN_SIZE_UNIT_PX = 10;
export const INLINE_IMAGE_EMBED_MIME_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/webp"
]);

function normalizeMimeType(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeBase64(value) {
  const normalized = String(value || "").replace(/\s+/g, "").trim();

  if (!normalized) {
    return "";
  }

  return /^[a-z0-9+/]+=*$/i.test(normalized) ? normalized : "";
}

function inferBase64ByteLength(value) {
  const normalized = normalizeBase64(value);

  if (!normalized) {
    return 0;
  }

  const paddingLength = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;

  return Math.max(0, Math.floor((normalized.length * 3) / 4) - paddingLength);
}

function normalizeEmbedDimension(value) {
  const dimension = Math.round(Number(value) || 0);
  return Number.isInteger(dimension) && dimension > 0 ? dimension : 0;
}

function normalizeAltText(value) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.slice(0, 240) : "Image";
}

function normalizeEmbedId(value) {
  return String(value || "").trim();
}

function normalizeMarkdownImageSizeValue(value, hasPxSuffix = false) {
  const numericValue = Math.round(Number(value) || 0);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return 0;
  }

  const scaledValue = hasPxSuffix
    ? numericValue
    : numericValue * INLINE_IMAGE_EMBED_MARKDOWN_SIZE_UNIT_PX;

  return Math.max(10, Math.min(2000, scaledValue));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeMarkdownAltText(value) {
  const normalized = normalizeAltText(value)
    .replace(/[\r\n]+/g, " ")
    .replace(/[[\]()]/g, "")
    .trim();

  return normalized || "Image";
}

export function parseInlineImageMarkdownSizeToken(rawValue) {
  const normalizedValue = String(rawValue || "").trim();
  const match = normalizedValue.match(/^\{\s*(\d{1,4})(px)?\s*x\s*(\d{1,4})(px)?\s*\}$/i);

  if (!match) {
    return null;
  }

  const widthPx = normalizeMarkdownImageSizeValue(match[1], Boolean(match[2]));
  const heightPx = normalizeMarkdownImageSizeValue(match[3], Boolean(match[4]));

  if (!widthPx || !heightPx) {
    return null;
  }

  return {
    widthPx,
    heightPx,
    token: `{${match[1]}${match[2] || ""}x${match[3]}${match[4] || ""}}`
  };
}

export function getMarkdownInlineImageMatches(value) {
  const matches = [];
  const source = String(value || "");
  const pattern = /!\[([^\]]*)\]\(([^)\s]+)\)(\{\s*\d{1,4}(?:px)?\s*x\s*\d{1,4}(?:px)?\s*\})?/gi;
  let match = pattern.exec(source);

  while (match) {
    const size = parseInlineImageMarkdownSizeToken(match[3]);
    matches.push({
      fullMatch: String(match[0] || ""),
      alt: String(match[1] || ""),
      href: String(match[2] || ""),
      size,
      index: match.index
    });
    match = pattern.exec(source);
  }

  return matches;
}

function createAttachmentFallbackError(reason) {
  const error = new Error("Inline image should use the attachment path.");
  error.code = "DM_INLINE_IMAGE_ATTACHMENT_ONLY";
  error.reason = String(reason || "attachment");
  return error;
}

export function isInlineImageMimeType(value) {
  return INLINE_IMAGE_EMBED_MIME_TYPES.includes(normalizeMimeType(value));
}

export function createInlineImageEmbedUri(embedId) {
  const normalizedEmbedId = normalizeEmbedId(embedId);
  return normalizedEmbedId ? `${INLINE_IMAGE_EMBED_URI_SCHEME}${normalizedEmbedId}` : "";
}

export function parseInlineImageEmbedUri(value) {
  const normalizedValue = String(value || "").trim();
  const normalizedPrefix = normalizedValue.slice(0, INLINE_IMAGE_EMBED_URI_SCHEME.length).toLowerCase();

  if (normalizedPrefix !== INLINE_IMAGE_EMBED_URI_SCHEME) {
    return "";
  }

  return normalizeEmbedId(normalizedValue.slice(INLINE_IMAGE_EMBED_URI_SCHEME.length));
}

export function buildInlineImageMarkdownReference({ embedId, alt = "Image", size = null }) {
  const uri = createInlineImageEmbedUri(embedId);

  if (!uri) {
    return "";
  }

  const sizeToken = parseInlineImageMarkdownSizeToken(size?.token || size)
    || (
      size && Number(size?.widthPx) > 0 && Number(size?.heightPx) > 0
        ? {
            token: `{${Math.round(Number(size.widthPx) / INLINE_IMAGE_EMBED_MARKDOWN_SIZE_UNIT_PX)}x${Math.round(Number(size.heightPx) / INLINE_IMAGE_EMBED_MARKDOWN_SIZE_UNIT_PX)}}`
          }
        : null
    );

  return `![${normalizeMarkdownAltText(alt)}](${uri})${sizeToken ? sizeToken.token : ""}`;
}

export function extractReferencedInlineImageEmbedIds(value) {
  const seenIds = new Set();
  const referencedIds = [];

  getMarkdownInlineImageMatches(value).forEach((match) => {
    const embedId = parseInlineImageEmbedUri(match.href);

    if (!embedId || seenIds.has(embedId)) {
      return;
    }

    seenIds.add(embedId);
    referencedIds.push(embedId);
  });

  return referencedIds;
}

export function filterReferencedInlineImageEmbeds(value, embeds) {
  const referencedIds = new Set(extractReferencedInlineImageEmbedIds(value));

  if (!referencedIds.size || !Array.isArray(embeds)) {
    return [];
  }

  return embeds.filter((embed) => referencedIds.has(normalizeEmbedId(embed?.id)));
}

export function getLegacyInlineImageEmbeds(value, embeds) {
  const normalizedEmbeds = Array.isArray(embeds) ? embeds.filter((embed) => normalizeEmbedId(embed?.id)) : [];
  const referencedIds = new Set(extractReferencedInlineImageEmbedIds(value));

  if (!referencedIds.size) {
    return normalizedEmbeds;
  }

  return normalizedEmbeds.filter((embed) => !referencedIds.has(normalizeEmbedId(embed?.id)));
}

export function replaceInlineImageMarkdownWithPlainText(value) {
  return getMarkdownInlineImageMatches(value).reduce((currentValue, match) => {
    const embedId = parseInlineImageEmbedUri(match.href);
    const replacement = embedId
      ? (String(match.alt || "").trim() || "Photo")
      : (String(match.alt || "").trim() || String(match.href || "").trim() || "Image");

    return currentValue.replace(match.fullMatch, replacement);
  }, String(value || ""));
}

export function removeInlineImageEmbedReferences(value, embedId) {
  const uri = createInlineImageEmbedUri(embedId);

  if (!uri) {
    return String(value || "");
  }

  const pattern = new RegExp(`!\\[[^\\]]*\\]\\(${escapeRegExp(uri)}\\)(?:\\{\\s*\\d{1,4}(?:px)?\\s*x\\s*\\d{1,4}(?:px)?\\s*\\})?`, "g");

  return String(value || "")
    .replace(pattern, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ");
}

export function insertInlineImageEmbedMarkdownReference({
  value,
  embed,
  selectionStart = null,
  selectionEnd = null
}) {
  const reference = buildInlineImageMarkdownReference({
    embedId: embed?.id,
    alt: embed?.alt
  });
  const baseValue = String(value || "");

  if (!reference) {
    return {
      value: baseValue,
      reference: "",
      selectionStart: null,
      selectionEnd: null
    };
  }

  const normalizedSelectionStart = Number.isInteger(selectionStart) && selectionStart >= 0
    ? Math.min(selectionStart, baseValue.length)
    : baseValue.length;
  const normalizedSelectionEnd = Number.isInteger(selectionEnd) && selectionEnd >= 0
    ? Math.min(selectionEnd, baseValue.length)
    : normalizedSelectionStart;
  const nextValue = `${baseValue.slice(0, normalizedSelectionStart)}${reference}${baseValue.slice(normalizedSelectionEnd)}`;
  const nextCaret = normalizedSelectionStart + reference.length;

  return {
    value: nextValue,
    reference,
    selectionStart: nextCaret,
    selectionEnd: nextCaret
  };
}

export function classifyInlineImageEmbedCandidate({ mimeType, byteLength }) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const normalizedByteLength = Math.max(0, Number(byteLength) || 0);

  if (!isInlineImageMimeType(normalizedMimeType)) {
    return {
      kind: "attachment",
      reason: "unsupported-type"
    };
  }

  if (normalizedByteLength <= 0) {
    return {
      kind: "attachment",
      reason: "empty"
    };
  }

  if (normalizedByteLength > INLINE_IMAGE_EMBED_MAX_BYTES) {
    return {
      kind: "attachment",
      reason: "too-large"
    };
  }

  return {
    kind: "inline",
    reason: "ok"
  };
}

function normalizeInlineImageEmbed(entry, index) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const mimeType = normalizeMimeType(entry.mimeType);
  const dataBase64 = normalizeBase64(entry.dataBase64);
  const byteLength = inferBase64ByteLength(dataBase64);
  const width = normalizeEmbedDimension(entry.width);
  const height = normalizeEmbedDimension(entry.height);

  if (!isInlineImageMimeType(mimeType) || !dataBase64 || byteLength <= 0 || byteLength > INLINE_IMAGE_EMBED_MAX_BYTES) {
    return null;
  }

  if (!width || !height) {
    return null;
  }

  return {
    id: entry.id ? String(entry.id) : `dmimg_${index}`,
    kind: INLINE_IMAGE_EMBED_KIND,
    mimeType,
    width,
    height,
    byteLength,
    dataBase64,
    alt: normalizeAltText(entry.alt)
  };
}

export function normalizeInlineImageEmbeds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => normalizeInlineImageEmbed(entry, index))
    .filter(Boolean);
}

export function buildInlineImageDataUrl(embed) {
  const mimeType = normalizeMimeType(embed?.mimeType);
  const dataBase64 = normalizeBase64(embed?.dataBase64);

  if (!isInlineImageMimeType(mimeType) || !dataBase64) {
    return "";
  }

  return `data:${mimeType};base64,${dataBase64}`;
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

async function loadImageDimensionsFromBlob(blob) {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not decode image"));
      element.src = objectUrl;
    });

    return {
      width: Math.max(0, Number(image.naturalWidth || image.width) || 0),
      height: Math.max(0, Number(image.naturalHeight || image.height) || 0)
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function buildInlineImageEmbedFromFile({
  fileName = "",
  mimeType = "",
  arrayBuffer,
  alt = "",
  id = null
}) {
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    throw new Error("Inline image embedding requires an ArrayBuffer payload.");
  }

  const candidate = classifyInlineImageEmbedCandidate({
    mimeType,
    byteLength: arrayBuffer.byteLength
  });

  if (candidate.kind !== "inline") {
    throw createAttachmentFallbackError(candidate.reason);
  }

  const blob = new Blob([arrayBuffer], {
    type: normalizeMimeType(mimeType)
  });
  const { width, height } = await loadImageDimensionsFromBlob(blob);

  if (!width || !height) {
    throw new Error("Could not determine inline image dimensions.");
  }

  const embed = normalizeInlineImageEmbeds([{
    id: id ? String(id) : `dmimg_${crypto.randomUUID()}`,
    kind: INLINE_IMAGE_EMBED_KIND,
    mimeType,
    width,
    height,
    byteLength: arrayBuffer.byteLength,
    dataBase64: arrayBufferToBase64(arrayBuffer),
    alt: normalizeAltText(alt || fileName || "Image")
  }])[0];

  if (!embed) {
    throw new Error("Could not normalize inline image embed.");
  }

  return embed;
}
