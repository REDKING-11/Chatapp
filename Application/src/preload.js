import { contextBridge, ipcRenderer } from "electron";
import { classifySecureDmIpcError } from "./lib/diagnostics.js";

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  Object.getOwnPropertyNames(value).forEach((key) => {
    const entry = value[key];
    if (entry && typeof entry === "object" && !Object.isFrozen(entry)) {
      deepFreeze(entry);
    }
  });

  return Object.freeze(value);
}

function exposeFrozenApi(name, api) {
  contextBridge.exposeInMainWorld(name, deepFreeze(api));
}

function secureDmInvoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload).catch((error) => {
    throw classifySecureDmIpcError(channel, error);
  });
}

// Security boundary: expose only reviewed, high-level secure DM operations.
// Never expose a generic IPC invoke/send helper here, and never add APIs that can
// return raw private keys, master keys, wrapped master keys, or decrypted secrets.
exposeFrozenApi("secureDm", {
  initializeDevice: (payload) => secureDmInvoke("secure-dm:init-device", payload),
  getDeviceBundle: (payload) => secureDmInvoke("secure-dm:get-device-bundle", payload),
  getConversationAccess: (payload) => secureDmInvoke("secure-dm:get-conversation-access", payload),
  createConversation: (payload) => secureDmInvoke("secure-dm:create-conversation", payload),
  adoptConversationId: (payload) => secureDmInvoke("secure-dm:adopt-conversation-id", payload),
  importConversation: (payload) => secureDmInvoke("secure-dm:import-conversation", payload),
  createMessage: (payload) => secureDmInvoke("secure-dm:create-message", payload),
  receiveMessage: (payload) => secureDmInvoke("secure-dm:receive-message", payload),
  syncConversationMetadata: (payload) => secureDmInvoke("secure-dm:sync-conversation-metadata", payload),
  listConversations: (payload) => secureDmInvoke("secure-dm:list-conversations", payload),
  listMessages: (payload) => secureDmInvoke("secure-dm:list-messages", payload),
  setMessageDeliveryState: (payload) => secureDmInvoke("secure-dm:set-message-delivery-state", payload),
  exportConversationPackage: (payload) => secureDmInvoke("secure-dm:export-conversation-package", payload),
  createWrappedKey: (payload) => secureDmInvoke("secure-dm:create-wrapped-key", payload),
  verifyDeviceBundles: (payload) => secureDmInvoke("secure-dm:verify-device-bundles", payload),
  getConversationVerification: (payload) => secureDmInvoke("secure-dm:get-conversation-verification", payload),
  setConversationDeviceVerified: (payload) => secureDmInvoke("secure-dm:set-conversation-device-verified", payload),
  beginDeviceIdentityRotation: (payload) => secureDmInvoke("secure-dm:begin-device-identity-rotation", payload),
  commitDeviceIdentityRotation: (payload) => secureDmInvoke("secure-dm:commit-device-identity-rotation", payload),
  rollbackDeviceIdentityRotation: (payload) => secureDmInvoke("secure-dm:rollback-device-identity-rotation", payload),
  rotateConversationKey: (payload) => secureDmInvoke("secure-dm:rotate-conversation-key", payload),
  rotateDeviceIdentity: (payload) => secureDmInvoke("secure-dm:rotate-device-identity", payload),
  importConversationPackage: (payload) => secureDmInvoke("secure-dm:import-conversation-package", payload),
  deleteConversation: (payload) => secureDmInvoke("secure-dm:delete-conversation", payload),
  diagnoseMissingKeys: (payload) => secureDmInvoke("secure-dm:diagnose-missing-keys", payload),
  exportDeviceTransfer: (payload) => secureDmInvoke("secure-dm:export-device-transfer", payload),
  importDeviceTransfer: (payload) => secureDmInvoke("secure-dm:import-device-transfer", payload)
});

exposeFrozenApi("desktopNotifications", {
  show: (payload) => ipcRenderer.invoke("desktop-notifications:show", payload)
});

// Auth tokens are persisted only through the reviewed main-process secure store.
// Do not reintroduce renderer localStorage/sessionStorage token persistence.
exposeFrozenApi("authSession", {
  getToken: () => ipcRenderer.invoke("auth-session:get-token"),
  setToken: (token) => ipcRenderer.invoke("auth-session:set-token", token),
  clearToken: () => ipcRenderer.invoke("auth-session:clear-token")
});

exposeFrozenApi("serverHealth", {
  check: (backendUrl) => ipcRenderer.invoke("server-health:check", backendUrl)
});

exposeFrozenApi("appUpdates", {
  getUpdateState: () => ipcRenderer.invoke("app-update:get-state"),
  checkForUpdates: (options) => ipcRenderer.invoke("app-update:check", options),
  openReleasesPage: () => ipcRenderer.invoke("app-update:open-releases"),
  openDownloadedInstaller: () => ipcRenderer.invoke("app-update:open-installer"),
  onUpdateState: (listener) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    const wrappedListener = (_event, payload) => {
      listener(payload);
    };

    ipcRenderer.on("app-update:state-changed", wrappedListener);
    return () => ipcRenderer.removeListener("app-update:state-changed", wrappedListener);
  }
});

exposeFrozenApi("attachmentTransfers", {
  registerOutgoing: (payload) => ipcRenderer.invoke("attachment-transfers:register-outgoing", payload),
  getOutgoingInfo: (payload) => ipcRenderer.invoke("attachment-transfers:get-outgoing-info", payload),
  readOutgoingChunk: (payload) => ipcRenderer.invoke("attachment-transfers:read-outgoing-chunk", payload),
  chooseSavePath: (payload) => ipcRenderer.invoke("attachment-transfers:choose-save-path", payload),
  beginIncomingDownload: (payload) => ipcRenderer.invoke("attachment-transfers:begin-incoming-download", payload),
  appendIncomingChunk: (payload) => ipcRenderer.invoke("attachment-transfers:append-incoming-chunk", payload),
  finishIncomingDownload: (payload) => ipcRenderer.invoke("attachment-transfers:finish-incoming-download", payload),
  cancelIncomingDownload: (payload) => ipcRenderer.invoke("attachment-transfers:cancel-incoming-download", payload)
});

exposeFrozenApi("fileShares", {
  createOrReuse: (payload) => ipcRenderer.invoke("file-shares:create-or-reuse", payload),
  get: (payload) => ipcRenderer.invoke("file-shares:get", payload),
  list: () => ipcRenderer.invoke("file-shares:list"),
  reset: (payload) => ipcRenderer.invoke("file-shares:reset", payload),
  prepareDownload: (payload) => ipcRenderer.invoke("file-shares:prepare-download", payload)
});
