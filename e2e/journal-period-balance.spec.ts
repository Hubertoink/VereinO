import { expect, test } from '@playwright/test'
import { build } from 'esbuild'

test('classic journal separates the period saldo from the dated account balance', async ({ page }) => {
    const { outputFiles } = await build({
        stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
            import React from 'react'
            import { createRoot } from 'react-dom/client'
            import FilterTotals from './src/renderer/views/Journal/components/FilterTotals'
            const accounts = [
                { id: 1, kind: 'BANK', name: 'Bank', openingDate: '2026-01-01', openingCents: 100000 },
                { id: 2, kind: 'CASH', name: 'Kasse' }
            ]
            window.api = { reports: {
                summary: async ({ paymentAccountId }) => ({ byType: [
                    { key: 'IN', gross: paymentAccountId ? 1250 : 1368.58 },
                    { key: 'OUT', gross: paymentAccountId ? 973.87 : 2492.45 }
                ], byPaymentAccount: paymentAccountId ? [{ accountId: 1, key: 'Bank', bookingNet: 276.13 }] : [
                    { accountId: 1, key: 'Bank', bookingNet: 276.13 }, { accountId: 2, key: 'Kasse', bookingNet: -1400 }
                ] }),
                cashBalance: async ({ from, to, includeOpenings }) => {
                    const include = includeOpenings !== false && (!from || from <= '2026-01-01') && to >= '2026-01-01'
                    const bank = include ? 1276.13 : 276.13
                    return { BANK: bank, BAR: -1400, accounts: accounts.map(a => ({ ...a, balance: a.id === 1 ? bank : -1400 })) }
                }
            } }
            const root = createRoot(document.getElementById('root'))
            window.filterJournal = props => root.render(<FilterTotals paymentAccounts={accounts} {...props} />)
            window.filterJournal({})
        ` },
        bundle: true, write: false, jsx: 'automatic'
    })
    await page.setContent('<div id="root"></div>')
    await page.addScriptTag({ content: outputFiles[0].text })
    const saldo = page.locator('.filter-totals-stat--diff')
    const balance = page.locator('.filter-totals-stat--balance')
    await expect(saldo).toHaveText(/Saldo-1.123,87/)
    await expect(balance).toHaveText(/Gesamtbestand-123,87/)
    await saldo.focus()
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip.getByRole('region', { name: 'Konten' })).toContainText(/Bank276,13/)
    await expect(tooltip).not.toContainText('Anfangsbestand')

    await page.evaluate(() => (window as any).filterJournal({ paymentAccountId: 1, from: '2026-11-01', to: '2026-11-30' }))
    await expect(saldo).toHaveText(/Saldo276,13/)
    await expect(balance).toHaveText(/Kontostand1.276,13/)
    await balance.focus()
    await expect(tooltip).toContainText(/Anfangsbestand bis zum Stichtag1.000,00/)
    await expect(tooltip.getByRole('region', { name: 'Konten' })).toContainText(/Bank1.276,13/)
    await expect(tooltip).not.toContainText('Kasse')

    await page.evaluate(() => (window as any).filterJournal({ paymentAccountId: 1, q: 'Spende' }))
    await expect(saldo).toHaveText(/Saldo276,13/)
    await expect(balance).toHaveCount(0)
})
