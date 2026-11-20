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
  platform: process.platform,
};

// Renderer'ga faqat shu tor, tiplangan API beriladi - `ipcRenderer`ning o'zi emas.
contextBridge.exposeInMainWorld('posNative', api);
