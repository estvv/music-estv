import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend for the dev proxy: the local `npm run dev` backend by default, the
// `backend` container when run through docker-compose.override.yml.
const apiTarget = process.env.API_TARGET ?? 'http://127.0.0.1:3013'

export default defineConfig({
  plugins: [react()],
  server: {
    // 127.0.0.1 rather than localhost: Spotify only accepts loopback IPs as
    // http redirect URIs, and the session cookie must live on the same host.
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: apiTarget,
      },
      '/ws': {
        target: apiTarget.replace(/^http/, 'ws'),
        ws: true,
      },
    },
  },
})
