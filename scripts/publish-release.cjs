const fs = require('node:fs')
const path = require('node:path')
const cp = require('node:child_process')

const rootDir = path.resolve(__dirname, '..')
const releaseDir = path.join(rootDir, 'release')
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
const version = pkg.version
const tag = `v${version}`
const isPrerelease = version.includes('-')

const assetNames = [
  'latest.yml',
  `VereinO-Setup-${version}-x64.exe`,
  `VereinO-Setup-${version}-x64.exe.blockmap`
]

function run(command, args) {
  const result = cp.spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`[release:publish] Fehlendes Release-Artefakt: ${path.relative(rootDir, filePath)}`)
    console.error('[release:publish] Bitte zuerst `npm run release:artifacts` ausführen.')
    process.exit(1)
  }
}

const assetPaths = assetNames.map((name) => path.join(releaseDir, name))
assetPaths.forEach(ensureFileExists)

const releaseView = cp.spawnSync('gh', ['release', 'view', tag], {
  cwd: rootDir,
  stdio: 'ignore',
  shell: false
})

if (releaseView.status !== 0) {
  const createArgs = ['release', 'create', tag, '--title', tag, '--generate-notes']

  if (isPrerelease) {
    createArgs.push('--prerelease')
  }

  run('gh', createArgs)
}

run('gh', ['release', 'upload', tag, ...assetPaths, '--clobber'])

console.log(`[release:publish] Release ${tag} wurde mit latest.yml und Installer-Dateien aktualisiert.`)
