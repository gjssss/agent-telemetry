import { buildBackendStatusMessage } from '@agent-telemetry/core'
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'

const app = new Hono()

app.get('/api/hello', (c) => {
  return c.json({
    message: buildBackendStatusMessage(),
    time: new Date().toISOString(),
  })
})

const distDir = Bun.env.FRONTEND_DIST
if (distDir && await Bun.file(`${distDir}/index.html`).exists()) {
  app.use('/*', serveStatic({ root: distDir }))
  app.get('*', async (c) => {
    if (c.req.path.startsWith('/api/'))
      return c.notFound()
    const html = await Bun.file(`${distDir}/index.html`).text()
    return c.html(html)
  })
}
else if (distDir) {
  console.warn(`[backend] FRONTEND_DIST not found: ${distDir}`)
}

const port = Number(Bun.env.PORT ?? 3000)

console.log(`[backend] listening on http://localhost:${port}`)
Bun.serve({ fetch: app.fetch, port })
