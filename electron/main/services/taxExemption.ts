import { getDb } from '../db/database'
import { getSetting, setSetting } from './settings'
import type { TaxExemptionCertificate } from '../../../shared/types'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_FILE_SIZE_MB = Math.round(MAX_FILE_SIZE / 1024 / 1024)
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'])

function validateTaxExemptionCertificate(certificate: TaxExemptionCertificate) {
  if (!certificate.fileName || !certificate.fileData || !certificate.mimeType) {
    throw new Error('Unvollständige Daten')
  }
  if (certificate.fileSize > MAX_FILE_SIZE) {
    throw new Error(`Datei zu groß. Maximum: ${MAX_FILE_SIZE_MB} MB`)
  }
  if (!ALLOWED_MIME_TYPES.has(certificate.mimeType.toLowerCase())) {
    throw new Error('Nur PDF, JPG und PNG Dateien sind erlaubt')
  }
}

/**
 * Get tax exemption certificate from settings
 */
export function getTaxExemptionCertificate(): TaxExemptionCertificate | null {
  try {
    const value = getSetting('org.taxExemption')
    if (!value) return null
    return value as TaxExemptionCertificate
  } catch (e) {
    console.error('Error getting tax exemption certificate:', e)
    return null
  }
}

/**
 * Save tax exemption certificate to settings
 * @throws Error if file size exceeds limit or invalid data
 */
export function saveTaxExemptionCertificate(certificate: TaxExemptionCertificate): void {
  validateTaxExemptionCertificate(certificate)
  setSetting('org.taxExemption', certificate)
}

/**
 * Delete tax exemption certificate from settings
 */
export function deleteTaxExemptionCertificate(): void {
  const db = getDb()
  db.prepare('DELETE FROM settings WHERE key = ?').run('org.taxExemption')
}

/**
 * Update validity dates of existing certificate
 */
export function updateTaxExemptionValidity(validFrom?: string, validUntil?: string): void {
  const existing = getTaxExemptionCertificate()
  if (!existing) {
    throw new Error('Kein Bescheid vorhanden')
  }

  const updated: TaxExemptionCertificate = {
    ...existing,
    validFrom,
    validUntil
  }

  setSetting('org.taxExemption', updated)
}
