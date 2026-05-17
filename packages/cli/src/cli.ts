import {
  authManager,
  calculateModelCost,
  configManager,
  isUnknownModel,
  modelsManager,
  resolveAgentTelemetryDir,
  type AuthState,
  type ModelProvider,
  type SessionMetricUpload,
  type UploadSessionsResponse,
} from '@agent-metry/core'
import {
  markCodexSessionsUploaded,
  planDefaultCodexSessionUploads,
  type PendingCodexSessionUpload,
} from '@agent-metry/core/codex'
import { Database } from 'bun:sqlite'
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

interface ModelSetOptions {
  provider: string
  input: string
  cachedInput: string
  output: string
}

interface SessionMetricCostRow {
  id: string
  model: string
  input_tokens: number
  output_tokens: number
  cached_input_tokens: number
  reasoning_output_tokens: number
}

interface ModelRow {
  model: string
}

interface CountRow {
  count: number
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

function resolveDatabasePath() {
  return `${resolveAgentTelemetryDir()}/data.db`
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

async function readBaseUrl() {
  return trimTrailingSlash(await configManager.getRequired('base_url'))
}

function parseModelProvider(value: string): ModelProvider {
  const provider = value.trim()
  if (provider === 'openai' || provider === 'anthropic')
    return provider
  throw new Error('Provider must be openai or anthropic')
}

function parsePriceOption(value: string, key: string) {
  const rawValue = value.trim()
  if (!rawValue)
    throw new Error(`${key} must be a non-negative finite number`)
  const price = Number(rawValue)
  if (!Number.isFinite(price) || price < 0)
    throw new Error(`${key} must be a non-negative finite number`)
  return price
}

function hasSessionMetricsTable(sqlite: Database) {
  return Boolean(sqlite.query<{ name: string }, [string]>(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get('session_metrics'))
}

async function openExistingMetricsDatabase() {
  const databasePath = resolveDatabasePath()
  if (!(await pathExists(databasePath)))
    return undefined

  const sqlite = new Database(databasePath)
  if (!hasSessionMetricsTable(sqlite)) {
    sqlite.close()
    return undefined
  }

  return sqlite
}

async function listMissingModels() {
  const state = await modelsManager.ensureDefaultModels()
  const knownModelIds = new Set(state.models.map(model => model.model))
  const sqlite = await openExistingMetricsDatabase()
  if (!sqlite)
    return []

  try {
    const rows = sqlite.query<ModelRow, []>(`
      SELECT DISTINCT model
      FROM session_metrics
      ORDER BY model ASC
    `).all()

    return rows
      .map(row => row.model)
      .filter(model => !isUnknownModel(model) && !knownModelIds.has(model))
  }
  finally {
    sqlite.close()
  }
}

async function repriceSessions(model?: string) {
  const modelId = model?.trim()
  if (model !== undefined && !modelId)
    throw new Error('Model id is required')

  const state = await modelsManager.ensureDefaultModels()
  const prices = new Map(state.models.map(price => [price.model, price]))
  const sqlite = await openExistingMetricsDatabase()
  if (!sqlite)
    return 0

  try {
    const rows = modelId
      ? sqlite.query<SessionMetricCostRow, [string]>(`
          SELECT
            id,
            model,
            input_tokens,
            output_tokens,
            cached_input_tokens,
            reasoning_output_tokens
          FROM session_metrics
          WHERE model = ?
        `).all(modelId)
      : sqlite.query<SessionMetricCostRow, []>(`
          SELECT
            id,
            model,
            input_tokens,
            output_tokens,
            cached_input_tokens,
            reasoning_output_tokens
          FROM session_metrics
        `).all()

    sqlite.transaction(() => {
      const updateQuery = sqlite.query(`
        UPDATE session_metrics
        SET
          input_cost = ?,
          output_cost = ?,
          cached_input_cost = ?,
          reasoning_output_cost = ?,
          total_cost = ?
        WHERE id = ?
      `)

      for (const row of rows) {
        const cost = calculateModelCost(row, prices.get(row.model))
        updateQuery.run(
          cost.input_cost,
          cost.output_cost,
          cost.cached_input_cost,
          cost.reasoning_output_cost,
          cost.total_cost,
          row.id,
        )
      }
    })()

    return rows.length
  }
  finally {
    sqlite.close()
  }
}

async function clearModelCosts(model: string) {
  const sqlite = await openExistingMetricsDatabase()
  if (!sqlite)
    return 0

  try {
    const count = sqlite.query<CountRow, [string]>(`
      SELECT COUNT(*) AS count
      FROM session_metrics
      WHERE model = ?
    `).get(model)?.count ?? 0

    sqlite.query(`
      UPDATE session_metrics
      SET
        input_cost = 0,
        output_cost = 0,
        cached_input_cost = 0,
        reasoning_output_cost = 0,
        total_cost = 0
      WHERE model = ?
    `).run(model)

    return count
  }
  finally {
    sqlite.close()
  }
}

async function setModel(model: string, options: ModelSetOptions) {
  const result = await modelsManager.set({
    model,
    provider: parseModelProvider(options.provider),
    input_usd_per_1m_tokens: parsePriceOption(options.input, 'input'),
    cached_input_usd_per_1m_tokens: parsePriceOption(options.cachedInput, 'cached-input'),
    output_usd_per_1m_tokens: parsePriceOption(options.output, 'output'),
  })
  const repricedSessions = await repriceSessions(result.model.model)
  console.log(`action=${result.action} repriced_sessions=${repricedSessions}`)
}

async function removeModel(model: string) {
  const result = await modelsManager.remove(model)
  const clearedSessions = await clearModelCosts(result.model)
  console.log(`removed=true cleared_sessions=${clearedSessions}`)
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
    throw new Error('Not logged in. Run `agent-metry login <email> <password>` first.')
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
  .name('agent-metry')
  .description('Agent Metry CLI.')
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

const modelsCommand = program
  .command('models')
  .description('Manage local model prices')

modelsCommand
  .command('list')
  .description('List local model prices')
  .action(async () => {
    console.log(JSON.stringify(await modelsManager.list(), null, 2))
  })

modelsCommand
  .command('missing')
  .description('List models present in uploaded sessions but missing prices')
  .action(async () => {
    console.log(JSON.stringify(await listMissingModels(), null, 2))
  })

modelsCommand
  .command('set')
  .argument('<model>')
  .requiredOption('--provider <provider>', 'Model provider: openai or anthropic')
  .requiredOption('--input <usd>', 'Input price in USD per 1M tokens')
  .requiredOption('--cached-input <usd>', 'Cached input price in USD per 1M tokens')
  .requiredOption('--output <usd>', 'Output price in USD per 1M tokens')
  .description('Create or update a local model price and reprice its sessions')
  .action(async (model: string, options: ModelSetOptions) => {
    await setModel(model, options)
  })

modelsCommand
  .command('remove')
  .argument('<model>')
  .description('Remove a local model price and clear its stored session costs')
  .action(async (model: string) => {
    await removeModel(model)
  })

modelsCommand
  .command('reprice')
  .argument('[model]')
  .description('Recalculate stored session costs from local model prices')
  .action(async (model?: string) => {
    const repricedSessions = await repriceSessions(model)
    console.log(`model=${model?.trim() || 'all'} repriced_sessions=${repricedSessions}`)
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
