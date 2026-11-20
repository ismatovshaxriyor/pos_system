import { contextBridge, ipcRenderer } from 'electron';

import { IPC, type PosNativeApi } from '../shared/ipc';

const api: PosNativeApi = {
  secure: {
    get: (key) => ipcRenderer.invoke(IPC.secureGet, key),
    set: (key, value) => ipcRenderer.invoke(IPC.secureSet, key, value),
    remove: (key) => ipcRenderer.invoke(IPC.secureRemove, key),
  },
  window: {
    toggleFullscreen: () => ipcRenderer.invoke(IPC.toggleFullscreen),
    quit: () => ipcRenderer.invoke(IPC.quit),
  },
  updates: {
    currentVersion: () => ipcRenderer.invoke(IPC.appVersion),
    install: (downloadUrl, sha256) => ipcRenderer.invoke(IPC.installUpdate, downloadUrl, sha256),
    onProgress: (cb) => {
      const handler = (_e: unknown, percent: number) => cb(percent);
      ipcRenderer.on(IPC.updateProgress, handler);
      return () => ipcRenderer.removeListener(IPC.updateProgress, handler);
    },
  },
  network: {
    localAddresses: () => ipcRenderer.invoke(IPC.localAddresses),
    browseMdns: () => ipcRenderer.invoke(IPC.browseMdns),
  },
  platform: process.platform,
};

// Renderer'ga faqat shu tor, tiplangan API beriladi - `ipcRenderer`ning o'zi emas.
contextBridge.exposeInMainWorld('posNative', api);
