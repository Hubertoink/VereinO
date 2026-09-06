import { widgetBounds } from '../../shared/receiptWidget'

describe('receipt widget docking', () => {
  const area = { x: -1920, y: 100, width: 1920, height: 1040 }
  it('keeps the right edge and the droplet center fixed when unfolding on a secondary display', () => {
    const position = { edge: 'right' as const, y: 700 }
    const collapsed = widgetBounds(area, position, false)
    const expanded = widgetBounds(area, position, true)
    expect(collapsed.x + collapsed.width).toBe(0)
    expect(expanded.x + expanded.width).toBe(0)
    expect(collapsed.y + collapsed.height / 2).toBe(expanded.y + expanded.height / 2)
  })
  it('clamps stale positions into the available work area at both edges', () => {
    expect(widgetBounds(area, { edge: 'left', y: -10000 }, false)).toEqual({
      x: -1920,
      y: 100,
      width: 44,
      height: 72
    })
    const expanded = widgetBounds(area, { edge: 'right', y: 10000 }, true)
    expect(expanded.y + expanded.height).toBe(area.y + area.height)
    expect(widgetBounds(area, { edge: 'left', y: NaN }, false).y).toBeGreaterThan(area.y)
  })
})

jest.mock('electron', () => ({
  app: { isPackaged: true, getLoginItemSettings: jest.fn(), setLoginItemSettings: jest.fn() }
}))
import { app } from 'electron'
import { getWidgetAutostart, setWidgetAutostart } from '../../electron/main/services/receiptWidget'

describe('receipt widget autostart', () => {
  const platform = process.platform
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    jest.clearAllMocks()
  })
  afterEach(() => Object.defineProperty(process, 'platform', { value: platform }))
  it('registers only the widget startup and reads the exact same executable and arguments', () => {
    const get = app.getLoginItemSettings as jest.Mock
    get
      .mockReturnValueOnce({ openAtLogin: false, executableWillLaunchAtLogin: false })
      .mockReturnValueOnce({ openAtLogin: true, executableWillLaunchAtLogin: true })
    expect(setWidgetAutostart(true)).toEqual({ enabled: true, available: true })
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      path: process.execPath,
      args: ['--receipt-widget']
    })
    expect(get).toHaveBeenLastCalledWith({ path: process.execPath, args: ['--receipt-widget'] })
  })
  it('removes the registration and respects an entry disabled in Windows', () => {
    const get = app.getLoginItemSettings as jest.Mock
    get.mockReturnValue({ openAtLogin: false, executableWillLaunchAtLogin: false })
    expect(setWidgetAutostart(false).enabled).toBe(false)
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: false,
      path: process.execPath,
      args: ['--receipt-widget']
    })
    get.mockReturnValue({ openAtLogin: true, executableWillLaunchAtLogin: false })
    expect(getWidgetAutostart().enabled).toBe(false)
    expect(() => setWidgetAutostart(true)).toThrow('nicht übernommen')
  })
})
