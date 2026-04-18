import assert from "node:assert/strict";
import { normalizeInlineImageEmbeds } from "../src/features/dm/inlineEmbeds.js";
import {
  buildInlineImageDiagnosticDetails,
  inspectInlineImageEmbedRenderable,
  resolveInlineImageEmbedReference,
  summarizeInlineImageEmbed,
  summarizeInlineImageEmbedUsage,
  verifyInlineImageEmbedsRoundTrip
} from "../src/features/dm/inlineEmbedContracts.js";

const validEmbed = normalizeInlineImageEmbeds([{
  id: "img-1",
  kind: "image",
  mimeType: "image/png",
  width: 128,
  height: 96,
  dataBase64: "AQID",
  alt: "Screenshot.png"
}])[0];

assert.ok(validEmbed);

assert.deepEqual(
  summarizeInlineImageEmbed(validEmbed),
  {
    embedId: "img-1",
    mimeType: "image/png",
    byteLength: 3,
    width: 128,
    height: 96,
    dataBase64Length: 4
  }
);

const renderable = inspectInlineImageEmbedRenderable(validEmbed);
assert.equal(renderable.ok, true);
assert.equal(renderable.reason, "ok");
assert.equal(renderable.imageSrc, "data:image/png;base64,AQID");

const invalidRenderable = inspectInlineImageEmbedRenderable({
  id: "img-invalid",
  mimeType: "image/png",
  width: 128,
  height: 96,
  byteLength: 3,
  dataBase64: "***"
});
assert.equal(invalidRenderable.ok, false);
assert.equal(invalidRenderable.reason, "invalid-image-src");

const repeatedReferenceBody = [
  "Before",
  "![Screenshot.png](dm-embed://img-1)",
  "middle",
  "![Screenshot again](dm-embed://img-1)",
  "after"
].join(" ");

assert.deepEqual(
  summarizeInlineImageEmbedUsage({
    body: repeatedReferenceBody,
    embeds: [validEmbed]
  }),
  {
    bodyHasEmbedRef: true,
    referencedEmbedIds: ["img-1"],
    missingReferencedEmbedIds: [],
    unreferencedEmbedIds: [],
    embedCount: 1
  }
);

const resolvedReference = resolveInlineImageEmbedReference({
  embedId: "img-1",
  alt: "Screenshot.png",
  embeds: [validEmbed]
});
assert.equal(resolvedReference.ok, true);
assert.equal(resolvedReference.embedId, "img-1");
assert.equal(resolvedReference.imageSrc, "data:image/png;base64,AQID");

const missingReference = resolveInlineImageEmbedReference({
  embedId: "img-missing",
  alt: "Missing",
  embeds: [validEmbed]
});
assert.equal(missingReference.ok, false);
assert.equal(missingReference.reason, "missing-embed");

const invalidReference = resolveInlineImageEmbedReference({
  embedId: "img-invalid",
  alt: "Broken",
  embeds: [{
    id: "img-invalid",
    mimeType: "image/png",
    width: 128,
    height: 96,
    byteLength: 3,
    dataBase64: "***"
  }]
});
assert.equal(invalidReference.ok, false);
assert.equal(invalidReference.reason, "invalid-image-src");

const roundTripOk = verifyInlineImageEmbedsRoundTrip({
  body: "text ![Screenshot.png](dm-embed://img-1)",
  outgoingEmbeds: [validEmbed],
  visibleEmbeds: [validEmbed]
});
assert.equal(roundTripOk.ok, true);
assert.deepEqual(roundTripOk.missingOnVisible, []);

const roundTripMissing = verifyInlineImageEmbedsRoundTrip({
  body: "text ![Screenshot.png](dm-embed://img-1)",
  outgoingEmbeds: [validEmbed],
  visibleEmbeds: []
});
assert.equal(roundTripMissing.ok, false);
assert.deepEqual(roundTripMissing.missingOnVisible, ["img-1"]);

assert.deepEqual(
  buildInlineImageDiagnosticDetails({
    stage: "service.list",
    reason: "roundtrip-missing",
    body: "text ![Screenshot.png](dm-embed://img-1)",
    embeds: [],
    embedId: "img-1",
    conversationId: "42",
    messageId: "m-1",
    surface: "service-list"
  }),
  {
    stage: "service.list",
    reason: "roundtrip-missing",
    surface: "service-list",
    conversationId: "42",
    messageId: "m-1",
    embedId: "img-1",
    mimeType: "",
    byteLength: 0,
    width: 0,
    height: 0,
    dataBase64Length: 0,
    bodyHasEmbedRef: true,
    referencedEmbedIds: ["img-1"],
    missingReferencedEmbedIds: ["img-1"],
    embedCount: 0
  }
);

console.log("dm-inline-image-diagnostics.test.mjs: ok");
