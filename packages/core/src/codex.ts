import { basename } from 'node:path'
import { stat } from 'node:fs/promises'

const AGENT_TELEMETRY_DIR_NAME = '.agent-telemetry'

interface LocalStateOptions {
  homeDir?: string
  stateDir?: string
}

interface UploadHistoryItem {
  provider: 'codex'
  session_id: string
  source_path: string
  file_size: number
  file_mtime_ms: number
  last_uploaded_at: string
}

interface UploadHistoryState {
  items: UploadHistoryItem[]
}

export interface CodexSessionMetrics {
  provider: 'codex'
  session_id: string
  started_at: string
  ended_at: string
  model: string
  model_provider: string | null
  reasoning_effort: string | null
  cli_version: string | null
  model_context_window: number | null
  input_tokens: number
  output_tokens: number
  cached_input_tokens: number
  reasoning_output_tokens: number
  total_tokens: number
  api_call_count: number
  conversation_turn_count: number
  user_message_count: number
  tool_call_count: number
}

export interface CodexSessionFile {
  source_path: string
  file_size: number
  file_mtime_ms: number
}

export interface ParsedCodexSessionFile {
  metrics: CodexSessionMetrics
  file: CodexSessionFile
}

export interface PendingCodexSessionUpload extends ParsedCodexSessionFile {
  reason: 'new' | 'changed'
}

export interface CodexUploadPlan {
  pending: PendingCodexSessionUpload[]
  skipped: CodexSessionFile[]
}

interface TokenUsageSnapshot {
  input_tokens: number
  output_tokens: number
  cached_input_tokens: number
  reasoning_output_tokens: number
  total_tokens: number
}

interface ScanCodexSessionOptions extends LocalStateOptions {
  codexDir?: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isObject(value) ? value : undefined
}

function asString(value: unknown) {
  return typeof value === 'string' && value ? value : undefined
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function payloadOf(entry: Record<string, unknown>) {
  return asRecord(entry.payload) ?? entry
}

function entryType(entry: Record<string, unknown>) {
  return asString(entry.type) ?? asString(entry.msg?.toString())
}

function timestampOf(entry: Record<string, unknown>) {
  return asString(entry.timestamp) ?? asString(entry.time) ?? asString(entry.ts)
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    const stringValue = asString(value)
    if (stringValue)
      return stringValue
  }
  return null
}

function pickNumber(...values: unknown[]) {
  for (const value of values) {
    const numberValue = asNumber(value)
    if (numberValue !== undefined)
      return numberValue
  }
  return null
}

function fileNameSessionId(path: string) {
  const fileName = basename(path).replace(/\.jsonl$/i, '')
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileName)
    ? fileName
    : undefined
}

function usageSnapshot(value: unknown): TokenUsageSnapshot | undefined {
  const usage = asRecord(value)
  if (!usage)
    return undefined

  const inputDetails = asRecord(usage.input_tokens_details)
  const outputDetails = asRecord(usage.output_tokens_details)
  const cachedInput = pickNumber(
    usage.cached_input_tokens,
    usage.cached_tokens,
    inputDetails?.cached_tokens,
  ) ?? 0
  const reasoningOutput = pickNumber(
    usage.reasoning_output_tokens,
    usage.reasoning_tokens,
    outputDetails?.reasoning_tokens,
  ) ?? 0
  const input = pickNumber(usage.input_tokens, usage.prompt_tokens) ?? 0
  const output = pickNumber(usage.output_tokens, usage.completion_tokens) ?? 0
  const total = pickNumber(usage.total_tokens) ?? input + output

  if (input === 0 && output === 0 && cachedInput === 0 && reasoningOutput === 0 && total === 0)
    return undefined

  return {
    input_tokens: input,
    output_tokens: output,
    cached_input_tokens: cachedInput,
    reasoning_output_tokens: reasoningOutput,
    total_tokens: total,
  }
}

function findTokenUsage(entry: Record<string, unknown>) {
  const payload = payloadOf(entry)
  const info = asRecord(payload.info)
  return usageSnapshot(payload.total_token_usage)
    ?? usageSnapshot(info?.total_token_usage)
    ?? usageSnapshot(payload.token_usage)
    ?? usageSnapshot(info?.last_token_usage)
    ?? usageSnapshot(payload.usage)
}

function findTurnId(entry: Record<string, unknown>) {
  const payload = payloadOf(entry)
  const turnContext = asRecord(payload.turn_context) ?? payload
  return asString(turnContext.turn_id)
}

function isUserMessage(entry: Record<string, unknown>) {
  const payload = payloadOf(entry)
  return entryType(entry) === 'event_msg' && asString(payload.type) === 'user_message'
}

function isToolCallItem(value: unknown): boolean {
  const item = asRecord(value)
  if (!item)
    return false

  const type = asString(item.type)
  if (type === 'function_call' || type === 'tool_call' || type === 'local_shell_call')
    return true

  return asString(item.call_id) !== undefined && asString(item.name) !== undefined
}

function countToolCalls(entry: Record<string, unknown>) {
  const payload = payloadOf(entry)
  if (isToolCallItem(payload))
    return 1

  if (isToolCallItem(payload.item))
    return 1

  const items = Array.isArray(payload.items) ? payload.items : undefined
  if (!items)
    return 0

  return items.filter(isToolCallItem).length
}

function sessionMeta(entry: Record<string, unknown>) {
  if (entryType(entry) !== 'session_meta')
    return undefined
  return payloadOf(entry)
}

function metadataFrom(entry: Record<string, unknown>) {
  const payload = payloadOf(entry)
  const nested = asRecord(payload.metadata) ?? asRecord(payload.config)
  const info = asRecord(payload.info)
  return {
    ...payload,
    ...nested,
    ...info,
  }
}

function sortByPath(left: CodexSessionFile, right: CodexSessionFile) {
  return left.source_path.localeCompare(right.source_path)
}

async function directoryExists(path: string) {
  try {
    return (await stat(path)).isDirectory()
  }
  catch {
    return false
  }
}

function resolveHomeDir(options: LocalStateOptions = {}) {
  const homeDir = options.homeDir ?? globalThis.Bun?.env.HOME
  if (!homeDir)
    throw new Error('HOME is not set; cannot resolve ~/.agent-telemetry')
  return homeDir
}

function resolveHistoryPath(options: LocalStateOptions = {}) {
  return `${options.stateDir
    ?? globalThis.Bun?.env.AGENT_TELEMETRY_HOME
    ?? `${resolveHomeDir(options)}/${AGENT_TELEMETRY_DIR_NAME}`}/history.json`
}

async function readUploadHistory(options: LocalStateOptions = {}) {
  const file = Bun.file(resolveHistoryPath(options))
  if (!(await file.exists()))
    return { items: [] }
  return await file.json() as UploadHistoryState
}

async function writeUploadHistory(history: UploadHistoryState, options: LocalStateOptions = {}) {
  const path = resolveHistoryPath(options)
  await Bun.$`mkdir -p ${path.substring(0, path.lastIndexOf('/'))}`.quiet()
  await Bun.write(path, `${JSON.stringify(history, null, 2)}\n`)
}

async function fileState(path: string): Promise<CodexSessionFile> {
  const stats = await stat(path)
  return {
    source_path: path,
    file_size: stats.size,
    file_mtime_ms: Math.trunc(stats.mtimeMs),
  }
}

async function collectGlob(root: string, pattern: string) {
  const glob = new Bun.Glob(pattern)
  const paths: string[] = []
  for await (const path of glob.scan({ cwd: root, absolute: true, onlyFiles: true }))
    paths.push(path)
  return paths
}

export async function scanCodexSessionFiles(options: ScanCodexSessionOptions = {}) {
  const homeDir = options.homeDir ?? globalThis.Bun?.env.HOME
  if (!homeDir && !options.codexDir)
    throw new Error('HOME is not set; cannot resolve ~/.codex')

  const codexDir = options.codexDir ?? `${homeDir}/.codex`
  const paths = new Set<string>()

  if (await directoryExists(`${codexDir}/sessions`)) {
    for (const path of await collectGlob(`${codexDir}/sessions`, '**/*.jsonl'))
      paths.add(path)
  }

  if (await directoryExists(`${codexDir}/archived_sessions`)) {
    for (const path of await collectGlob(`${codexDir}/archived_sessions`, '*.jsonl'))
      paths.add(path)
  }

  return (await Promise.all([...paths].map(fileState))).sort(sortByPath)
}

export async function parseCodexSessionFile(file: CodexSessionFile | string): Promise<ParsedCodexSessionFile> {
  const sourceFile = typeof file === 'string' ? await fileState(file) : file
  const text = await Bun.file(sourceFile.source_path).text()
  const fallbackSessionId = fileNameSessionId(sourceFile.source_path)
  let sessionId: string | undefined
  let startedAt: string | undefined
  let endedAt: string | undefined
  let model: string | null = null
  let modelProvider: string | null = null
  let reasoningEffort: string | null = null
  let cliVersion: string | null = null
  let modelContextWindow: number | null = null
  let lastTokenUsage: TokenUsageSnapshot | undefined
  const uniqueTokenSnapshots = new Set<string>()
  const turnIds = new Set<string>()
  let userMessageCount = 0
  let toolCallCount = 0

  for (const line of text.split('\n')) {
    if (!line.trim())
      continue

    let entry: Record<string, unknown>
    try {
      const parsed = JSON.parse(line) as unknown
      if (!isObject(parsed))
        continue
      entry = parsed
    }
    catch {
      continue
    }

    const timestamp = timestampOf(entry)
    if (timestamp) {
      startedAt ??= timestamp
      endedAt = timestamp
    }

    const meta = sessionMeta(entry)
    if (meta && !sessionId)
      sessionId = asString(meta.id) ?? asString(meta.session_id)

    const metadata = metadataFrom(entry)
    model ??= pickString(metadata.model, metadata.model_id)
    modelProvider ??= pickString(metadata.model_provider)
    reasoningEffort ??= pickString(metadata.reasoning_effort)
    cliVersion ??= pickString(metadata.cli_version, metadata.version)
    modelContextWindow ??= pickNumber(metadata.model_context_window, metadata.context_window)

    const tokenUsage = findTokenUsage(entry)
    if (tokenUsage) {
      uniqueTokenSnapshots.add(JSON.stringify(tokenUsage))
      lastTokenUsage = tokenUsage
    }

    const turnId = findTurnId(entry)
    if (turnId)
      turnIds.add(turnId)

    if (isUserMessage(entry))
      userMessageCount += 1

    toolCallCount += countToolCalls(entry)
  }

  const metrics: CodexSessionMetrics = {
    provider: 'codex',
    session_id: sessionId ?? fallbackSessionId ?? basename(sourceFile.source_path).replace(/\.jsonl$/i, ''),
    started_at: startedAt ?? new Date(sourceFile.file_mtime_ms).toISOString(),
    ended_at: endedAt ?? new Date(sourceFile.file_mtime_ms).toISOString(),
    model: model ?? 'unknown',
    model_provider: modelProvider,
    reasoning_effort: reasoningEffort,
    cli_version: cliVersion,
    model_context_window: modelContextWindow,
    input_tokens: lastTokenUsage?.input_tokens ?? 0,
    output_tokens: lastTokenUsage?.output_tokens ?? 0,
    cached_input_tokens: lastTokenUsage?.cached_input_tokens ?? 0,
    reasoning_output_tokens: lastTokenUsage?.reasoning_output_tokens ?? 0,
    total_tokens: lastTokenUsage?.total_tokens ?? 0,
    api_call_count: uniqueTokenSnapshots.size,
    conversation_turn_count: turnIds.size,
    user_message_count: userMessageCount,
    tool_call_count: toolCallCount,
  }

  return {
    metrics,
    file: sourceFile,
  }
}

function unchanged(historyItem: UploadHistoryItem | undefined, file: CodexSessionFile) {
  return historyItem?.file_size === file.file_size
    && historyItem.file_mtime_ms === file.file_mtime_ms
}

export async function planCodexSessionUploads(
  files: CodexSessionFile[],
  history: UploadHistoryState,
): Promise<CodexUploadPlan> {
  const byPath = new Map(history.items.map((item) => [item.source_path, item]))
  const pending: PendingCodexSessionUpload[] = []
  const skipped: CodexSessionFile[] = []

  for (const file of files.sort(sortByPath)) {
    const historyItem = byPath.get(file.source_path)
    if (unchanged(historyItem, file)) {
      skipped.push(file)
      continue
    }

    const parsed = await parseCodexSessionFile(file)
    pending.push({
      ...parsed,
      reason: historyItem ? 'changed' : 'new',
    })
  }

  return { pending, skipped }
}

export async function planDefaultCodexSessionUploads(options: ScanCodexSessionOptions = {}) {
  const files = await scanCodexSessionFiles(options)
  const history = await readUploadHistory(options)
  return await planCodexSessionUploads(files, history)
}

export async function markCodexSessionsUploaded(
  uploaded: ParsedCodexSessionFile[],
  options: LocalStateOptions = {},
  uploadedAt = new Date().toISOString(),
) {
  const history = await readUploadHistory(options)
  const byPath = new Map(history.items.map((item) => [item.source_path, item]))

  for (const item of uploaded) {
    byPath.set(item.file.source_path, {
      provider: 'codex',
      session_id: item.metrics.session_id,
      source_path: item.file.source_path,
      file_size: item.file.file_size,
      file_mtime_ms: item.file.file_mtime_ms,
      last_uploaded_at: uploadedAt,
    })
  }

  const next = { items: [...byPath.values()].sort((left, right) => left.source_path.localeCompare(right.source_path)) }
  await writeUploadHistory(next, options)
  return next
}
