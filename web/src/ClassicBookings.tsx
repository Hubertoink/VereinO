import { useTagOptions } from './useTagOptions'
import React, { useEffect, useState } from 'react'
import WebInvoiceBatchControl from './WebInvoiceBatchControl'
import JournalView from '../../src/renderer/views/Journal/JournalView'
import { DEFAULT_ORDER, type ColKey } from '../../src/renderer/views/Journal/types'
import { addDataChangedListener } from '../../src/renderer/utils/refresh'
import { useToast } from '../../src/renderer/context/useToast'
import { usePlanningOptions } from './usePlanningOptions'
import type { User } from './api'
import type { WebTableSettings } from './settingsApi'

export default function ClassicBookings({
  onCapture,
  tabs,
  onSelectTab,
  onCloseTab,
  onEditBooking,
  user,
  onSessionExpired,
  tableSettings,
  onNewBooking
}: {
  onCapture?: React.ComponentProps<typeof WebInvoiceBatchControl>['onCapture']
  tabs: React.ComponentProps<typeof JournalView>['bookingDraftTabs']
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onEditBooking: NonNullable<React.ComponentProps<typeof JournalView>['onExternalEdit']>
  user: User
  onSessionExpired: () => void
  onError: (message: string) => void
  tableSettings?: WebTableSettings | null
  onNewBooking: () => void
}) {
  const { notify } = useToast()
  const { tags } = useTagOptions(onSessionExpired)
  const planning = usePlanningOptions(onSessionExpired)
  const [revision, setRevision] = useState(0)
  const [limit, setLimit] = useState(tableSettings?.journalLimit || 50)
  const [cols, setCols] = useState(
    () =>
      Object.fromEntries(
        DEFAULT_ORDER.map((key) => [
          key,
          tableSettings?.columns[key] ?? !['voucherNo', 'net', 'vat'].includes(key)
        ])
      ) as Record<ColKey, boolean>
  )
  const [order, setOrder] = useState<ColKey[]>(
    (tableSettings?.columnOrder as ColKey[]) || DEFAULT_ORDER
  )
  const refresh = () => setRevision((value) => value + 1)
  useEffect(() => addDataChangedListener(['vouchers'], refresh), [])
  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    const timer = window.setInterval(refreshVisible, 30000)
    return () => {
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
      window.clearInterval(timer)
    }
  }, [])
  useEffect(() => {
    document.documentElement.dataset.journalRowStyle = tableSettings?.journalRowStyle || 'both'
    document.documentElement.dataset.journalRowDensity =
      tableSettings?.journalRowDensity || 'normal'
    return () => {
      delete document.documentElement.dataset.journalRowStyle
      delete document.documentElement.dataset.journalRowDensity
    }
  }, [tableSettings])
  const fmtDate = (value: string) =>
    tableSettings?.dateFormat === 'iso'
      ? value.slice(0, 10)
      : new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('de-DE')
  return (
    <section className="web-classic-journal" aria-label="Buchungen">
      <JournalView
        showBookingDraftTabs={!!tabs?.length}
        bookingDraftTabs={tabs}
        onOpenBookingDraft={onSelectTab}
        onCloseBookingDraft={onCloseTab}
        onExternalEdit={user.role === 'ADMIN' ? onEditBooking : undefined}
        readOnly
        flashId={null}
        setFlashId={() => {}}
        periodLock={null}
        refreshKey={revision}
        notify={notify}
        bumpDataVersion={refresh}
        fmtDate={fmtDate}
        setActivePage={() => {}}
        yearsAvail={[new Date().getFullYear()]}
        budgets={planning.budgets}
        earmarks={planning.earmarks}
        budgetsForEdit={planning.budgets}
        budgetNames={new Map(planning.budgets.map((b) => [b.id, b.label]))}
        paymentAccounts={[
          { id: 1, name: 'Bank', kind: 'BANK', sortOrder: 0, isActive: 1 },
          { id: 2, name: 'Kasse', kind: 'CASH', sortOrder: 1, isActive: 1 }
        ]}
        tagDefs={tags}
        eurFmt={new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })}
        friendlyError={(error) => (error instanceof Error ? error.message : String(error))}
        journalLimit={limit}
        setJournalLimit={(value) => setLimit(value as 20 | 50 | 100)}
        dateFmt={tableSettings?.dateFormat === 'iso' ? 'ISO' : 'DOT'}
        cols={cols}
        setCols={setCols}
        order={order}
        setOrder={setOrder}
      />
      <div className="journal-fab-cluster" role="group" aria-label="Journal-Aktionen">
        <WebInvoiceBatchControl
          onCapture={onCapture}
          user={user}
          onSessionExpired={onSessionExpired}
        />
        {user.role !== 'USER' && (
          <button
            className="fab fab-buchung"
            onClick={onNewBooking}
            aria-label="Neue Buchung"
            title="+ Buchung"
          >
            <span className="fab-buchung-icon">+</span>
            <span className="fab-buchung-text">Buchung</span>
          </button>
        )}
      </div>
    </section>
  )
}
