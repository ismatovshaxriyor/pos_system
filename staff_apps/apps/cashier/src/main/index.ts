import { app, BrowserWindow, ipcMain, session, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';

import { IPC, SECURE_KEY_PREFIX } from '../shared/ipc';
import { secureGet, secureRemove, secureSet } from './secure-store';

const isDev = !app.isPackaged;
/** Monoblokda to'liq ekran (kiosk). Ishlab chiqishda yoki `POS_KIOSK=0` bilan o'chiriladi. */
const kiosk = !isDev && process.env.POS_KIOSK !== '0';

let mainWindow: BrowserWindow | null = null;

/** IPC faqat bizning o'z sahifamizdan kelsin (kelajakda boshqa kontent yuklansa ham himoya). */
function isTrusted(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? '';
  if (isDev && process.env.ELECTRON_RENDERER_URL) return url.startsWith(process.env.ELECTRON_RENDERER_URL);
  return url.startsWith('file://');
}

function validKey(key: unknown): key is string {
  return typeof key === 'string' && key.startsWith(SECURE_KEY_PREFIX) && key.length <= 100;
}

function registerIpc(): void {
  ipcMain.handle(IPC.secureGet, (e, key: unknown) => {
    if (!isTrusted(e) || !validKey(key)) throw new Error('Ruxsat yoʼq.');
    return secureGet(key);
  });
  ipcMain.handle(IPC.secureSet, (e, key: unknown, value: unknown) => {
    if (!isTrusted(e) || !validKey(key) || typeof value !== 'string' || value.length > 65_536) {
      throw new Error('Ruxsat yoʼq.');
    }
    secureSet(key, value);
  });
  ipcMain.handle(IPC.secureRemove, (e, key: unknown) => {
    if (!isTrusted(e) || !validKey(key)) throw new Error('Ruxsat yoʼq.');
    secureRemove(key);
  });
  ipcMain.handle(IPC.toggleFullscreen, (e) => {
    if (!isTrusted(e) || !mainWindow) return false;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
    return mainWindow.isFullScreen();
  });
  ipcMain.handle(IPC.quit, (e) => {
    if (isTrusted(e)) app.quit();
  });
}

function hardenSession(): void {
  const ses = session.defaultSession;
  // Kamera, mikrofon, geolokatsiya va h.k. - kassa ilovasiga hech biri kerak emas.
  ses.setPermissionRequestHandler((_wc, _perm, callback) => callback(false));

  // Server (Django Channels) `AllowedHostsOriginValidator` bilan WebSocket `Origin`ini
  // tekshiradi. Paketlangan ilova `file://` dan ochiladi, uning `Origin`i server
  // ALLOWED_HOSTS'iga hech qachon mos kelmaydi. WS so'rovida Origin'ni serverning o'z
  // manziliga almashtiramiz (same-origin holat). Cheklangan ALLOWED_HOSTS bilan haqiqiy
  // serverda hali sinalmagan - README'dagi "Tekshirilmagan" bandiga qarang.
  ses.webRequest.onBeforeSendHeaders({ urls: ['ws://*/*', 'wss://*/*'] }, (details, callback) => {
    try {
      const u = new URL(details.url);
      const origin = `${u.protocol === 'wss:' ? 'https' : 'http'}://${u.host}`;
      callback({ requestHeaders: { ...details.requestHeaders, Origin: origin } });
    } catch {
      callback({ requestHeaders: details.requestHeaders });
    }
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    fullscreen: kiosk,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev,
      spellcheck: false,
    },
  });
  mainWindow = win;

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    mainWindow = null;
  });

  // Sensorli ekranda tasodifiy chimchilab kattalashtirish (pinch-zoom) UI'ni buzmasin.
  // Promise qaytaradi: oyna tez yopilsa rad etiladi - e'tiborsiz qoldiramiz.
  void win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});

  // Kiosk: boshqa sahifaga o'tish yoki yangi oyna ochish taqiqlanadi.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev && process.env.ELECTRON_RENDERER_URL ? process.env.ELECTRON_RENDERER_URL : 'file://';
    if (!url.startsWith(allowed)) event.preventDefault();
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

if (!app.requestSingleInstanceLock()) {
  // Ikkinchi nusxa ochilmasin (kassa bitta).
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    registerIpc();
    hardenSession();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
