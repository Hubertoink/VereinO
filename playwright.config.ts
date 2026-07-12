import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    timeout: 60_000,
    retries: 0,
    // The suites launch real Electron processes with application-wide singleton
    // state. Running them concurrently can let one suite close another's window.
    workers: 1,
    use: {
        baseURL: 'http://localhost:5173'
    },
    projects: [
        { name: 'Chromium', use: { ...devices['Desktop Chrome'] } }
    ]
})
