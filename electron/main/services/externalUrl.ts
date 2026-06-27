const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:'])

export function requireAllowedExternalUrl(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('Die externe URL fehlt oder ist ungültig.')
    }

    let url: URL
    try {
        url = new URL(value.trim())
    } catch {
        throw new Error('Die externe URL ist ungültig.')
    }

    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol)) {
        throw new Error(`Das URL-Protokoll „${url.protocol}“ ist nicht erlaubt.`)
    }
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.hostname) {
        throw new Error('Die externe URL enthält keinen gültigen Hostnamen.')
    }
    if (url.username || url.password) {
        throw new Error('Externe URLs mit eingebetteten Zugangsdaten sind nicht erlaubt.')
    }

    return url.toString()
}
