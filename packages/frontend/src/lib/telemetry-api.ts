import { useAuthStore } from '@/stores/auth-store'

export type TimeRange = '1d' | '7d' | '30d' | 'total'
export type LeaderboardMetric = 'cost' | 'tokens'

export class ApiRequestError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

export const TIME_RANGES: Array<{ value: TimeRange; label: string }> = [
  { value: '1d', label: '1d' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'total', label: 'total' },
]

export type SummaryTotals = {
  session_count: number
  user_count: number
  model_count: number
  input_tokens: number
  output_tokens: number
  cached_input_tokens: number
  reasoning_output_tokens: number
  total_tokens: number
  api_call_count: number
  conversation_turn_count: number
  user_message_count: number
  tool_call_count: number
  input_cost: number
  output_cost: number
  cached_input_cost: number
  reasoning_output_cost: number
  total_cost: number
}

export type SummaryModel = {
  model: string
  model_provider: string | null
  session_count: number
  total_tokens: number
  total_cost: number
}

export type SummaryProvider = {
  provider: string
  session_count: number
  total_tokens: number
  total_cost: number
}

export type SummaryResponse = {
  range: TimeRange
  totals: SummaryTotals
  providers: SummaryProvider[]
  models: SummaryModel[]
  missing_price_model_ids: string[]
}

export type LeaderboardRow = {
  rank: number
  user_id: string
  name: string | null
  email: string
  session_count: number
  total_tokens: number
  total_cost: number
}

export type LeaderboardResponse = {
  range: TimeRange
  metric: LeaderboardMetric
  rows: LeaderboardRow[]
}

export type CurrentUser = {
  id: string
  email: string
  name?: string | null
  createdAt?: string
  updatedAt?: string
}

export type ProfileSummary = {
  session_count: number
  model_count: number
  total_tokens: number
  total_cost: number
  api_call_count: number
  conversation_turn_count: number
  user_message_count: number
  tool_call_count: number
}

export type UploadBatch = {
  id: string
  provider: string
  started_at: string
  completed_at: string
  received_count: number
  inserted_count: number
  updated_count: number
  skipped_count: number
  error_count: number
}

export type ProfileResponse = {
  range: TimeRange
  user: CurrentUser
  summary: ProfileSummary
  recent_batches: UploadBatch[]
}

let isRedirectingToLogin = false

function getLoginRedirect() {
  if (typeof window === 'undefined') return undefined

  const { pathname, search, hash } = window.location
  if (pathname === '/login' || pathname === '/sign-in') return undefined

  return `${pathname}${search}${hash}`
}

function redirectToLogin() {
  if (typeof window === 'undefined' || isRedirectingToLogin) return

  const redirect = getLoginRedirect()
  const search = redirect
    ? `?${new URLSearchParams({ redirect }).toString()}`
    : ''
  const target = `/login${search}`

  if (`${window.location.pathname}${window.location.search}` === target) return

  isRedirectingToLogin = true
  window.location.assign(target)
}

async function readErrorMessage(response: Response) {
  const result = (await response.json().catch(() => null)) as {
    error?: string
    message?: string
  } | null

  return result?.error ?? result?.message ?? 'Request failed.'
}

function requireAuthMarker() {
  if (useAuthStore.getState().auth.accessToken) return

  redirectToLogin()
  throw new ApiRequestError('Unauthorized', 401)
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  requireAuthMarker()

  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const message = await readErrorMessage(response)

    if (response.status === 401) {
      useAuthStore.getState().auth.reset()
      redirectToLogin()
    }

    throw new ApiRequestError(message, response.status)
  }

  return (await response.json()) as T
}

export function getSummary(range: TimeRange) {
  return apiJson<SummaryResponse>(`/api/stats/summary?range=${range}`)
}

export function getLeaderboard(range: TimeRange, metric: LeaderboardMetric) {
  return apiJson<LeaderboardResponse>(
    `/api/stats/leaderboard?range=${range}&metric=${metric}`
  )
}

export function getProfile(range: TimeRange) {
  return apiJson<ProfileResponse>(`/api/profile?range=${range}`)
}

export async function updateCurrentUserName(name: string) {
  const result = await apiJson<{ user: CurrentUser }>('/api/me', {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
  return result.user
}

export function formatInteger(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US').format(Number(value ?? 0))
}

export function formatCost(microUsd: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(Number(microUsd ?? 0) / 1_000_000)
}
