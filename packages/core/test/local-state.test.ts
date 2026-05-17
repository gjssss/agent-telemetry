import { afterEach, expect, test } from 'bun:test'
import {
  DEFAULT_BASE_URL,
  authManager,
  calculateModelCost,
  configManager,
  historyManager,
  modelsManager,
  type ModelPrice,
} from '../src/index'

const tempDirs: string[] = []

function createTempHome() {
  const path = `${Bun.env.TMPDIR ?? '/tmp'}agent-metry-test-${crypto.randomUUID()}`
  tempDirs.push(path)
  return path
}

afterEach(async () => {
  for (const path of tempDirs.splice(0))
    await Bun.$`rm -rf ${path}`.quiet()
})

test('ensureConfig creates config.json with default base_url in an isolated home', async () => {
  const homeDir = createTempHome()

  const config = await configManager.ensureConfig({ homeDir })

  expect(config.base_url).toBe(DEFAULT_BASE_URL)
  expect(await Bun.file(`${homeDir}/.agent-metry/config.json`).json()).toEqual({
    base_url: DEFAULT_BASE_URL,
  })
})

test('config manager supports set, get, list, and remove', async () => {
  const homeDir = createTempHome()

  await configManager.set('base_url', 'http://127.0.0.1:4000', { homeDir })
  await configManager.set('extra', 'value', { homeDir })

  expect(await configManager.getRequired('base_url', { homeDir })).toBe('http://127.0.0.1:4000')
  expect(await configManager.list({ homeDir })).toEqual({
    base_url: 'http://127.0.0.1:4000',
    extra: 'value',
  })

  await configManager.remove('extra', { homeDir })

  expect(await configManager.list({ homeDir })).toEqual({
    base_url: 'http://127.0.0.1:4000',
  })
})

test('required config fields throw when missing', async () => {
  const homeDir = createTempHome()

  await configManager.ensureConfig({ homeDir })
  await configManager.remove('base_url', { homeDir })

  await expect(configManager.getRequired('base_url', { homeDir })).rejects.toThrow(
    'Missing required config field: base_url',
  )
})

test('models manager creates default OpenAI and Claude prices', async () => {
  const homeDir = createTempHome()

  const models = await modelsManager.ensureDefaultModels({ homeDir })
  const modelIds = models.models.map((model) => model.model)

  expect(modelIds).toContain('gpt-5.5')
  expect(modelIds).toContain('gpt-5.4-mini')
  expect(modelIds).toContain('claude-opus-4-7')
  expect(modelIds).toContain('claude-sonnet-4-5')
  expect(await Bun.file(`${homeDir}/.agent-metry/models.json`).exists()).toBe(true)
})

test('models manager supports set, update, and remove without reordering defaults', async () => {
  const homeDir = createTempHome()

  const created = await modelsManager.set(
    {
      model: 'custom-model',
      provider: 'openai',
      input_usd_per_1m_tokens: 1,
      cached_input_usd_per_1m_tokens: 0.1,
      output_usd_per_1m_tokens: 2,
    },
    { homeDir },
  )
  const updated = await modelsManager.set(
    {
      model: 'custom-model',
      provider: 'anthropic',
      input_usd_per_1m_tokens: 3,
      cached_input_usd_per_1m_tokens: 0.3,
      output_usd_per_1m_tokens: 4,
    },
    { homeDir },
  )

  expect(created.action).toBe('created')
  expect(updated.action).toBe('updated')
  expect(updated.state.models.at(0)?.model).toBe('gpt-5.5')
  expect(updated.state.models.at(-1)).toEqual({
    model: 'custom-model',
    provider: 'anthropic',
    input_usd_per_1m_tokens: 3,
    cached_input_usd_per_1m_tokens: 0.3,
    output_usd_per_1m_tokens: 4,
  })

  await modelsManager.remove('custom-model', { homeDir })

  expect((await modelsManager.list({ homeDir })).models.map(model => model.model)).not.toContain('custom-model')
})

test('models manager rejects invalid model prices', async () => {
  const homeDir = createTempHome()
  const invalidProvider = {
    model: 'bad-provider',
    provider: 'other',
    input_usd_per_1m_tokens: 1,
    cached_input_usd_per_1m_tokens: 0,
    output_usd_per_1m_tokens: 1,
  } as ModelPrice

  await expect(modelsManager.set(invalidProvider, { homeDir })).rejects.toThrow(
    'Provider must be openai or anthropic',
  )
  await expect(modelsManager.set(
    {
      model: 'bad-price',
      provider: 'openai',
      input_usd_per_1m_tokens: -1,
      cached_input_usd_per_1m_tokens: 0,
      output_usd_per_1m_tokens: 1,
    },
    { homeDir },
  )).rejects.toThrow('input_usd_per_1m_tokens must be a non-negative finite number')
})

test('calculateModelCost uses shared model prices and reports missing prices', () => {
  const price: ModelPrice = {
    model: 'priced-model',
    provider: 'openai',
    input_usd_per_1m_tokens: 5,
    cached_input_usd_per_1m_tokens: 0.5,
    output_usd_per_1m_tokens: 30,
  }

  expect(calculateModelCost({
    model: 'priced-model',
    input_tokens: 1_000_000,
    output_tokens: 100_000,
    cached_input_tokens: 200_000,
    reasoning_output_tokens: 10_000,
  }, price)).toEqual({
    input_cost: 4_000_000,
    output_cost: 3_000_000,
    cached_input_cost: 100_000,
    reasoning_output_cost: 300_000,
    total_cost: 7_400_000,
  })

  expect(calculateModelCost({
    model: 'missing-model',
    input_tokens: 1_000_000,
    output_tokens: 0,
    cached_input_tokens: 0,
    reasoning_output_tokens: 0,
  }).missing_model_id).toBe('missing-model')
})

test('auth and history managers persist and reload state', async () => {
  const homeDir = createTempHome()

  await authManager.write(
    {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    },
    { homeDir },
  )
  await historyManager.write(
    {
      items: [
        {
          provider: 'codex',
          session_id: 'session-id',
          source_path: '/tmp/session.jsonl',
          file_size: 123,
          file_mtime_ms: 456,
          last_uploaded_at: '2026-05-17T00:00:00.000Z',
        },
      ],
    },
    { homeDir },
  )

  expect(await authManager.read({ homeDir })).toEqual({
    access_token: 'access-token',
    refresh_token: 'refresh-token',
  })
  expect(await historyManager.read({ homeDir })).toEqual({
    items: [
      {
        provider: 'codex',
        session_id: 'session-id',
        source_path: '/tmp/session.jsonl',
        file_size: 123,
        file_mtime_ms: 456,
        last_uploaded_at: '2026-05-17T00:00:00.000Z',
      },
    ],
  })
})
