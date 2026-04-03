import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { translationWorkbenchApiPlugin } from './src/server/workbenchApiPlugin.js'

const workbenchRoot = fileURLToPath(new URL('./', import.meta.url))

export default defineConfig({
  root: workbenchRoot,
  plugins: [react(), translationWorkbenchApiPlugin()],
  appType: 'spa',
  publicDir: false,
  server: {
    port: 4318,
  },
  preview: {
    port: 4318,
  },
})
