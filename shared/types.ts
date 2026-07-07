/**
 * Organization profile for multi-org support
 * Each organization has its own database folder
 */
export interface TaxExemptionCertificate {
  fileName: string
  uploadDate: string
  validFrom?: string
  validUntil?: string
  fileData: string // base64-encoded
  mimeType: string // application/pdf, image/jpeg, image/png
  fileSize: number // in bytes
}
