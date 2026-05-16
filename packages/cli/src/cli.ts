import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { buildGreeting } from '@auto-code/core'
import { Command } from 'commander'

const VERSION = __APP_VERSION__

interface RunOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
}

interface WebOptions {
  port?: string
}

function runCommand(command: string, args: string[], options: RunOptions = {}) {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: 'inherit',
    })

    child.on('error', rejectPromise)
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise()
      }
      else {
        rejectPromise(new Error(`${command} ${args.join(' ')} exited with ${code}`))
      }
    })
  })
}

function resolveCliDist() {
  const cliDir = dirname(fileURLToPath(import.meta.url))
  return cliDir
}

async function runWeb(options: WebOptions) {
  const cliDist = resolveCliDist()
  const webRoot = resolve(cliDist, 'web')
  const frontendDist = resolve(webRoot, 'frontend')
  const backendEntry = resolve(webRoot, 'backend', 'index.js')

  if (!existsSync(frontendDist)) {
    throw new Error('Frontend assets not found. Please rebuild the CLI package.')
  }

  if (!existsSync(backendEntry)) {
    throw new Error('Backend bundle not found. Please rebuild the CLI package.')
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FRONTEND_DIST: frontendDist,
  }

  if (options.port) {
    env.PORT = options.port
  }

  await runCommand('node', [backendEntry], { env })
}

const program = new Command()

program
  .name('auto-code')
  .description('A modern TypeScript CLI template built with Vite.')
  .version(VERSION)

program
  .command('hello')
  .description('Print a greeting')
  .argument('[name]', 'Name to greet', 'world')
  .action((name: string) => {
    console.log(buildGreeting(name))
  })

program
  .command('web')
  .description('Serve the bundled frontend with the backend API')
  .option('-p, --port <port>', 'Set backend port', '3000')
  .action(async (options: WebOptions) => {
    await runWeb(options)
  })

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
