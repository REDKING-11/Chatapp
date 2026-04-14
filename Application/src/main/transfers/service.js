import fs from "node:fs";
import path from "node:path";
import { app, dialog } from "electron";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const outgoingTransfers = new Map();
const incomingTransfers = new Map();
const incomingAttachmentSecrets = new Map();
const ATTACHMENT_CHUNK_ALGORITHM = "aes-256-gcm-chunked-v1";

function toSafeBaseName(value) {
  const normalized = String(value || "download").trim();
  const basename = path.basename(normalized);
  return basename || "download";
}

function getDefaultSavePath(fileName) {
  return path.join(app.getPath("downloads"), toSafeBaseName(fileName));
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

export function registerOutgoingAttachment({ transferId, fileName, mimeType, arrayBuffer }) {
  if (!transferId) {
    throw new Error("transferId is required");
  }

  const buffer = Buffer.from(arrayBuffer || []);
  const entry = {
    transferId: String(transferId),
    fileName: toSafeBaseName(fileName),
    mimeType: String(mimeType || "application/octet-stream"),
    fileSize: buffer.byteLength,
    secret: createAttachmentSecret(),
    buffer,
    createdAt: new Date().toISOString()
  };

  outgoingTransfers.set(entry.transferId, entry);

  return {
    transferId: entry.transferId,
    fileName: entry.fileName,
    mimeType: entry.mimeType,
    fileSize: entry.fileSize,
    algorithm: entry.secret.algorithm
  };
}

export function buildOutgoingAttachmentPayload({ transferId }) {
  const entry = outgoingTransfers.get(String(transferId || ""));

  if (!entry) {
    throw new Error("Attachment is no longer available on this device");
  }

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
  const chunk = entry.buffer.subarray(safeOffset, nextOffset);
  const encryptedChunk = encryptAttachmentChunk(chunk, entry.secret);

  return {
    transferId: entry.transferId,
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
  const result = await dialog.showSaveDialog({
    defaultPath: getDefaultSavePath(defaultName),
    buttonLabel: "Save file"
  });

  return {
    canceled: Boolean(result.canceled),
    filePath: result.canceled ? null : result.filePath
  };
}

export function beginIncomingDownload({ transferId, filePath }) {
  if (!transferId || !filePath) {
    throw new Error("transferId and filePath are required");
  }

  const secret = incomingAttachmentSecrets.get(String(transferId || ""));

  if (!secret) {
    throw new Error("Attachment decryption details are not available on this device");
  }

  const normalizedPath = String(filePath);
  const writeStream = fs.createWriteStream(normalizedPath);
  const entry = {
    transferId: String(transferId),
    filePath: normalizedPath,
    secret,
    writeStream,
    bytesWritten: 0
  };

  incomingTransfers.set(entry.transferId, entry);

  return {
    transferId: entry.transferId,
    filePath: entry.filePath,
    bytesWritten: entry.bytesWritten
  };
}

export async function appendIncomingDownloadChunk({ transferId, chunkBase64, ivBase64, tagBase64 }) {
  const entry = incomingTransfers.get(String(transferId || ""));

  if (!entry) {
    throw new Error("Incoming transfer was not initialized");
  }

  const buffer = decryptAttachmentChunk({
    chunkBase64,
    ivBase64,
    tagBase64
  }, entry.secret);

  await new Promise((resolve, reject) => {
    entry.writeStream.write(buffer, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  entry.bytesWritten += buffer.byteLength;

  return {
    transferId: entry.transferId,
    bytesWritten: entry.bytesWritten
  };
}

export async function finishIncomingDownload({ transferId }) {
  const entry = incomingTransfers.get(String(transferId || ""));

  if (!entry) {
    return { ok: true, transferId: String(transferId || "") };
  }

  await new Promise((resolve, reject) => {
    entry.writeStream.end((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

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
