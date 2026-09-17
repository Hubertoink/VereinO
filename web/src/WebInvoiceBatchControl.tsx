import React, { useMemo, useState } from 'react'
import InvoiceBatchControl from '../../src/renderer/components/InvoiceBatchControl'
import type { RendererApi } from '../../src/types/api'
import { useToast } from '../../src/renderer/context/useToast'
import { api, webFetch, type Fields, type User } from './api'
import WebInvoiceCapture, { uploadInvoice } from './WebInvoiceCapture'
import { InvoiceFlyoutPortal } from './ViewportPopover'

type Document = {
  documentId: string
  fileName: string
  fields: Partial<Fields> & { warnings?: string[] }
}
export default function WebInvoiceBatchControl({
  user,
  onSessionExpired,
  onCapture,
  variant = 'floating'
}: {
  onCapture?: React.ComponentProps<typeof WebInvoiceCapture>['onCapture']
  user: User
  onSessionExpired: () => void
  variant?: 'floating' | 'inline'
}) {
  const { notify } = useToast()
  const [capture, setCapture] = useState<{ file: File; document?: Document } | null>(null)
  const queue = useMemo(() => {
    const documents = new Map<number, Document>(),
      ids = new Map<string, number>(),
      listeners = new Set<() => void>()
    let nextId = 1
    const changed = () => listeners.forEach((listener) => listener())
    const adapter = {
      list: async () => {
        const [result, settings] = await Promise.all([
          api<{ rows: Document[] }>('/ai/documents'),
          api<{ enabled: boolean; hasApiKey: boolean }>('/ai/settings')
        ])
        documents.clear()
        const rows = (result.rows || []).map((document) => {
          if (!ids.has(document.documentId)) ids.set(document.documentId, nextId++)
          const id = ids.get(document.documentId)!
          documents.set(id, document)
          return { id, fileName: document.fileName, status: 'NEEDS_REVIEW' }
        })
        return {
          rows,
          aiAvailable: settings.enabled && settings.hasApiKey,
          doclingAvailable: false
        }
      },
      onChanged: (listener: () => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      import: async ({ files }: { files: { fileName: string; dataBytes: Uint8Array }[] }) => {
        const imported: string[] = []
        try {
          for (const file of files) {
            try {
              const result = await uploadInvoice(
                new File([new Uint8Array(file.dataBytes)], file.fileName, {
                  type: 'application/pdf'
                })
              )
              imported.push(result.documentId)
            } catch (error) {
              notify(
                'error',
                `${file.fileName}: ${error instanceof Error ? error.message : String(error)}`
              )
            }
          }
        } finally {
          changed()
        }
        return { imported, duplicates: [], reused: [] }
      },
      discard: async ({ id }: { id: number }) => {
        const document = documents.get(id)
        if (document) await api(`/ai/documents/${document.documentId}`, 'DELETE')
        changed()
        return { ok: true }
      },
      retry: async () => {
        throw new Error('Bitte den Beleg erneut auswählen.')
      }
    } as unknown as RendererApi['ai']['invoiceBatch']
    return { adapter, documents }
  }, [notify, user.id, user.organizationId])
  const review = async (id: number) => {
    const document = queue.documents.get(id)
    if (!document) return
    try {
      const response = await webFetch(`/api/ai/documents/${document.documentId}/content`, {
        credentials: 'same-origin'
      })
      if (response.status === 401) {
        onSessionExpired()
        return
      }
      if (!response.ok)
        throw new Error(
          'Der Beleg ist nicht mehr verfügbar. Bitte die Warteschlange erneut öffnen.'
        )
      const blob = await response.blob()
      setCapture({ file: new File([blob], document.fileName, { type: blob.type }), document })
    } catch (error) {
      notify('error', error instanceof Error ? error.message : String(error))
    }
  }
  return (
    <>
      <InvoiceBatchControl
        variant={variant}
        webMode
        apiOverride={queue.adapter}
        flyoutPortal={InvoiceFlyoutPortal}
        paymentAccounts={[]}
        notify={notify}
        onNewInvoice={(file) => setCapture({ file })}
        onReview={(id) => void review(id)}
      />
      {capture && (
        <WebInvoiceCapture
          onCapture={onCapture}
          user={user}
          onSessionExpired={onSessionExpired}
          initialFile={capture.file}
          initialDocument={capture.document}
          onClose={() => setCapture(null)}
        />
      )}
    </>
  )
}
