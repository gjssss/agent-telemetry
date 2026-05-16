import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function runCommand(command, args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' })

    child.on('error', rejectPromise)
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise()
      } else {
        rejectPromise(new Error(`${command} ${args.join(' ')} exited with ${code}`))
      }
    })
  })
}

function findRepoRoot(startDir) {
  let current = startDir
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current
    const parent = resolve(current, '..')
    if (parent === current) break
    current = parent
  }
  return startDir
}

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const cliDir = resolve(scriptDir, '..')
  const repoRoot = findRepoRoot(cliDir)

  const frontendDir = resolve(repoRoot, 'packages', 'frontend')
  const backendDir = resolve(repoRoot, 'packages', 'backend')
  const coreDir = resolve(repoRoot, 'packages', 'core')
  const cliDist = resolve(cliDir, 'dist')
  const webDist = resolve(cliDist, 'web')
  const coreDist = resolve(cliDist, 'core')

  await runCommand('pnpm', ['--filter', './packages/core', 'build'], repoRoot)
  await runCommand('pnpm', ['--filter', './packages/frontend', 'build'], repoRoot)
  await runCommand('pnpm', ['--filter', './packages/backend', 'build'], repoRoot)
  await runCommand('pnpm', ['--filter', './packages/cli', 'build:cli'], repoRoot)

  await rm(webDist, { recursive: true, force: true })
  await mkdir(resolve(webDist, 'frontend'), { recursive: true })
  await mkdir(resolve(webDist, 'backend'), { recursive: true })

  await cp(resolve(frontendDir, 'dist'), resolve(webDist, 'frontend'), {
    recursive: true,
  })
  await cp(resolve(backendDir, 'dist'), resolve(webDist, 'backend'), {
    recursive: true,
  })

  await rm(coreDist, { recursive: true, force: true })
  await mkdir(coreDist, { recursive: true })
  await cp(resolve(coreDir, 'dist'), coreDist, {
    recursive: true,
  })

  console.log(`[build] bundled web assets into ${webDist}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
