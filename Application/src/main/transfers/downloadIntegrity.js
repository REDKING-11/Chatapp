export function normalizeIncomingOffset(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.floor(numberValue)) : fallback;
}

export function classifyIncomingChunkOffset({ bytesWritten = 0, offset = 0, nextOffset = 0 }) {
  const safeBytesWritten = normalizeIncomingOffset(bytesWritten);
  const safeOffset = normalizeIncomingOffset(offset);
  const safeNextOffset = normalizeIncomingOffset(nextOffset);

  if (safeNextOffset <= safeOffset) {
    throw new Error("Incoming file chunk has an invalid offset range");
  }

  if (safeOffset < safeBytesWritten) {
    if (safeNextOffset <= safeBytesWritten) {
      return {
        action: "duplicate",
        offset: safeOffset,
        nextOffset: safeNextOffset,
        bytesWritten: safeBytesWritten
      };
    }

    throw new Error("Incoming file chunk overlaps already written data");
  }

  if (safeOffset > safeBytesWritten) {
    throw new Error("Incoming file chunk arrived out of order");
  }

  return {
    action: "write",
    offset: safeOffset,
    nextOffset: safeNextOffset,
    bytesWritten: safeBytesWritten
  };
}

export function assertIncomingChunkLength({ offset = 0, nextOffset = 0, byteLength = 0 }) {
  const expectedLength = normalizeIncomingOffset(nextOffset) - normalizeIncomingOffset(offset);
  const actualLength = normalizeIncomingOffset(byteLength);

  if (expectedLength !== actualLength) {
    throw new Error("Incoming file chunk length does not match its offset range");
  }

  return true;
}

export function assertIncomingDownloadComplete({ bytesWritten = 0, expectedBytes = null }) {
  if (expectedBytes === null || expectedBytes === undefined) {
    return true;
  }

  const safeExpectedBytes = normalizeIncomingOffset(expectedBytes);
  const safeBytesWritten = normalizeIncomingOffset(bytesWritten);

  if (safeBytesWritten !== safeExpectedBytes) {
    throw new Error("Incoming file download did not finish at the expected size");
  }

  return true;
}
