import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import path from 'node:path';
import {
  adoptConversationId,
  createConversation,
  createEncryptedMessage,
  deleteConversation,
  diagnoseMissingConversationKeys,
  exportConversationPackage,
  exportDeviceTransferPackage,
  getDeviceBundle,
  importConversation,
  importConversationPackage,
  importDeviceTransferPackage,
  initializeDevice,
  listConversations,
  listMessages,
  receiveEncryptedMessage,
  beginDeviceIdentityRotation,
  commitDeviceIdentityRotation,
  rollbackDeviceIdentityRotation,
  syncConversationMetadata,
  createWrappedKeyForConversation,
  verifyDeviceBundles,
  getConversationVerification,
  setConversationDeviceVerified,
  rotateConversationKey,
  rotateDeviceIdentity
} from './main/dm/service';
import {
  appendIncomingDownloadChunk,
  beginIncomingDownload,
  cancelIncomingDownload,
  chooseAttachmentSavePath,
  finishIncomingDownload,
  getOutgoingAttachmentInfo,
  readOutgoingAttachmentChunk,
  registerOutgoingAttachment
} from './main/transfers/service';
import {
  clearStoredAuthToken,
  readStoredAuthToken,
  writeStoredAuthToken
} from './main/auth/storage';

const LOCAL_DEVELOPMENT_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SECURE_DM_SENSITIVE_RESPONSE_KEYS = new Set([
  'encryptionPrivateKey',
  'signingPrivateKey',
  'conversationKey',
  'masterKey',
  'wrappedMasterKey',
  'recipientPrivateKey',
  'privateKey',
  'secretKey',
  'seed',
  'rawKey',
  'decryptedKey'
]);
const FORBIDDEN_SECURE_DM_CHANNEL_TOKENS = [
  'private-key',
  'master-key',
  'raw-key',
  'secret',
  'export-key',
  'decrypt-key'
];

function assertNoSecureDmSecrets(value, path = 'result') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecureDmSecrets(entry, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  Object.entries(value).forEach(([key, entryValue]) => {
    if (SECURE_DM_SENSITIVE_RESPONSE_KEYS.has(String(key))) {
      throw new Error(`secure-dm IPC attempted to expose sensitive key material at ${path}.${key}`);
    }

    assertNoSecureDmSecrets(entryValue, `${path}.${key}`);
  });
}

function handleSecureDm(channel, handler) {
  ipcMain.handle(channel, async (_event, payload) => {
    const result = await handler(payload);
    assertNoSecureDmSecrets(result);
    return result;
  });
}

const SECURE_DM_IPC_HANDLERS = Object.freeze({
  'secure-dm:init-device': initializeDevice,
  'secure-dm:get-device-bundle': getDeviceBundle,
  'secure-dm:create-conversation': createConversation,
  'secure-dm:adopt-conversation-id': adoptConversationId,
  'secure-dm:import-conversation': importConversation,
  'secure-dm:create-message': createEncryptedMessage,
  'secure-dm:receive-message': receiveEncryptedMessage,
  'secure-dm:sync-conversation-metadata': syncConversationMetadata,
  'secure-dm:list-conversations': listConversations,
  'secure-dm:list-messages': listMessages,
  'secure-dm:export-conversation-package': exportConversationPackage,
  'secure-dm:create-wrapped-key': createWrappedKeyForConversation,
  'secure-dm:verify-device-bundles': verifyDeviceBundles,
  'secure-dm:get-conversation-verification': getConversationVerification,
  'secure-dm:set-conversation-device-verified': setConversationDeviceVerified,
  'secure-dm:rotate-conversation-key': rotateConversationKey,
  'secure-dm:rotate-device-identity': rotateDeviceIdentity,
  'secure-dm:begin-device-identity-rotation': beginDeviceIdentityRotation,
  'secure-dm:commit-device-identity-rotation': commitDeviceIdentityRotation,
  'secure-dm:rollback-device-identity-rotation': rollbackDeviceIdentityRotation,
  'secure-dm:import-conversation-package': importConversationPackage,
  'secure-dm:delete-conversation': deleteConversation,
  'secure-dm:diagnose-missing-keys': diagnoseMissingConversationKeys,
  'secure-dm:export-device-transfer': exportDeviceTransferPackage,
  'secure-dm:import-device-transfer': importDeviceTransferPackage
});

function assertSecureDmChannelPolicy(channel) {
  const normalizedChannel = String(channel || '').toLowerCase();

  FORBIDDEN_SECURE_DM_CHANNEL_TOKENS.forEach((token) => {
    if (normalizedChannel.includes(token)) {
      throw new Error(`Refusing to register forbidden secure-dm IPC channel: ${channel}`);
    }
  });
}

function assertAllowedRemoteBackendUrl(value) {
  let url;

  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('Backend URL must be a valid URL');
  }

  const hostname = String(url.hostname || '').trim().toLowerCase();
  const isLocalDevelopment = LOCAL_DEVELOPMENT_HOSTS.has(hostname) || hostname.endsWith('.localhost');

  if (url.protocol === 'https:') {
    return url.toString().replace(/\/$/, '');
  }

  if (isLocalDevelopment && url.protocol === 'http:') {
    return url.toString().replace(/\/$/, '');
  }

  throw new Error('Backend URL must use https:// for remote hosts. http:// is allowed only for localhost development.');
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
  Object.entries(SECURE_DM_IPC_HANDLERS).forEach(([channel, handler]) => {
    assertSecureDmChannelPolicy(channel);
    handleSecureDm(channel, (payload) => handler(payload));
  });
};

const registerNotificationIpc = () => {
  ipcMain.handle('desktop-notifications:show', (_event, payload) => {
    const title = String(payload?.title || 'Chatapp');
    const body = String(payload?.body || '');

    if (!Notification.isSupported()) {
      return { ok: false, supported: false };
    }

    const notification = new Notification({
      title,
      body,
      silent: false
    });
    notification.show();

    return { ok: true, supported: true };
  });
};

const registerAuthSessionIpc = () => {
  ipcMain.handle('auth-session:get-token', () => ({
    token: readStoredAuthToken()
  }));

  ipcMain.handle('auth-session:set-token', (_event, token) => writeStoredAuthToken(token));
  ipcMain.handle('auth-session:clear-token', () => clearStoredAuthToken());
};

const registerServerHealthIpc = () => {
  ipcMain.handle('server-health:check', async (_event, backendUrl) => {
    const baseUrl = assertAllowedRemoteBackendUrl(backendUrl);

    if (!baseUrl) {
      return { online: false };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${baseUrl}/api/server`, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      return { online: res.ok, status: res.status };
    } catch {
      return { online: false };
    }
  });
};

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/REDKING-11/Chatapp/releases/latest';
const GITHUB_RELEASES_PAGE = 'https://github.com/REDKING-11/Chatapp/releases';

const registerAppUpdateIpc = () => {
  ipcMain.handle('app-update:check', async () => {
    const currentVersion = app.getVersion();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(GITHUB_RELEASES_URL, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': `Chatapp/${currentVersion}`
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return { currentVersion, hasUpdate: false };
      }

      const data = await res.json();
      const latestTag = String(data.tag_name || '');
      const latestVersion = latestTag.replace(/^v/, '');
      const hasUpdate = latestVersion.length > 0 && latestVersion !== currentVersion;

      return {
        currentVersion,
        latestVersion: latestTag,
        hasUpdate,
        releaseUrl: data.html_url || GITHUB_RELEASES_PAGE,
        releaseName: data.name || latestTag
      };
    } catch {
      return { currentVersion, hasUpdate: false };
    }
  });

  ipcMain.handle('app-update:open-releases', () => {
    shell.openExternal(GITHUB_RELEASES_PAGE);
  });
};

const registerAttachmentTransferIpc = () => {
  ipcMain.handle('attachment-transfers:register-outgoing', (_event, payload) => registerOutgoingAttachment(payload));
  ipcMain.handle('attachment-transfers:get-outgoing-info', (_event, payload) => getOutgoingAttachmentInfo(payload));
  ipcMain.handle('attachment-transfers:read-outgoing-chunk', (_event, payload) => readOutgoingAttachmentChunk(payload));
  ipcMain.handle('attachment-transfers:choose-save-path', (_event, payload) => chooseAttachmentSavePath(payload));
  ipcMain.handle('attachment-transfers:begin-incoming-download', (_event, payload) => beginIncomingDownload(payload));
  ipcMain.handle('attachment-transfers:append-incoming-chunk', (_event, payload) => appendIncomingDownloadChunk(payload));
  ipcMain.handle('attachment-transfers:finish-incoming-download', (_event, payload) => finishIncomingDownload(payload));
  ipcMain.handle('attachment-transfers:cancel-incoming-download', (_event, payload) => cancelIncomingDownload(payload));
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  registerSecureDmIpc();
  registerAuthSessionIpc();
  registerNotificationIpc();
  registerServerHealthIpc();
  registerAttachmentTransferIpc();
  registerAppUpdateIpc();
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
