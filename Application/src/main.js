import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import {
  adoptConversationId,
  createConversation,
  createEncryptedMessage,
  getDeviceBundle,
  importConversation,
  importConversationPackage,
  initializeDevice,
  listConversations,
  listMessages,
  receiveEncryptedMessage,
  exportConversationPackage,
  createWrappedKeyForConversation
} from './main/dm/service';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

};

const registerSecureDmIpc = () => {
  ipcMain.handle('secure-dm:init-device', (_event, payload) => initializeDevice(payload));
  ipcMain.handle('secure-dm:get-device-bundle', (_event, payload) => getDeviceBundle(payload));
  ipcMain.handle('secure-dm:create-conversation', (_event, payload) => createConversation(payload));
  ipcMain.handle('secure-dm:adopt-conversation-id', (_event, payload) => adoptConversationId(payload));
  ipcMain.handle('secure-dm:import-conversation', (_event, payload) => importConversation(payload));
  ipcMain.handle('secure-dm:create-message', (_event, payload) => createEncryptedMessage(payload));
  ipcMain.handle('secure-dm:receive-message', (_event, payload) => receiveEncryptedMessage(payload));
  ipcMain.handle('secure-dm:list-conversations', (_event, payload) => listConversations(payload));
  ipcMain.handle('secure-dm:list-messages', (_event, payload) => listMessages(payload));
  ipcMain.handle('secure-dm:export-conversation-package', (_event, payload) => exportConversationPackage(payload));
  ipcMain.handle('secure-dm:create-wrapped-key', (_event, payload) => createWrappedKeyForConversation(payload));
  ipcMain.handle('secure-dm:import-conversation-package', (_event, payload) => importConversationPackage(payload));
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  registerSecureDmIpc();
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
