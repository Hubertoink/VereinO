import type { FileDataPayload } from '../../../shared/filePayload'

// Compatibility for older renderer sessions and persisted settings. Tesseract is the local OCR engine.
export async function getDoclingStatus(_force = false) {
  return { installed: false, enabled: false, configured: false, version: null, runtime: null, error: null }
}

export async function setDoclingEnabled(enabled: boolean) {
  if (enabled) throw new Error('Docling wird nicht mehr unterstützt. Die integrierte Texterkennung verwendet Tesseract.')
  return getDoclingStatus()
}

export async function extractWithDocling(
  _input: { fileName: string; mimeType?: string | null } & FileDataPayload
): Promise<{ ok: boolean; markdown: string; text: string; document: unknown; version: string | null }> {
  throw new Error('Docling wird nicht mehr unterstützt. Bitte die integrierte Texterkennung verwenden.')
}
