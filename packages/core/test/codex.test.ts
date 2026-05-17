import { afterEach, expect, test } from 'bun:test'
import {
  markCodexSessionsUploaded,
  parseCodexSessionFile,
  planCodexSessionUploads,
  planDefaultCodexSessionUploads,
  scanCodexSessionFiles,
} from '../src/codex'

const tempDirs: string[] = []

function createTempDir() {
  const path = `${Bun.env.TMPDIR ?? '/tmp'}agent-telemetry-codex-test-${crypto.randomUUID()}`
  tempDirs.push(path)
  return path
}

async function writeJsonl(path: string, entries: unknown[]) {
  await Bun.$`mkdir -p ${path.substring(0, path.lastIndexOf('/'))}`.quiet()
  await Bun.write(path, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`)
}

afterEach(async () => {
  for (const path of tempDirs.splice(0))
    await Bun.$`rm -rf ${path}`.quiet()
})

test('parseCodexSessionFile returns whitelisted aggregate session metrics', async () => {
  const dir = createTempDir()
  const path = `${dir}/019caaaa-1111-7222-8333-abcdefabcdef.jsonl`

  await writeJsonl(path, [
    {
      type: 'session_meta',
      timestamp: '2026-05-17T00:00:00.000Z',
      payload: {
        id: 'session-from-meta',
        cwd: '/Users/gjssss/workspace/secret-project',
        git: { branch: 'main', commit: 'abc123' },
        cli_version: '1.2.3',
        model: 'gpt-5.3-codex',
        model_provider: 'openai',
        reasoning_effort: 'medium',
        model_context_window: 200000,
      },
    },
    {
      type: 'turn_context',
      timestamp: '2026-05-17T00:00:01.000Z',
      payload: { turn_id: 'turn-1' },
    },
    {
      type: 'turn_context',
      timestamp: '2026-05-17T00:00:02.000Z',
      payload: { turn_id: 'turn-1' },
    },
    {
      type: 'event_msg',
      timestamp: '2026-05-17T00:00:03.000Z',
      payload: {
        type: 'user_message',
        message: 'prompt secret',
      },
    },
    {
      type: 'response_item',
      timestamp: '2026-05-17T00:00:04.000Z',
      payload: {
        item: {
          type: 'function_call',
          name: 'exec_command',
          arguments: { cmd: 'cat /Users/gjssss/.ssh/id_rsa' },
          output: 'command output secret',
        },
      },
    },
    {
      type: 'token_count',
      timestamp: '2026-05-17T00:00:05.000Z',
      payload: {
        total_token_usage: {
          input_tokens: 10,
          output_tokens: 20,
          cached_input_tokens: 3,
          reasoning_output_tokens: 4,
          total_tokens: 30,
        },
      },
    },
    {
      type: 'token_count',
      timestamp: '2026-05-17T00:00:06.000Z',
      payload: {
        total_token_usage: {
          input_tokens: 10,
          output_tokens: 20,
          cached_input_tokens: 3,
          reasoning_output_tokens: 4,
          total_tokens: 30,
        },
      },
    },
    {
      type: 'token_count',
      timestamp: '2026-05-17T00:00:07.000Z',
      payload: {
        total_token_usage: {
          input_tokens: 15,
          output_tokens: 25,
          cached_input_tokens: 5,
          reasoning_output_tokens: 6,
          total_tokens: 40,
        },
      },
    },
    {
      type: 'response_item',
      timestamp: '2026-05-17T00:00:08.000Z',
      payload: {
        item: {
          type: 'message',
          content: 'response secret',
          reasoning: 'reasoning secret',
        },
      },
    },
  ])

  const parsed = await parseCodexSessionFile(path)

  expect(parsed.metrics).toEqual({
    provider: 'codex',
    session_id: 'session-from-meta',
    started_at: '2026-05-17T00:00:00.000Z',
    ended_at: '2026-05-17T00:00:08.000Z',
    model: 'gpt-5.3-codex',
    model_provider: 'openai',
    reasoning_effort: 'medium',
    cli_version: '1.2.3',
    model_context_window: 200000,
    input_tokens: 15,
    output_tokens: 25,
    cached_input_tokens: 5,
    reasoning_output_tokens: 6,
    total_tokens: 40,
    api_call_count: 2,
    conversation_turn_count: 1,
    user_message_count: 1,
    tool_call_count: 1,
  })

  const uploadPayload = JSON.stringify(parsed.metrics)
  expect(uploadPayload).not.toContain('prompt secret')
  expect(uploadPayload).not.toContain('response secret')
  expect(uploadPayload).not.toContain('reasoning secret')
  expect(uploadPayload).not.toContain('command output secret')
  expect(uploadPayload).not.toContain('/Users/gjssss')
  expect(uploadPayload).not.toContain('secret-project')
  expect(uploadPayload).not.toContain('abc123')
  expect(uploadPayload).not.toContain('jsonl')
})

test('parseCodexSessionFile falls back to filename UUID when session_meta id is absent', async () => {
  const dir = createTempDir()
  const path = `${dir}/019cbbbb-1111-7222-8333-abcdefabcdef.jsonl`

  await writeJsonl(path, [
    {
      type: 'token_count',
      timestamp: '2026-05-17T00:00:00.000Z',
      payload: { total_token_usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } },
    },
  ])

  const parsed = await parseCodexSessionFile(path)

  expect(parsed.metrics.session_id).toBe('019cbbbb-1111-7222-8333-abcdefabcdef')
})

test('parseCodexSessionFile reads nested info token totals from current Codex sessions', async () => {
  const dir = createTempDir()
  const path = `${dir}/019cbbbc-1111-7222-8333-abcdefabcdef.jsonl`

  await writeJsonl(path, [
    {
      type: 'response_item',
      timestamp: '2026-05-17T00:00:00.000Z',
      payload: {
        type: 'message',
        info: {
          model_context_window: 200000,
          total_token_usage: {
            input_tokens: 100,
            output_tokens: 20,
            cached_input_tokens: 30,
            reasoning_output_tokens: 4,
            total_tokens: 120,
          },
        },
      },
    },
    {
      type: 'response_item',
      timestamp: '2026-05-17T00:00:01.000Z',
      payload: {
        type: 'message',
        info: {
          model_context_window: 200000,
          total_token_usage: {
            input_tokens: 150,
            output_tokens: 50,
            cached_input_tokens: 40,
            reasoning_output_tokens: 10,
            total_tokens: 200,
          },
        },
      },
    },
  ])

  const parsed = await parseCodexSessionFile(path)

  expect(parsed.metrics.model).toBe('unknown')
  expect(parsed.metrics.model_context_window).toBe(200000)
  expect(parsed.metrics.input_tokens).toBe(150)
  expect(parsed.metrics.output_tokens).toBe(50)
  expect(parsed.metrics.cached_input_tokens).toBe(40)
  expect(parsed.metrics.reasoning_output_tokens).toBe(10)
  expect(parsed.metrics.total_tokens).toBe(200)
  expect(parsed.metrics.api_call_count).toBe(2)
})

test('scanCodexSessionFiles uses default Codex session and archived session locations', async () => {
  const homeDir = createTempDir()
  const activePath = `${homeDir}/.codex/sessions/2026/05/17/019cccc1-1111-7222-8333-abcdefabcdef.jsonl`
  const archivedPath = `${homeDir}/.codex/archived_sessions/019cccc2-1111-7222-8333-abcdefabcdef.jsonl`
  const ignoredNestedArchivedPath = `${homeDir}/.codex/archived_sessions/nested/019cccc3-1111-7222-8333-abcdefabcdef.jsonl`

  await writeJsonl(activePath, [])
  await writeJsonl(archivedPath, [])
  await writeJsonl(ignoredNestedArchivedPath, [])

  const files = await scanCodexSessionFiles({ homeDir })

  expect(files.map((file) => file.source_path).sort()).toEqual([archivedPath, activePath].sort())
})

test('planCodexSessionUploads marks new and changed files pending and skips unchanged files', async () => {
  const dir = createTempDir()
  const newPath = `${dir}/019cdddd-1111-7222-8333-abcdefabcdef.jsonl`
  const changedPath = `${dir}/019ceeee-1111-7222-8333-abcdefabcdef.jsonl`
  const changedMtimePath = `${dir}/019ceee1-1111-7222-8333-abcdefabcdef.jsonl`
  const unchangedPath = `${dir}/019cffff-1111-7222-8333-abcdefabcdef.jsonl`

  await writeJsonl(newPath, [{ type: 'token_count', payload: { total_token_usage: { input_tokens: 1 } } }])
  await writeJsonl(changedPath, [{ type: 'token_count', payload: { total_token_usage: { input_tokens: 2 } } }])
  await writeJsonl(changedMtimePath, [{ type: 'token_count', payload: { total_token_usage: { input_tokens: 4 } } }])
  await writeJsonl(unchangedPath, [{ type: 'token_count', payload: { total_token_usage: { input_tokens: 3 } } }])

  const newFile = await parseCodexSessionFile(newPath).then((parsed) => parsed.file)
  const changedFile = await parseCodexSessionFile(changedPath).then((parsed) => parsed.file)
  const changedMtimeFile = await parseCodexSessionFile(changedMtimePath).then((parsed) => parsed.file)
  const unchangedFile = await parseCodexSessionFile(unchangedPath).then((parsed) => parsed.file)

  const plan = await planCodexSessionUploads(
    [
      newFile,
      { ...changedFile, file_size: changedFile.file_size + 1 },
      { ...changedMtimeFile, file_mtime_ms: changedMtimeFile.file_mtime_ms + 1 },
      unchangedFile,
    ],
    {
      items: [
        {
          provider: 'codex',
          session_id: 'changed-session',
          source_path: changedPath,
          file_size: changedFile.file_size,
          file_mtime_ms: changedFile.file_mtime_ms,
          last_uploaded_at: '2026-05-17T00:00:00.000Z',
        },
        {
          provider: 'codex',
          session_id: 'changed-mtime-session',
          source_path: changedMtimePath,
          file_size: changedMtimeFile.file_size,
          file_mtime_ms: changedMtimeFile.file_mtime_ms,
          last_uploaded_at: '2026-05-17T00:00:00.000Z',
        },
        {
          provider: 'codex',
          session_id: 'unchanged-session',
          source_path: unchangedPath,
          file_size: unchangedFile.file_size,
          file_mtime_ms: unchangedFile.file_mtime_ms,
          last_uploaded_at: '2026-05-17T00:00:00.000Z',
        },
        {
          provider: 'codex',
          session_id: 'deleted-local-session',
          source_path: `${dir}/deleted.jsonl`,
          file_size: 1,
          file_mtime_ms: 1,
          last_uploaded_at: '2026-05-17T00:00:00.000Z',
        },
      ],
    },
  )

  expect(plan.pending.map((item) => [item.file.source_path, item.reason])).toEqual([
    [newPath, 'new'],
    [changedMtimePath, 'changed'],
    [changedPath, 'changed'],
  ])
  expect(plan.skipped.map((file) => file.source_path)).toEqual([unchangedPath])
})

test('history is updated only when uploaded sessions are explicitly marked successful', async () => {
  const homeDir = createTempDir()
  const path = `${homeDir}/.codex/sessions/019c1234-1111-7222-8333-abcdefabcdef.jsonl`

  await writeJsonl(path, [{ type: 'token_count', payload: { total_token_usage: { input_tokens: 1 } } }])

  const initialPlan = await planDefaultCodexSessionUploads({ homeDir })
  expect(initialPlan.pending).toHaveLength(1)
  expect(await Bun.file(`${homeDir}/.agent-telemetry/history.json`).exists()).toBe(false)

  await markCodexSessionsUploaded(initialPlan.pending, { homeDir }, '2026-05-17T00:00:00.000Z')

  const nextPlan = await planDefaultCodexSessionUploads({ homeDir })
  expect(nextPlan.pending).toHaveLength(0)
  expect(nextPlan.skipped).toHaveLength(1)
})
