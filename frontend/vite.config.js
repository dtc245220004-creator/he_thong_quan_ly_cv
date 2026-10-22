import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, projectRoot, 'VITE_')

  return {
    envDir: projectRoot,
    plugins: [react()],
    define: {
      'process.env.NODE_ENV': JSON.stringify(command === 'build' ? 'production' : 'development'),
    },
    server: {
      proxy: {
        '/api': {
          target: env.VITE_BACKEND_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  }
})
