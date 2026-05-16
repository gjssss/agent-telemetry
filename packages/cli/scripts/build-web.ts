async function runCommand(args: string[], cwd: string) {
  const child = Bun.spawn(args, {
    cwd,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const exitCode = await child.exited
  if (exitCode !== 0)
    throw new Error(`${args.join(' ')} exited with ${exitCode}`)
}

function parentDir(dir: string) {
  const cleanDir = dir.replace(/\/+$/, '')
  const index = cleanDir.lastIndexOf('/')
  if (index <= 0)
    return '/'
  return cleanDir.slice(0, index)
}

async function findRepoRoot(startDir: string) {
  let current = startDir
  for (let i = 0; i < 8; i += 1) {
    const packageFile = Bun.file(`${current}/package.json`)
    if (await packageFile.exists()) {
      const pkg = await packageFile.json() as {
        packageManager?: string
        workspaces?: unknown
      }
      if (pkg.packageManager?.startsWith('bun@') || Array.isArray(pkg.workspaces))
        return current
    }

    const parent = parentDir(current)
    if (parent === current)
      break
    current = parent
  }

  return startDir
}

async function main() {
  const scriptDir = import.meta.dirname
  const cliDir = parentDir(scriptDir)
  const repoRoot = await findRepoRoot(cliDir)

  const frontendDir = `${repoRoot}/packages/frontend`
  const backendDir = `${repoRoot}/packages/backend`
  const coreDir = `${repoRoot}/packages/core`
  const cliDist = `${cliDir}/dist`
  const webDist = `${cliDist}/web`
  const coreDist = `${cliDist}/core`

  await runCommand(['bun', 'run', '--filter', '@agent-telemetry/core', 'build'], repoRoot)
  await runCommand(['bun', 'run', '--filter', '@agent-telemetry/frontend', 'build'], repoRoot)
  await runCommand(['bun', 'run', '--filter', '@agent-telemetry/backend', 'build'], repoRoot)
  await runCommand(['bun', 'run', '--filter', '@agent-telemetry/cli', 'build:cli'], repoRoot)

  await runCommand(['rm', '-rf', webDist], repoRoot)
  await runCommand(['mkdir', '-p', `${webDist}/frontend`, `${webDist}/backend`], repoRoot)
  await runCommand(['cp', '-R', `${frontendDir}/dist/.`, `${webDist}/frontend`], repoRoot)
  await runCommand(['cp', '-R', `${backendDir}/dist/.`, `${webDist}/backend`], repoRoot)

  await runCommand(['rm', '-rf', coreDist], repoRoot)
  await runCommand(['mkdir', '-p', coreDist], repoRoot)
  await runCommand(['cp', '-R', `${coreDir}/dist/.`, coreDist], repoRoot)

  console.log(`[build] bundled web assets into ${webDist}`)
}

await main()
