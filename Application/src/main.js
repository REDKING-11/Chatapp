import { app, BrowserWindow, ipcMain, Notification } from 'electron';
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
  getConversationAccess,
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
  setMessageDeliveryState,
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
  createOrReuseFileShare,
  chooseAttachmentSavePath,
  finishIncomingDownload,
  getFileShare,
  getOutgoingAttachmentInfo,
  listFileShares,
  prepareOutgoingFileShareDownload,
  readOutgoingAttachmentChunk,
  registerOutgoingAttachment,
  resetOutgoingFileShare
} from './main/transfers/service';
import {
  clearStoredAuthToken,
  readStoredAuthToken,
  writeStoredAuthToken
} from './main/auth/storage';
import { registerAppUpdateIpc } from './main/appUpdates.js';
import { normalizeSecureBackendUrl } from './lib/transportPolicy.mjs';
import { normalizeAppDiagnosticError } from './lib/diagnostics.js';

if (process.platform === 'win32') {
  app.setAppUserModelId('com.redfolder.librechat');
}

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
const RENDERER_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: http: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: data: http: https:",
  "connect-src 'self' http: https: ws: wss:"
].join('; ');

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
    try {
      const result = await handler(payload);
      assertNoSecureDmSecrets(result);
      return result;
    } catch (error) {
      const operation = `secureDm.${String(channel || '').replace(/^secure-dm:/, '').replace(/-/g, '.') || 'unknown'}`;
      const innerDiagnostic = normalizeAppDiagnosticError(error);
      const diagnostic = normalizeAppDiagnosticError(error, {
        code: String(error?.code || '').startsWith('IPC_') ? error.code : 'IPC_SECURE_DM_FAILED',
        message: innerDiagnostic.message,
        userMessage: 'Secure DM local operation failed.',
        source: 'ipc',
        operation,
        severity: 'error',
        details: {
          channel,
          causeCode: innerDiagnostic.code,
          causeSource: innerDiagnostic.source,
          causeOperation: innerDiagnostic.operation,
          causeMessage: innerDiagnostic.message,
          causeUserMessage: innerDiagnostic.userMessage,
          causeStatus: innerDiagnostic.status ?? null,
          causeEndpoint: innerDiagnostic.endpoint || '',
          causeDeviceId: innerDiagnostic.deviceId || '',
          causeConversationId: innerDiagnostic.conversationId || ''
        }
      });

      console.error(`[${diagnostic.code}] ${operation}`, {
        code: diagnostic.code,
        source: diagnostic.source,
        operation: diagnostic.operation,
        severity: diagnostic.severity,
        details: diagnostic.details,
        message: diagnostic.message,
        cause: {
          code: innerDiagnostic.code,
          source: innerDiagnostic.source,
          operation: innerDiagnostic.operation,
          message: innerDiagnostic.message,
          stack: innerDiagnostic.stack
        }
      });

      const wrappedError = new Error(`[${diagnostic.code}] ${diagnostic.message}`);
      wrappedError.code = diagnostic.code;
      wrappedError.source = diagnostic.source;
      wrappedError.operation = diagnostic.operation;
      wrappedError.severity = diagnostic.severity;
      wrappedError.status = diagnostic.status ?? null;
      wrappedError.endpoint = diagnostic.endpoint || '';
      wrappedError.traceId = diagnostic.traceId || '';
      wrappedError.deviceId = diagnostic.deviceId || '';
      wrappedError.conversationId = diagnostic.conversationId || '';
      wrappedError.friendUserId = diagnostic.friendUserId || '';
      wrappedError.details = diagnostic.details;
      wrappedError.causeCode = innerDiagnostic.code;
      wrappedError.causeSource = innerDiagnostic.source;
      wrappedError.causeOperation = innerDiagnostic.operation;
      wrappedError.causeMessage = innerDiagnostic.message;
      wrappedError.causeStack = innerDiagnostic.stack;
      throw wrappedError;
    }
  });
}

const SECURE_DM_IPC_HANDLERS = Object.freeze({
  'secure-dm:init-device': initializeDevice,
  'secure-dm:get-device-bundle': getDeviceBundle,
  'secure-dm:get-conversation-access': getConversationAccess,
  'secure-dm:create-conversation': createConversation,
  'secure-dm:adopt-conversation-id': adoptConversationId,
  'secure-dm:import-conversation': importConversation,
  'secure-dm:create-message': createEncryptedMessage,
  'secure-dm:receive-message': receiveEncryptedMessage,
  'secure-dm:sync-conversation-metadata': syncConversationMetadata,
  'secure-dm:list-conversations': listConversations,
  'secure-dm:list-messages': listMessages,
  'secure-dm:set-message-delivery-state': setMessageDeliveryState,
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
  return normalizeSecureBackendUrl(value, 'Backend URL');
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

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = {
      ...(details.responseHeaders || {})
    };

    responseHeaders['Content-Security-Policy'] = [RENDERER_CSP];

    callback({ responseHeaders });
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

const registerAttachmentTransferIpc = () => {
  ipcMain.handle('attachment-transfers:register-outgoing', (_event, payload) => registerOutgoingAttachment(payload));
  ipcMain.handle('attachment-transfers:get-outgoing-info', (_event, payload) => getOutgoingAttachmentInfo(payload));
  ipcMain.handle('attachment-transfers:read-outgoing-chunk', (_event, payload) => readOutgoingAttachmentChunk(payload));
  ipcMain.handle('attachment-transfers:choose-save-path', (_event, payload) => chooseAttachmentSavePath(payload));
  ipcMain.handle('attachment-transfers:begin-incoming-download', (_event, payload) => beginIncomingDownload(payload));
  ipcMain.handle('attachment-transfers:append-incoming-chunk', (_event, payload) => appendIncomingDownloadChunk(payload));
  ipcMain.handle('attachment-transfers:finish-incoming-download', (_event, payload) => finishIncomingDownload(payload));
  ipcMain.handle('attachment-transfers:cancel-incoming-download', (_event, payload) => cancelIncomingDownload(payload));
  ipcMain.handle('file-shares:create-or-reuse', (_event, payload) => createOrReuseFileShare(payload));
  ipcMain.handle('file-shares:get', (_event, payload) => getFileShare(payload));
  ipcMain.handle('file-shares:list', () => listFileShares());
  ipcMain.handle('file-shares:reset', (_event, payload) => resetOutgoingFileShare(payload));
  ipcMain.handle('file-shares:prepare-download', (_event, payload) => prepareOutgoingFileShareDownload(payload));
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
