import {
  createAppDiagnosticError,
  recordAppDiagnostic
} from "../../lib/diagnostics.js";
import { buildInlineImageDiagnosticDetails } from "./inlineEmbedContracts.js";

const INFO_TRACE_LIMIT = 500;
const seenInfoTraceKeys = new Set();

const DIAGNOSTIC_CODE_BY_REASON = Object.freeze({
  "invalid-embed": "DM_INLINE_IMAGE_EMBED_INVALID",
  "missing-id": "DM_INLINE_IMAGE_EMBED_INVALID",
  "missing-mime": "DM_INLINE_IMAGE_EMBED_INVALID",
  "missing-data": "DM_INLINE_IMAGE_EMBED_INVALID",
  "preview-source-missing": "DM_INLINE_IMAGE_PREVIEW_SOURCE_MISSING",
  "missing-embed": "DM_INLINE_IMAGE_REFERENCE_MISSING",
  "missing-embed-id": "DM_INLINE_IMAGE_REFERENCE_MISSING",
  "invalid-image-src": "DM_INLINE_IMAGE_RENDER_SOURCE_INVALID",
  "roundtrip-missing": "DM_INLINE_IMAGE_ROUND_TRIP_MISSING",
  "render-error": "DM_INLINE_IMAGE_RENDER_ERROR",
  "trace": "DM_INLINE_IMAGE_TRACE"
});

function getDiagnosticCode(level, reason) {
  if (level === "info") {
    return "DM_INLINE_IMAGE_TRACE";
  }

  return DIAGNOSTIC_CODE_BY_REASON[String(reason || "").trim()] || "DM_INLINE_IMAGE_TRACE";
}

function rememberInfoTraceKey(traceKey) {
  if (!traceKey || seenInfoTraceKeys.has(traceKey)) {
    return false;
  }

  seenInfoTraceKeys.add(traceKey);

  if (seenInfoTraceKeys.size > INFO_TRACE_LIMIT) {
    const firstKey = seenInfoTraceKeys.values().next().value;
    if (firstKey) {
      seenInfoTraceKeys.delete(firstKey);
    }
  }

  return true;
}

export function traceInlineImageDiagnostic({
  level = "info",
  debugMode = false,
  onceKey = "",
  stage = "",
  reason = "",
  message = "",
  userMessage = "",
  body = "",
  embeds = [],
  embed = null,
  embedId = "",
  conversationId = "",
  messageId = "",
  surface = "",
  extraDetails = {}
} = {}) {
  const normalizedLevel = String(level || "info").trim().toLowerCase();

  if (normalizedLevel === "info") {
    if (!debugMode) {
      return null;
    }

    if (onceKey && !rememberInfoTraceKey(onceKey)) {
      return null;
    }
  }

  return recordAppDiagnostic(createAppDiagnosticError({
    code: getDiagnosticCode(normalizedLevel, reason),
    message: String(message || "Inline image trace"),
    userMessage: String(userMessage || message || "Inline image trace"),
    source: "dm",
    operation: `inlineImage.${String(stage || "unknown")}`,
    severity: normalizedLevel,
    conversationId,
    details: buildInlineImageDiagnosticDetails({
      stage,
      reason,
      body,
      embeds,
      embed,
      embedId,
      conversationId,
      messageId,
      surface,
      extraDetails
    })
  }));
}
