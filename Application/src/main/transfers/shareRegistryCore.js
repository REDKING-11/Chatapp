function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export function normalizeFilePathKey(filePath) {
  const normalized = normalizeString(filePath);

  if (!normalized) {
    return "";
  }

  return process.platform === "win32"
    ? normalized.toLowerCase()
    : normalized;
}

export function deriveShareStatus(share) {
  if (!share?.deprecatedAt) {
    return "active";
  }

  if (share.deprecatedReason === "changed") {
    return "changed";
  }

  if (share.deprecatedReason === "missing") {
    return "missing";
  }

  return "deprecated";
}

export function normalizeShareRegistry(value) {
  const shares = Array.isArray(value?.shares)
    ? value.shares.map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const shareId = normalizeString(entry.shareId);
      const filePath = normalizeString(entry.filePath);
      const filePathKey = normalizeFilePathKey(entry.filePathKey || filePath);

      if (!shareId || !filePath || !filePathKey) {
        return null;
      }

      return {
        shareId,
        filePath,
        filePathKey,
        fileName: normalizeString(entry.fileName, "file"),
        mimeType: normalizeString(entry.mimeType, "application/octet-stream"),
        fileSize: Math.max(0, Number(entry.fileSize) || 0),
        modifiedMs: Math.max(0, Number(entry.modifiedMs) || 0),
        createdAt: normalizeString(entry.createdAt),
        updatedAt: normalizeString(entry.updatedAt),
        deprecatedAt: normalizeString(entry.deprecatedAt),
        deprecatedReason: normalizeString(entry.deprecatedReason),
        replacedByShareId: normalizeString(entry.replacedByShareId)
      };
    }).filter(Boolean)
    : [];

  return { shares };
}

function createShareRecord({
  shareId,
  filePath,
  fileName,
  mimeType,
  fileSize,
  modifiedMs,
  now
}) {
  return {
    shareId,
    filePath,
    filePathKey: normalizeFilePathKey(filePath),
    fileName: normalizeString(fileName, "file"),
    mimeType: normalizeString(mimeType, "application/octet-stream"),
    fileSize: Math.max(0, Number(fileSize) || 0),
    modifiedMs: Math.max(0, Number(modifiedMs) || 0),
    createdAt: now,
    updatedAt: now,
    deprecatedAt: "",
    deprecatedReason: "",
    replacedByShareId: ""
  };
}

function markDeprecated(share, { reason, now, replacedByShareId = "" }) {
  if (!share) {
    return null;
  }

  return {
    ...share,
    updatedAt: now,
    deprecatedAt: now,
    deprecatedReason: normalizeString(reason),
    replacedByShareId: normalizeString(replacedByShareId)
  };
}

function getShareIndexById(registry, shareId) {
  return registry.shares.findIndex((entry) => entry.shareId === shareId);
}

function getLatestActiveShareByPath(registry, filePathKey) {
  const matches = registry.shares.filter((entry) => (
    entry.filePathKey === filePathKey
      && !entry.deprecatedAt
  ));

  if (!matches.length) {
    return null;
  }

  return matches.sort((left, right) => (
    String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""))
  ))[0];
}

export function syncFileShareSelection({
  registry,
  filePath,
  fileName,
  mimeType,
  fileSize,
  modifiedMs,
  now,
  createShareId
}) {
  const nextRegistry = normalizeShareRegistry(registry);
  const normalizedPathKey = normalizeFilePathKey(filePath);
  const activeShare = getLatestActiveShareByPath(nextRegistry, normalizedPathKey);
  const normalizedNow = normalizeString(now);

  if (
    activeShare
    && activeShare.fileSize === Math.max(0, Number(fileSize) || 0)
    && activeShare.modifiedMs === Math.max(0, Number(modifiedMs) || 0)
  ) {
    const index = getShareIndexById(nextRegistry, activeShare.shareId);
    nextRegistry.shares[index] = {
      ...activeShare,
      updatedAt: normalizedNow,
      fileName: normalizeString(fileName, activeShare.fileName),
      mimeType: normalizeString(mimeType, activeShare.mimeType)
    };

    return {
      registry: nextRegistry,
      share: nextRegistry.shares[index],
      action: "reused"
    };
  }

  const nextShare = createShareRecord({
    shareId: createShareId(),
    filePath,
    fileName,
    mimeType,
    fileSize,
    modifiedMs,
    now: normalizedNow
  });

  if (activeShare) {
    const index = getShareIndexById(nextRegistry, activeShare.shareId);
    nextRegistry.shares[index] = markDeprecated(activeShare, {
      reason: "changed",
      now: normalizedNow,
      replacedByShareId: nextShare.shareId
    });
  }

  nextRegistry.shares.push(nextShare);

  return {
    registry: nextRegistry,
    share: nextShare,
    action: activeShare ? "rotated" : "created"
  };
}

export function resolveFileShareForRequest({
  registry,
  shareId,
  snapshot,
  now,
  createShareId
}) {
  const nextRegistry = normalizeShareRegistry(registry);
  const index = getShareIndexById(nextRegistry, normalizeString(shareId));

  if (index < 0) {
    return {
      registry: nextRegistry,
      ok: false,
      errorCode: "share-not-found",
      errorMessage: "That share link could not be found."
    };
  }

  const share = nextRegistry.shares[index];
  const normalizedNow = normalizeString(now);

  if (share.deprecatedAt) {
    return {
      registry: nextRegistry,
      ok: false,
      errorCode: share.replacedByShareId ? "share-replaced" : "share-deprecated",
      errorMessage: share.replacedByShareId
        ? "That share link was replaced by a newer one."
        : "That share link is no longer active.",
      share: nextRegistry.shares[index],
      replacementShareId: share.replacedByShareId || ""
    };
  }

  if (!snapshot?.exists) {
    nextRegistry.shares[index] = markDeprecated(share, {
      reason: "missing",
      now: normalizedNow
    });

    return {
      registry: nextRegistry,
      ok: false,
      errorCode: "share-missing",
      errorMessage: "That shared file is no longer available on the sender device.",
      share: nextRegistry.shares[index]
    };
  }

  const nextSize = Math.max(0, Number(snapshot.fileSize) || 0);
  const nextModifiedMs = Math.max(0, Number(snapshot.modifiedMs) || 0);

  if (share.fileSize !== nextSize || share.modifiedMs !== nextModifiedMs) {
    const replacementShare = createShareRecord({
      shareId: createShareId(),
      filePath: share.filePath,
      fileName: snapshot.fileName || share.fileName,
      mimeType: snapshot.mimeType || share.mimeType,
      fileSize: nextSize,
      modifiedMs: nextModifiedMs,
      now: normalizedNow
    });

    nextRegistry.shares[index] = markDeprecated(share, {
      reason: "changed",
      now: normalizedNow,
      replacedByShareId: replacementShare.shareId
    });
    nextRegistry.shares.push(replacementShare);

    return {
      registry: nextRegistry,
      ok: false,
      errorCode: "share-replaced",
      errorMessage: "That share link was replaced because the file changed.",
      share: nextRegistry.shares[index],
      replacementShareId: replacementShare.shareId
    };
  }

  nextRegistry.shares[index] = {
    ...share,
    updatedAt: normalizedNow
  };

  return {
    registry: nextRegistry,
    ok: true,
    share: nextRegistry.shares[index]
  };
}

export function resetFileShare({
  registry,
  shareId,
  snapshot,
  now,
  createShareId
}) {
  const nextRegistry = normalizeShareRegistry(registry);
  const index = getShareIndexById(nextRegistry, normalizeString(shareId));

  if (index < 0) {
    throw new Error("Share could not be found");
  }

  const share = nextRegistry.shares[index];

  if (!snapshot?.exists) {
    nextRegistry.shares[index] = markDeprecated(share, {
      reason: "missing",
      now
    });
    return {
      registry: nextRegistry,
      share: nextRegistry.shares[index],
      replacementShare: null
    };
  }

  const replacementShare = createShareRecord({
    shareId: createShareId(),
    filePath: share.filePath,
    fileName: snapshot.fileName || share.fileName,
    mimeType: snapshot.mimeType || share.mimeType,
    fileSize: snapshot.fileSize,
    modifiedMs: snapshot.modifiedMs,
    now
  });

  nextRegistry.shares[index] = markDeprecated(share, {
    reason: "replaced",
    now,
    replacedByShareId: replacementShare.shareId
  });
  nextRegistry.shares.push(replacementShare);

  return {
    registry: nextRegistry,
    share: nextRegistry.shares[index],
    replacementShare
  };
}
