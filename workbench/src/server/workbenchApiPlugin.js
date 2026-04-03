import { buildWorkbenchState, saveWorkbenchChanges } from './workbenchStore.js'

const API_BASE_PATH = '/api/translation-workbench'

export function translationWorkbenchApiPlugin() {
  const handler = async (request, response, next) => {
    if (!request.url?.startsWith(API_BASE_PATH)) {
      next()
      return
    }

    try {
      const url = new URL(request.url, 'http://localhost')

      if (request.method === 'GET' && url.pathname === API_BASE_PATH) {
        const state = await buildWorkbenchState()
        sendJson(response, 200, state)
        return
      }

      if (
        request.method === 'POST' &&
        url.pathname === `${API_BASE_PATH}/save`
      ) {
        const body = await readJsonBody(request)
        const result = await saveWorkbenchChanges(body?.changes ?? [])
        sendJson(response, 200, result)
        return
      }

      sendJson(response, 404, {
        error: 'Not found',
      })
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : 'Unknown server error',
      })
    }
  }

  return {
    name: 'translation-workbench-api',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

async function readJsonBody(request) {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const rawBody = Buffer.concat(chunks).toString('utf8')
  return rawBody ? JSON.parse(rawBody) : {}
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}
