import {
  buildInlineImageDataUrl,
  extractReferencedInlineImageEmbedIds
} from "./inlineEmbeds.js";

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeMimeType(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDimension(value) {
  const dimension = Math.round(Number(value) || 0);
  return Number.isInteger(dimension) && dimension > 0 ? dimension : 0;
}

function normalizeByteLength(value) {
  const byteLength = Math.max(0, Number(value) || 0);
  return Number.isFinite(byteLength) ? byteLength : 0;
}

function normalizeBase64Length(value) {
  return String(value || "").replace(/\s+/g, "").trim().length;
}

function normalizeEmbedCollection(embeds) {
  return Array.isArray(embeds) ? embeds.filter((embed) => embed && typeof embed === "object") : [];
}

export function summarizeInlineImageEmbed(embed) {
  return {
    embedId: normalizeId(embed?.id),
    mimeType: normalizeMimeType(embed?.mimeType),
    byteLength: normalizeByteLength(embed?.byteLength),
    width: normalizeDimension(embed?.width),
    height: normalizeDimension(embed?.height),
    dataBase64Length: normalizeBase64Length(embed?.dataBase64)
  };
}

export function createInlineImageEmbedMap(embeds) {
  return new Map(
    normalizeEmbedCollection(embeds)
      .map((embed) => [normalizeId(embed?.id), embed])
      .filter(([embedId]) => Boolean(embedId))
  );
}

export function summarizeInlineImageEmbedUsage({ body, embeds }) {
  const referencedEmbedIds = extractReferencedInlineImageEmbedIds(body);
  const embedIds = normalizeEmbedCollection(embeds)
    .map((embed) => normalizeId(embed?.id))
    .filter(Boolean);
  const embedIdSet = new Set(embedIds);
  const referencedIdSet = new Set(referencedEmbedIds);

  return {
    bodyHasEmbedRef: referencedEmbedIds.length > 0,
    referencedEmbedIds,
    missingReferencedEmbedIds: referencedEmbedIds.filter((embedId) => !embedIdSet.has(embedId)),
    unreferencedEmbedIds: embedIds.filter((embedId) => !referencedIdSet.has(embedId)),
    embedCount: embedIdSet.size
  };
}

export function inspectInlineImageEmbedRenderable(embed) {
  const summary = summarizeInlineImageEmbed(embed);

  if (!summary.embedId) {
    return {
      ok: false,
      reason: "missing-id",
      imageSrc: "",
      summary
    };
  }

  if (!summary.mimeType) {
    return {
      ok: false,
      reason: "missing-mime",
      imageSrc: "",
      summary
    };
  }

  if (!summary.dataBase64Length) {
    return {
      ok: false,
      reason: "missing-data",
      imageSrc: "",
      summary
    };
  }

  const imageSrc = buildInlineImageDataUrl(embed);

  if (!imageSrc) {
    return {
      ok: false,
      reason: "invalid-image-src",
      imageSrc: "",
      summary
    };
  }

  return {
    ok: true,
    reason: "ok",
    imageSrc,
    summary
  };
}

export function resolveInlineImageEmbedReference({ embedId, alt = "Image", embeds }) {
  const normalizedEmbedId = normalizeId(embedId);
  const altText = String(alt || "Image").trim() || "Image";

  if (!normalizedEmbedId) {
    return {
      ok: false,
      reason: "missing-embed-id",
      embedId: "",
      altText,
      embed: null,
      imageSrc: "",
      summary: summarizeInlineImageEmbed(null)
    };
  }

  const embed = createInlineImageEmbedMap(embeds).get(normalizedEmbedId) || null;

  if (!embed) {
    return {
      ok: false,
      reason: "missing-embed",
      embedId: normalizedEmbedId,
      altText,
      embed: null,
      imageSrc: "",
      summary: summarizeInlineImageEmbed(null)
    };
  }

  const renderability = inspectInlineImageEmbedRenderable(embed);

  return {
    ...renderability,
    embedId: normalizedEmbedId,
    altText,
    embed
  };
}

export function verifyInlineImageEmbedsRoundTrip({ body, outgoingEmbeds, visibleEmbeds }) {
  const outgoingUsage = summarizeInlineImageEmbedUsage({
    body,
    embeds: outgoingEmbeds
  });
  const visibleUsage = summarizeInlineImageEmbedUsage({
    body,
    embeds: visibleEmbeds
  });

  return {
    ok: visibleUsage.missingReferencedEmbedIds.length === 0,
    outgoingUsage,
    visibleUsage,
    missingOnVisible: visibleUsage.missingReferencedEmbedIds
  };
}

export function buildInlineImageDiagnosticDetails({
  stage = "",
  reason = "",
  body = "",
  embeds = [],
  embed = null,
  embedId = "",
  conversationId = "",
  messageId = "",
  surface = "",
  extraDetails = {}
} = {}) {
  const resolvedEmbed = embed || createInlineImageEmbedMap(embeds).get(normalizeId(embedId)) || null;
  const summary = summarizeInlineImageEmbed(resolvedEmbed);
  const usage = summarizeInlineImageEmbedUsage({
    body,
    embeds
  });

  return {
    stage: String(stage || ""),
    reason: String(reason || ""),
    surface: String(surface || ""),
    conversationId: String(conversationId || ""),
    messageId: String(messageId || ""),
    embedId: normalizeId(embedId) || summary.embedId,
    mimeType: summary.mimeType,
    byteLength: summary.byteLength,
    width: summary.width,
    height: summary.height,
    dataBase64Length: summary.dataBase64Length,
    bodyHasEmbedRef: usage.bodyHasEmbedRef,
    referencedEmbedIds: usage.referencedEmbedIds,
    missingReferencedEmbedIds: usage.missingReferencedEmbedIds,
    embedCount: usage.embedCount,
    ...extraDetails
  };
}
