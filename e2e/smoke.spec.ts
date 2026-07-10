import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

let electronApp: ElectronApplication
let page: Page
let userDataDir: string

test.beforeAll(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-e2e-'))
  const mainEntry = path.resolve('dist-electron/main/index.cjs')
  const rendererEntry = pathToFileURL(path.resolve('dist/index.html')).toString()
  const launchEnv = { ...process.env }
  // VS Code/Codex terminals can set this for their own Electron host. Passing it
  // through would make electron.exe behave like plain Node and reject Chromium flags.
  delete launchEnv.ELECTRON_RUN_AS_NODE

  electronApp = await electron.launch({
    args: [mainEntry, `--user-data-dir=${userDataDir}`],
    env: {
      ...launchEnv,
      ELECTRON_RENDERER_URL: rendererEntry,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
    }
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
  }
  if (userDataDir) {
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined)
  }
})

test('starts the real Electron app with its preload bridge', async () => {
  await expect(page).toHaveTitle(/VereinO/i)
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible()

  const bridgeResult = await page.evaluate(async () => ({
    ping: window.api.ping(),
    appInfo: await window.api.app.version(),
    bootstrap: await window.api.app.bootstrap()
  }))

  expect(bridgeResult.ping).toBe('pong')
  expect(bridgeResult.appInfo.name).toBeTruthy()
  expect(bridgeResult.appInfo.version).toMatch(/^\d+\.\d+\.\d+/)
  expect(bridgeResult.bootstrap.counts.pendingSubmissions).toBeGreaterThanOrEqual(0)
  expect(Array.isArray(bridgeResult.bootstrap.paymentAccounts)).toBe(true)
})

test('creates and lists a backup through the real IPC bridge', async () => {
  const result = await page.evaluate(async () => {
    const created = await window.api.backup.make('e2e')
    const listed = await window.api.backup.list()
    return { created, listed }
  })

  expect(result.created.ok, result.created.error || 'Backup creation failed without an error message').toBe(true)
  expect(result.created.filePath).toMatch(/database_.+_e2e\.sqlite$/)
  expect(result.listed.ok).toBe(true)
  expect(result.listed.backups?.some(({ filePath }) => filePath === result.created.filePath)).toBe(true)
})

test('loads split application pages on demand', async () => {
  const laterButton = page.getByRole('button', { name: 'Später', exact: true })
  if (await laterButton.isVisible()) await laterButton.click()

  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(page.locator('.dashboard-card').first()).toBeVisible()

  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Suche', exact: true })).toBeVisible()
})
