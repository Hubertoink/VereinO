import React, { useMemo, useRef, useState } from 'react'
import LocalInvoiceScanModal, {
  type LocalInvoiceScanResult
} from '../../src/renderer/components/modals/LocalInvoiceScanModal'
import { EMPTY_LOCAL_INVOICE_FIELDS } from '../../src/renderer/utils/localInvoiceExtraction'
import type { RendererApi } from '../../src/types/api'
import { api, webFetch, ApiError, parseCents, type Fields, type User } from './api'
import BookingEditor from './BookingEditor'
import { useModalBackgroundLock } from './useModalBackgroundLock'
import { dispatchDataChanged } from '../../src/renderer/utils/refresh'
import './webAI.css'
export async function uploadInvoice(file: File, analyze = true) {
  const form = new FormData()
  form.append('file', file)
  const response = await webFetch(analyze ? '/api/ai/invoice' : '/api/ai/documents', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-VereinO-Request': '1' },
    body: form
  })
  const result = await response.json()
  if (!response.ok)
    throw new ApiError(
      response.status,
      result.message || result.error || 'Beleg konnte nicht verarbeitet werden.'
    )
  return result as { documentId: string; fields: Partial<Fields> & { warnings?: string[] } }
}
export default function WebInvoiceCapture({
  user,
  onClose,
  onSessionExpired,
  initialFile,
  initialDocument,
  onCapture
}: {
  onCapture?: (fields: Fields, documentId?: string, warnings?: string[]) => void
  user: User
  onClose: () => void
  onSessionExpired: () => void
  initialFile?: File
  initialDocument?: { documentId: string; fields: Partial<Fields> & { warnings?: string[] } }
}) {
  useModalBackgroundLock()
  const document = useRef<{ id: string; file: File } | null>(
    initialDocument && initialFile ? { id: initialDocument.documentId, file: initialFile } : null
  )
  const selectedFile = useRef<File | undefined>(initialFile)
  const [candidate, setCandidate] = useState<Fields | null>(null)
  const [warnings, setWarnings] = useState<string[]>(initialDocument?.fields.warnings || [])
  const services = useMemo(
    () =>
      ({
        classifications: { primary: { list: () => api('/classifications/primary') } },
        ai: {
          settings: {
            get: async () => {
              const settings = await api<{
                hasApiKey: boolean
                enabled: boolean
                provider: string
              }>('/ai/settings')
              return { ...settings, hasApiKey: settings.hasApiKey && settings.enabled }
            }
          },
          invoice: {
            checkDuplicate: async () => ({ isDuplicate: false }),
            extract: async (input: {
              file: { fileName: string; mimeType: string; dataBytes: Uint8Array }
            }) => {
              const started = performance.now(),
                file =
                  selectedFile.current ||
                  new File([new Uint8Array(input.file.dataBytes)], input.file.fileName, {
                    type: input.file.mimeType
                  })
              try {
                const response = await uploadInvoice(file)
                document.current = { id: response.documentId, file }
                setWarnings(response.fields.warnings || [])
                const fields = response.fields
                return {
                  result: {
                    supplier: fields.counterparty || '',
                    invoiceDate: fields.date || '',
                    description: fields.description || '',
                    grossAmount: fields.grossAmountCents ? fields.grossAmountCents / 100 : null,
                    invoiceNumber: '',
                    dueDate: '',
                    netAmount: null,
                    taxAmount: null,
                    iban: '',
                    partyId: null,
                    type: fields.type || 'OUT',
                    sphere: fields.sphere || 'IDEELL',
                    primaryClassificationValueId: fields.primaryClassificationValueId,
                    paymentMethod: 'BANK',
                    paymentAccountId: null,
                    budgets: [],
                    earmarks: [],
                    tags: [],
                    warnings: fields.warnings || []
                  },
                  timings: {
                    totalMs: performance.now() - started,
                    analysisMs: performance.now() - started,
                    doclingMs: null,
                    ocrMs: null
                  }
                }
              } catch (cause) {
                if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
                throw cause
              }
            }
          }
        },
        docling: { status: async () => ({ enabled: false }) },
        ocr: {
          extract: async () => {
            throw new Error('Bitte „Mit KI auslesen“ verwenden.')
          }
        }
      }) as unknown as RendererApi,
    [onSessionExpired]
  )
  async function review(result: LocalInvoiceScanResult) {
    try {
      if (!document.current || document.current.file !== result.file) {
        const uploaded = await uploadInvoice(result.file, false)
        document.current = { id: uploaded.documentId, file: result.file }
      }
      const fields: Fields = {
        date: result.fields.invoiceDate || '',
        description: [
          result.fields.description,
          result.fields.invoiceNumber && `Rechnung ${result.fields.invoiceNumber}`
        ]
          .filter(Boolean)
          .join(' · '),
        counterparty: result.fields.supplier,
        grossAmountCents: result.fields.grossAmount ? parseCents(result.fields.grossAmount) : 0,
        type: result.bookingMeta.type === 'IN' ? 'IN' : 'OUT',
        sphere: result.bookingMeta.sphere || 'IDEELL',
        paymentMethod: result.bookingMeta.paymentMethod === 'BAR' ? 'CASH' : 'BANK',
        primaryClassificationValueId: result.bookingMeta.primaryClassificationValueId
      }
      if (onCapture) {
        onCapture(fields, document.current?.id, warnings)
        onClose()
      } else setCandidate(fields)
      return true
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      throw cause
    }
  }
  return candidate ? (
    <BookingEditor
      initialFields={candidate}
      aiDocumentId={document.current?.id}
      reviewWarnings={warnings}
      mode={user.role === 'USER' ? 'drafts' : 'bookings'}
      user={user}
      onSessionExpired={onSessionExpired}
      onClose={onClose}
      onSaved={() => {
        dispatchDataChanged(['vouchers'])
        onClose()
      }}
    />
  ) : (
    <LocalInvoiceScanModal
      webMode
      apiOverride={services}
      initialFile={initialFile}
      initialState={
        initialDocument
          ? {
              fields: {
                ...EMPTY_LOCAL_INVOICE_FIELDS,
                supplier: initialDocument.fields.counterparty || '',
                invoiceDate: initialDocument.fields.date || '',
                description: initialDocument.fields.description || '',
                grossAmount: initialDocument.fields.grossAmountCents
                  ? (initialDocument.fields.grossAmountCents / 100).toFixed(2)
                  : ''
              },
              partyId: null,
              budgets: [],
              earmarksAssigned: [],
              tags: [],
              note: '',
              visibleSections: [],
              bookingMeta: {
                type: initialDocument.fields.type || 'OUT',
                sphere: initialDocument.fields.sphere || 'IDEELL',
                paymentMethod: initialDocument.fields.paymentMethod === 'CASH' ? 'BAR' : 'BANK',
                primaryClassificationValueId: initialDocument.fields.primaryClassificationValueId,
                paymentAccountId: null
              }
            }
          : undefined
      }
      onClose={onClose}
      onFileChange={(file) => {
        selectedFile.current = file || undefined
        if (file !== document.current?.file) {
          document.current = null
          setWarnings([])
        }
      }}
      budgetsForEdit={[]}
      earmarks={[]}
      tagDefs={[]}
      submitLabel={user.role === 'USER' ? 'Als Entwurf übernehmen' : 'Als Buchung übernehmen'}
      closeOnCreate={false}
      onCreateInvoice={review}
    />
  )
}
