import { contextBridge, ipcRenderer } from "electron";

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

// Security boundary: expose only reviewed, high-level secure DM operations.
// Never expose a generic IPC invoke/send helper here, and never add APIs that can
// return raw private keys, master keys, wrapped master keys, or decrypted secrets.
exposeFrozenApi("secureDm", {
  initializeDevice: (payload) => ipcRenderer.invoke("secure-dm:init-device", payload),
  getDeviceBundle: (payload) => ipcRenderer.invoke("secure-dm:get-device-bundle", payload),
  createConversation: (payload) => ipcRenderer.invoke("secure-dm:create-conversation", payload),
  adoptConversationId: (payload) => ipcRenderer.invoke("secure-dm:adopt-conversation-id", payload),
  importConversation: (payload) => ipcRenderer.invoke("secure-dm:import-conversation", payload),
  createMessage: (payload) => ipcRenderer.invoke("secure-dm:create-message", payload),
  receiveMessage: (payload) => ipcRenderer.invoke("secure-dm:receive-message", payload),
  syncConversationMetadata: (payload) => ipcRenderer.invoke("secure-dm:sync-conversation-metadata", payload),
  listConversations: (payload) => ipcRenderer.invoke("secure-dm:list-conversations", payload),
  listMessages: (payload) => ipcRenderer.invoke("secure-dm:list-messages", payload),
  exportConversationPackage: (payload) => ipcRenderer.invoke("secure-dm:export-conversation-package", payload),
  createWrappedKey: (payload) => ipcRenderer.invoke("secure-dm:create-wrapped-key", payload),
  verifyDeviceBundles: (payload) => ipcRenderer.invoke("secure-dm:verify-device-bundles", payload),
  getConversationVerification: (payload) => ipcRenderer.invoke("secure-dm:get-conversation-verification", payload),
  setConversationDeviceVerified: (payload) => ipcRenderer.invoke("secure-dm:set-conversation-device-verified", payload),
  beginDeviceIdentityRotation: (payload) => ipcRenderer.invoke("secure-dm:begin-device-identity-rotation", payload),
  commitDeviceIdentityRotation: (payload) => ipcRenderer.invoke("secure-dm:commit-device-identity-rotation", payload),
  rollbackDeviceIdentityRotation: (payload) => ipcRenderer.invoke("secure-dm:rollback-device-identity-rotation", payload),
  rotateConversationKey: (payload) => ipcRenderer.invoke("secure-dm:rotate-conversation-key", payload),
  rotateDeviceIdentity: (payload) => ipcRenderer.invoke("secure-dm:rotate-device-identity", payload),
  importConversationPackage: (payload) => ipcRenderer.invoke("secure-dm:import-conversation-package", payload),
  deleteConversation: (payload) => ipcRenderer.invoke("secure-dm:delete-conversation", payload),
  diagnoseMissingKeys: (payload) => ipcRenderer.invoke("secure-dm:diagnose-missing-keys", payload),
  exportDeviceTransfer: (payload) => ipcRenderer.invoke("secure-dm:export-device-transfer", payload),
  importDeviceTransfer: (payload) => ipcRenderer.invoke("secure-dm:import-device-transfer", payload)
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
  check: () => ipcRenderer.invoke("app-update:check"),
  openReleasesPage: () => ipcRenderer.invoke("app-update:open-releases")
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
