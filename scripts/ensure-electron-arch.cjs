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
  const executable = process.platform === 'win32'
    ? 'electron.exe'
    : process.platform === 'darwin'
      ? path.join('Electron.app', 'Contents', 'MacOS', 'Electron')
      : 'electron'
  return path.join(process.cwd(), 'node_modules', 'electron', 'dist', executable)
}

function getElectronVersion() {
  const pkgPath = path.join(process.cwd(), 'node_modules', 'electron', 'package.json')
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version
}

function installElectronBinary(arch) {
  const version = getElectronVersion()
  const electronDir = path.join(process.cwd(), 'node_modules', 'electron')
  fs.rmSync(path.join(electronDir, 'dist'), { recursive: true, force: true })
  fs.rmSync(path.join(electronDir, 'path.txt'), { force: true })
  const env = {
    ...process.env,
    npm_config_arch: arch,
  }
  const result = cp.spawnSync(process.execPath, [path.join(electronDir, 'install.js')], {
    stdio: 'inherit',
    shell: false,
    env,
  })

  if (result.status !== 0) {
    throw new Error(`[ensure-electron-arch] Electron ${arch} install failed with exit code ${result.status ?? 1}.`)
  }

  console.log(`[ensure-electron-arch] Electron ${version} installed for ${arch}.`)
}

function ensureElectronArch() {
  const electronExe = getElectronExePath()
  const expectedArch = process.platform === 'win32' && process.arch === 'arm64'
    ? 'x64'
    : process.arch

  if (!fs.existsSync(electronExe)) {
    console.log(`[ensure-electron-arch] Electron binary missing; installing for ${expectedArch}.`)
    installElectronBinary(expectedArch)
  }

  if (process.platform !== 'win32' || process.arch !== 'arm64') return

  const currentArch = machineToArch(readPeMachine(electronExe))
  if (currentArch === 'x64') {
    console.log('[ensure-electron-arch] Electron already aligned to x64 for Windows ARM64.')
    return
  }

  const version = getElectronVersion()
  console.log(`[ensure-electron-arch] Reinstalling electron@${version} as x64 (current: ${currentArch}).`)
  installElectronBinary('x64')

  const nextArch = machineToArch(readPeMachine(electronExe))
  if (nextArch !== 'x64') {
    throw new Error(`[ensure-electron-arch] Expected x64 electron after reinstall, got ${nextArch}.`)
  }

  console.log('[ensure-electron-arch] Electron switched to x64 successfully.')
}

ensureElectronArch()