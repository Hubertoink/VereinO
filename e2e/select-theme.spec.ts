import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

for (const theme of ['light', 'dark']) {
  test(`select picker follows ${theme} theme and retains keyboard selection`, async ({ page }, info) => {
    await page.setContent(`<html data-theme="${theme}"><body><div class="modal" style="margin:80px; width:320px"><label>Sphäre<select class="input" style="width:100%"><option value="">Alle</option><option value="IDEELL">Ideell</option><option disabled>Gesperrt</option><option value="ZWECK">Zweckbetrieb</option></select></label><button>Übernehmen</button></div></body></html>`)
    await page.addStyleTag({ content: await readFile('src/renderer/styles.css', 'utf8') })
    const select = page.getByRole('combobox')
    await expect(select).toHaveCSS('appearance', 'base-select')
    await select.click()
    await expect(select).toHaveJSProperty('value', '')
    await expect(page.getByRole('option', { name: 'Alle', exact: true })).toBeVisible()
    const colors = await select.evaluate(el => ({ picker: getComputedStyle(el, '::picker(select)').backgroundColor, field: (() => { const probe = document.createElement('div'); probe.style.backgroundColor = 'var(--surface)'; el.parentElement!.append(probe); const color = getComputedStyle(probe).backgroundColor; probe.remove(); return color })() }))
    expect(colors.picker).toBe(colors.field)
    await page.screenshot({ path: info.outputPath(`select-${theme}.png`) })
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(select).toHaveValue('IDEELL')
    await select.click()
    await page.keyboard.press('Escape')
    await expect(select).toBeFocused()
    await expect(select).toHaveValue('IDEELL')
    await select.click()
    await page.getByRole('option', { name: 'Zweckbetrieb', exact: true }).click()
    await expect(select).toHaveValue('ZWECK')
  })
}
