import React, { Suspense, lazy } from 'react'
import { initializeBookingAIPatterns } from './renderer/utils/bookingAiPatterns'

// Lazy-load the heavy renderer App to keep the root lightweight
const RendererApp = lazy(async () => {
	const [renderer] = await Promise.all([
		import('./renderer/App'),
		initializeBookingAIPatterns(),
	])
	return renderer
})

export default function App() {
	return (
		<Suspense fallback={
			<div className="suspense-fallback">
				<div className="suspense-box" role="status" aria-live="polite" aria-label="Lädt">
					<div className="spinner" aria-hidden="true" />
					<div className="suspense-text">Lädt…</div>
				</div>
			</div>
		}>
			<RendererApp />
		</Suspense>
	)
}
