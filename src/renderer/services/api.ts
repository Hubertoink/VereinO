import type { RendererApi } from '../../types/api'

export type { RendererApi } from '../../types/api'

export function getApi(): RendererApi {
    if (!window.api) {
        throw new Error('VereinO API bridge is not available.')
    }

    return window.api
}

export function maybeApi(): RendererApi | undefined {
    return window.api
}
