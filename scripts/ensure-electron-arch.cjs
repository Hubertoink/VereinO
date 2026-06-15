const fs = require('node:fs')
const path = require('node:path')
const cp = require('node:child_process')

function readPeMachine(filePath) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const dosHeader = Buffer.alloc(4)
    fs.readSync(fd, dosHeader, 0, 4, 0x3c)
    const peOffset = dosHeader.readUInt32LE(0)
    const machine = Buffer.alloc(2)
    fs.readSync(fd, machine, 0, 2, peOffset + 4)
    return machine.readUInt16LE(0)
  } finally {
    fs.closeSync(fd)
  }
}

function machineToArch(machine) {
  if (machine === 0x8664) return 'x64'
  if (machine === 0xaa64) return 'arm64'
  if (machine === 0x014c) return 'x86'
  return `0x${machine.toString(16)}`
}

function getElectronExePath() {
  return path.join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe')
}

function getElectronVersion() {
  const pkgPath = path.join(process.cwd(), 'node_modules', 'electron', 'package.json')
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version
}

function ensureElectronArch() {
  if (process.platform !== 'win32' || process.arch !== 'arm64') return

  const electronExe = getElectronExePath()
  if (!fs.existsSync(electronExe)) {
    throw new Error(`Electron binary not found at ${electronExe}`)
  }

  const currentArch = machineToArch(readPeMachine(electronExe))
  if (currentArch === 'x64') {
    console.log('[ensure-electron-arch] Electron already aligned to x64 for Windows ARM64.')
    return
  }

  const version = getElectronVersion()
  console.log(`[ensure-electron-arch] Reinstalling electron@${version} as x64 (current: ${currentArch}).`)

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const env = {
    ...process.env,
    npm_config_arch: 'x64',
  }
  const result = cp.spawnSync(npmCmd, ['install', `electron@${version}`, '--save-dev', '--force'], {
    stdio: 'inherit',
    shell: false,
    env,
  })

  if (result.status !== 0) {
    throw new Error(`[ensure-electron-arch] Electron x64 install failed with exit code ${result.status ?? 1}.`)
  }

  const nextArch = machineToArch(readPeMachine(electronExe))
  if (nextArch !== 'x64') {
    throw new Error(`[ensure-electron-arch] Expected x64 electron after reinstall, got ${nextArch}.`)
  }

  console.log('[ensure-electron-arch] Electron switched to x64 successfully.')
}

ensureElectronArch()