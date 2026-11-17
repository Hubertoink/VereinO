import { defineConfig } from '@playwright/test'
import config from './playwright.config'

// Fast regression coverage without repeatedly launching the whole application.
export default defineConfig({
  ...config,
  testMatch: [
    'booking-defaults.spec.ts',
    'booking-ai-organizations.spec.ts',
    'booking-type-selection.spec.ts',
    'modal-header.spec.ts',
    'party-selector.spec.ts',
    'bookings-plus-filters.spec.ts',
    'journal-edit-tabs.spec.ts',
    'leader-shortcuts.spec.ts',
    'report-chart-width.spec.ts',
    'report-monthly-loading.spec.ts',
    'reports-analytics.spec.ts'
  ],
  use: {
    ...config.use,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }
      : {})
  }
})
