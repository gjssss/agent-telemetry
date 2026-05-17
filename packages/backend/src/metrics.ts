import type {
  ModelPrice,
  SessionMetricUpload,
  UploadProvider,
  UploadSessionsRequest,
  UploadSessionsResponse,
} from '@agent-telemetry/core'
import { modelsManager } from '@agent-telemetry/core'
import { sql } from 'drizzle-orm'
import { db, resolveDataDir, sqlite } from './db'
import { user } from './db/schema'

type TimeRange = '1d' | '7d' | '30d' | 'total'
type LeaderboardMetric = 'cost' | 'tokens'

interface NormalizedSessionMetric {
  provider: UploadProvider
  sessionId: string
  startedAt: string
  endedAt: string
  model: string
  modelProvider: string | null
  reasoningEffort: string | null
  cliVersion: string | null
  modelContextWindow: number | null
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  apiCallCount: number
  conversationTurnCount: number
  userMessageCount: number
  toolCallCount: number
}

interface CostResult {
  inputCost: number
  outputCost: number
  cachedInputCost: number
  reasoningOutputCost: number
  totalCost: number
  missingModelId?: string
}

function toNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function toOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function toOptionalInteger(value: unknown) {
  if (value === null || value === undefined)
    return null
  if (typeof value !== 'number' || !Number.isFinite(value))
    return null
  return Math.trunc(value)
}

function toCount(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    return 0
  return Math.trunc(value)
}

function isIsoLike(value: string) {
  return !Number.isNaN(Date.parse(value))
}

function normalizeProvider(value: unknown, fallback?: UploadProvider): UploadProvider | undefined {
  if (value === 'codex')
    return value
  return fallback
}

function normalizeSessionMetric(
  raw: SessionMetricUpload,
  fallbackProvider?: UploadProvider,
): NormalizedSessionMetric | undefined {
  const provider = normalizeProvider(raw.provider, fallbackProvider)
  const sessionId = toNonEmptyString(raw.session_id)
  const startedAt = toNonEmptyString(raw.started_at)
  const endedAt = toNonEmptyString(raw.ended_at)
  const model = toNonEmptyString(raw.model)

  if (!provider || !sessionId || !startedAt || !endedAt || !model)
    return undefined
  if (!isIsoLike(startedAt) || !isIsoLike(endedAt))
    return undefined

  const inputTokens = toCount(raw.input_tokens)
  const outputTokens = toCount(raw.output_tokens)
  const cachedInputTokens = toCount(raw.cached_input_tokens)
  const reasoningOutputTokens = toCount(raw.reasoning_output_tokens)

  return {
    provider,
    sessionId,
    startedAt,
    endedAt,
    model,
    modelProvider: toOptionalString(raw.model_provider),
    reasoningEffort: toOptionalString(raw.reasoning_effort),
    cliVersion: toOptionalString(raw.cli_version),
    modelContextWindow: toOptionalInteger(raw.model_context_window),
    inputTokens,
    outputTokens,
    cachedInputTokens,
    reasoningOutputTokens,
    totalTokens: toCount(raw.total_tokens) || inputTokens + outputTokens + cachedInputTokens + reasoningOutputTokens,
    apiCallCount: toCount(raw.api_call_count),
    conversationTurnCount: toCount(raw.conversation_turn_count),
    userMessageCount: toCount(raw.user_message_count),
    toolCallCount: toCount(raw.tool_call_count),
  }
}

function parseUploadRequest(body: unknown) {
  if (!body || typeof body !== 'object')
    return undefined

  const payload = body as UploadSessionsRequest
  const provider = normalizeProvider(payload.provider)
  if (!Array.isArray(payload.sessions))
    return undefined

  return {
    provider,
    sessions: payload.sessions,
  }
}

function costForTokens(tokens: number, usdPer1mTokens: number) {
  return Math.round(tokens * usdPer1mTokens)
}

function calculateCost(metric: NormalizedSessionMetric, prices: Map<string, ModelPrice>): CostResult {
  const price = prices.get(metric.model)
  if (!price) {
    return {
      inputCost: 0,
      outputCost: 0,
      cachedInputCost: 0,
      reasoningOutputCost: 0,
      totalCost: 0,
      missingModelId: metric.model,
    }
  }

  const inputCost = costForTokens(metric.inputTokens, price.input_usd_per_1m_tokens)
  const outputCost = costForTokens(metric.outputTokens, price.output_usd_per_1m_tokens)
  const cachedInputCost = costForTokens(metric.cachedInputTokens, price.cached_input_usd_per_1m_tokens)
  const reasoningOutputCost = costForTokens(metric.reasoningOutputTokens, price.output_usd_per_1m_tokens)

  return {
    inputCost,
    outputCost,
    cachedInputCost,
    reasoningOutputCost,
    totalCost: inputCost + outputCost + cachedInputCost + reasoningOutputCost,
  }
}

async function readModelPrices() {
  const state = await modelsManager.ensureDefaultModels({ stateDir: resolveDataDir() })
  return new Map(state.models.map(model => [model.model, model]))
}

function rangeStart(range: TimeRange, now = new Date()) {
  if (range === 'total')
    return undefined

  const days = range === '1d' ? 1 : range === '7d' ? 7 : 30
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

export function normalizeRange(value: string | undefined): TimeRange {
  if (value === '1d' || value === '7d' || value === '30d' || value === 'total')
    return value
  return '7d'
}

export function normalizeLeaderboardMetric(value: string | undefined): LeaderboardMetric {
  if (value === 'tokens')
    return 'tokens'
  return 'cost'
}

export async function uploadSessionMetrics(
  userId: string,
  body: unknown,
): Promise<UploadSessionsResponse | { error: string }> {
  const parsed = parseUploadRequest(body)
  if (!parsed)
    return { error: 'sessions array is required' }

  const prices = await readModelPrices()
  const startedAt = new Date().toISOString()
  const completedAt = new Date().toISOString()
  const batchId = crypto.randomUUID()
  const missingPriceModelIds = new Set<string>()
  const normalized: Array<{ metric: NormalizedSessionMetric, cost: CostResult }> = []
  let errorCount = 0

  for (const raw of parsed.sessions) {
    const metric = normalizeSessionMetric(raw, parsed.provider)
    if (!metric) {
      errorCount += 1
      continue
    }

    const cost = calculateCost(metric, prices)
    if (cost.missingModelId)
      missingPriceModelIds.add(cost.missingModelId)
    normalized.push({ metric, cost })
  }

  let insertedCount = 0
  let updatedCount = 0

  sqlite.transaction(() => {
    const existingQuery = sqlite.query<{ id: string }, [string, string, string]>(`
      SELECT id
      FROM session_metrics
      WHERE user_id = ? AND provider = ? AND session_id = ?
    `)

    const upsertQuery = sqlite.query(`
      INSERT INTO session_metrics (
        id, user_id, provider, session_id, started_at, ended_at, uploaded_at,
        model, model_provider, reasoning_effort, cli_version, model_context_window,
        input_tokens, output_tokens, cached_input_tokens, reasoning_output_tokens, total_tokens,
        api_call_count, conversation_turn_count, user_message_count, tool_call_count,
        input_cost, output_cost, cached_input_cost, reasoning_output_cost, total_cost
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, provider, session_id) DO UPDATE SET
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        uploaded_at = excluded.uploaded_at,
        model = excluded.model,
        model_provider = excluded.model_provider,
        reasoning_effort = excluded.reasoning_effort,
        cli_version = excluded.cli_version,
        model_context_window = excluded.model_context_window,
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        cached_input_tokens = excluded.cached_input_tokens,
        reasoning_output_tokens = excluded.reasoning_output_tokens,
        total_tokens = excluded.total_tokens,
        api_call_count = excluded.api_call_count,
        conversation_turn_count = excluded.conversation_turn_count,
        user_message_count = excluded.user_message_count,
        tool_call_count = excluded.tool_call_count,
        input_cost = excluded.input_cost,
        output_cost = excluded.output_cost,
        cached_input_cost = excluded.cached_input_cost,
        reasoning_output_cost = excluded.reasoning_output_cost,
        total_cost = excluded.total_cost
    `)

    for (const { metric, cost } of normalized) {
      const existing = existingQuery.get(userId, metric.provider, metric.sessionId)
      const rowId = existing?.id ?? crypto.randomUUID()
      if (existing)
        updatedCount += 1
      else
        insertedCount += 1

      upsertQuery.run(
        rowId,
        userId,
        metric.provider,
        metric.sessionId,
        metric.startedAt,
        metric.endedAt,
        new Date().toISOString(),
        metric.model,
        metric.modelProvider,
        metric.reasoningEffort,
        metric.cliVersion,
        metric.modelContextWindow,
        metric.inputTokens,
        metric.outputTokens,
        metric.cachedInputTokens,
        metric.reasoningOutputTokens,
        metric.totalTokens,
        metric.apiCallCount,
        metric.conversationTurnCount,
        metric.userMessageCount,
        metric.toolCallCount,
        cost.inputCost,
        cost.outputCost,
        cost.cachedInputCost,
        cost.reasoningOutputCost,
        cost.totalCost,
      )
    }

    sqlite.query(`
      INSERT INTO upload_batches (
        id, user_id, provider, started_at, completed_at,
        received_count, inserted_count, updated_count, skipped_count, error_count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      batchId,
      userId,
      parsed.provider ?? 'codex',
      startedAt,
      completedAt,
      parsed.sessions.length,
      insertedCount,
      updatedCount,
      0,
      errorCount,
    )
  })()

  return {
    batch_id: batchId,
    received_count: parsed.sessions.length,
    inserted_count: insertedCount,
    updated_count: updatedCount,
    skipped_count: 0,
    error_count: errorCount,
    missing_price_model_ids: [...missingPriceModelIds].sort(),
  }
}

export async function getSummaryStats(range: TimeRange) {
  const start = rangeStart(range)
  const whereClause = start ? 'WHERE ended_at >= ?' : ''
  const params = start ? [start] : []
  const priceModelIds = new Set((await readModelPrices()).keys())

  const totals = sqlite.query(`
    SELECT
      COUNT(*) AS session_count,
      COUNT(DISTINCT user_id) AS user_count,
      COUNT(DISTINCT model) AS model_count,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
      COALESCE(SUM(reasoning_output_tokens), 0) AS reasoning_output_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(api_call_count), 0) AS api_call_count,
      COALESCE(SUM(conversation_turn_count), 0) AS conversation_turn_count,
      COALESCE(SUM(user_message_count), 0) AS user_message_count,
      COALESCE(SUM(tool_call_count), 0) AS tool_call_count,
      COALESCE(SUM(input_cost), 0) AS input_cost,
      COALESCE(SUM(output_cost), 0) AS output_cost,
      COALESCE(SUM(cached_input_cost), 0) AS cached_input_cost,
      COALESCE(SUM(reasoning_output_cost), 0) AS reasoning_output_cost,
      COALESCE(SUM(total_cost), 0) AS total_cost
    FROM session_metrics
    ${whereClause}
  `).get(...params)

  const models = sqlite.query(`
    SELECT
      model,
      model_provider AS model_provider,
      COUNT(*) AS session_count,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(total_cost), 0) AS total_cost
    FROM session_metrics
    ${whereClause}
    GROUP BY model, model_provider
    ORDER BY total_cost DESC, total_tokens DESC, model ASC
  `).all(...params)

  const providers = sqlite.query(`
    SELECT
      provider,
      COUNT(*) AS session_count,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(total_cost), 0) AS total_cost
    FROM session_metrics
    ${whereClause}
    GROUP BY provider
    ORDER BY total_cost DESC, total_tokens DESC, provider ASC
  `).all(...params)

  const distinctModels = sqlite.query<{ model: string }, string[]>(`
    SELECT DISTINCT model
    FROM session_metrics
    ${whereClause}
  `).all(...params)

  return {
    range,
    totals,
    providers,
    models,
    missing_price_model_ids: distinctModels
      .map(row => row.model)
      .filter(model => !priceModelIds.has(model))
      .sort(),
  }
}

export function getLeaderboard(range: TimeRange, metric: LeaderboardMetric) {
  const start = rangeStart(range)
  const whereClause = start ? 'WHERE sm.ended_at >= ?' : ''
  const params = start ? [start] : []
  const orderColumn = metric === 'tokens' ? 'total_tokens' : 'total_cost'

  const rows = sqlite.query(`
    SELECT
      sm.user_id AS user_id,
      u.name AS name,
      u.email AS email,
      COUNT(*) AS session_count,
      COALESCE(SUM(sm.total_tokens), 0) AS total_tokens,
      COALESCE(SUM(sm.total_cost), 0) AS total_cost
    FROM session_metrics sm
    INNER JOIN user u ON u.id = sm.user_id
    ${whereClause}
    GROUP BY sm.user_id, u.name, u.email
    ORDER BY ${orderColumn} DESC, session_count DESC, u.name ASC
  `).all(...params) as Array<Record<string, unknown>>

  return {
    range,
    metric,
    rows: rows.map((row, index) => ({ rank: index + 1, ...row })),
  }
}

export function getUserProfile(userId: string, range: TimeRange) {
  const start = rangeStart(range)
  const metricsWhere = start ? 'WHERE user_id = ? AND ended_at >= ?' : 'WHERE user_id = ?'
  const metricsParams = start ? [userId, start] : [userId]

  const summary = sqlite.query(`
    SELECT
      COUNT(*) AS session_count,
      COUNT(DISTINCT model) AS model_count,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(total_cost), 0) AS total_cost,
      COALESCE(SUM(api_call_count), 0) AS api_call_count,
      COALESCE(SUM(conversation_turn_count), 0) AS conversation_turn_count,
      COALESCE(SUM(user_message_count), 0) AS user_message_count,
      COALESCE(SUM(tool_call_count), 0) AS tool_call_count
    FROM session_metrics
    ${metricsWhere}
  `).get(...metricsParams)

  const recentBatches = sqlite.query(`
    SELECT
      id,
      provider,
      started_at AS started_at,
      completed_at AS completed_at,
      received_count AS received_count,
      inserted_count AS inserted_count,
      updated_count AS updated_count,
      skipped_count AS skipped_count,
      error_count AS error_count
    FROM upload_batches
    WHERE user_id = ?
    ORDER BY started_at DESC
    LIMIT 10
  `).all(userId)

  return {
    range,
    summary,
    recent_batches: recentBatches,
  }
}

export async function updateUserName(userId: string, name: string) {
  const now = new Date()
  await db.update(user)
    .set({ name, updatedAt: now })
    .where(sql`${user.id} = ${userId}`)
    .returning()
  return db.query.user.findFirst({
    where: (users, { eq }) => eq(users.id, userId),
  })
}
