import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins'
import { db } from './db'
import * as schema from './db/schema'

const port = Number(Bun.env.PORT ?? 3000)

export const auth = betterAuth({
  appName: 'Agent Telemetry',
  baseURL: Bun.env.BETTER_AUTH_URL ?? `http://localhost:${port}`,
  secret: Bun.env.BETTER_AUTH_SECRET ?? 'agent-telemetry-local-development-secret-change-me',
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  plugins: [bearer()],
})

export async function getAuthSession(headers: Headers) {
  return auth.api.getSession({ headers })
}
