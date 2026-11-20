import type { PosNativeApi } from '../shared/ipc';

declare global {
  interface Window {
    posNative: PosNativeApi;
  }
}

export {};
