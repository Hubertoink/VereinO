import { expect, test, type Page } from '@playwright/test'
import { build } from 'esbuild'

let script: string

test.beforeAll(async () => {
  script = (
    await build({
      stdin: {
        resolveDir: process.cwd(),
        loader: 'tsx',
        contents: `
      import { useState } from 'react'
      import { createRoot } from 'react-dom/client'
      import { flushSync } from 'react-dom'
      import ReportsMonthlyChart from './src/renderer/components/reports/ReportsMonthlyChart'
      import ReportsInOutLines from './src/renderer/components/reports/ReportsInOutLines'
      import { buildReportMonthlyModel } from './src/renderer/components/reports/reportMonthlyData'

      const timers = new Map(), frames = new Map(), observers = []
      let nextId = 100000, reads = 0, detachedReads = 0
      window.setTimeout = callback => { const id = nextId++; timers.set(id, callback); return id }
      window.clearTimeout = id => timers.delete(id)
      window.requestAnimationFrame = callback => { const id = nextId++; frames.set(id, callback); return id }
      window.cancelAnimationFrame = id => frames.delete(id)
      const originalWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
      Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get() {
        if (this.classList.contains('report-chart-scroll')) {
          reads++
          if (!this.isConnected) detachedReads++
        }
        return originalWidth.get.call(this)
      } })
      window.ResizeObserver = class {
        targets = []; connected = true
        constructor(callback) { this.callback = callback; observers.push(this) }
        observe(element) { this.targets.push(element) }
        disconnect() { this.connected = false }
      }
      const measurementObservers = () => observers.filter(observer => observer.targets.length === 1)
      window.chartTest = {
        snapshot: () => ({
          timers: timers.size, frames: frames.size, reads, detachedReads,
          measurementsCreated: measurementObservers().length,
          measurementsActive: measurementObservers().filter(observer => observer.connected).length,
          observersActive: observers.filter(observer => observer.connected).length
        }),
        flushFrames: () => {
          const callbacks = [...frames.values()]; frames.clear()
          flushSync(() => callbacks.forEach(callback => callback(performance.now())))
        },
        flushTimers: () => {
          const callbacks = [...timers.values()]; timers.clear()
          flushSync(() => callbacks.forEach(callback => callback()))
        },
        resize: width => {
          document.getElementById('chart-host').style.width = width + 'px'
          flushSync(() => window.dispatchEvent(new Event('resize')))
        },
        observeResize: width => {
          document.getElementById('chart-host').style.width = width + 'px'
          flushSync(() => observers.filter(observer => observer.connected).forEach(observer => observer.callback()))
        },
        visible: () => document.dispatchEvent(new Event('visibilitychange')),
        deliverDisconnectedMeasurements: () => measurementObservers().filter(observer => !observer.connected).forEach(observer => observer.callback())
      }
      const data = buildReportMonthlyModel({
        income: [{ month: '2026-01', gross: 100 }, { month: '2026-02', gross: 200 }],
        expense: [{ month: '2026-01', gross: -50 }]
      })
      function Harness() {
        const [loading, setLoading] = useState(true)
        const [mounted, setMounted] = useState(true)
        const [activateKey, setActivateKey] = useState(0)
        window.chartTest.loading = value => flushSync(() => setLoading(value))
        window.chartTest.mount = value => flushSync(() => setMounted(value))
        window.chartTest.activate = () => flushSync(() => setActivateKey(value => value + 1))
        return <div id="chart-host" style={{ width: 700 }}>{mounted && <>
          <ReportsMonthlyChart data={data} loading={loading} activateKey={activateKey} />
          <ReportsInOutLines data={data} loading={loading} activateKey={activateKey} />
        </>}</div>
      }
      flushSync(() => createRoot(document.getElementById('root')).render(<Harness />))
    `
      },
      bundle: true,
      write: false,
      platform: 'browser',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"' }
    })
  ).outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.setContent('<div id="root"></div>')
  await page.addScriptTag({ content: script })
})

const snapshot = (page: Page) => page.evaluate(() => (window as any).chartTest.snapshot())
async function expectWidth(page: Page, width: number) {
  await expect(page.getByRole('img', { name: 'Monatsverlauf', exact: true })).toHaveAttribute(
    'width',
    String(width)
  )
  await expect(page.getByRole('img', { name: 'IN vs OUT', exact: true })).toHaveAttribute(
    'width',
    String(width)
  )
}

test('both charts return to their measured starting width after loading and resizing', async ({
  page
}) => {
  await page.evaluate(() => (window as any).chartTest.loading(false))
  await expectWidth(page, 700)
  // Reattach at the measured width: this exposed the former stale-state comparison.
  await page.evaluate(() => {
    const chart = (window as any).chartTest
    chart.loading(true)
    chart.loading(false)
  })
  await page.evaluate(() => (window as any).chartTest.observeResize(920))
  await expectWidth(page, 920)
  await page.evaluate(() => (window as any).chartTest.resize(700))
  await expectWidth(page, 700)

  const before = await snapshot(page)
  await page.evaluate(() => {
    const chart = (window as any).chartTest
    chart.activate()
    chart.flushFrames()
    chart.flushTimers()
  })
  expect((await snapshot(page)).measurementsCreated).toBe(before.measurementsCreated)
  await expectWidth(page, 700)
})

test('loading removes measurement work and remounts attach to the current width', async ({
  page
}) => {
  expect(await snapshot(page)).toMatchObject({ timers: 0, frames: 0, observersActive: 0 })
  await page.evaluate(() => (window as any).chartTest.loading(false))
  await expectWidth(page, 700)
  await page.evaluate(() => {
    const chart = (window as any).chartTest
    chart.flushFrames()
    chart.visible()
    chart.loading(true)
  })
  expect(await snapshot(page)).toMatchObject({ timers: 0, frames: 0, observersActive: 0 })
  await expect(page.getByRole('img')).toHaveCount(0)
  await page.evaluate(() => {
    const chart = (window as any).chartTest
    chart.resize(850)
    chart.loading(false)
  })
  await expectWidth(page, 850)
  await page.evaluate(() => {
    const chart = (window as any).chartTest
    chart.mount(false)
    chart.resize(760)
    chart.mount(true)
  })
  await expectWidth(page, 760)
  expect((await snapshot(page)).measurementsActive).toBe(2)
})

test('unmount cancels activation frames and visibility timers and ignores late observers', async ({
  page
}) => {
  await page.evaluate(() => {
    const chart = (window as any).chartTest
    chart.loading(false)
    chart.flushFrames()
    chart.visible()
    chart.activate()
  })
  const pending = await snapshot(page)
  expect(pending.timers).toBeGreaterThan(0)
  expect(pending.frames).toBe(2)
  await page.evaluate(() => (window as any).chartTest.mount(false))
  const disposed = await snapshot(page)
  expect(disposed).toMatchObject({ timers: 0, frames: 0, observersActive: 0, detachedReads: 0 })
  await page.evaluate(() => {
    const chart = (window as any).chartTest
    chart.visible()
    chart.resize(900)
    chart.deliverDisconnectedMeasurements()
    chart.flushFrames()
    chart.flushTimers()
  })
  expect(await snapshot(page)).toEqual(disposed)
})
