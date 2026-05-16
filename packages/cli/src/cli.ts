import { Command } from 'commander'

const VERSION = __APP_VERSION__

interface RunOptions {
  cwd?: string
  env?: Record<string, string | undefined>
}

interface ServerOptions {
  port?: string
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

async function runServer(options: ServerOptions) {
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

const program = new Command()

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

await program.parseAsync(Bun.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  throw error
})
