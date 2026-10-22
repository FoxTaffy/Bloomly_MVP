import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

// Номер сборки поднимает хук коммита (scripts/agents/version-bump.mjs); шапка сайта показывает его же.
const { version } = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'))

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Each store gets its own chunk — breaks all TDZ circular-dep issues
          if (id.includes('/stores/groups')) return 'store-groups'
          if (id.includes('/stores/auth')) return 'store-auth'
          if (id.includes('/stores/messages')) return 'store-messages'
          if (id.includes('/stores/')) return 'store-misc'
          if (id.includes('node_modules/pinia')) return 'vendor-pinia'
          if (id.includes('node_modules/vue-router')) return 'vendor-router'
          if (id.includes('node_modules/')) return 'vendor'
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['bloomly.fun', 'www.bloomly.fun'],
    proxy: {
      '/api': {
        target: 'http://api:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
