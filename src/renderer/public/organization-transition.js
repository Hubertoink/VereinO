// Runs before the React entry point so a reload cannot expose the rebuilding UI.
;(() => {
  const key = 'vereino.organization-transition'
  let overlay
  let previousFocus
  let switching = false
  let resumed = false
  let timeout
  const ready = new Set()
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const clearMarker = () => { try { sessionStorage.removeItem(key) } catch { /* unavailable storage */ } }
  function remove() {
    clearTimeout(timeout)
    clearMarker()
    document.getElementById('root')?.removeAttribute('inert')
    if (!overlay) return
    const exiting = overlay
    overlay = undefined
    exiting.classList.add('org-transition-leaving')
    window.setTimeout(() => exiting.remove(), reduced() ? 0 : 220)
    previousFocus?.focus?.()
    switching = false
  }
  function show(state, restore) {
    previousFocus = document.activeElement
    overlay = document.createElement('div')
    overlay.className = 'org-transition' + (restore ? ' org-transition-restored' : '')
    overlay.setAttribute('role', 'status')
    overlay.setAttribute('aria-live', 'polite')
    overlay.tabIndex = -1
    overlay.style.backgroundColor = state.background
    overlay.style.color = state.color
    const content = document.createElement('div')
    content.className = 'org-transition-content'
    const indicator = document.createElement('div')
    indicator.className = 'org-transition-indicator'
    indicator.setAttribute('aria-hidden', 'true')
    const title = document.createElement('div')
    title.className = 'org-transition-title'
    title.textContent = state.name
    const description = document.createElement('div')
    description.className = 'org-transition-description'
    description.textContent = 'Organisation wird geöffnet…'
    content.append(indicator, title, description)
    overlay.append(content)
    document.body.append(overlay)
    document.getElementById('root')?.setAttribute('inert', '')
    overlay.focus()
  }
  window.organizationTransition = {
    async start(name) {
      if (switching) throw new Error('Ein Organisationswechsel läuft bereits.')
      switching = true
      const styles = getComputedStyle(document.documentElement)
      const state = { name, started: Date.now(),
        background: styles.getPropertyValue('--surface').trim() || '#ffffff',
        color: styles.getPropertyValue('--text').trim() || '#202020' }
      try { sessionStorage.setItem(key, JSON.stringify(state)) } catch { /* still cover the current page */ }
      show(state, false)
      // Let the opaque fade finish before switching the database and theme.
      await new Promise(resolve => window.setTimeout(resolve, reduced() ? 0 : 180))
    },
    cancel: remove,
    ready(part) {
      if (!resumed || !overlay) return
      ready.add(part)
      if (!['appearance', 'bootstrap', 'profile', 'navigation'].every(value => ready.has(value))) return
      resumed = false
      // Allow React commits and lazy views to settle before revealing the page.
      let quiet
      const observer = new MutationObserver(schedule)
      const root = document.getElementById('root')
      const finish = () => {
        observer.disconnect()
        clearTimeout(quiet)
        clearTimeout(limit)
        requestAnimationFrame(() => requestAnimationFrame(remove))
      }
      function schedule() { clearTimeout(quiet); quiet = window.setTimeout(finish, 300) }
      const limit = window.setTimeout(finish, 2000)
      if (root) observer.observe(root, { childList: true, subtree: true, attributes: true })
      schedule()
    }
  }
  try {
    const state = JSON.parse(sessionStorage.getItem(key) || 'null')
    if (state && typeof state.name === 'string' && Date.now() - state.started < 30000) {
      switching = true
      resumed = true
      show(state, true)
      // A failed startup must never leave the application permanently covered.
      timeout = window.setTimeout(remove, 10000)
    } else clearMarker()
  } catch { clearMarker() }
})()
