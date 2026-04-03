import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { translationWorkbenchApiPlugin } from './src/server/workbenchApiPlugin.js'

const workbenchRoot = fileURLToPath(new URL('./', import.meta.url))
const reactDirectory = fileURLToPath(
  new URL('../../../apps/cuebids/node_modules/react/', import.meta.url)
)
const reactDomDirectory = fileURLToPath(
  new URL('../../../apps/cuebids/node_modules/react-dom/', import.meta.url)
)
const reactJsxRuntimePath = path.join(reactDirectory, 'jsx-runtime.js')

export default {
  root: workbenchRoot,
  plugins: [translationWorkbenchApiPlugin()],
  appType: 'spa',
  publicDir: false,
  resolve: {
    alias: {
      react: reactDirectory,
      'react-dom': reactDomDirectory,
      'react/jsx-runtime': reactJsxRuntimePath,
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  server: {
    port: 4318,
  },
  preview: {
    port: 4318,
  },
}
