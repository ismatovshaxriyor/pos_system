import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';

// electron-vite v6: `build.externalizeDeps` sukut bo'yicha yoqilgan (eski
// `externalizeDepsPlugin` deprecated) - main/preload'da qo'shimcha plagin kerak emas.
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    resolve: {
      alias: { '@': resolve(__dirname, 'src/renderer/src') },
    },
  },
});
