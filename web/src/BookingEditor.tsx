import { useTagOptions } from './useTagOptions'
import './bookingDialogs.css'
import { webBookingSuggestions } from './bookingSuggestions'
import { rememberBookingAIPattern } from '../../src/renderer/utils/bookingAiPatterns'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CompactBookingFlyout from '../../src/renderer/components/CompactBookingFlyout'
import type { QA } from '../../src/renderer/types/bookingEntry'
import { usePlanningOptions } from './usePlanningOptions'
import EntryAttachments from './EntryAttachments'
import { webFetch, api, ApiError, type Entry, type Fields, type User } from './api'

type Props = {
  onAttachmentsChanged?: () => void
  draftFiles?: File[]
  onDraftFilesChange?: (files: File[]) => void
  draftState?: QA
  onDraftStateChange?: (qa: QA) => void
  workspaceTabs?: { id: string; label: string; title: string }[]
  activeTabId?: string
  onSelectTab?: (id: string) => void
  onNewTab?: () => void
  aiDocumentId?: string
  reviewWarnings?: string[]
  entry?: Entry
  initialFields?: Fields
  saveBooking?: (fields: Fields) => Promise<unknown>
  mode?: 'bookings' | 'drafts'
  user: User
  onClose: () => void
  onSaved: (saved?: Entry) => void
  onSessionExpired: () => void
}

// The pilot stores payment methods; these options represent those methods, not persisted account IDs.
const paymentMethods = [
  { id: 1, name: 'Bank', kind: 'BANK' as const, isActive: 1 },
  { id: 2, name: 'Kasse', kind: 'CASH' as const, isActive: 1 }
]

export default function BookingEditor({
  onAttachmentsChanged,
  draftFiles,
  onDraftFilesChange,
  draftState,
  onDraftStateChange,
  workspaceTabs,
  activeTabId,
  onSelectTab,
  onNewTab,
  aiDocumentId,
  reviewWarnings = [],
  entry,
  initialFields,
  saveBooking,
  mode = 'bookings',
  user,
  onClose,
  onSaved,
  onSessionExpired
}: Props) {
  const [files, setLocalFiles] = useState<File[]>(draftFiles || [])
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const uploaded = useRef(new Map<File, string>())
  useEffect(() => () => {
    for (const id of uploaded.current.values()) void api(`/attachments/${id}`, 'DELETE').catch(() => {})
  }, [])
  const setFiles = (next: File[]) => {
    if (saving.current) return
    setLocalFiles(next)
    onDraftFilesChange?.(next)
    for (const [file, id] of uploaded.current) if (!next.includes(file)) {
      uploaded.current.delete(file)
      void api(`/attachments/${id}`, 'DELETE').catch(() => {})
    }
  }
  const addFiles = (selected: FileList | null) => {
    if (!selected) return
    const next = [...files, ...Array.from(selected)]
    if (next.length > 20 || next.some(file => file.size > 10 * 1024 * 1024 || !/\.(pdf|png|jpe?g|webp)$/i.test(file.name))) {
      setError('Bis zu 20 Anhänge: PDF, PNG, JPEG oder WebP, jeweils höchstens 10 MB.')
      return
    }
    setError('')
    setFiles(next)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  const tagOptions = useTagOptions(onSessionExpired)
  const [qa, setQa] = useState<QA>(() => {
    if (draftState) return draftState
    const today = new Date()
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const source = entry || initialFields
    return {
      date: source ? source.date : localDate,
      type: source?.type || 'IN',
      sphere: source?.sphere || 'IDEELL',
      primaryClassificationValueId: source?.primaryClassificationValueId,
      description: source?.description || '',
      grossAmount: source ? source.grossAmountCents / 100 : undefined,
      mode: 'GROSS',
      vatRate: 0,
      paymentMethod: source?.paymentMethod === 'CASH' ? 'BAR' : 'BANK',
      paymentAccountId: source?.paymentMethod === 'CASH' ? 2 : 1,
      counterparty: source?.counterparty || '',
      tags: source?.tags || [],
      budgets: entry?.budgets?.map(({ budgetId, amount }) => ({ budgetId, amount })),
      earmarksAssigned: entry?.earmarksAssigned?.map(({ earmarkId, amount }) => ({
        earmarkId,
        amount
      }))
    }
  })
  const stateChangeRef = useRef(onDraftStateChange)
  stateChangeRef.current = onDraftStateChange
  useEffect(() => {
    stateChangeRef.current?.(qa)
  }, [qa])
  const [busy, setBusy] = useState(false)
  const [classification, setClassification] = useState<{
    profile: string
    label: string
    values: Array<{ id: number; name: string; icon?: string | null }>
  }>()
  useEffect(() => {
    let active = true
    api<{
      profile: string
      definition: { primaryLabel: string }
      values: Array<{ id: number; name: string; icon?: string | null }>
    }>('/classifications/primary')
      .then((result) => {
        if (active)
          setClassification({
            profile: result.profile,
            label: result.definition.primaryLabel,
            values: result.values
          })
      })
      .catch((cause) => {
        if (active) {
          if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
          setError('Kategorien konnten nicht geladen werden.')
        }
      })
    return () => {
      active = false
    }
  }, [onSessionExpired])
  const [error, setError] = useState('')
  const saving = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isDraft = mode === 'drafts'
  const planning = usePlanningOptions(onSessionExpired, !saveBooking, isDraft && user.role === 'USER')
  const authorized = isDraft
    ? !entry ||
      (user.role === 'ADMIN' || user.role === 'EDITOR'
        ? ['DRAFT', 'RETURNED', 'SUBMITTED'].includes(entry.status || '')
        : entry.createdBy === user.id && ['DRAFT', 'RETURNED'].includes(entry.status || ''))
    : user.role === 'ADMIN' || (!entry && user.role === 'EDITOR')
  const close = () => {
    if (!saving.current) onClose()
  }
  const save = async () => {
    if (saving.current || !authorized || !classification) return
    if (classification.profile === 'GENERAL' && !qa.primaryClassificationValueId) {
      setError('Bitte eine Kategorie auswählen.')
      return
    }
    const grossAmount = Number(qa.grossAmount)
    const grossAmountCents = Math.round(grossAmount * 100)
    if (!qa.description.trim()) {
      setError('Bitte eine Beschreibung eingeben.')
      return
    }
    if (!Number.isSafeInteger(grossAmountCents) || grossAmountCents <= 0) {
      setError('Bitte einen gültigen Betrag größer als 0 eingeben.')
      return
    }
    if (Math.abs(grossAmount - grossAmountCents / 100) > 1e-9) {
      setError('Bitte den Betrag mit höchstens zwei Nachkommastellen eingeben.')
      return
    }
    if (qa.type !== 'IN' && qa.type !== 'OUT') return
    const fields: Fields = {
      ...(classification?.profile === 'GENERAL'
        ? { primaryClassificationValueId: qa.primaryClassificationValueId ?? null }
        : {}),
      tags: qa.tags || [],
      budgets: qa.budgets || [],
      earmarksAssigned: qa.earmarksAssigned || [],
      date: qa.date,
      type: qa.type,
      sphere: qa.sphere,
      description: qa.description.trim(),
      grossAmountCents,
      paymentMethod: qa.paymentAccountId === 2 ? 'CASH' : 'BANK',
      counterparty: qa.counterparty?.trim() || ''
    }
    const payload = {
      attachmentIds: [] as string[],
      ...fields,
      ...(aiDocumentId && !entry ? { aiDocumentId } : {})
    }
    saving.current = true
    setBusy(true)
    setError('')
    try {
      for (const file of files) {
        if (!uploaded.current.has(file)) {
          const form = new FormData()
          form.append('file', file)
          const response = await webFetch('/api/attachments/staged', { method: 'POST', headers: { 'X-VereinO-Request': '1' }, body: form })
          const result = await response.json()
          if (!response.ok) throw new ApiError(response.status, result.message || result.error || 'Anhang konnte nicht hochgeladen werden.')
          uploaded.current.set(file, result.file.id)
        }
        payload.attachmentIds.push(uploaded.current.get(file)!)
      }
      let saved: Entry | undefined
      if (saveBooking) await saveBooking(fields)
      else {
        const response = await api<{ draft?: Entry; booking?: Entry }>(
          entry ? `/${mode}/${entry.id}` : `/${mode}`,
          entry ? 'PATCH' : 'POST',
          entry ? { ...payload, version: entry.version } : payload
        )
        saved = isDraft ? response.draft : response.booking
      }
      if (!saveBooking)
        rememberBookingAIPattern({
          tags: fields.tags,
          description: fields.description,
          grossAmount,
          type: fields.type,
          sphere: classification.profile === 'NONPROFIT' ? fields.sphere : undefined,
          budgets: qa.budgets,
          earmarks: qa.earmarksAssigned,
          paymentAccountId: qa.paymentAccountId
        })
      uploaded.current.clear()
      onDraftFilesChange?.([])
      onSaved(saved)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
      else
        setError(
          cause instanceof Error
            ? cause.message
            : isDraft
              ? 'Der Entwurf konnte nicht gespeichert werden.'
              : 'Die Buchung konnte nicht gespeichert werden.'
        )
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (attachmentsOpen) return
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })
  if (!authorized) return null
  return createPortal(
    <>
      <div
        className="compact-booking-flyout-dismiss compact-booking-flyout-dismiss--dimmed"
        onClick={close}
        style={{ pointerEvents: 'auto' }}
      />
      <div className="compact-booking-flyout-anchor web-booking-editor">
        <CompactBookingFlyout
          primaryClassification={classification}
          qa={qa}
          setQa={setQa}
          title={
            isDraft
              ? entry
                ? 'Entwurf bearbeiten'
                : 'Entwurf erfassen'
              : entry
                ? 'Buchung bearbeiten'
                : 'Buchung erfassen'
          }
          saveLabel={isDraft ? 'Entwurf speichern' : 'Buchung speichern'}
          kindOptions={[
            { value: 'IN', label: 'Einnahme' },
            { value: 'OUT', label: 'Ausgabe' }
          ]}
          allowedOptionalSections={
            saveBooking
              ? ['party']
              : isDraft
                ? ['party', 'budget', 'earmark', 'tags', 'attachments']
                : ['party', 'budget', 'earmark', 'tags', 'attachments']
          }
          readOnlyCore={!!saveBooking}
          allowTaxMode={false}
          allowAISuggestions={!saveBooking}
          transformAISuggestions={(suggestions) =>
            webBookingSuggestions(
              suggestions,
              classification?.profile === 'GENERAL',
              !saveBooking,
              planning.budgets.map((item) => item.id),
              planning.earmarks.map((item) => item.id)
            )
          }
          learnOnSave={false}
          freeTextCounterparty
          busy={busy}
          error={error || planning.error || tagOptions.error || reviewWarnings.join(' ')}
          onSave={save}
          onClose={close}
          showExpand={false}
          onExpand={() => {}}
          files={files}
          setFiles={setFiles}
          onDropFiles={addFiles}
          openFilePicker={() => fileInputRef.current?.click()}
          attachmentAccept=".pdf,.png,.jpg,.jpeg,.webp"
          attachmentsContent={<><small>PDF, PNG, JPEG oder WebP · jeweils höchstens 10 MB</small>{entry && <button type="button" className="btn" onClick={() => setAttachmentsOpen(true)}>Vorhandene Anhänge anzeigen</button>}</>}
          fileInputRef={fileInputRef}
          budgetsForEdit={planning.budgets}
          earmarks={planning.earmarks}
          paymentAccounts={paymentMethods}
          tagDefs={tagOptions.tags}
          descSuggest={[]}
          afterSaveDefault="close"
          draftTabsEnabled={!!workspaceTabs}
          draftTabs={workspaceTabs || []}
          activeDraftId={activeTabId || null}
          onSelectDraft={(id) => {
            if (!saving.current) onSelectTab?.(id)
          }}
          onNewDraft={() => {
            if (!saving.current) onNewTab?.()
          }}
        />
      </div>
      {attachmentsOpen && entry && <EntryAttachments entry={entry} kind={mode} onChanged={onAttachmentsChanged} onSessionExpired={onSessionExpired} onClose={() => setAttachmentsOpen(false)} />}
    </>,
    document.body
  )
}
