import fs from "node:fs";
import path from "node:path";
import { app, dialog } from "electron";

const outgoingTransfers = new Map();
const incomingTransfers = new Map();

function toSafeBaseName(value) {
  const normalized = String(value || "download").trim();
  const basename = path.basename(normalized);
  return basename || "download";
}

function getDefaultSavePath(fileName) {
  return path.join(app.getPath("downloads"), toSafeBaseName(fileName));
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
    buffer,
    createdAt: new Date().toISOString()
  };

  outgoingTransfers.set(entry.transferId, entry);

  return {
    transferId: entry.transferId,
    fileName: entry.fileName,
    mimeType: entry.mimeType,
    fileSize: entry.fileSize
  };
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
    fileSize: entry.fileSize
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

  return {
    transferId: entry.transferId,
    fileName: entry.fileName,
    mimeType: entry.mimeType,
    fileSize: entry.fileSize,
    offset: safeOffset,
    nextOffset,
    done: nextOffset >= entry.fileSize,
    chunkBase64: chunk.toString("base64")
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

  const normalizedPath = String(filePath);
  const writeStream = fs.createWriteStream(normalizedPath);
  const entry = {
    transferId: String(transferId),
    filePath: normalizedPath,
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

export async function appendIncomingDownloadChunk({ transferId, chunkBase64 }) {
  const entry = incomingTransfers.get(String(transferId || ""));

  if (!entry) {
    throw new Error("Incoming transfer was not initialized");
  }

  const buffer = Buffer.from(String(chunkBase64 || ""), "base64");

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
