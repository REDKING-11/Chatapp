import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("secureDm", {
  initializeDevice: (payload) => ipcRenderer.invoke("secure-dm:init-device", payload),
  getDeviceBundle: (payload) => ipcRenderer.invoke("secure-dm:get-device-bundle", payload),
  createConversation: (payload) => ipcRenderer.invoke("secure-dm:create-conversation", payload),
  adoptConversationId: (payload) => ipcRenderer.invoke("secure-dm:adopt-conversation-id", payload),
  importConversation: (payload) => ipcRenderer.invoke("secure-dm:import-conversation", payload),
  createMessage: (payload) => ipcRenderer.invoke("secure-dm:create-message", payload),
  receiveMessage: (payload) => ipcRenderer.invoke("secure-dm:receive-message", payload),
  listConversations: (payload) => ipcRenderer.invoke("secure-dm:list-conversations", payload),
  listMessages: (payload) => ipcRenderer.invoke("secure-dm:list-messages", payload),
  exportConversationPackage: (payload) => ipcRenderer.invoke("secure-dm:export-conversation-package", payload),
  createWrappedKey: (payload) => ipcRenderer.invoke("secure-dm:create-wrapped-key", payload),
  importConversationPackage: (payload) => ipcRenderer.invoke("secure-dm:import-conversation-package", payload)
});
