import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      '/admin': process.env.MAGIUM_DEV_API_PROXY_TARGET ?? 'http://localhost:8090',
      '/health': process.env.MAGIUM_DEV_API_PROXY_TARGET ?? 'http://localhost:8090',
      '/v1': process.env.MAGIUM_DEV_API_PROXY_TARGET ?? 'http://localhost:8090',
    },
  },
})
