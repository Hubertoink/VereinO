import type { BookingWorkspace } from './useBookingTabs'
import { useTagOptions } from './useTagOptions'
import WebInvoiceCapture from './WebInvoiceCapture'
import WebInvoiceBatchControl from './WebInvoiceBatchControl'
import React, { useEffect, useLayoutEffect, useState } from 'react'
import BookingsPlusView from '../../src/renderer/views/BookingsPlus/BookingsPlusView'
import type { RendererApi } from '../../src/types/api'
import { dispatchDataChanged } from '../../src/renderer/utils/refresh'
import { usePlanningOptions } from './usePlanningOptions'
import { createAttachmentsApi } from './attachmentsApi'
import BookingEditor from './BookingEditor'
import { createRendererReadApi, webPaymentAccounts, type WebVoucherRow } from './rendererApi'
import { api, ApiError, type User, type Entry } from './api'
import type { WebTableSettings } from './settingsApi'
import { useToast } from '../../src/renderer/context/useToast'
import ClassicBookings from './ClassicBookings'

type Props = {
  workspace: BookingWorkspace
  onOpenAI: () => void
  user: User
  onSessionExpired: () => void
  onError: (message: string) => void
  externalFilters?: React.ComponentProps<typeof BookingsPlusView>['externalFilters']
  jumpRevision?: number
  bookingView?: 'classic' | 'plus'
  tableSettings?: WebTableSettings | null
}
export default function DesktopBookings({
  workspace,
  onOpenAI,
  user,
  onSessionExpired,
  onError,
  externalFilters,
  jumpRevision,
  bookingView = 'plus',
  tableSettings
}: Props) {
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [generalProfile, setGeneralProfile] = useState<boolean | null>(null)
  const [profileError, setProfileError] = useState('')
  useEffect(() => {
    let active = true
    const load = () => {
      setProfileError('')
      void api<{ profile: 'GENERAL' | 'NONPROFIT' }>('/settings/profile')
        .then((result) => {
          if (active) setGeneralProfile(result.profile === 'GENERAL')
        })
        .catch((error) => {
          if (!active) return
          if (error instanceof ApiError && error.status === 401) onSessionExpired()
          else setProfileError('Organisationsprofil konnte nicht geladen werden.')
        })
    }
    load()
    window.addEventListener('web-profile-changed', load)
    return () => {
      active = false
      window.removeEventListener('web-profile-changed', load)
    }
  }, [user.id, onSessionExpired])
  useEffect(() => {
    if (bookingView !== 'plus') return
    const refresh = () => {
      if (document.visibilityState === 'visible') dispatchDataChanged(['vouchers'])
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 30000)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(timer)
    }
  }, [bookingView])
  const editing = workspace.rows.find((row) => row.id === workspace.active)
  const draftTabs = workspace.rows
    .filter((row) => row.retained)
    .map((row, index) => ({
      id: row.id,
      label: row.qa?.description?.trim() || row.entry?.description || `Neue Buchung ${index + 1}`,
      title: row.entry
        ? `Buchung ${row.entry.number || row.entry.id} bearbeiten`
        : 'Ungespeicherte Buchung',
      type: row.qa?.type || row.entry?.type || ('IN' as const),
      isActive: row.id === workspace.active
    }))

  const { notify } = useToast()
  const { tags } = useTagOptions(onSessionExpired)
  const planning = usePlanningOptions(onSessionExpired)
  useLayoutEffect(() => {
    if (generalProfile === null) return
    const previous = window.api
    const adapter = createRendererReadApi(
      onSessionExpired,
      generalProfile ? 'GENERAL' : 'NONPROFIT'
    )
    // The mounted shared views require only this explicit subset of the Electron API.
    window.api = {
      ...adapter.bridge,
      attachments: createAttachmentsApi(onSessionExpired)
    } as unknown as RendererApi
    setReady(true)
    return () => {
      adapter.dispose()
      window.api = previous
    }
  }, [user.id, onSessionExpired, generalProfile])
  if (profileError)
    return (
      <div className="card" role="alert">
        {profileError}
        <button
          className="btn"
          onClick={() => window.dispatchEvent(new Event('web-profile-changed'))}
        >
          Erneut versuchen
        </button>
      </div>
    )
  if (!ready || generalProfile === null)
    return (
      <div className="card" role="status">
        Buchungen werden geladen …
      </div>
    )
  return (
    <>
      {invoiceOpen && (
        <WebInvoiceCapture
          onCapture={workspace.newTabsEnabled ? workspace.capture : undefined}
          user={user}
          onSessionExpired={onSessionExpired}
          onClose={() => setInvoiceOpen(false)}
        />
      )}
      {bookingView === 'classic' ? (
        <ClassicBookings
          onCapture={workspace.newTabsEnabled ? workspace.capture : undefined}
          tabs={draftTabs}
          onSelectTab={workspace.select}
          onCloseTab={workspace.remove}
          onEditBooking={(row) => workspace.open((row as WebVoucherRow).webEntry)}
          key={String(generalProfile)}
          user={user}
          onSessionExpired={onSessionExpired}
          onError={onError}
          tableSettings={tableSettings}
          onNewBooking={() => workspace.open()}
        />
      ) : (
        <>
          {planning.error && (
            <div className="alert error" role="alert">
              {planning.error}
            </div>
          )}
          <BookingsPlusView
            key={String(generalProfile)}
            showBookingDraftTabs={draftTabs.length > 0}
            bookingDraftTabs={draftTabs}
            onOpenBookingDraft={workspace.select}
            onCloseBookingDraft={workspace.remove}
            externalFilters={externalFilters}
            jumpRevision={jumpRevision}
            onResetFilters={() => {}}
            fmtDate={(date) =>
              new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('de-DE')
            }
            onNewBooking={() => workspace.open()}
            onEditBooking={(row) => workspace.open((row as WebVoucherRow).webEntry)}
            onOpenInvoiceCapture={() => setInvoiceOpen(true)}
            invoiceControl={
              <WebInvoiceBatchControl
                onCapture={workspace.newTabsEnabled ? workspace.capture : undefined}
                variant="inline"
                user={user}
                onSessionExpired={onSessionExpired}
              />
            }
            onNewInvoice={() => setInvoiceOpen(true)}
            onReviewInvoice={() => setInvoiceOpen(true)}
            notify={notify}
            paymentAccounts={webPaymentAccounts}
            budgets={planning.budgets}
            earmarks={planning.earmarks}
            tagDefs={tags}
            allowVoucherDeletion={false}
            generalProfile={generalProfile}
            capabilities={{
              editBooking: user.role === 'ADMIN',
              editMetadata: false,
              attachments: true,
              invoiceCapture: true,
              invoiceBatch: false,
              deleteBooking: false,
              assignments: true
            }}
          />
        </>
      )}
      {editing && (
        <BookingEditor
          key={editing.id}
          entry={editing.entry}
          initialFields={editing.initialFields}
          aiDocumentId={editing.aiDocumentId}
          reviewWarnings={editing.reviewWarnings}
          draftState={editing.qa}
          draftFiles={editing.files}
          onDraftFilesChange={files => workspace.updateFiles(editing.id, files)}
          onDraftStateChange={(qa) => workspace.update(editing.id, qa)}
          workspaceTabs={editing.retained ? draftTabs : undefined}
          activeTabId={editing.id}
          onSelectTab={workspace.select}
          onNewTab={() => workspace.open()}
          user={user}
          onClose={() => workspace.park(editing.id)}
          onSessionExpired={onSessionExpired}
          onSaved={() => {
            workspace.remove(editing.id)
            if (workspace.afterSave === 'new') workspace.open()
            notify('success', 'Buchung gespeichert.')
            dispatchDataChanged(['vouchers'])
          }}
        />
      )}
    </>
  )
}
