import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'b8cd-188-113-230-199.ngrok-free.app',
      '.ngrok-free.app',
    ],
  },
})
