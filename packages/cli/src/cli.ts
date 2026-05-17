import {
  authManager,
  configManager,
  modelsManager,
  type AuthState,
  type SessionMetricUpload,
  type UploadSessionsResponse,
} from '@agent-telemetry/core'
import {
  markCodexSessionsUploaded,
  planDefaultCodexSessionUploads,
  type PendingCodexSessionUpload,
} from '@agent-telemetry/core/codex'
import { Command } from 'commander'

const VERSION = __APP_VERSION__

interface RunOptions {
  cwd?: string
  env?: Record<string, string | undefined>
}

interface ServerOptions {
  port?: string
}

interface HttpErrorPayload {
  error?: string
  message?: string
}

async function runCommand(command: string, args: string[], options: RunOptions = {}) {
  const child = Bun.spawn([command, ...args], {
    cwd: options.cwd,
    env: options.env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const exitCode = await child.exited
  if (exitCode !== 0)
    throw new Error(`${command} ${args.join(' ')} exited with ${exitCode}`)
}

function resolveCliDist() {
  return import.meta.dirname
}

async function pathExists(path: string) {
  return Bun.file(path).exists()
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

async function readBaseUrl() {
  return trimTrailingSlash(await configManager.getRequired('base_url'))
}

async function requestJson<T>(
  path: string,
  options: {
    method: 'GET' | 'POST' | 'PATCH'
    body?: unknown
    token?: string
  },
): Promise<T> {
  const baseUrl = await readBaseUrl()
  const headers = new Headers({ accept: 'application/json' })
  if (options.body !== undefined)
    headers.set('content-type', 'application/json')
  if (options.token)
    headers.set('authorization', `Bearer ${options.token}`)

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) as HttpErrorPayload : undefined
  if (!response.ok) {
    const message = payload?.error ?? payload?.message ?? `${response.status} ${response.statusText}`
    throw new Error(message)
  }

  return payload as T
}

async function runServer(options: ServerOptions) {
  await modelsManager.ensureDefaultModels()

  const cliDist = resolveCliDist()
  const webRoot = `${cliDist}/web`
  const frontendDist = `${webRoot}/frontend`
  const backendEntry = `${webRoot}/backend/index.js`

  if (!(await pathExists(`${frontendDist}/index.html`))) {
    throw new Error('Frontend assets not found. Please rebuild the CLI package.')
  }

  if (!(await pathExists(backendEntry))) {
    throw new Error('Backend bundle not found. Please rebuild the CLI package.')
  }

  const env: Record<string, string | undefined> = {
    ...Bun.env,
    FRONTEND_DIST: frontendDist,
  }

  if (options.port) {
    env.PORT = options.port
  }

  await runCommand('bun', [backendEntry], { env })
}

async function createUser(email: string, password: string) {
  const result = await requestJson<{ user: { id: string, email: string, name: string } }>('/api/users', {
    method: 'POST',
    body: {
      email,
      password,
      name: email,
    },
  })

  console.log(`Created user ${result.user.email}`)
}

function extractAuthState(payload: unknown): AuthState {
  if (!payload || typeof payload !== 'object')
    throw new Error('Login response did not contain an auth token')

  const record = payload as Record<string, unknown>
  const token = typeof record.token === 'string' ? record.token : undefined
  const refreshToken = typeof record.refreshToken === 'string' ? record.refreshToken : ''
  if (!token)
    throw new Error('Login response did not contain an auth token')

  return {
    access_token: token,
    refresh_token: refreshToken,
  }
}

async function login(email: string, password: string) {
  const payload = await requestJson<unknown>('/api/auth/sign-in/email', {
    method: 'POST',
    body: {
      email,
      password,
    },
  })

  await authManager.write(extractAuthState(payload))
  console.log(`Logged in as ${email}`)
}

async function readAuthToken() {
  const auth = await authManager.read()
  if (!auth?.access_token) {
    throw new Error('Not logged in. Run `agent-telemetry login <email> <password>` first.')
  }
  return auth.access_token
}

function toUploadMetric(item: PendingCodexSessionUpload): SessionMetricUpload {
  const { metrics } = item

  return {
    provider: 'codex',
    session_id: metrics.session_id,
    started_at: metrics.started_at,
    ended_at: metrics.ended_at,
    model: metrics.model || 'unknown',
    model_provider: metrics.model_provider,
    reasoning_effort: metrics.reasoning_effort,
    cli_version: metrics.cli_version,
    model_context_window: metrics.model_context_window,
    input_tokens: metrics.input_tokens,
    output_tokens: metrics.output_tokens,
    cached_input_tokens: metrics.cached_input_tokens,
    reasoning_output_tokens: metrics.reasoning_output_tokens,
    total_tokens: metrics.total_tokens,
    api_call_count: metrics.api_call_count,
    conversation_turn_count: metrics.conversation_turn_count,
    user_message_count: metrics.user_message_count,
    tool_call_count: metrics.tool_call_count,
  }
}

async function uploadCodexSessions() {
  const token = await readAuthToken()
  const plan = await planDefaultCodexSessionUploads()

  if (plan.pending.length === 0) {
    console.log(`No changed Codex sessions to upload. Skipped ${plan.skipped.length}.`)
    return
  }

  const response = await requestJson<UploadSessionsResponse>('/api/upload', {
    method: 'POST',
    token,
    body: {
      provider: 'codex',
      sessions: plan.pending.map(toUploadMetric),
    },
  })

  if (response.error_count > 0) {
    throw new Error(`Upload completed with ${response.error_count} rejected session(s); history was not updated.`)
  }

  await markCodexSessionsUploaded(plan.pending)
  console.log([
    `Uploaded ${plan.pending.length} Codex session(s).`,
    `inserted=${response.inserted_count}`,
    `updated=${response.updated_count}`,
    `skipped_local=${plan.skipped.length}`,
  ].join(' '))
}

const program = new Command()

await configManager.ensureConfig()

program
  .name('agent-telemetry')
  .description('Agent Telemetry CLI.')
  .version(VERSION)

program
  .command('server')
  .description('Serve the bundled frontend with the backend API')
  .option('-p, --port <port>', 'Set backend port', '3000')
  .action(async (options: ServerOptions) => {
    await runServer(options)
  })

const configCommand = program
  .command('config')
  .description('Manage local CLI configuration')

configCommand
  .command('set')
  .argument('<key>')
  .argument('<value>')
  .description('Set a local config value')
  .action(async (key: string, value: string) => {
    await configManager.set(key, value)
  })

configCommand
  .command('get')
  .argument('<key>')
  .description('Get a required local config value')
  .action(async (key: string) => {
    console.log(await configManager.getRequired(key))
  })

configCommand
  .command('list')
  .description('List local config values')
  .action(async () => {
    console.log(JSON.stringify(await configManager.list(), null, 2))
  })

configCommand
  .command('remove')
  .argument('<key>')
  .description('Remove a local config value')
  .action(async (key: string) => {
    await configManager.remove(key)
  })

const userCommand = program
  .command('user')
  .description('Manage users')

userCommand
  .command('create')
  .argument('<email>')
  .argument('<password>')
  .description('Create a user with name defaulting to email')
  .action(async (email: string, password: string) => {
    await createUser(email, password)
  })

program
  .command('login')
  .argument('<email>')
  .argument('<password>')
  .description('Login and save CLI auth credentials')
  .action(async (email: string, password: string) => {
    await login(email, password)
  })

program
  .command('upload')
  .description('Upload changed Codex session aggregates')
  .action(async () => {
    await uploadCodexSessions()
  })

await program.parseAsync(Bun.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
