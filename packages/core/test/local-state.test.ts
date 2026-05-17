import { afterEach, expect, test } from 'bun:test'
import {
  DEFAULT_BASE_URL,
  authManager,
  configManager,
  historyManager,
  modelsManager,
} from '../src/index'

const tempDirs: string[] = []

function createTempHome() {
  const path = `${Bun.env.TMPDIR ?? '/tmp'}agent-telemetry-test-${crypto.randomUUID()}`
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
  expect(await Bun.file(`${homeDir}/.agent-telemetry/config.json`).json()).toEqual({
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
  expect(await Bun.file(`${homeDir}/.agent-telemetry/models.json`).exists()).toBe(true)
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
