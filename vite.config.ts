import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api/system': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: true,
      },
      '/sb': {
        target: process.env.VITE_SUPABASE_URL || 'https://dscadajjthbcrullhwtx.supabase.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sb/, ''),
        ws: true,
      },
    },
  },
})
