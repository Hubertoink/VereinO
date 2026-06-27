import { requireAllowedExternalUrl } from '../../electron/main/services/externalUrl'

describe('requireAllowedExternalUrl', () => {
    it.each([
        ['https://vereino.example/hilfe', 'https://vereino.example/hilfe'],
        ['http://localhost:3000/docs', 'http://localhost:3000/docs'],
        ['mailto:vorstand@example.org', 'mailto:vorstand@example.org']
    ])('allows supported external URLs', (input, expected) => {
        expect(requireAllowedExternalUrl(input)).toBe(expected)
    })

    it.each([
        'file:///C:/Windows/System32/calc.exe',
        'javascript:alert(1)',
        'data:text/html,<h1>Test</h1>',
        'custom-protocol://open'
    ])('rejects the external protocol in %s', (url) => {
        expect(() => requireAllowedExternalUrl(url)).toThrow('ist nicht erlaubt')
    })

    it('rejects malformed and missing URLs', () => {
        expect(() => requireAllowedExternalUrl('keine URL')).toThrow('ungültig')
        expect(() => requireAllowedExternalUrl(undefined)).toThrow('fehlt oder ist ungültig')
    })

    it('rejects embedded credentials', () => {
        expect(() => requireAllowedExternalUrl('https://user:secret@example.org'))
            .toThrow('eingebetteten Zugangsdaten')
    })
})
