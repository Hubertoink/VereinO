// Apply the saved text size before the first paint, including detached windows.
;(() => {
  let density = 'compact'
  try {
    if (localStorage.getItem('ui.displayDensity') === 'standard') density = 'standard'
  } catch {
    // Use the default when storage is unavailable.
  }
  document.documentElement.dataset.uiDensity = density
})()
