import type { FileDataPayload } from '../../../shared/filePayload'

// Compatibility for older renderer sessions and persisted settings. Tesseract is the local OCR engine.
export async function getDoclingStatus(_force = false) {
  return { installed: false, enabled: false, configured: false, version: null, runtime: null, error: null }
}

export async function setDoclingEnabled(enabled: boolean) {
  if (enabled) throw new Error('Docling wird nicht mehr unterstützt. Die integrierte Texterkennung verwendet Tesseract.')
  return getDoclingStatus()
}

export function cleanDoclingMarkdown(markdown: string) {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[ \t]+\|[ \t]+/g, '\t')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function extractWithDocling(
  _input: { fileName: string; mimeType?: string | null } & FileDataPayload
): Promise<{ ok: boolean; markdown: string; text: string; document: unknown; version: string | null }> {
  throw new Error('Docling wird nicht mehr unterstützt. Bitte die integrierte Texterkennung verwenden.')
}
