const { spawnSync } = require('node:child_process')

const electronVersion = require('electron/package.json').version
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

let result = run(['rebuild', 'better-sqlite3'])
if (result.status !== 0) {
  console.error('\n[rebuild:native] Prebuild failed; falling back to source build (requires VS Build Tools on Windows).')
  result = run(['rebuild', '--build-from-source', 'better-sqlite3'])
}

process.exit(result.status ?? 1)
