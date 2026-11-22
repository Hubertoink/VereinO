import { expect, type Page } from '@playwright/test'

// Booking workflows start in an existing organization. First-run behavior has its own suite.
export async function initializeExistingOrganization(page: Page) {
  const dashboard = page.locator('[data-shortcut-nav="Dashboard"]')
  await expect(dashboard).toBeVisible({ timeout: 30_000 })
  await page.evaluate(async () => {
    await window.api.settings.set({ key: 'backup.auto', value: 'OFF' })
    await window.api.settings.set({ key: 'setup.completed', value: true })
  })
  await page.reload()
  await expect(dashboard).toBeVisible({ timeout: 30_000 })
}
