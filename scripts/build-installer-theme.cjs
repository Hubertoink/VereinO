// Compile our NSIS presentation plugin from source; no downloaded plugin binaries.
// NSIS runs as x86 even when the installed Electron application is x64.
const { spawnSync } = require('node:child_process')
const { mkdirSync } = require('node:fs')
const path = require('node:path')

if (process.platform !== 'win32') process.exit(0)
const projectDir = path.resolve(__dirname, '..')
const sourceDir = path.join(projectDir, 'build', 'installer-theme')
const outputDir = path.join(sourceDir, 'generated')
mkdirSync(outputDir, { recursive: true })

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: sourceDir, encoding: 'utf8', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}):\n${result.stdout || ''}\n${result.stderr || ''}`)
  }
  return result.stdout
}

const vswhere = path.join(process.env['ProgramFiles(x86)'], 'Microsoft Visual Studio', 'Installer', 'vswhere.exe')
const installation = run(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath']).trim()
if (!installation) throw new Error('The Windows installer theme requires Visual Studio C++ Build Tools (x86/x64 and Windows SDK).')
const vcvars = path.join(installation, 'VC', 'Auxiliary', 'Build', 'vcvars32.bat')
const environment = run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${vcvars}" >nul && set"`], { windowsVerbatimArguments: true })
const env = { ...process.env }
for (const line of environment.split(/\r?\n/)) {
  const index = line.indexOf('=')
  if (index > 0) {
    const key = line.slice(0, index)
    const previous = Object.keys(env).find((existing) => existing.toLowerCase() === key.toLowerCase())
    if (previous) delete env[previous]
    env[key] = line.slice(index + 1)
  }
}
const flags = ['/nologo', '/std:c++17', '/MT', '/O2', '/W4', '/WX', '/DUNICODE', '/D_UNICODE', '/D_WIN32_WINNT=0x0A00']
const libraries = ['user32.lib', 'gdi32.lib', 'comctl32.lib', 'uxtheme.lib', 'dwmapi.lib', 'advapi32.lib', 'shell32.lib']
run('rc.exe', ['/nologo', '/fo', path.join(outputDir, 'theme.res'), 'theme.rc'], { env })
run('cl.exe', [...flags, '/LD', 'theme.cpp', `/Fo${path.join(outputDir, 'theme.obj')}`,
  path.join(outputDir, 'theme.res'), '/link', '/DEF:VereinOTheme.def',
  `/OUT:${path.join(sourceDir, 'VereinOTheme.dll')}`, `/IMPLIB:${path.join(outputDir, 'VereinOTheme.lib')}`,
  '/DYNAMICBASE', '/NXCOMPAT', ...libraries], { env })
if (process.argv.includes('--test')) {
  run('cl.exe', [...flags, 'theme.test.cpp', `/Fo${path.join(outputDir, 'theme.test.obj')}`,
    path.join(outputDir, 'theme.res'), `/Fe${path.join(outputDir, 'theme.test.exe')}`,
    '/link', ...libraries], { env })
  process.stdout.write(run(path.join(outputDir, 'theme.test.exe'), [], { env }))
}
console.log('Built VereinOTheme.dll (x86 Unicode NSIS plugin).')
