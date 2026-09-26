// Escape closes the native top-layer picker before any enclosing dialog.
// Leave the default browser action intact so focus and selection are preserved.
export function installSelectKeyboardGuard() {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && document.querySelector('select:open')) {
      event.stopImmediatePropagation()
    }
  }
  window.addEventListener('keydown', onKeyDown, true)
  return () => window.removeEventListener('keydown', onKeyDown, true)
}
