import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/views/AI/AIView.css', 'src/renderer/components/modalHeader.css'].map(path => fs.readFile(path, 'utf8')))).join('\n')
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, { useEffect, useState } from 'react'
    import { createRoot } from 'react-dom/client'
    import { AiSettingsDrawer } from './src/renderer/views/AI/AiSettingsDrawer'
    import { useAiSettings } from './src/renderer/views/AI/useAiSettings'
    import { DEFAULT_AI_SETTINGS } from './src/renderer/views/AI/aiSettings'
    const root = createRoot(document.getElementById('root'))
    let stored = { ...DEFAULT_AI_SETTINGS }
    window.savedSettings = []
    window.api = { ai: { settings: {
      get: async () => ({ ...stored }),
      set: async payload => { window.savedSettings.push(payload); stored = { ...stored, ...payload }; return { ...stored, ok: true } }
    } } }
    const notify = () => {}
    function Settings() {
      const [busy, setBusy] = useState(false)
      const state = useAiSettings(notify, setBusy)
      useEffect(() => { void state.loadSettings() }, [state.loadSettings])
      return <div className="modal-overlay"><AiSettingsDrawer settings={state.settings} apiKey={state.apiKey} modelOptions={state.providerModelOptions}
        providerOptions={[{ value: 'openai', label: 'OpenAI' }]} connectionTest={null} busy={busy}
        onClose={() => {}} onApiKeyChange={state.updateApiKey} onSettingsChange={state.setSettings} onProviderChange={state.handleProviderChange}
        onInvalidateConnection={state.invalidateConnection} onSave={state.saveSettings} onTestConnection={() => {}} /></div>
    }
    let version = 0
    window.renderSettings = () => root.render(<Settings key={++version} />)
    window.renderSettings()
  ` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } })
  script = result.outputFiles[0].text
})

test('AI booking comments default on, persist after save and can be disabled', async ({ page }, info) => {
  await page.setViewportSize({ width: 1180, height: 980 })
  await page.route('http://settings.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="light"><div id="root"></div></html>' }))
  await page.goto('http://settings.test/')
  await page.addStyleTag({ content: css })
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' })
  await page.addScriptTag({ content: script })
  const option = page.getByRole('checkbox', { name: /KI-Kommentare in Buchungsentwürfe übernehmen/ })
  await expect(option).toBeChecked()
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  expect((await page.evaluate(() => (window as any).savedSettings))[0].bookingCommentsEnabled).toBe(true)
  await page.evaluate(() => (window as any).renderSettings())
  await expect(option).toBeChecked()
  await page.screenshot({ path: info.outputPath('ai-comment-opt-in.png') })
  await option.uncheck()
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  await page.evaluate(() => (window as any).renderSettings())
  await expect(option).not.toBeChecked()
})
