import { test, expect } from '@playwright/test'

// Pure smoke test independent of running dev server.
// Loads about:blank, injects simple HTML, asserts content.
test('smoke: playwright environment works', async ({ page }) => {
  await page.goto('about:blank')
  await page.setContent('<html><body><h1 id="ok">OK</h1></body></html>')
  await expect(page.locator('#ok')).toHaveText('OK')
})
