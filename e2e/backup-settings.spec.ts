import { expect, test, type Page } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/modalHeader.css'].map(file => fs.readFile(file, 'utf8')))).join('\n')
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import { StoragePane } from './src/renderer/views/Settings/panes/StoragePane'
    import { ToastProvider } from './src/renderer/context/ToastContext'
    import { useToast } from './src/renderer/context/useToast'
    let listener = () => {}
    window.shellCalls = []
    window.notifications = []
    window.openedRecovery = 0
    window.listCalls = 0
    window.progress = update => listener(update)
    window.api = {
      settings: { get: async () => ({ value: null }) },
      db: {
        location: {
          get: async () => ({ root:'C:/VereinO', dbPath:'C:/VereinO/database.sqlite', filesDir:'C:/VereinO/files', configuredRoot:'C:/VereinO', organization:{id:'org-a',name:'Verein A'} }),
          pick: async () => {
            if (location.search.includes('occupied')) throw new Error('Bitte einen leeren Zielordner wählen. Vorhandene Daten werden nicht überschrieben.')
            return {root:'D:/Verein A', sourceRoot:'C:/VereinO',organization:{id:'org-a',name:'Verein A'}}
          },
          migrateTo: async payload => { window.movePayload = payload; throw new Error('Test: Zielordner nicht erreichbar.') },
        }

      },
      shell: {
        openPath: async value => { window.shellCalls.push({action:'open',value}); return {ok:true} },
        showItemInFolder: async value => { window.shellCalls.push({action:'reveal',value}); return {ok:true} }
      },
      backup: {
        getDir: async () => ({ok:true, dir:'H:/Backups'}),
        getProgress: async () => null,
        onProgress: callback => { listener = callback; return () => { listener = () => {} } },
        list: async () => { window.listCalls++; return location.search.includes('offline') ? {ok:false,error:'Das Netzlaufwerk ist nicht erreichbar.'} : {ok:true,backups:[]} },
        openRecoveryFolder: async () => { window.openedRecovery++; return {ok:true} },
        make: async () => {
          window.progress({active:true,stage:'transfer',message:'Sicherung wird zum Zielordner übertragen …',completedBytes:40,totalBytes:100})
          return new Promise(resolve => { window.finishBackup = () => {
            const error='Zeitüberschreitung. Die vollständige lokale Sicherung bleibt erhalten.'
            window.progress({active:false,stage:'error',message:error,localFilePath:'C:/Local/VereinO/backup-recovery/backup-123/database_test.sqlite',logFilePath:'C:/Local/VereinO/backup-recovery/backup-123/backup.log'})
            resolve({ok:false,error})
          } })
        }
      }
    }
    function Fixture() {
      const {notify} = useToast()
      const report = React.useCallback((type,text,ms,action) => { window.notifications.push({type,text}); notify(type,text,ms,action) }, [notify])
      return <div id="settings-surface" style={{transform:'translateZ(0)'}}><StoragePane notify={report} /></div>
    }
    createRoot(document.getElementById('root')).render(<ToastProvider><Fixture /></ToastProvider>)
  ` }, bundle: true, platform: 'browser', write: false, loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } })
  script = result.outputFiles[0].text
})

async function openSettings(page: Page, offline = false) {
  await page.route('http://backup-settings.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="dark"><body><main id="root" style="padding:16px;box-sizing:border-box"></main></body></html>' }))
  await page.goto(`http://backup-settings.test/${offline ? '?offline' : ''}`)
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
}

test('reports errors as actionable toasts while retaining inline live progress', async ({ page }, info) => {
  await page.setViewportSize({ width: 1050, height: 1000 })
  await openSettings(page, true)
  await expect(page.getByRole('alert')).toContainText('Das Netzlaufwerk ist nicht erreichbar.')
  await expect(page.locator('.storage-pane')).not.toContainText('Das Netzlaufwerk ist nicht erreichbar.')
  expect(await page.evaluate(() => (window as any).listCalls)).toBe(1)
  await page.getByRole('button', { name: 'Jetzt sichern', exact: true }).click()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '40')
  await expect(page.getByRole('button', { name: 'Jetzt sichern', exact: true })).toBeDisabled()
  await page.evaluate(() => (window as any).finishBackup())
  await expect(page.getByRole('button', { name: 'Jetzt sichern', exact: true })).toBeEnabled()
  const failure = page.getByRole('alert').filter({hasText:'Zeitüberschreitung'})
  await expect(failure).toContainText('lokale Sicherung bleibt erhalten')
  await expect(page.locator('.storage-pane')).not.toContainText('Zeitüberschreitung')
  await expect(page.locator('.backup-progress-status')).toHaveCount(0)
  await failure.getByRole('button', {name:'Lokale Kopien & Protokolle'}).click()
  expect(await page.evaluate(() => (window as any).openedRecovery)).toBe(1)
  await page.screenshot({ path: info.outputPath('backup-error-toast.png'), animations: 'disabled' })
})

test('paths expose Explorer actions on hover and keyboard focus and reveal the database safely', async ({page}, info) => {
  await page.setViewportSize({width:1050,height:900})
  await openSettings(page)
  const root = page.getByRole('button',{name:'Arbeitsordner im Explorer öffnen'})
  await expect(root.locator('.storage-location-path__open')).toHaveCSS('opacity','0')
  await root.hover()
  await expect(root.locator('.storage-location-path__open')).toHaveCSS('opacity','1')
  await root.click()
  const database = page.getByRole('button',{name:'Datenbank im Explorer anzeigen'})
  await page.keyboard.press('Tab')
  await expect(database).toBeFocused()
  await expect(database.locator('.storage-location-path__open')).toHaveCSS('opacity','1')
  await page.keyboard.press('Enter')
  await page.getByRole('button',{name:'Belege und Anhänge im Explorer öffnen'}).click()
  expect(await page.evaluate(() => (window as any).shellCalls)).toEqual([
    {action:'open',value:'C:/VereinO'},
    {action:'reveal',value:'C:/VereinO/database.sqlite'},
    {action:'open',value:'C:/VereinO/files'}
  ])
  await page.screenshot({path:info.outputPath('storage-paths.png'), animations:'disabled'})
})

test('organization location dialog stays centered over transformed and scrolled settings with an edge-to-edge header', async ({page}, info) => {
  await openSettings(page)
  await page.locator('#settings-surface').evaluate(el => { el.style.marginTop='250px' })
  for (const viewport of [{width:1182,height:740},{width:900,height:1000},{width:520,height:700}]) {
    await page.setViewportSize(viewport)
    await page.getByRole('button',{name:'Ordner wählen…'}).click()
    const modal = page.getByRole('dialog',{name:'Speicherort ändern'})
    await expect(modal).toBeVisible()
    await modal.evaluate(el => el.getAnimations().forEach(animation => animation.finish()))
    const geometry = await modal.evaluate(el => {
      const rect=el.getBoundingClientRect(),header=el.querySelector('.modal-header-bar')!.getBoundingClientRect()
      return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,headerLeft:header.left-rect.left,headerRight:rect.right-header.right,headerTop:header.top-rect.top,portalled:el.parentElement?.parentElement===document.body}
    })
    expect(geometry.portalled).toBe(true)
    expect(Math.abs(geometry.y+geometry.height/2-viewport.height/2)).toBeLessThan(2)
    expect(geometry.headerLeft).toBeLessThanOrEqual(1)
    expect(geometry.headerRight).toBeLessThanOrEqual(1)
    expect(geometry.headerTop).toBeLessThanOrEqual(1)
    expect(await modal.locator('.storage-compare-body').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await expect(modal.getByRole('button',{name:'Kopieren und verwenden'})).toBeInViewport()
    await page.screenshot({path:info.outputPath(`comparison-${viewport.width}.png`), animations:'disabled'})
    await page.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)
    await expect(page.getByRole('button',{name:'Ordner wählen…'})).toBeFocused()
  }
})


test('folder changes show the organization and keep errors in a toast', async ({ page }) => {
  await openSettings(page)
  await expect(page.getByRole('button', {name:'Standard vergleichen…'})).toHaveCount(0)
  await page.getByRole('button', {name:'Ordner wählen…'}).click()
  const dialog = page.getByRole('dialog', {name:'Speicherort ändern'})
  await expect(dialog).toContainText('Verein A')
  await expect(dialog).toContainText('C:/VereinO')
  await expect(dialog).toContainText('D:/Verein A')
  await page.getByRole('button', {name:'Kopieren und verwenden'}).click()
  expect(await page.evaluate(() => (window as any).movePayload)).toEqual({root:'D:/Verein A',organizationId:'org-a'})
  await expect(page.getByRole('alert')).toContainText('Zielordner nicht erreichbar')
  await expect(dialog).not.toContainText('Zielordner nicht erreichbar')
  await expect(dialog.getByRole('button', {name:'Kopieren und verwenden'})).toBeEnabled()
})
