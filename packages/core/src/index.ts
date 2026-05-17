export interface HealthStatusPayload {
  message: string
  time: string
}

export function buildHealthStatusMessage() {
  return 'Agent Metry backend'
}

export function formatHealthStatus(payload?: HealthStatusPayload) {
  if (!payload) {
    return {
      title: 'Waiting',
      subtitle: 'Waiting for server response',
    }
  }

  return {
    title: payload.message,
    subtitle: `Updated at ${payload.time}`,
  }
}

export const AGENT_METRY_DIR_NAME = '.agent-metry'
export const DEFAULT_BASE_URL = 'http://localhost:3000'

export interface LocalStateOptions {
  homeDir?: string
  stateDir?: string
}

export interface AgentTelemetryConfig {
  base_url?: string
  [key: string]: string | undefined
}

export interface AuthState {
  access_token: string
  refresh_token: string
}

export interface ModelPrice {
  model: string
  provider: 'openai' | 'anthropic'
  input_usd_per_1m_tokens: number
  cached_input_usd_per_1m_tokens: number
  output_usd_per_1m_tokens: number
}

export interface ModelsState {
  models: ModelPrice[]
}

export interface UploadHistoryItem {
  provider: 'codex'
  session_id: string
  source_path: string
  file_size: number
  file_mtime_ms: number
  last_uploaded_at: string
}

export interface UploadHistoryState {
  items: UploadHistoryItem[]
}

export type UploadProvider = 'codex'

export interface SessionMetricUpload {
  provider?: UploadProvider
  session_id: string
  started_at: string
  ended_at: string
  model: string
  model_provider?: string | null
  reasoning_effort?: string | null
  cli_version?: string | null
  model_context_window?: number | null
  input_tokens?: number
  output_tokens?: number
  cached_input_tokens?: number
  reasoning_output_tokens?: number
  total_tokens?: number
  api_call_count?: number
  conversation_turn_count?: number
  user_message_count?: number
  tool_call_count?: number
}

export interface UploadSessionsRequest {
  provider?: UploadProvider
  sessions: SessionMetricUpload[]
}

export interface UploadSessionsResponse {
  batch_id: string
  received_count: number
  inserted_count: number
  updated_count: number
  skipped_count: number
  error_count: number
  missing_price_model_ids: string[]
}

export const DEFAULT_MODEL_PRICES: ModelPrice[] = [
  {
    model: 'gpt-5.5',
    provider: 'openai',
    input_usd_per_1m_tokens: 5,
    cached_input_usd_per_1m_tokens: 0.5,
    output_usd_per_1m_tokens: 30,
  },
  {
    model: 'gpt-5.4',
    provider: 'openai',
    input_usd_per_1m_tokens: 2.5,
    cached_input_usd_per_1m_tokens: 0.25,
    output_usd_per_1m_tokens: 15,
  },
  {
    model: 'gpt-5.4-mini',
    provider: 'openai',
    input_usd_per_1m_tokens: 0.75,
    cached_input_usd_per_1m_tokens: 0.075,
    output_usd_per_1m_tokens: 4.5,
  },
  {
    model: 'gpt-5.4-nano',
    provider: 'openai',
    input_usd_per_1m_tokens: 0.2,
    cached_input_usd_per_1m_tokens: 0.02,
    output_usd_per_1m_tokens: 1.25,
  },
  {
    model: 'gpt-5.3-codex',
    provider: 'openai',
    input_usd_per_1m_tokens: 1.75,
    cached_input_usd_per_1m_tokens: 0.175,
    output_usd_per_1m_tokens: 14,
  },
  {
    model: 'claude-opus-4-7',
    provider: 'anthropic',
    input_usd_per_1m_tokens: 5,
    cached_input_usd_per_1m_tokens: 0.5,
    output_usd_per_1m_tokens: 25,
  },
  {
    model: 'claude-opus-4-6',
    provider: 'anthropic',
    input_usd_per_1m_tokens: 5,
    cached_input_usd_per_1m_tokens: 0.5,
    output_usd_per_1m_tokens: 25,
  },
  {
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    input_usd_per_1m_tokens: 3,
    cached_input_usd_per_1m_tokens: 0.3,
    output_usd_per_1m_tokens: 15,
  },
  {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    input_usd_per_1m_tokens: 3,
    cached_input_usd_per_1m_tokens: 0.3,
    output_usd_per_1m_tokens: 15,
  },
  {
    model: 'claude-haiku-4-5',
    provider: 'anthropic',
    input_usd_per_1m_tokens: 1,
    cached_input_usd_per_1m_tokens: 0.1,
    output_usd_per_1m_tokens: 5,
  },
]

function resolveHomeDir(options: LocalStateOptions = {}) {
  const homeDir = options.homeDir ?? globalThis.Bun?.env.HOME
  if (!homeDir)
    throw new Error('HOME is not set; cannot resolve ~/.agent-metry')
  return homeDir
}

export function resolveAgentTelemetryDir(options: LocalStateOptions = {}) {
  return options.stateDir
    ?? globalThis.Bun?.env.AGENT_METRY_HOME
    ?? `${resolveHomeDir(options)}/${AGENT_METRY_DIR_NAME}`
}

function resolveStateFile(fileName: string, options: LocalStateOptions = {}) {
  return `${resolveAgentTelemetryDir(options)}/${fileName}`
}

async function ensureStateDir(options: LocalStateOptions = {}) {
  await globalThis.Bun.$`mkdir -p ${resolveAgentTelemetryDir(options)}`.quiet()
}

async function readJsonFile<T>(path: string): Promise<T | undefined> {
  const file = globalThis.Bun.file(path)
  if (!(await file.exists()))
    return undefined
  return await file.json() as T
}

async function writeJsonFile(path: string, value: unknown) {
  await globalThis.Bun.write(path, `${JSON.stringify(value, null, 2)}\n`)
}

function assertStringField(value: string | undefined, key: string) {
  if (!value)
    throw new Error(`Missing required config field: ${key}`)
  return value
}

export const configManager = {
  path(options?: LocalStateOptions) {
    return resolveStateFile('config.json', options)
  },

  async ensureConfig(options?: LocalStateOptions) {
    await ensureStateDir(options)
    const path = this.path(options)
    const existing = await readJsonFile<AgentTelemetryConfig>(path)
    if (existing)
      return existing
    const initial: AgentTelemetryConfig = { base_url: DEFAULT_BASE_URL }
    await writeJsonFile(path, initial)
    return initial
  },

  async read(options?: LocalStateOptions) {
    return await readJsonFile<AgentTelemetryConfig>(this.path(options)) ?? {}
  },

  async write(config: AgentTelemetryConfig, options?: LocalStateOptions) {
    await ensureStateDir(options)
    await writeJsonFile(this.path(options), config)
  },

  async get(key: string, options?: LocalStateOptions) {
    const config = await this.read(options)
    return config[key]
  },

  async getRequired(key: string, options?: LocalStateOptions) {
    return assertStringField(await this.get(key, options), key)
  },

  async set(key: string, value: string, options?: LocalStateOptions) {
    const config = await this.ensureConfig(options)
    const next = { ...config, [key]: value }
    await this.write(next, options)
    return next
  },

  async list(options?: LocalStateOptions) {
    await this.ensureConfig(options)
    return await this.read(options)
  },

  async remove(key: string, options?: LocalStateOptions) {
    const config = await this.ensureConfig(options)
    const next = { ...config }
    delete next[key]
    await this.write(next, options)
    return next
  },
}

export const authManager = {
  path(options?: LocalStateOptions) {
    return resolveStateFile('auth.json', options)
  },

  async read(options?: LocalStateOptions) {
    return await readJsonFile<AuthState>(this.path(options))
  },

  async write(auth: AuthState, options?: LocalStateOptions) {
    await ensureStateDir(options)
    await writeJsonFile(this.path(options), auth)
  },
}

export const modelsManager = {
  path(options?: LocalStateOptions) {
    return resolveStateFile('models.json', options)
  },

  async ensureDefaultModels(options?: LocalStateOptions) {
    await ensureStateDir(options)
    const path = this.path(options)
    const existing = await readJsonFile<ModelsState>(path)
    if (existing)
      return existing
    const initial: ModelsState = { models: DEFAULT_MODEL_PRICES }
    await writeJsonFile(path, initial)
    return initial
  },

  async read(options?: LocalStateOptions) {
    return await readJsonFile<ModelsState>(this.path(options))
  },
}

export const historyManager = {
  path(options?: LocalStateOptions) {
    return resolveStateFile('history.json', options)
  },

  async read(options?: LocalStateOptions) {
    return await readJsonFile<UploadHistoryState>(this.path(options)) ?? { items: [] }
  },

  async write(history: UploadHistoryState, options?: LocalStateOptions) {
    await ensureStateDir(options)
    await writeJsonFile(this.path(options), history)
  },
}
