import type { RendererApi } from './types/api'

declare global {
    interface Window {
        api: RendererApi
    }
}

export {}
