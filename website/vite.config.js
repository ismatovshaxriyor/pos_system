import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev'da ikkita backend bor: /api/public/* (menyu/stol/ofitsiant
    // chaqiruvi) local_server'ga (8000), /api/sync/* (ilovalar/litsenziya/
    // statistika) cloud_server'ga (8001) tegishli - prodda buni website'ning
    // nginx'i BACKEND_WEB orqali hal qiladi, lekin u faqat bitta backend'ga
    // proxy qiladi (deploy turiga qarab) - shu sabab website hech qachon
    // ikkalasiga bir vaqtda muhtoj bo'lmaydi (QR sahifasi restoranda, apps
    // sahifasi markazda). Dev'da esa ikkalasini alohida ko'rish uchun
    // ajratamiz.
    proxy: {
      '/api/public': 'http://localhost:8000',
      '/api/sync': 'http://localhost:8001',
    },
  },
})
