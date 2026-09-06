import { expect, test } from '@playwright/test'
import { build } from 'esbuild'

let script: string

test.beforeAll(async () => {
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React, { useState } from 'react'
      import { createRoot } from 'react-dom/client'
      import PartySelector from './src/renderer/components/common/PartySelector'
      const parties = [{ id: 1, name: 'Bestandskunde', role: 'CUSTOMER', isActive: 1 }]
      window.api = { parties: {
        list: async () => ({ rows: parties }),
        upsert: async (input) => { const party = { ...input, id: parties.length + 1 }; parties.push(party); return party },
        get: async ({ id }) => parties.find(party => party.id === id)
      }}
      function Harness() {
        const [party, setParty] = useState({ partyId: null, name: '' })
        const [saves, setSaves] = useState(0)
        return <form onSubmit={event => { event.preventDefault(); setSaves(saves + 1) }}>
          <PartySelector valueId={party.partyId} valueName={party.name} role="CUSTOMER" ariaLabel="Kunde" onChange={setParty} />
          <output id="selection">{party.partyId}:{party.name}</output><output id="saves">{saves}</output>
          <button type="submit">Buchung speichern</button>
        </form>
      }
      createRoot(document.getElementById('root')).render(<Harness />)
    ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' }
  })
  script = result.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.setContent('<style>.party-selector__menu { position:fixed;background:white;z-index:2 } .party-editor-overlay { position:fixed;inset:0;background:white;z-index:3;overflow:auto } label { display:block } </style><div id="root"></div>')
  await page.addScriptTag({ content: script })
})

test('Enter creates a customer and saves only that customer, never the booking', async ({ page }) => {
  const input = page.getByRole('combobox', { name: 'Kunde' })
  await input.fill('Neuer Kunde')
  await input.press('Enter')
  const editor = page.getByRole('dialog', { name: 'Geschäftspartner anlegen' })
  await expect(editor).toBeVisible()
  await expect(editor.getByRole('combobox', { name: 'Rolle', exact: true })).toHaveValue('BOTH')
  await expect(editor.getByLabel('Name *', { exact: true })).toHaveValue('Neuer Kunde')
  await expect(page.locator('#saves')).toHaveText('0')
  await editor.getByLabel('Name *', { exact: true }).press('Enter')
  await expect(editor).toHaveCount(0)
  await expect(page.locator('#selection')).toHaveText('2:Neuer Kunde')
  await expect(page.locator('#saves')).toHaveText('0')
  await expect(input).toBeFocused()
  await page.getByRole('button', { name: 'Buchung speichern', exact: true }).click()
  await expect(page.locator('#saves')).toHaveText('1')
})

test('Enter selects existing customers and supports highlighted matches', async ({ page }) => {
  const input = page.getByRole('combobox', { name: 'Kunde' })
  await input.fill('Bestandskunde')
  await input.press('Enter')
  await expect(page.locator('#selection')).toHaveText('1:Bestandskunde')
  await input.fill('Bestand')
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(page.locator('#selection')).toHaveText('1:Bestandskunde')
  await expect(page.locator('#saves')).toHaveText('0')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('empty Enter and IME composition do not submit; Escape only dismisses the picker', async ({ page }) => {
  const input = page.getByRole('combobox', { name: 'Kunde' })
  await input.press('Enter')
  await input.fill('Entwurf')
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('#saves')).toHaveText('0')
  await input.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(input).toHaveValue('Entwurf')
})
