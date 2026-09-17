import { useMemo } from 'react'
import AttachmentsModal from '../../src/renderer/components/modals/AttachmentsModal'
import type { RendererApi } from '../../src/types/api'
import { createAttachmentsApi } from './attachmentsApi'
import { toVoucherRow } from './rendererApi'
import type { Entry } from './api'

export default function EntryAttachments({ entry, kind, onClose, onChanged, onSessionExpired }: {
  entry: Entry
  kind: 'drafts' | 'bookings'
  onClose: () => void
  onChanged?: () => void
  onSessionExpired: () => void
}) {
  const bridge = useMemo(() => ({
    attachments: createAttachmentsApi(onSessionExpired, kind),
    vouchers: { list: async () => ({ rows: [toVoucherRow(entry)], total: 1 }) }
  }) as unknown as Pick<RendererApi, 'attachments' | 'vouchers'>, [entry, kind, onSessionExpired])
  return <AttachmentsModal api={bridge} voucher={{ voucherId: entry.id, voucherNo: entry.number || `Entwurf #${entry.id}`, date: entry.date, description: entry.description }} onClose={onClose} onChanged={onChanged} />
}
