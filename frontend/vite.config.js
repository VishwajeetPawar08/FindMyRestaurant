import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        // 127.0.0.1 (not "localhost") avoids IPv6 ::1 resolution problems on Windows/Node 17+
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
