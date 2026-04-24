import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import electron from "electron";

const STABLE_USER_DATA_NAME = "Chatapp";
const { app } = electron || {};
let storagePathDependencies = null;

function createDefaultStoragePathDependencies() {
  return {
    getPath(name) {
      if (!app?.getPath) {
        throw new Error("Electron app.getPath is not available for storage path resolution");
      }

      return app.getPath(name);
    }
  };
}

function getStoragePathDependencies() {
  return storagePathDependencies || (storagePathDependencies = createDefaultStoragePathDependencies());
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizePath(value) {
  return path.normalize(String(value || ""));
}

function getStableUserDataRoot() {
  return path.join(getStoragePathDependencies().getPath("appData"), STABLE_USER_DATA_NAME);
}

function getMigrationSourceRoots() {
  const appDataRoot = getStoragePathDependencies().getPath("appData");
  const stableUserDataRoot = normalizePath(getStableUserDataRoot());
  const currentUserDataRoot = normalizePath(getStoragePathDependencies().getPath("userData"));
  const sources = [];

  if (currentUserDataRoot !== stableUserDataRoot) {
    sources.push(getStoragePathDependencies().getPath("userData"));
  }

  const libreChatRoot = path.join(appDataRoot, "LibreChat");
  if (normalizePath(libreChatRoot) !== stableUserDataRoot && normalizePath(libreChatRoot) !== currentUserDataRoot) {
    sources.push(libreChatRoot);
  }

  return sources;
}

function createStoreCandidate(rootPath, subdirectory, fileNames) {
  const storeDir = path.join(rootPath, subdirectory);

  return {
    rootPath,
    storeDir,
    filePaths: fileNames.map((fileName) => path.join(storeDir, fileName))
  };
}

function hasAnyExistingFile(filePaths) {
  return filePaths.some((filePath) => fs.existsSync(filePath));
}

function copyMissingFiles(sourceFiles, targetFiles) {
  sourceFiles.forEach((sourceFilePath, index) => {
    const targetFilePath = targetFiles[index];

    if (!fs.existsSync(sourceFilePath) || fs.existsSync(targetFilePath)) {
      return;
    }

    fs.copyFileSync(sourceFilePath, targetFilePath);
  });
}

export function copyStorageFiles(sourceFiles, targetFiles, { overwrite = false } = {}) {
  targetFiles.forEach((targetFilePath) => {
    ensureDirectory(path.dirname(targetFilePath));
  });

  sourceFiles.forEach((sourceFilePath, index) => {
    const targetFilePath = targetFiles[index];

    if (!fs.existsSync(sourceFilePath)) {
      return;
    }

    if (!overwrite && fs.existsSync(targetFilePath)) {
      return;
    }

    fs.copyFileSync(sourceFilePath, targetFilePath);
  });
}

export function listStoragePathCandidates(subdirectory, fileNames) {
  return [
    createStoreCandidate(getStableUserDataRoot(), subdirectory, fileNames),
    ...getMigrationSourceRoots().map((sourceRoot) => createStoreCandidate(sourceRoot, subdirectory, fileNames))
  ];
}

export function resolveStoragePaths(subdirectory, fileNames) {
  const [stableCandidate, ...sourceCandidates] = listStoragePathCandidates(subdirectory, fileNames);
  const stableStoreDir = stableCandidate.storeDir;
  const stableFiles = stableCandidate.filePaths;

  ensureDirectory(stableStoreDir);

  if (hasAnyExistingFile(stableFiles)) {
    return {
      storeDir: stableStoreDir,
      filePaths: stableFiles
    };
  }

  for (const sourceCandidate of sourceCandidates) {
    const sourceFiles = sourceCandidate.filePaths;
    if (!hasAnyExistingFile(sourceFiles)) {
      continue;
    }

    copyStorageFiles(sourceFiles, stableFiles);

    return {
      storeDir: stableStoreDir,
      filePaths: stableFiles
    };
  }

  return {
    storeDir: stableStoreDir,
    filePaths: stableFiles
  };
}

export function __setStoragePathTestDependencies(dependencies = null) {
  if (!dependencies) {
    storagePathDependencies = null;
    return;
  }

  const appDataRoot = path.resolve(String(dependencies.appDataRoot || os.tmpdir()));
  const userDataRoot = path.resolve(String(dependencies.userDataRoot || path.join(appDataRoot, STABLE_USER_DATA_NAME)));

  storagePathDependencies = {
    getPath(name) {
      if (name === "appData") {
        return appDataRoot;
      }

      if (name === "userData") {
        return userDataRoot;
      }

      throw new Error(`Unsupported test storage path: ${name}`);
    }
  };
}
