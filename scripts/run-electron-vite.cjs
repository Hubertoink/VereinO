const { spawn } = require('node:child_process')
const path = require('node:path')

const target = process.argv[2] || 'dev'
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const cliPath = path.join(process.cwd(), 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
const child = spawn(process.execPath, [cliPath, target], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  shell: false
})

child.on('error', (error) => {
  console.error('[run-electron-vite] Failed to start electron-vite:', error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
