const { spawnSync } = require('node:child_process')

const electronVersion = require('electron/package.json').version
const electronPath = require('electron')
const forcedArch = process.platform === 'win32' && process.arch === 'arm64'
  ? 'x64'
  : process.arch
const npmCli = process.env.npm_execpath
const command = npmCli ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm')
const commandPrefix = npmCli ? [npmCli] : []
const env = {
  ...process.env,
  npm_config_runtime: 'electron',
  npm_config_target: electronVersion,
  npm_config_disturl: 'https://electronjs.org/headers',
  npm_config_arch: forcedArch,
  npm_config_target_arch: forcedArch
}

function run(args) {
  const result = spawnSync(command, [...commandPrefix, ...args], {
    stdio: 'inherit',
    shell: false,
    env
  })

  if (result.error) console.error(`[rebuild:native] ${result.error.message}`)
  return result
}

function canLoadBetterSqlite3() {
  const probe = [
    "const Database = require('better-sqlite3')",
    "const database = new Database(':memory:')",
    'database.close()'
  ].join(';')
  const result = spawnSync(electronPath, ['-e', probe], {
    cwd: process.cwd(),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'ignore',
    shell: false,
    timeout: 10000
  })
  return result.status === 0
}

if (process.env.VEREINO_FORCE_NATIVE_REBUILD !== '1' && canLoadBetterSqlite3()) {
  console.log(`[rebuild:native] better-sqlite3 already matches Electron ${electronVersion} (${forcedArch}).`)
  process.exit(0)
}

console.log(`[rebuild:native] Rebuilding better-sqlite3 for Electron ${electronVersion} (${forcedArch}).`)
let result = run(['rebuild', 'better-sqlite3'])
if (result.status !== 0) {
  console.error('\n[rebuild:native] Prebuild failed; falling back to source build (requires VS Build Tools on Windows).')
  result = run(['rebuild', '--build-from-source', 'better-sqlite3'])
}

process.exit(result.status ?? 1)
