import fs from "node:fs";
import path from "node:path";
import electron from "electron";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import os from "node:os";
import {
  copyStorageFiles,
  listStoragePathCandidates
} from "../storagePaths.js";
import {
  deriveShareStatus,
  normalizeFilePathKey,
  normalizeShareRegistry,
  resolveFileShareForRequest,
  resetFileShare,
  syncFileShareSelection
} from "./shareRegistryCore.js";
import {
  assertIncomingChunkLength,
  assertIncomingDownloadComplete,
  classifyIncomingChunkOffset,
  normalizeIncomingOffset
} from "./downloadIntegrity.js";

const outgoingTransfers = new Map();
const incomingTransfers = new Map();
const incomingAttachmentSecrets = new Map();
const ATTACHMENT_CHUNK_ALGORITHM = "aes-256-gcm-chunked-v1";
const FILE_SHARE_REGISTRY_NAME = "file-shares.json";
const { app, dialog } = electron || {};

let cachedShareRegistry = null;
let transferServiceDependencies = null;

function createDefaultTransferServiceDependencies() {
  return {
    getPath(name) {
      if (!app?.getPath) {
        throw new Error("Electron app.getPath is not available for transfer service");
      }

      return app.getPath(name);
    },
    async showSaveDialog(options) {
      if (!dialog?.showSaveDialog) {
        throw new Error("Electron dialog.showSaveDialog is not available for transfer service");
      }

      return dialog.showSaveDialog(options);
    }
  };
}

function getTransferServiceDependencies() {
  return transferServiceDependencies || (transferServiceDependencies = createDefaultTransferServiceDependencies());
}

function toSafeBaseName(value) {
  const normalized = String(value || "download").trim();
  const basename = path.basename(normalized);
  return basename || "download";
}

function getDefaultSavePath(fileName) {
  return path.join(getTransferServiceDependencies().getPath("downloads"), toSafeBaseName(fileName));
}

function getFileShareRegistryCandidates() {
  return listStoragePathCandidates("", [FILE_SHARE_REGISTRY_NAME]);
}

function getStableFileShareRegistryCandidate() {
  return getFileShareRegistryCandidates()[0];
}

function ensureFileShareRegistryDir(dirPath = getStableFileShareRegistryCandidate().storeDir) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function quarantineFileShareRegistry(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  try {
    fs.renameSync(filePath, `${filePath}.corrupt-${Date.now()}`);
  } catch {
    // Best-effort quarantine only.
  }
}

function readNormalizedFileShareRegistry(filePath) {
  return normalizeShareRegistry(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function getFileShareRegistryPath() {
  const [stableCandidate, ...legacyCandidates] = getFileShareRegistryCandidates();
  const stablePath = stableCandidate.filePaths[0];
  let stableError = null;

  ensureFileShareRegistryDir(stableCandidate.storeDir);

  if (fs.existsSync(stablePath)) {
    try {
      readNormalizedFileShareRegistry(stablePath);
      return stablePath;
    } catch (error) {
      stableError = error;
    }
  }

  for (const candidate of legacyCandidates) {
    const legacyPath = candidate.filePaths[0];

    if (!fs.existsSync(legacyPath)) {
      continue;
    }

    try {
      readNormalizedFileShareRegistry(legacyPath);
      copyStorageFiles(candidate.filePaths, stableCandidate.filePaths, {
        overwrite: true
      });
      return stablePath;
    } catch {
      // Keep looking for the first readable legacy candidate.
    }
  }

  if (stableError) {
    console.warn("File share registry is unreadable. Quarantining the local file share registry.", stableError);
    quarantineFileShareRegistry(stablePath);
  }

  return stablePath;
}

function loadFileShareRegistry() {
  if (cachedShareRegistry) {
    return cachedShareRegistry;
  }

  try {
    cachedShareRegistry = readNormalizedFileShareRegistry(getFileShareRegistryPath());
  } catch {
    cachedShareRegistry = normalizeShareRegistry({ shares: [] });
  }

  return cachedShareRegistry;
}

function saveFileShareRegistry(registry) {
  cachedShareRegistry = normalizeShareRegistry(registry);
  const filePath = getFileShareRegistryPath();
  ensureFileShareRegistryDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(cachedShareRegistry, null, 2), "utf8");
  return cachedShareRegistry;
}

function nextShareId() {
  return `share_${randomUUID()}`;
}

function nextTransferId() {
  return `file_${randomUUID()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getMimeTypeFromFilePath(filePath) {
  const extension = path.extname(String(filePath || "")).toLowerCase();

  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".txt":
      return "text/plain";
    case ".md":
      return "text/markdown";
    case ".json":
      return "application/json";
    case ".pdf":
      return "application/pdf";
    case ".zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

function createAttachmentSecret() {
  return {
    algorithm: ATTACHMENT_CHUNK_ALGORITHM,
    keyBase64: randomBytes(32).toString("base64")
  };
}

function getAttachmentKeyBuffer(secret) {
  const keyBase64 = String(secret?.keyBase64 || "");

  if (!keyBase64) {
    throw new Error("Attachment encryption key is missing");
  }

  return Buffer.from(keyBase64, "base64");
}

function encryptAttachmentChunk(buffer, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getAttachmentKeyBuffer(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(buffer),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    chunkBase64: ciphertext.toString("base64"),
    ivBase64: iv.toString("base64"),
    tagBase64: tag.toString("base64")
  };
}

function decryptAttachmentChunk({ chunkBase64, ivBase64, tagBase64 }, secret) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getAttachmentKeyBuffer(secret),
    Buffer.from(String(ivBase64 || ""), "base64")
  );
  decipher.setAuthTag(Buffer.from(String(tagBase64 || ""), "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(String(chunkBase64 || ""), "base64")),
    decipher.final()
  ]);
}

function registerOutgoingTransferEntry(entry) {
  const normalizedEntry = {
    transferId: String(entry.transferId || nextTransferId()),
    fileName: toSafeBaseName(entry.fileName),
    mimeType: String(entry.mimeType || "application/octet-stream"),
    fileSize: Math.max(0, Number(entry.fileSize) || 0),
    secret: entry.secret || createAttachmentSecret(),
    buffer: Buffer.isBuffer(entry.buffer) ? entry.buffer : null,
    filePath: entry.filePath ? String(entry.filePath) : "",
    createdAt: entry.createdAt || nowIso(),
    shareId: entry.shareId ? String(entry.shareId) : ""
  };

  outgoingTransfers.set(normalizedEntry.transferId, normalizedEntry);
  return normalizedEntry;
}

function readFileSnapshot(filePath, fallback = {}) {
  try {
    const stats = fs.statSync(String(filePath || ""));

    if (!stats.isFile()) {
      return {
        exists: false,
        reason: "missing"
      };
    }

    return {
      exists: true,
      filePath: String(filePath),
      fileName: toSafeBaseName(fallback.fileName || path.basename(String(filePath || ""))),
      mimeType: String(fallback.mimeType || getMimeTypeFromFilePath(filePath)),
      fileSize: stats.size,
      modifiedMs: Math.round(stats.mtimeMs || 0)
    };
  } catch {
    return {
      exists: false,
      reason: "missing"
    };
  }
}

function buildPublicFileShare(share, options = {}) {
  if (!share) {
    return null;
  }

  const status = deriveShareStatus(share);

  return {
    shareId: share.shareId,
    status,
    fileName: share.fileName,
    mimeType: share.mimeType,
    fileSize: share.fileSize,
    updatedAt: share.updatedAt || share.createdAt || "",
    deprecatedAt: share.deprecatedAt || "",
    deprecatedReason: share.deprecatedReason || "",
    replacedByShareId: share.replacedByShareId || "",
    filePath: options.includePath ? share.filePath : undefined
  };
}

function getShareOrThrow(shareId) {
  const registry = loadFileShareRegistry();
  const share = registry.shares.find((entry) => entry.shareId === String(shareId || ""));

  if (!share) {
    throw new Error("Share could not be found");
  }

  return share;
}

function buildAttachmentPayload(entry) {
  return {
    transferId: entry.transferId,
    fileName: entry.fileName,
    mimeType: entry.mimeType,
    fileSize: entry.fileSize,
    encryption: {
      algorithm: entry.secret.algorithm,
      keyBase64: entry.secret.keyBase64
    }
  };
}

export function registerOutgoingAttachment({ transferId, fileName, mimeType, arrayBuffer }) {
  if (!transferId) {
    throw new Error("transferId is required");
  }

  const buffer = Buffer.from(arrayBuffer || []);
  const entry = registerOutgoingTransferEntry({
    transferId: String(transferId),
    fileName,
    mimeType,
    fileSize: buffer.byteLength,
    buffer
  });

  return {
    transferId: entry.transferId,
    fileName: entry.fileName,
    mimeType: entry.mimeType,
    fileSize: entry.fileSize,
    algorithm: entry.secret.algorithm
  };
}

export function createOrReuseFileShare({ filePath, fileName, mimeType }) {
  const snapshot = readFileSnapshot(filePath, { fileName, mimeType });

  if (!snapshot.exists) {
    throw new Error("That file is no longer available to share.");
  }

  const result = syncFileShareSelection({
    registry: loadFileShareRegistry(),
    filePath: snapshot.filePath,
    fileName: snapshot.fileName,
    mimeType: snapshot.mimeType,
    fileSize: snapshot.fileSize,
    modifiedMs: snapshot.modifiedMs,
    now: nowIso(),
    createShareId: nextShareId
  });

  saveFileShareRegistry(result.registry);

  return {
    ...buildPublicFileShare(result.share, { includePath: true }),
    action: result.action
  };
}

export function listFileShares() {
  const registry = loadFileShareRegistry();

  return {
    shares: registry.shares
      .slice()
      .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
      .map((entry) => buildPublicFileShare(entry, { includePath: true }))
  };
}

export function getFileShare({ shareId }) {
  const share = getShareOrThrow(shareId);
  return buildPublicFileShare(share, { includePath: true });
}

export function resetOutgoingFileShare({ shareId }) {
  const currentShare = getShareOrThrow(shareId);
  const snapshot = readFileSnapshot(currentShare.filePath, {
    fileName: currentShare.fileName,
    mimeType: currentShare.mimeType
  });
  const result = resetFileShare({
    registry: loadFileShareRegistry(),
    shareId,
    snapshot,
    now: nowIso(),
    createShareId: nextShareId
  });

  saveFileShareRegistry(result.registry);

  return {
    share: buildPublicFileShare(result.share, { includePath: true }),
    replacementShare: buildPublicFileShare(result.replacementShare, { includePath: true })
  };
}

export function prepareOutgoingFileShareDownload({ shareId }) {
  const currentShare = getShareOrThrow(shareId);
  const resolution = resolveFileShareForRequest({
    registry: loadFileShareRegistry(),
    shareId,
    snapshot: readFileSnapshot(currentShare.filePath, {
      fileName: currentShare.fileName,
      mimeType: currentShare.mimeType
    }),
    now: nowIso(),
    createShareId: nextShareId
  });

  saveFileShareRegistry(resolution.registry);

  if (!resolution.ok) {
    const error = new Error(resolution.errorMessage || "That share is not available.");
    error.code = resolution.errorCode;
    error.shareId = String(shareId || "");
    error.replacementShareId = resolution.replacementShareId || "";
    throw error;
  }

  const session = registerOutgoingTransferEntry({
    transferId: nextTransferId(),
    fileName: resolution.share.fileName,
    mimeType: resolution.share.mimeType,
    fileSize: resolution.share.fileSize,
    filePath: resolution.share.filePath,
    shareId: resolution.share.shareId
  });

  return {
    share: buildPublicFileShare(resolution.share, { includePath: true }),
    attachment: {
      ...buildAttachmentPayload(session),
      shareId: resolution.share.shareId,
      status: "active"
    }
  };
}

export function buildOutgoingAttachmentPayload({ transferId }) {
  const entry = outgoingTransfers.get(String(transferId || ""));

  if (!entry) {
    throw new Error("Attachment is no longer available on this device");
  }

  return buildAttachmentPayload(entry);
}

export function buildOutgoingFileSharePayload({ shareId }) {
  const share = getShareOrThrow(shareId);
  const resolution = resolveFileShareForRequest({
    registry: loadFileShareRegistry(),
    shareId,
    snapshot: readFileSnapshot(share.filePath, {
      fileName: share.fileName,
      mimeType: share.mimeType
    }),
    now: nowIso(),
    createShareId: nextShareId
  });

  saveFileShareRegistry(resolution.registry);

  if (!resolution.ok) {
    if (resolution.replacementShareId) {
      const replacementShare = resolution.registry.shares.find(
        (entry) => entry.shareId === resolution.replacementShareId
      );

      if (replacementShare) {
        return {
          shareId: replacementShare.shareId,
          fileName: replacementShare.fileName,
          mimeType: replacementShare.mimeType,
          fileSize: replacementShare.fileSize,
          status: "active",
          deprecatedAt: "",
          deprecatedReason: "",
          replacedByShareId: ""
        };
      }
    }

    const fallbackShare = resolution.share || share;
    return {
      shareId: fallbackShare.shareId,
      fileName: fallbackShare.fileName,
      mimeType: fallbackShare.mimeType,
      fileSize: fallbackShare.fileSize,
      status: deriveShareStatus(fallbackShare),
      deprecatedAt: fallbackShare.deprecatedAt || "",
      deprecatedReason: fallbackShare.deprecatedReason || "",
      replacedByShareId: fallbackShare.replacedByShareId || ""
    };
  }

  return {
    shareId: resolution.share.shareId,
    fileName: resolution.share.fileName,
    mimeType: resolution.share.mimeType,
    fileSize: resolution.share.fileSize,
    status: "active",
    deprecatedAt: "",
    deprecatedReason: "",
    replacedByShareId: ""
  };
}

export function registerIncomingAttachmentPayload(attachment) {
  const transferId = String(attachment?.transferId || "");
  const encryption = attachment?.encryption;

  if (!transferId || !encryption?.keyBase64) {
    return;
  }

  incomingAttachmentSecrets.set(transferId, {
    algorithm: String(encryption.algorithm || ATTACHMENT_CHUNK_ALGORITHM),
    keyBase64: String(encryption.keyBase64),
    fileName: toSafeBaseName(attachment?.fileName),
    mimeType: String(attachment?.mimeType || "application/octet-stream"),
    fileSize: Math.max(0, Number(attachment?.fileSize) || 0)
  });
}

export function getOutgoingAttachmentInfo({ transferId }) {
  const entry = outgoingTransfers.get(String(transferId || ""));

  if (!entry) {
    return null;
  }

  return {
    transferId: entry.transferId,
    shareId: entry.shareId || "",
    fileName: entry.fileName,
    mimeType: entry.mimeType,
    fileSize: entry.fileSize,
    algorithm: entry.secret.algorithm
  };
}

export function readOutgoingAttachmentChunk({ transferId, offset = 0, length = 65536 }) {
  const entry = outgoingTransfers.get(String(transferId || ""));

  if (!entry) {
    throw new Error("Attachment is no longer available on this device");
  }

  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLength = Math.max(1024, Number(length) || 65536);
  const nextOffset = Math.min(entry.fileSize, safeOffset + safeLength);
  let chunk = Buffer.alloc(0);

  if (entry.buffer) {
    chunk = entry.buffer.subarray(safeOffset, nextOffset);
  } else if (entry.filePath) {
    const fileHandle = fs.openSync(entry.filePath, "r");
    try {
      const chunkLength = Math.max(0, nextOffset - safeOffset);
      chunk = Buffer.alloc(chunkLength);
      fs.readSync(fileHandle, chunk, 0, chunkLength, safeOffset);
    } finally {
      fs.closeSync(fileHandle);
    }
  }

  const encryptedChunk = encryptAttachmentChunk(chunk, entry.secret);

  return {
    transferId: entry.transferId,
    shareId: entry.shareId || "",
    fileName: entry.fileName,
    mimeType: entry.mimeType,
    fileSize: entry.fileSize,
    algorithm: entry.secret.algorithm,
    offset: safeOffset,
    nextOffset,
    done: nextOffset >= entry.fileSize,
    chunkBase64: encryptedChunk.chunkBase64,
    ivBase64: encryptedChunk.ivBase64,
    tagBase64: encryptedChunk.tagBase64
  };
}

export async function chooseAttachmentSavePath({ defaultName }) {
  const result = await getTransferServiceDependencies().showSaveDialog({
    defaultPath: getDefaultSavePath(defaultName),
    buttonLabel: "Save file"
  });

  return {
    canceled: Boolean(result.canceled),
    filePath: result.canceled ? null : result.filePath
  };
}

export function beginIncomingDownload({ transferId, filePath, attachment = null, expectedBytes = null }) {
  if (!transferId || !filePath) {
    throw new Error("transferId and filePath are required");
  }

  if (attachment) {
    registerIncomingAttachmentPayload(attachment);
  }

  const secret = incomingAttachmentSecrets.get(String(transferId || ""));

  if (!secret) {
    throw new Error("Attachment decryption details are not available on this device");
  }

  const normalizedPath = String(filePath);
  const writeStream = fs.createWriteStream(normalizedPath);
  const resolvedExpectedBytes = expectedBytes ?? secret.fileSize ?? attachment?.fileSize ?? null;
  const entry = {
    transferId: String(transferId),
    filePath: normalizedPath,
    secret,
    writeStream,
    bytesWritten: 0,
    expectedBytes: resolvedExpectedBytes === null || resolvedExpectedBytes === undefined
      ? null
      : normalizeIncomingOffset(resolvedExpectedBytes)
  };

  incomingTransfers.set(entry.transferId, entry);

  return {
    transferId: entry.transferId,
    filePath: entry.filePath,
    bytesWritten: entry.bytesWritten,
    expectedBytes: entry.expectedBytes
  };
}

export async function appendIncomingDownloadChunk({ transferId, chunkBase64, ivBase64, tagBase64, offset = null, nextOffset = null, fileSize = null }) {
  const entry = incomingTransfers.get(String(transferId || ""));

  if (!entry) {
    throw new Error("Incoming transfer was not initialized");
  }

  if (fileSize !== null && fileSize !== undefined) {
    entry.expectedBytes = normalizeIncomingOffset(fileSize);
  }

  const hasExplicitOffsets = offset !== null
    && offset !== undefined
    && nextOffset !== null
    && nextOffset !== undefined;

  if (hasExplicitOffsets) {
    const offsetDecision = classifyIncomingChunkOffset({
      bytesWritten: entry.bytesWritten,
      offset,
      nextOffset
    });

    if (offsetDecision.action === "duplicate") {
      return {
        transferId: entry.transferId,
        bytesWritten: entry.bytesWritten,
        expectedBytes: entry.expectedBytes,
        offset: offsetDecision.offset,
        nextOffset: offsetDecision.nextOffset,
        duplicate: true
      };
    }
  }

  const buffer = decryptAttachmentChunk({
    chunkBase64,
    ivBase64,
    tagBase64
  }, entry.secret);

  const resolvedOffset = hasExplicitOffsets
    ? normalizeIncomingOffset(offset)
    : entry.bytesWritten;
  const resolvedNextOffset = hasExplicitOffsets
    ? normalizeIncomingOffset(nextOffset)
    : entry.bytesWritten + buffer.byteLength;

  const offsetDecision = classifyIncomingChunkOffset({
    bytesWritten: entry.bytesWritten,
    offset: resolvedOffset,
    nextOffset: resolvedNextOffset
  });

  if (entry.expectedBytes !== null && resolvedNextOffset > entry.expectedBytes) {
    throw new Error("Incoming file chunk exceeds the expected download size");
  }

  assertIncomingChunkLength({
    offset: offsetDecision.offset,
    nextOffset: offsetDecision.nextOffset,
    byteLength: buffer.byteLength
  });

  await new Promise((resolve, reject) => {
    entry.writeStream.write(buffer, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  entry.bytesWritten = offsetDecision.nextOffset;

  return {
    transferId: entry.transferId,
    bytesWritten: entry.bytesWritten,
    expectedBytes: entry.expectedBytes,
    offset: offsetDecision.offset,
    nextOffset: offsetDecision.nextOffset,
    duplicate: false
  };
}

export async function finishIncomingDownload({ transferId }) {
  const entry = incomingTransfers.get(String(transferId || ""));

  if (!entry) {
    return { ok: true, transferId: String(transferId || "") };
  }

  try {
    assertIncomingDownloadComplete({
      bytesWritten: entry.bytesWritten,
      expectedBytes: entry.expectedBytes
    });

    await new Promise((resolve, reject) => {
      entry.writeStream.end((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  } catch (error) {
    entry.writeStream.destroy();
    incomingTransfers.delete(entry.transferId);
    incomingAttachmentSecrets.delete(entry.transferId);

    try {
      fs.unlinkSync(entry.filePath);
    } catch {
      // Best effort cleanup.
    }

    throw error;
  }

  incomingTransfers.delete(entry.transferId);
  incomingAttachmentSecrets.delete(entry.transferId);

  return {
    ok: true,
    transferId: entry.transferId,
    filePath: entry.filePath,
    bytesWritten: entry.bytesWritten
  };
}

export async function cancelIncomingDownload({ transferId, removePartial = false }) {
  const entry = incomingTransfers.get(String(transferId || ""));

  if (!entry) {
    return { ok: true, transferId: String(transferId || "") };
  }

  await new Promise((resolve) => {
    entry.writeStream.destroy();
    resolve();
  });

  incomingTransfers.delete(entry.transferId);
  incomingAttachmentSecrets.delete(entry.transferId);

  if (removePartial) {
    try {
      fs.unlinkSync(entry.filePath);
    } catch {
      // Best effort cleanup.
    }
  }

  return {
    ok: true,
    transferId: entry.transferId,
    filePath: entry.filePath
  };
}

export function __setTransferServiceTestDependencies(dependencies = null) {
  if (!dependencies) {
    transferServiceDependencies = null;
    return;
  }

  const userDataRoot = path.resolve(String(dependencies.userDataRoot || os.tmpdir()));
  const downloadsRoot = path.resolve(String(dependencies.downloadsRoot || userDataRoot));

  transferServiceDependencies = {
    getPath(name) {
      if (name === "userData") {
        return userDataRoot;
      }

      if (name === "downloads") {
        return downloadsRoot;
      }

      throw new Error(`Unsupported transfer service test path: ${name}`);
    },
    async showSaveDialog(options = {}) {
      return {
        canceled: false,
        filePath: options.defaultPath || path.join(downloadsRoot, "download")
      };
    }
  };
}

export function __resetTransferServiceTestState() {
  outgoingTransfers.clear();
  incomingTransfers.clear();
  incomingAttachmentSecrets.clear();
  cachedShareRegistry = null;
}
