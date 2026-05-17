import { buildHealthStatusMessage } from '@agent-telemetry/core'
import { isAPIError } from 'better-auth/api'
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { auth, getAuthSession } from './auth'
import { initializeDatabase } from './db'
import {
  getLeaderboard,
  getSummaryStats,
  getUserProfile,
  normalizeLeaderboardMetric,
  normalizeRange,
  updateUserName,
  uploadSessionMetrics,
} from './metrics'

const app = new Hono()

initializeDatabase()

app.get('/api/health', (c) => {
  return c.json({
    message: buildHealthStatusMessage(),
    time: new Date().toISOString(),
  })
})

app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  return auth.handler(c.req.raw)
})

app.post('/api/users', async (c) => {
  const body = await c.req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : email

  if (!email || !password) {
    return c.json({ error: 'email and password are required' }, 400)
  }

  try {
    const result = await auth.api.signUpEmail({
      body: {
        email,
        name,
        password,
      },
      headers: c.req.raw.headers,
    })

    return c.json({
      user: result.user,
    }, 201)
  }
  catch (error) {
    if (isAPIError(error)) {
      return c.json({
        error: error.body?.message ?? 'failed to create user',
        code: error.body?.code,
      }, error.statusCode as ContentfulStatusCode)
    }

    throw error
  }
})

app.get('/api/me', async (c) => {
  const session = await getAuthSession(c.req.raw.headers)
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  return c.json({
    session: session.session,
    user: session.user,
  })
})

app.patch('/api/me', async (c) => {
  const session = await getAuthSession(c.req.raw.headers)
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body = await c.req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return c.json({ error: 'name is required' }, 400)
  }

  const user = await updateUserName(session.user.id, name)
  return c.json({ user })
})

app.post('/api/upload', async (c) => {
  const session = await getAuthSession(c.req.raw.headers)
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body = await c.req.json().catch(() => null)
  const result = await uploadSessionMetrics(session.user.id, body)
  if ('error' in result) {
    return c.json({ error: result.error }, 400)
  }

  return c.json(result)
})

app.get('/api/stats/summary', async (c) => {
  const session = await getAuthSession(c.req.raw.headers)
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const range = normalizeRange(c.req.query('range'))
  return c.json(await getSummaryStats(range))
})

app.get('/api/stats/leaderboard', async (c) => {
  const session = await getAuthSession(c.req.raw.headers)
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const range = normalizeRange(c.req.query('range'))
  const metric = normalizeLeaderboardMetric(c.req.query('metric'))
  return c.json(getLeaderboard(range, metric))
})

app.get('/api/profile', async (c) => {
  const session = await getAuthSession(c.req.raw.headers)
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const range = normalizeRange(c.req.query('range'))
  return c.json({
    user: session.user,
    ...getUserProfile(session.user.id, range),
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
