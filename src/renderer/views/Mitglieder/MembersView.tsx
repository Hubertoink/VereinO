import ManagementKpis from '../../components/finance/ManagementKpis'
import MemberContributionDialog from './MemberContributionDialog'
import type { DashboardTaskTarget } from '../../../../shared/dashboardTasks'
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { IconCalendarCheck, IconCalendarDue, IconCheck, IconChevronLeft, IconChevronRight, IconChevronsLeft, IconChevronsRight, IconFileExport, IconFilter, IconMail, IconPencil, IconPlus, IconTrash, IconX } from '@tabler/icons-react'
import ModalHeader, { ModalCloseButton } from '../../components/ModalHeader'

import ColumnSelectDropdown from '../../components/dropdowns/ColumnSelectDropdown'
import FilterDropdown from '../../components/dropdowns/FilterDropdown'
import MembersExportModal from '../../components/modals/MembersExportModal'
import DatePickerButton from '../../components/common/DatePickerButton'
import AppIcon from '../../components/common/AppIcon'
import BookingPopupFrame from '../../components/modals/BookingPopupFrame'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useToast } from '../../context/useToast'
import { addDataChangedListener, dispatchDataChanged } from '../../utils/refresh'

type PageShortcutAction = {
    id: string
    key: string
    label: string
    action: () => void
}

type MemberContributionFilter = 'ALL' | 'DUE' | 'NOT_DUE' | 'NO_PLAN'
type MemberIntervalFilter = 'ALL' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
type MemberBoardFilter = 'ALL' | 'ANY' | 'NONE' | 'V1' | 'V2' | 'KASSIER' | 'KASSENPR1' | 'KASSENPR2' | 'SCHRIFT'

interface MembersViewProps {
    initialTask?: DashboardTaskTarget | null
    registerPageShortcuts?: (shortcuts: PageShortcutAction[]) => void
}

export default function MembersView({ registerPageShortcuts, initialTask }: MembersViewProps = {}) {
    const { notify } = useToast()
    const [q, setQ] = useState('')
    const debouncedQ = useDebouncedValue(q, 250)
    const loadRequestIdRef = useRef(0)
    const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'NEW' | 'PAUSED' | 'LEFT'>('ALL')
    const [contributionFilter, setContributionFilter] = useState<MemberContributionFilter>(initialTask?.kind === 'members' ? 'DUE' : 'ALL')
    const [intervalFilter, setIntervalFilter] = useState<MemberIntervalFilter>('ALL')
    const [boardFilter, setBoardFilter] = useState<MemberBoardFilter>('ALL')
    const [sortBy, setSortBy] = useState<'memberNo'|'name'|'email'|'status'>(() => { try { return (localStorage.getItem('members.sortBy') as any) || 'name' } catch { return 'name' } })
    const [sort, setSort] = useState<'ASC'|'DESC'>(() => { try { return (localStorage.getItem('members.sort') as any) || 'ASC' } catch { return 'ASC' } })
    useEffect(() => { try { localStorage.setItem('members.sortBy', sortBy) } catch { } }, [sortBy])
    useEffect(() => { try { localStorage.setItem('members.sort', sort) } catch { } }, [sort])
    const [rows, setRows] = useState<Array<{ id: number; memberNo?: string | null; name: string; email?: string | null; phone?: string | null; address?: string | null; status: string; boardRole?: 'V1'|'V2'|'KASSIER'|'KASSENPR1'|'KASSENPR2'|'SCHRIFT' | null; iban?: string | null; bic?: string | null; contribution_amount?: number | null; contribution_interval?: 'MONTHLY'|'QUARTERLY'|'YEARLY' | null; mandate_ref?: string | null; mandate_date?: string | null; join_date?: string | null; leave_date?: string | null; notes?: string | null; next_due_date?: string | null }>>([])
    const [total, setTotal] = useState(0)
    const [memberSummary, setMemberSummary] = useState<{ active: number; dueMembers: number; dueAmount: number } | null>(null)
    const [limit, setLimit] = useState(50)
    const [offset, setOffset] = useState(0)
    useEffect(() => {
        if (initialTask?.kind !== 'members') return
        setQ('')
        setStatus('ALL')
        setContributionFilter('DUE')
        setIntervalFilter('ALL')
        setBoardFilter('ALL')
        setOffset(0)
    }, [initialTask])
    const [busy, setBusy] = useState(false)
    const [showPayments, setShowPayments] = useState(false)
    const [form, setForm] = useState<null | { mode: 'create' | 'edit'; draft: { id?: number; memberNo?: string | null; name: string; email?: string | null; phone?: string | null; address?: string | null; status?: 'ACTIVE'|'NEW'|'PAUSED'|'LEFT'; boardRole?: 'V1'|'V2'|'KASSIER'|'KASSENPR1'|'KASSENPR2'|'SCHRIFT' | null;
        iban?: string | null; bic?: string | null; contribution_amount?: number | null; contribution_interval?: 'MONTHLY'|'QUARTERLY'|'YEARLY' | null;
        mandate_ref?: string | null; mandate_date?: string | null; join_date?: string | null; leave_date?: string | null; notes?: string | null; next_due_date?: string | null; contribution_effective_date?: string | null; } }>(null)
    const [deleteConfirm, setDeleteConfirm] = useState<null | { id: number; label: string }>(null)
    const [deleteBusy, setDeleteBusy] = useState(false)
    const [boardRoleError, setBoardRoleError] = useState<string | null>(null)
    const [showInvite, setShowInvite] = useState(false)
    const [showExport, setShowExport] = useState(false)
    const [inviteBusy, setInviteBusy] = useState(false)
    const [inviteEmails, setInviteEmails] = useState<string[]>([])
    const [inviteRecipientNames, setInviteRecipientNames] = useState<Record<string, string>>({})
    const inviteSubjectRef = useRef<HTMLInputElement | null>(null)
    const [inviteFeedback, setInviteFeedback] = useState<null | { type: 'info' | 'success' | 'error'; text: string }>(null)
    const [inviteStats, setInviteStats] = useState<{ candidates: number; withoutEmail: number }>({ candidates: 0, withoutEmail: 0 })
    const [inviteBatchIndex, setInviteBatchIndex] = useState(0)
    const [showInviteRecipients, setShowInviteRecipients] = useState(false)
    const [inviteSubject, setInviteSubject] = useState<string>(() => { try { return localStorage.getItem('invite.subject') || 'Einladung zur Sitzung' } catch { return 'Einladung zur Sitzung' } })
    const [inviteBody, setInviteBody] = useState<string>(() => { try { return localStorage.getItem('invite.body') || 'Hallo zusammen,\n\nwir laden euch zur Sitzung ein.\n\nViele Grüße' } catch { return 'Hallo zusammen,\n\nwir laden euch zur Sitzung ein.\n\nViele Grüße' } })
    const [inviteActiveOnly, setInviteActiveOnly] = useState<boolean>(() => { try { return localStorage.getItem('invite.activeOnly') === '1' } catch { return false } })
    const INVITE_BCC_BATCH_SIZE = 50
    useEffect(() => { try { localStorage.setItem('invite.subject', inviteSubject) } catch {} }, [inviteSubject])
    useEffect(() => { try { localStorage.setItem('invite.body', inviteBody) } catch {} }, [inviteBody])
    useEffect(() => { try { localStorage.setItem('invite.activeOnly', inviteActiveOnly ? '1' : '0') } catch {} }, [inviteActiveOnly])

    const [colPrefs, setColPrefs] = useState<{ showMemberNo: boolean; showIBAN: boolean; showContribution: boolean; showAddress: boolean; showNotes: boolean }>(() => {
        try {
            const raw = localStorage.getItem('members.columns')
            if (raw) {
                const parsed = JSON.parse(raw)
                return {
                    showMemberNo: parsed.showMemberNo ?? true,
                    showIBAN: parsed.showIBAN ?? true,
                    showContribution: parsed.showContribution ?? true,
                    showAddress: parsed.showAddress ?? false,
                    showNotes: parsed.showNotes ?? false
                }
            }
        } catch {}
        return { showMemberNo: true, showIBAN: true, showContribution: true, showAddress: false, showNotes: false }
    })
    useEffect(() => { try { localStorage.setItem('members.columns', JSON.stringify(colPrefs)) } catch {} }, [colPrefs])
    const [boardRows, setBoardRows] = useState<any[]>([])
    const [boardRefresh, setBoardRefresh] = useState(0)
    useEffect(() => {
        let alive = true
        ;(async () => {
            try {
                const pageSize = 200
                let ofs = 0
                let total = 0
                const acc: any[] = []
                do {
                    // Load ALL members regardless of filters to get complete board overview
                    const res = await (window as any).api?.members?.list?.({ limit: pageSize, offset: ofs, sortBy: 'memberNo', sort: 'ASC' })
                    const rows = (res?.rows || []) as any[]
                    total = res?.total ?? rows.length
                    acc.push(...rows)
                    ofs += pageSize
                } while (ofs < total)
                const onlyBoard = acc.filter(r => !!r.boardRole)
                const roleOrder: Record<string, number> = { V1: 1, V2: 2, KASSIER: 3, SCHRIFT: 4, KASSENPR1: 5, KASSENPR2: 6 }
                onlyBoard.sort((a, b) => {
                    const ra = roleOrder[String(a.boardRole) as string] || 999
                    const rb = roleOrder[String(b.boardRole) as string] || 999
                    if (ra !== rb) return ra - rb
                    return String(a.name || '').localeCompare(String(b.name || ''), 'de', { sensitivity: 'base' })
                })
                if (alive) setBoardRows(onlyBoard)
            } catch {
                if (alive) setBoardRows([])
            }
        })()
        const onChanged = () => setBoardRefresh(v => v + 1)
        const removeDataChangedListener = addDataChangedListener(['members'], onChanged)
        return () => { alive = false; removeDataChangedListener() }
    }, [boardRefresh])

    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    function validateIBAN(iban?: string | null): { ok: boolean; msg?: string } {
        if (!iban) return { ok: true }
        const s = iban.replace(/\s+/g, '').toUpperCase()
        if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(s)) return { ok: false, msg: 'Format ungültig' }
        const rearr = s.slice(4) + s.slice(0, 4)
        const nums = rearr.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
        let mod = 0
        for (let i = 0; i < nums.length; i += 7) {
            const part = String(mod) + nums.slice(i, i + 7)
            mod = Number(BigInt(part) % 97n)
        }
        return { ok: mod === 1, msg: mod === 1 ? undefined : 'Prüfziffer ungültig' }
    }
    function validateBIC(bic?: string | null): { ok: boolean; msg?: string } {
        if (!bic) return { ok: true }
        const s = bic.replace(/\s+/g, '').toUpperCase()
        if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(s)) return { ok: false, msg: 'Format ungültig' }
        return { ok: true }
    }

    const [requiredTouched, setRequiredTouched] = useState(false)
    const [missingRequired, setMissingRequired] = useState<string[]>([])

    const [addrStreet, setAddrStreet] = useState<string>('')
    const [addrZip, setAddrZip] = useState<string>('')
    const [addrCity, setAddrCity] = useState<string>('')
    const memberNoInputRef = useRef<HTMLInputElement | null>(null)
    const memberNameInputRef = useRef<HTMLInputElement | null>(null)
    const memberEmailInputRef = useRef<HTMLInputElement | null>(null)
    const memberJoinInputRef = useRef<HTMLInputElement | null>(null)
    const memberLeaveInputRef = useRef<HTMLInputElement | null>(null)
    const memberMandateDateInputRef = useRef<HTMLInputElement | null>(null)
    const memberNextDueDateInputRef = useRef<HTMLInputElement | null>(null)
    const memberIbanInputRef = useRef<HTMLInputElement | null>(null)
    const memberNotesInputRef = useRef<HTMLTextAreaElement | null>(null)
    useEffect(() => {
        if (!form) return
        const a = (form.draft.address || '').trim()
        const m = /^(.*?)(?:,\s*)?(\d{4,5})?\s*([^,]*)$/.exec(a)
        if (m) { setAddrStreet(m[1]?.trim() || ''); setAddrZip(m[2]?.trim() || ''); setAddrCity(m[3]?.trim() || '') }
        else { setAddrStreet(a); setAddrZip(''); setAddrCity('') }
    }, [form?.draft.address])

    const openCreateMember = useCallback(() => {
        setRequiredTouched(false)
        setMissingRequired([])
        setAddrStreet('')
        setAddrZip('')
        setAddrCity('')
        setForm({
            mode: 'create',
            draft: {
                name: '',
                status: 'ACTIVE',
                boardRole: null,
                memberNo: null,
                email: null,
                phone: null,
                address: null,
                iban: null,
                bic: null,
                contribution_amount: null,
                contribution_interval: null,
                mandate_ref: null,
                mandate_date: null,
                join_date: null,
                leave_date: null,
                notes: null,
                next_due_date: null
            }
        })
    }, [])

    const load = useCallback(async () => {
        const requestId = ++loadRequestIdRef.current
        setBusy(true)
        try {
            const res = await (window as any).api?.members?.list?.({
                includeSummary: true,
                q: debouncedQ || undefined,
                status,
                contributionFilter,
                intervalFilter,
                boardFilter,
                limit,
                offset,
                sortBy,
                sort
            })
            if (requestId !== loadRequestIdRef.current) return
            setRows(res?.rows || [])
            setTotal(res?.total || 0)
            setMemberSummary(res?.summary || null)
        } catch (e: any) {
            if (requestId === loadRequestIdRef.current) { setMemberSummary(null); console.error('members.list failed', e) }
        } finally {
            if (requestId === loadRequestIdRef.current) setBusy(false)
        }
    }, [boardFilter, contributionFilter, debouncedQ, intervalFilter, limit, offset, sort, sortBy, status])
    useEffect(() => { void load() }, [load])
    useEffect(() => addDataChangedListener(['members', 'vouchers'], () => { void load() }), [load])

    const saveMemberForm = useCallback(async () => {
        if (!form) return
        try {
            setRequiredTouched(true)
            const missing: string[] = []
            if (!form.draft.name || !form.draft.name.trim()) missing.push('Name')
            if (form.mode === 'create') {
                if (!form.draft.memberNo || !String(form.draft.memberNo).trim()) missing.push('Mitglieds-Nr.')
                if (!form.draft.join_date || !String(form.draft.join_date).trim()) missing.push('Eintritt')
            }
            if (missing.length) { setMissingRequired(missing); return }

            setBoardRoleError(null)
            if (form.draft.boardRole) {
                const allMembers: any[] = []
                let memberOffset = 0
                const pageSize = 200
                let hasMore = true
                while (hasMore) {
                    const batch = await (window as any).api?.members?.list?.({ limit: pageSize, offset: memberOffset })
                    const rows = batch?.rows || []
                    allMembers.push(...rows)
                    hasMore = rows.length === pageSize
                    memberOffset += pageSize
                }

                const existingWithRole = allMembers.find((m: any) =>
                    m.boardRole === form.draft.boardRole && m.id !== form.draft.id
                )
                if (existingWithRole) {
                    const roleLabels: Record<string, string> = {
                        V1: '1. Vorsitz',
                        V2: '2. Vorsitz',
                        KASSIER: 'Kassier',
                        KASSENPR1: '1. Kassenprüfer',
                        KASSENPR2: '2. Kassenprüfer',
                        SCHRIFT: 'Schriftführer'
                    }
                    const roleLabel = roleLabels[form.draft.boardRole] || form.draft.boardRole
                    setBoardRoleError(`Die Funktion "${roleLabel}" ist bereits an ${existingWithRole.name} vergeben.`)
                    return
                }
            }

            const addrCombined = [addrStreet, [addrZip, addrCity].filter(Boolean).join(' ')].filter(Boolean).join(', ')
            const payload = { ...form.draft, address: addrCombined || form.draft.address || null }
            if (form.mode === 'create') {
                await (window as any).api?.members?.create?.(payload)
            } else {
                await (window as any).api?.members?.update?.(payload)
            }
            setForm(null)
            setRequiredTouched(false)
            setMissingRequired([])
            setBoardRoleError(null)
            await load()
            dispatchDataChanged(['members'])
        } catch (e: any) {
            alert(e?.message || String(e))
        }
    }, [addrCity, addrStreet, addrZip, form])

    useEffect(() => {
        if (!registerPageShortcuts) return
        registerPageShortcuts([
            { id: 'members-quick-add', key: 'q', label: 'Neu', action: openCreateMember }
        ])
        return () => registerPageShortcuts([])
    }, [openCreateMember, registerPageShortcuts])

    useEffect(() => {
        if (!showInvite) return
        setInviteFeedback(null)
        setInviteBatchIndex(0)
        let alive = true
        ;(async () => {
            setInviteBusy(true)
            try {
                const pageSize = 200
                let ofs = 0
                let emails: string[] = []
                const recipientNames: Record<string, string> = {}
                let totalCount = 0
                let candidateCount = 0
                let withoutEmailCount = 0
                do {
                    const effectiveStatus = inviteActiveOnly ? 'ACTIVE' : status
                    const res = await (window as any).api?.members?.list?.({ q: q || undefined, status: effectiveStatus, limit: pageSize, offset: ofs })
                    const rows = res?.rows || []
                    totalCount = res?.total || rows.length
                    candidateCount += rows.length
                    rows.forEach((r: any) => {
                        const email = String(r.email || '').trim()
                        if (!!email && /@/.test(email)) {
                            emails.push(email)
                            const key = email.toLowerCase()
                            if (!recipientNames[key] && String(r.name || '').trim()) {
                                recipientNames[key] = String(r.name).trim()
                            }
                        }
                        else withoutEmailCount += 1
                    })
                    ofs += pageSize
                } while (ofs < totalCount)
                const seen = new Set<string>()
                const unique = emails.filter(e => { const k = e.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
                if (alive) {
                    setInviteEmails(unique)
                    setInviteRecipientNames(recipientNames)
                    setInviteStats({ candidates: candidateCount, withoutEmail: withoutEmailCount })
                }
            } catch {
                if (alive) {
                    setInviteEmails([])
                    setInviteRecipientNames({})
                    setInviteStats({ candidates: 0, withoutEmail: 0 })
                }
            }
            finally { if (alive) setInviteBusy(false) }
        })()
        return () => { alive = false }
    }, [showInvite, q, status, inviteActiveOnly])

    useEffect(() => {
        if (!showInvite) setShowInviteRecipients(false)
    }, [showInvite])

    const inviteEmailBatches = useMemo(() => {
        if (!inviteEmails.length) return [] as string[][]
        const batches: string[][] = []
        for (let i = 0; i < inviteEmails.length; i += INVITE_BCC_BATCH_SIZE) {
            batches.push(inviteEmails.slice(i, i + INVITE_BCC_BATCH_SIZE))
        }
        return batches
    }, [inviteEmails, INVITE_BCC_BATCH_SIZE])

    const inviteTotalBatches = inviteEmailBatches.length
    const inviteCurrentBatch = inviteEmailBatches[inviteBatchIndex] || []

    useEffect(() => {
        if (inviteBatchIndex < inviteTotalBatches) return
        setInviteBatchIndex(inviteTotalBatches > 0 ? inviteTotalBatches - 1 : 0)
    }, [inviteBatchIndex, inviteTotalBatches])

    useEffect(() => {
        if (!showInvite) return
        const timer = window.setTimeout(() => inviteSubjectRef.current?.focus(), 0)
        function onKeydown(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                e.preventDefault()
                if (showInviteRecipients) setShowInviteRecipients(false)
                else setShowInvite(false)
            }
        }
        window.addEventListener('keydown', onKeydown)
        return () => {
            window.clearTimeout(timer)
            window.removeEventListener('keydown', onKeydown)
        }
    }, [showInvite, showInviteRecipients])

    const copyInviteBcc = useCallback(async (emails: string[]) => {
        if (!emails.length) {
            setInviteFeedback({ type: 'info', text: 'Keine E-Mail-Adressen zum Kopieren vorhanden.' })
            return false
        }
        try {
            await navigator.clipboard.writeText(emails.join('; '))
            setInviteFeedback({ type: 'success', text: `${emails.length} E-Mail-Adressen als BCC kopiert.` })
            return true
        } catch {
            setInviteFeedback({ type: 'error', text: 'Kopieren nicht möglich.' })
            return false
        }
    }, [])

    const openInviteMailClient = useCallback(async () => {
        if (!inviteCurrentBatch.length) {
            setInviteFeedback({ type: 'info', text: 'Keine Empfänger im aktuellen Batch.' })
            return
        }
        const subject = encodeURIComponent(inviteSubject || '')
        const body = encodeURIComponent(inviteBody || '')
        const bccRaw = inviteCurrentBatch.join(',')
        const mailto = `mailto:?bcc=${encodeURIComponent(bccRaw)}&subject=${subject}&body=${body}`
        if (mailto.length <= 1800) {
            try {
                window.location.href = mailto
                setInviteFeedback(null)
                notify('info', inviteTotalBatches > 1
                        ? `Mail-Programm für Batch ${inviteBatchIndex + 1}/${inviteTotalBatches} geöffnet.`
                        : 'Mail-Programm geöffnet.'
                )
            } catch {
                setInviteFeedback({ type: 'error', text: 'Mail-Programm konnte nicht geöffnet werden.' })
            }
            return
        }
        const copied = await copyInviteBcc(inviteCurrentBatch)
        if (copied) {
            setInviteFeedback({
                type: 'info',
                text: `Link zu lang – Batch ${inviteBatchIndex + 1}/${inviteTotalBatches} wurde als BCC kopiert.`
            })
        }
    }, [copyInviteBcc, inviteCurrentBatch, inviteSubject, inviteBody, inviteBatchIndex, inviteTotalBatches, notify])

    useEffect(() => {
        if (!form) return
        // Keyboard shortcuts: Ctrl+S to save, Esc to close
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') { setForm(null); e.preventDefault(); return }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault()
                void saveMemberForm()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [form, saveMemberForm])

    const pages = Math.max(1, Math.ceil(total / Math.max(1, limit)))
    const page = Math.floor(offset / Math.max(1, limit)) + 1

    return (
        <div className="members-header">
            <div className="members-header-top">
                <div className="members-header-left">
                    <h1 className="members-title">Mitglieder</h1>
                    <input className="input members-search" placeholder="Suche (Name, E-Mail, Tel., Nr.)" value={q} onChange={(e) => { setOffset(0); setQ(e.target.value) }} />
                    <MemberFilterDropdown
                        status={status}
                        contributionFilter={contributionFilter}
                        intervalFilter={intervalFilter}
                        boardFilter={boardFilter}
                        onApply={(values) => {
                            setStatus(values.status)
                            setContributionFilter(values.contributionFilter)
                            setIntervalFilter(values.intervalFilter)
                            setBoardFilter(values.boardFilter)
                            setOffset(0)
                        }}
                    />
                    <ColumnSelectDropdown
                        title="Spalten"
                        tip="Tipp: Du kannst IBAN/Beitrag ausblenden und stattdessen die Adresse anzeigen."
                        columns={[
                            {
                                key: 'showMemberNo',
                                label: 'Nr. anzeigen',
                                checked: colPrefs.showMemberNo,
                                onChange: (checked) => setColPrefs((p) => ({ ...p, showMemberNo: checked }))
                            },
                            {
                                key: 'showIBAN',
                                label: 'IBAN anzeigen',
                                checked: colPrefs.showIBAN,
                                onChange: (checked) => setColPrefs((p) => ({ ...p, showIBAN: checked }))
                            },
                            {
                                key: 'showContribution',
                                label: 'Beitrag anzeigen',
                                checked: colPrefs.showContribution,
                                onChange: (checked) => setColPrefs((p) => ({ ...p, showContribution: checked }))
                            },
                            {
                                key: 'showAddress',
                                label: 'Adresse anzeigen',
                                checked: colPrefs.showAddress,
                                onChange: (checked) => setColPrefs((p) => ({ ...p, showAddress: checked }))
                            },
                            {
                                key: 'showNotes',
                                label: 'Anmerkungen anzeigen',
                                checked: colPrefs.showNotes,
                                onChange: (checked) => setColPrefs((p) => ({ ...p, showNotes: checked }))
                            }
                        ]}
                    />
                    {(() => { const hasFilters = !!(q.trim() || status !== 'ALL' || contributionFilter !== 'ALL' || intervalFilter !== 'ALL' || boardFilter !== 'ALL'); return hasFilters ? (
                        <button className="btn btn-accent" onClick={() => { setQ(''); setStatus('ALL'); setContributionFilter('ALL'); setIntervalFilter('ALL'); setBoardFilter('ALL'); setOffset(0) }} title="Filter zurücksetzen"><AppIcon icon={IconX} size="action" /></button>
                    ) : null })()}
                </div>
                <div className="members-header-right">
                    <button className="btn members-export-trigger" title="Mitglieder als Excel oder PDF exportieren" onClick={() => setShowExport(true)}><AppIcon icon={IconFileExport} size="action" /></button>
                    <button className="btn btn-with-icon" title="Alle gefilterten Mitglieder per E-Mail einladen" onClick={() => setShowInvite(true)}><AppIcon icon={IconMail} size="control" />Einladen (E-Mail)</button>
                    <button className="btn btn-accent btn-with-icon" onClick={openCreateMember}>
                        <AppIcon icon={IconPlus} size="control" />Neu
                    </button>
                </div>
            </div>
            <ManagementKpis compact label="Mitgliederübersicht" loading={busy} items={[
                { label: 'Aktive Mitglieder', value: memberSummary ? String(memberSummary.active) : '—', hint: 'In der gefilterten Auswahl' },
                { label: 'Mit fälligen Beiträgen', value: memberSummary ? String(memberSummary.dueMembers) : '—', hint: 'Mitglieder mit offenen Beitragsperioden', tone: memberSummary?.dueMembers ? 'warning' : undefined },
                { label: 'Fällige Beiträge', value: memberSummary ? eurFmt.format(memberSummary.dueAmount) : '—', hint: 'Offene Restbeträge nach Teilzahlungen', tone: memberSummary?.dueAmount ? 'warning' : undefined }
            ]} />
            <div className="members-board-card">
                <div className="members-board-header">
                    <h2 className="members-board-title">Vorstand</h2>
                    {boardRows.length > 0 && <div className="helper">{boardRows.length} Personen</div>}
                </div>
                {boardRows.length === 0 ? (
                    <div className="helper" style={{ padding: '16px 0', textAlign: 'center' }}>
                        <div style={{ marginBottom: 4 }}>Kein Vorstand vorhanden</div>
                        <div style={{ fontSize: '0.9em', opacity: 0.7 }}>Vorstandsfunktionen können bei der Mitgliedschaft zugewiesen werden.</div>
                    </div>
                ) : (
                    <div className="members-board-table-scroll-wrapper">
                        <table cellPadding={6} className="members-board-table">
                            <thead>
                                <tr>
                                    <th align="left">Funktion</th>
                                    <th align="left">Name</th>
                                    <th align="left">E-Mail</th>
                                    <th align="left">Telefon</th>
                                </tr>
                            </thead>
                            <tbody>
                                {boardRows.map((r: any) => (
                                    <tr key={`board-${r.id}`}>
                                        <td>{(() => { const map: any = { V1: { label: '1. Vorsitz', color: '#00C853' }, V2: { label: '2. Vorsitz', color: '#4CAF50' }, KASSIER: { label: 'Kassier', color: '#03A9F4' }, KASSENPR1: { label: '1. Prüfer', color: '#FFC107' }, KASSENPR2: { label: '2. Prüfer', color: '#FFD54F' }, SCHRIFT: { label: 'Schriftführer', color: '#9C27B0' } }; const def = map[r.boardRole] || null; return def ? (<span className="badge members-badge-role" style={{ '--role-color': def.color } as React.CSSProperties}>{def.label}</span>) : (r.boardRole || '—') })()}</td>
                                        <td>{r.name}</td>
                                        <td>{r.email || '—'}</td>
                                        <td>{r.phone || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            <div className="members-table-scroll-wrapper">
                <table cellPadding={6} className="members-table">
                    <thead>
                        <tr>
                            {colPrefs.showMemberNo && (
                                <th align="left" className="members-sort-header" onClick={() => { setOffset(0); setSortBy('memberNo' as any); setSort(s => (sortBy === 'memberNo' ? (s === 'ASC' ? 'DESC' : 'ASC') : 'ASC')) }}>
                                    Nr. <span aria-hidden="true" style={{ color: (sortBy as any) === 'memberNo' ? 'var(--warning)' : 'var(--text-dim)' }}>{(sortBy as any) === 'memberNo' ? (sort === 'ASC' ? '↑' : '↓') : '↕'}</span>
                                </th>
                            )}
                            <th align="left" className="members-sort-header" onClick={() => { setOffset(0); setSortBy('name'); setSort(s => (sortBy === 'name' ? (s === 'ASC' ? 'DESC' : 'ASC') : 'ASC')) }}>
                                Name <span aria-hidden="true" style={{ color: sortBy === 'name' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'name' ? (sort === 'ASC' ? '↑' : '↓') : '↕'}</span>
                            </th>
                            <th align="left" className="members-sort-header" onClick={() => { setOffset(0); setSortBy('email'); setSort(s => (sortBy === 'email' ? (s === 'ASC' ? 'DESC' : 'ASC') : 'ASC')) }}>
                                E-Mail <span aria-hidden="true" style={{ color: sortBy === 'email' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'email' ? (sort === 'ASC' ? '↑' : '↓') : '↕'}</span>
                            </th>
                            <th align="left">Telefon</th>
                            {colPrefs.showAddress && (<th align="left">Adresse</th>)}
                            {colPrefs.showIBAN && (<th align="left">IBAN</th>)}
                            {colPrefs.showContribution && (<th align="right">Beitrag</th>)}
                            <th align="left" className="members-sort-header" onClick={() => { setOffset(0); setSortBy('status'); setSort(s => (sortBy === 'status' ? (s === 'ASC' ? 'DESC' : 'ASC') : 'ASC')) }}>
                                Status <span aria-hidden="true" style={{ color: sortBy === 'status' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'status' ? (sort === 'ASC' ? '↑' : '↓') : '↕'}</span>
                            </th>
                            {colPrefs.showNotes && (<th align="left">Anmerkungen</th>)}
                            <th align="center">Aktionen</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.id}>
                                {colPrefs.showMemberNo && (<td>{r.memberNo || '—'}</td>)}
                                <td>
                                    <span>{r.name}</span>
                                    {r.boardRole && (() => { const map: any = { V1: { label: '1. Vorsitz', color: '#00C853' }, V2: { label: '2. Vorsitz', color: '#4CAF50' }, KASSIER: { label: 'Kassier', color: '#03A9F4' }, KASSENPR1: { label: '1. Prüfer', color: '#FFC107' }, KASSENPR2: { label: '2. Prüfer', color: '#FFD54F' }, SCHRIFT: { label: 'Schriftführer', color: '#9C27B0' } }; const def = map[r.boardRole] || null; return def ? (<span className="badge" style={{ marginLeft: 8, background: def.color, color: '#fff' }}>{def.label}</span>) : null })()}
                                    {((r as any).contribution_amount != null && (r as any).contribution_amount > 0 && !!(r as any).contribution_interval) ? (
                                        <MemberStatusButton memberId={r.id} name={r.name} memberNo={r.memberNo || undefined} />
                                    ) : null}
                                </td>
                                <td>{r.email || '—'}</td>
                                <td>{r.phone || '—'}</td>
                                {colPrefs.showAddress && (<td>{r.address || '—'}</td>)}
                                {colPrefs.showIBAN && (<td>{r.iban || '—'}</td>)}
                                {colPrefs.showContribution && (<td align="right">{r.contribution_amount != null ? eurFmt.format(r.contribution_amount) : '—'}<small className="management-contribution-interval">{r.contribution_interval ? ({ MONTHLY: 'pro Monat', QUARTERLY: 'pro Quartal', YEARLY: 'pro Jahr' })[r.contribution_interval] : 'Kein Intervall'}</small></td>)}
                                <td>{(() => { const s = String(r.status || '').toUpperCase(); const c = (s === 'ACTIVE') ? '#00C853' : (s === 'LEFT') ? 'var(--danger)' : '#FFD600'; return (
                                    <span className="management-status" style={{ '--status-color': c } as React.CSSProperties}>{({ ACTIVE: 'Aktiv', NEW: 'Neu', PAUSED: 'Pausiert', LEFT: 'Ausgetreten' } as Record<string, string>)[s] || s}</span>
                                ) })()}</td>
                                {colPrefs.showNotes && (
                                    <td title={r.notes || undefined} style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {r.notes ? (r.notes.length > 120 ? (r.notes.slice(0, 120) + '…') : r.notes) : '—'}
                                    </td>
                                )}
                                <td align="center" style={{ whiteSpace: 'nowrap' }}>
                                <button className="btn btn-edit" title="Bearbeiten" onClick={() => setForm({ mode: 'edit', draft: {
                                    id: r.id,
                                    memberNo: r.memberNo ?? null,
                                    name: r.name,
                                    email: r.email ?? null,
                                    phone: r.phone ?? null,
                                    address: r.address ?? null,
                                    status: r.status as any,
                                    boardRole: (r as any).boardRole ?? null,
                                    iban: (r as any).iban ?? null,
                                    bic: (r as any).bic ?? null,
                                    contribution_amount: (r as any).contribution_amount ?? null,
                                    contribution_interval: (r as any).contribution_interval ?? null,
                                    mandate_ref: (r as any).mandate_ref ?? null,
                                    mandate_date: (r as any).mandate_date ?? null,
                                    join_date: (r as any).join_date ?? null,
                                    leave_date: (r as any).leave_date ?? null,
                                    notes: (r as any).notes ?? null,
                                    next_due_date: (r as any).next_due_date ?? null
                                } })}><AppIcon icon={IconPencil} size="control" /></button>
                            </td>
                        </tr>
                    ))}
                    {rows.length === 0 && (() => { const base = 6; const colSpan = base + (colPrefs.showAddress ? 1 : 0) + (colPrefs.showIBAN ? 1 : 0) + (colPrefs.showContribution ? 1 : 0) + (colPrefs.showNotes ? 1 : 0); return (
                        <tr><td colSpan={colSpan}><div className="helper">Keine Einträge</div></td></tr>
                    )})()}
                </tbody>
            </table>
            </div>
            <div className="pagination-bar" style={{ marginTop: 12, marginBottom: 0 }}>
                <div className="pagination-bar__info">
                    <div className="pagination-bar__stat">
                        <span>Gesamt:</span>
                        <span className="pagination-bar__stat-value">{total}</span>
                    </div>
                    <div className="pagination-bar__divider" />
                    <div className="pagination-bar__stat">
                        <span>Seite:</span>
                        <span className="pagination-bar__stat-value">{page} / {pages}</span>
                    </div>
                </div>
                <div className="pagination-bar__controls">
                    <button className="btn pagination-bar__btn" onClick={() => setOffset(0)} disabled={offset <= 0} title="Erste"><AppIcon icon={IconChevronsLeft} size="control" /></button>
                    <button className="btn pagination-bar__btn" onClick={() => setOffset(v => Math.max(0, v - limit))} disabled={offset <= 0} title="Zurück"><AppIcon icon={IconChevronLeft} size="control" /></button>
                    <button className="btn pagination-bar__btn" onClick={() => setOffset(v => (v + limit < total ? v + limit : v))} disabled={offset + limit >= total} title="Weiter"><AppIcon icon={IconChevronRight} size="control" /></button>
                    <button className="btn pagination-bar__btn" onClick={() => setOffset((pages - 1) * limit)} disabled={offset + limit >= total} title="Letzte"><AppIcon icon={IconChevronsRight} size="control" /></button>
                </div>
            </div>

            {form && (
                <BookingPopupFrame
                    title={form.mode === 'create' ? 'Mitglied anlegen' : 'Mitglied bearbeiten'}
                    titleId="member-form-modal-title"
                    subtitle="Stammdaten, Mitgliedschaft und SEPA-Mandat"
                    onClose={() => setForm(null)}
                    variant="compact"
                    anchorAlign="end"
                    className="member-modal standard-floating-modal member-floating-modal"
                    headerAccessory={<span className="badge member-modal-status" title="Status" style={{ background: (form.draft.status === 'ACTIVE' ? '#00C853' : form.draft.status === 'NEW' ? '#2196F3' : form.draft.status === 'PAUSED' ? '#FF9800' : 'var(--danger)'), color: '#fff' }}>{form.draft.status || '—'}</span>}
                >
                    <div className="member-modal-body">

                        {/* Two-column layout with all fields visible */}
                        <div className="block-grid" style={{ marginTop: 12, gap: 8 }}>
                            {/* Left column: Basis */}
                            <div className="card" style={{ padding: 12 }}>
                                <div className="helper" style={{ marginBottom: 8 }}>Basis</div>
                                <div className="row">
                                    <div className={`field standard-floating-field${String(form.draft.memberNo || '').trim() ? ' standard-floating-field--filled' : ''}`}>
                                        <label htmlFor="member-number">Mitglieds-Nr. <span style={{ color: 'var(--danger)' }} title="Pflichtfeld">*</span></label>
                                        <input id="member-number" ref={memberNoInputRef} className="input" placeholder="z.B. 12345" value={form.draft.memberNo ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, memberNo: e.target.value || null } })} style={requiredTouched && (!form.draft.memberNo || !String(form.draft.memberNo).trim()) ? { borderColor: 'var(--danger)' } : undefined} />
                                        {requiredTouched && (!form.draft.memberNo || !String(form.draft.memberNo).trim()) && (<div className="helper" style={{ color: 'var(--danger)' }}>Pflichtfeld</div>)}
                                    </div>
                                    <div className={`field standard-floating-field${form.draft.name.trim() ? ' standard-floating-field--filled' : ''}`}>
                                        <label htmlFor="member-name">Name <span style={{ color: 'var(--danger)' }} title="Pflichtfeld">*</span></label>
                                        <input id="member-name" ref={memberNameInputRef} className="input" placeholder="Max Mustermann" value={form.draft.name} onChange={(e) => setForm({ ...form, draft: { ...form.draft, name: e.target.value } })} style={requiredTouched && (!form.draft.name || !form.draft.name.trim()) ? { borderColor: 'var(--danger)' } : undefined} />
                                        {requiredTouched && (!form.draft.name || !form.draft.name.trim()) && (<div className="helper" style={{ color: 'var(--danger)' }}>Pflichtfeld</div>)}
                                    </div>
                                    <div className={`field standard-floating-field${String(form.draft.email || '').trim() ? ' standard-floating-field--filled' : ''}`}><label htmlFor="member-email">E-Mail</label><input id="member-email" ref={memberEmailInputRef} className="input" type="email" placeholder="max@example.org" value={form.draft.email ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, email: e.target.value || null } })} /></div>
                                    <div className={`field standard-floating-field${String(form.draft.phone || '').trim() ? ' standard-floating-field--filled' : ''}`}><label htmlFor="member-phone">Telefon</label><input id="member-phone" className="input" type="tel" inputMode="numeric" placeholder="0123 4567890" value={form.draft.phone ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, phone: e.target.value.replace(/[^0-9\s\-\+]/g, '') || null } })} /></div>
                                    <div className="field member-address-field" style={{ gridColumn: '1 / -1' }}>
                                        <div className="member-address-grid">
                                            <div className={`field standard-floating-field${addrStreet.trim() ? ' standard-floating-field--filled' : ''}`}>
                                                <label htmlFor="member-street">Straße und Nr.</label>
                                                <input id="member-street" className="input" value={addrStreet} onChange={(e) => setAddrStreet(e.target.value)} />
                                            </div>
                                            <div className={`field standard-floating-field${addrZip.trim() ? ' standard-floating-field--filled' : ''}`}>
                                                <label htmlFor="member-zip">PLZ</label>
                                                <input id="member-zip" className="input" inputMode="numeric" value={addrZip} onChange={(e) => setAddrZip(e.target.value.replace(/[^0-9]/g, ''))} maxLength={5} />
                                            </div>
                                            <div className={`field standard-floating-field${addrCity.trim() ? ' standard-floating-field--filled' : ''}`}>
                                                <label htmlFor="member-city">Ort</label>
                                                <input id="member-city" className="input" value={addrCity} onChange={(e) => setAddrCity(e.target.value)} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right column: Mitgliedschaft + Anmerkungen */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div className="card" style={{ padding: 12 }}>
                                    <div className="helper" style={{ marginBottom: 8 }}>Mitgliedschaft</div>
                                    <div className="row">
                                        <div className="field standard-floating-field standard-floating-field--filled">
                                            <label htmlFor="member-join-date">Eintritt <span style={{ color: 'var(--danger)' }} title="Pflichtfeld">*</span></label>
                                            <span className="booking-date-input-wrap">
                                                <input id="member-join-date" ref={memberJoinInputRef} className="input" type="date" value={form.draft.join_date ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, join_date: e.target.value || null } })} style={requiredTouched && (!form.draft.join_date || !String(form.draft.join_date).trim()) ? { borderColor: 'var(--danger)' } : undefined} />
                                                <DatePickerButton inputRef={memberJoinInputRef} ariaLabel="Kalender zur Auswahl des Eintrittsdatums öffnen" />
                                            </span>
                                            {requiredTouched && (!form.draft.join_date || !String(form.draft.join_date).trim()) && (<div className="helper" style={{ color: 'var(--danger)' }}>Pflichtfeld</div>)}
                                        </div>
                                        <div className="field standard-floating-field standard-floating-field--filled"><label htmlFor="member-leave-date">Austritt</label><span className="booking-date-input-wrap"><input id="member-leave-date" ref={memberLeaveInputRef} className="input" type="date" value={form.draft.leave_date ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, leave_date: e.target.value || null } })} /><DatePickerButton inputRef={memberLeaveInputRef} ariaLabel="Kalender zur Auswahl des Austrittsdatums öffnen" /></span></div>
                                        <div className="field standard-floating-field standard-floating-field--filled">
                                            <label htmlFor="member-status">Status</label>
                                            <select id="member-status" className="input" value={form.draft.status ?? 'ACTIVE'} onChange={(e) => setForm({ ...form, draft: { ...form.draft, status: e.target.value as any } })}>
                                                <option value="ACTIVE">Aktiv</option>
                                                <option value="NEW">Neu</option>
                                                <option value="PAUSED">Pause</option>
                                                <option value="LEFT">Ausgetreten</option>
                                            </select>
                                        </div>
                                        <div className="field standard-floating-field standard-floating-field--filled">
                                            <label htmlFor="member-board-role">Vorstandsfunktion</label>
                                            <select id="member-board-role" className="input" value={form.draft.boardRole ?? ''} onChange={(e) => { setBoardRoleError(null); setForm({ ...form, draft: { ...form.draft, boardRole: (e.target.value || null) as any } }) }}>
                                                <option value="">—</option>
                                                <option value="V1">1. Vorsitz</option>
                                                <option value="V2">2. Vorsitz</option>
                                                <option value="KASSIER">Kassier</option>
                                                <option value="KASSENPR1">1. Kassenprüfer</option>
                                                <option value="KASSENPR2">2. Kassenprüfer</option>
                                                <option value="SCHRIFT">Schriftführer</option>
                                            </select>
                                            {boardRoleError && <div className="helper" style={{ color: 'var(--danger)' }}>{boardRoleError}</div>}
                                        </div>
                                    </div>
                                </div>
                                <div className="card" style={{ padding: 12, flex: 1 }}>
                                    <div className={`field standard-floating-field${String(form.draft.notes || '').trim() ? ' standard-floating-field--filled' : ''}`}>
                                        <label htmlFor="member-notes">Anmerkungen</label>
                                        <textarea id="member-notes" ref={memberNotesInputRef} className="input" rows={2} placeholder="Freitext …" value={form.draft.notes ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, notes: e.target.value || null } })} style={{ resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Finanzen block - full width, more compact */}
                        <div className="card" style={{ padding: 12, marginTop: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
                                <div className="helper">Finanzen & SEPA-Mandat</div>
                            </div>
                            <div className="member-finance-grid">
                                {(() => { const v = validateIBAN(form.draft.iban); return (
                                    <div className={`field standard-floating-field${String(form.draft.iban || '').trim() ? ' standard-floating-field--filled' : ''}`} style={{ gridColumn: 'span 2' }}>
                                        <label htmlFor="member-iban" title="IBAN mit Prüfziffer">IBAN</label>
                                        <input id="member-iban" ref={memberIbanInputRef} className="input" placeholder="DE12 3456 7890 1234 5678 90" value={form.draft.iban ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, iban: e.target.value || null } })} style={{ borderColor: v.ok ? undefined : 'var(--danger)' }} />
                                        {!v.ok && <div className="helper" style={{ color: 'var(--danger)' }}>{v.msg}</div>}
                                    </div>
                                ) })()}
                                {(() => { const v = validateBIC(form.draft.bic); return (
                                    <div className={`field standard-floating-field${String(form.draft.bic || '').trim() ? ' standard-floating-field--filled' : ''}`}>
                                        <label htmlFor="member-bic" title="8 oder 11 Zeichen">BIC</label>
                                        <input id="member-bic" className="input" placeholder="BANKDEFFXXX" value={form.draft.bic ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, bic: e.target.value || null } })} style={{ borderColor: v.ok ? undefined : 'var(--danger)' }} />
                                        {!v.ok && <div className="helper" style={{ color: 'var(--danger)' }}>{v.msg}</div>}
                                    </div>
                                ) })()}
                                <div className={`field standard-floating-field${String(form.draft.mandate_ref || '').trim() ? ' standard-floating-field--filled' : ''}`}>
                                    <label htmlFor="member-mandate-ref">Mandats-Ref.</label>
                                    <input id="member-mandate-ref" className="input" placeholder="M-2025-001" value={form.draft.mandate_ref ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, mandate_ref: e.target.value || null } })} />
                                </div>
                                <div className={`field standard-floating-field${form.draft.contribution_amount != null ? ' standard-floating-field--filled' : ''}`}>
                                    <label htmlFor="member-contribution">Beitrag (EUR)</label>
                                    <input id="member-contribution" className="input" type="number" step="0.01" placeholder="z.B. 12,00" value={form.draft.contribution_amount ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, contribution_amount: e.target.value ? Number(e.target.value) : null } })} />
                                </div>
                                <div className="field standard-floating-field standard-floating-field--filled">
                                    <label htmlFor="member-contribution-interval">Intervall</label>
                                    <select id="member-contribution-interval" className="input" value={form.draft.contribution_interval ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, contribution_interval: (e.target.value || null) as any } })}>
                                        <option value="">—</option>
                                        <option value="MONTHLY">Monatlich</option>
                                        <option value="QUARTERLY">Quartal</option>
                                        <option value="YEARLY">Jährlich</option>
                                    </select>
                                </div>
                                <div className="field standard-floating-field standard-floating-field--filled">
                                    <label htmlFor="member-mandate-date">Mandats-Datum</label>
                                    <span className="booking-date-input-wrap">
                                        <input id="member-mandate-date" ref={memberMandateDateInputRef} className="input" type="date" value={form.draft.mandate_date ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, mandate_date: e.target.value || null } })} />
                                        <DatePickerButton inputRef={memberMandateDateInputRef} ariaLabel="Kalender zur Auswahl des Mandatsdatums öffnen" />
                                    </span>
                                </div>
                                <div className="field standard-floating-field standard-floating-field--filled">
                                    <label htmlFor="member-next-due-date">{form.mode === 'create' ? 'Initiale Fälligkeit' : 'Beitragsänderung ab (optional)'}</label>
                                    <span className="booking-date-input-wrap">
                                        <input id="member-next-due-date" ref={memberNextDueDateInputRef} className="input" type="date" value={(form.mode === 'create' ? form.draft.next_due_date : form.draft.contribution_effective_date) ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, [form.mode === 'create' ? 'next_due_date' : 'contribution_effective_date']: e.target.value || null } })} />
                                        <DatePickerButton inputRef={memberNextDueDateInputRef} ariaLabel="Kalender zur Auswahl des Beitragsbeginns öffnen" />
                                    </span>
                                    {form.mode === 'edit' && <small className="helper">Ohne Datum gelten Änderungen ab der nächsten Beitragsperiode. Offene Beiträge bleiben erhalten.</small>}
                                </div>
                            </div>
                        </div>

                    </div>
                        <div className="member-modal-footer">
                            <div className="helper">Ctrl+S = Speichern · Esc = Abbrechen</div>
                            <div className="member-modal-actions">
                                {form.mode === 'edit' && (
                                    <button className="btn danger modal-delete-btn btn-with-icon" onClick={() => {
                                        if (!form?.draft?.id) return
                                        const label = `${form.draft.name}${form.draft.memberNo ? ` (${form.draft.memberNo})` : ''}`
                                        setDeleteConfirm({ id: form.draft.id, label })
                                    }}><AppIcon icon={IconTrash} size="control" />Löschen</button>
                                )}
                                <button className="btn" onClick={() => setForm(null)}>Abbrechen</button>
                                <button className="btn primary" onClick={() => { void saveMemberForm() }}>Speichern</button>
                            </div>
                        </div>
                </BookingPopupFrame>
            )}
            {showInvite && (
                <BookingPopupFrame
                    title="Einladung per E-Mail"
                    titleId="invite-modal-title"
                    subtitle="Gefilterte Mitglieder gesammelt per BCC einladen"
                    onClose={() => setShowInvite(false)}
                    variant="compact"
                    anchorAlign="end"
                    className="invite-modal member-invite-modal"
                >
                        <div className="invite-modal-content">
                            <div className="invite-summary-row">
                                <div className="invite-summary-stats">
                                    <div className="invite-stat-card">
                                        <div className="helper">Gefunden</div>
                                        <strong>{inviteEmails.length}</strong>
                                    </div>
                                    <div className="invite-stat-card">
                                        <div className="helper">Ohne E-Mail</div>
                                        <strong>{inviteStats.withoutEmail}</strong>
                                    </div>
                                    <div className="invite-stat-card">
                                        <div className="helper">In Ansicht gesamt</div>
                                        <strong>{inviteStats.candidates}</strong>
                                    </div>
                                </div>
                                <label className="invite-active-toggle">
                                    <span>Nur aktive einladen</span>
                                    <input className="toggle" type="checkbox" role="switch" checked={inviteActiveOnly} aria-checked={inviteActiveOnly} onChange={(e)=>setInviteActiveOnly(e.target.checked)} />
                                </label>
                            </div>
                            <div className="invite-grid">
                                <div className="compact-booking-field">
                                    <label htmlFor="member-invite-subject">Betreff</label>
                                    <input id="member-invite-subject" ref={inviteSubjectRef} className="input" value={inviteSubject} onChange={(e)=>setInviteSubject(e.target.value)} />
                                </div>
                                <div className="compact-booking-field invite-batch-field">
                                    <span>Empfänger im Batch (BCC)</span>
                                    <button
                                        id="member-invite-batch"
                                        type="button"
                                        className="input invite-batch-count-display invite-batch-count-button"
                                        onClick={() => setShowInviteRecipients(true)}
                                        disabled={!inviteCurrentBatch.length}
                                        aria-haspopup="dialog"
                                        aria-label={`${inviteCurrentBatch.length || 0} Empfänger im aktuellen Batch anzeigen`}
                                        title="Empfänger im aktuellen Batch anzeigen"
                                    >
                                        <strong>{inviteCurrentBatch.length || 0}</strong>
                                        <span>Empfänger anzeigen</span>
                                    </button>
                                </div>
                                <div className="compact-booking-field invite-grid-span">
                                    <label htmlFor="member-invite-message">Nachricht</label>
                                    <textarea id="member-invite-message" className="input invite-message-input" rows={6} value={inviteBody} onChange={(e)=>setInviteBody(e.target.value)} />
                                </div>
                                <div className="invite-grid-span">
                                    <div className="compact-booking-field">
                                        <label htmlFor="member-invite-bcc">Empfänger (BCC)</label>
                                        <textarea id="member-invite-bcc" className="input invite-bcc-input" readOnly rows={3} value={inviteCurrentBatch.join('; ')} />
                                    </div>
                                    {inviteTotalBatches > 1 && (
                                        <div className="invite-batch-row">
                                            <div className="helper">Batch {inviteBatchIndex + 1} von {inviteTotalBatches} (max. {INVITE_BCC_BATCH_SIZE} Empfänger je E-Mail)</div>
                                            <div className="invite-batch-actions">
                                                <button className="btn" disabled={inviteBatchIndex <= 0} onClick={() => setInviteBatchIndex((v) => Math.max(0, v - 1))}>Vorheriger Batch</button>
                                                <button className="btn" disabled={inviteBatchIndex >= inviteTotalBatches - 1} onClick={() => setInviteBatchIndex((v) => Math.min(inviteTotalBatches - 1, v + 1))}>Nächster Batch</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {inviteFeedback && <div className={`invite-feedback invite-feedback-${inviteFeedback.type}`}>{inviteFeedback.text}</div>}
                        </div>
                        <div className="invite-modal-footer">
                            <div className="helper">{inviteBusy ? 'Sammle E-Mail-Adressen…' : `${inviteEmails.length} Empfänger gefunden`}</div>
                            <div className="invite-footer-actions">
                                <button className="btn" disabled={!inviteCurrentBatch.length} onClick={() => copyInviteBcc(inviteCurrentBatch)}>BCC kopieren</button>
                                <button className="btn primary" disabled={!inviteCurrentBatch.length} onClick={() => { void openInviteMailClient() }}>Im Mail-Programm öffnen ({inviteCurrentBatch.length})</button>
                            </div>
                        </div>
                </BookingPopupFrame>
            )}
            {showInvite && showInviteRecipients && createPortal(
                <div
                    className="modal-overlay invite-recipient-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="invite-recipient-modal-title"
                    onClick={(e) => {
                        e.stopPropagation()
                        if (e.target === e.currentTarget) setShowInviteRecipients(false)
                    }}
                >
                    <div className="modal invite-recipient-modal" onClick={(e) => e.stopPropagation()}>
                        <ModalHeader
                          className="invite-modal-header"
                          title="Empfänger im Batch"
                          titleId="invite-recipient-modal-title"
                          subtitle={`${inviteCurrentBatch.length} E-Mail-Adresse${inviteCurrentBatch.length === 1 ? '' : 'n'}`}
                          onClose={() => setShowInviteRecipients(false)}
                          closeLabel="Schließen"
                          closeOnEscape={false}
                        />
                        <div className="invite-recipient-modal__content">
                            <table className="invite-recipient-table">
                                <thead>
                                    <tr><th>#</th><th>E-Mail-Adresse</th></tr>
                                </thead>
                                <tbody>
                                    {inviteCurrentBatch.map((email, index) => (
                                        <tr key={email.toLowerCase()}>
                                            <td>{index + 1}</td>
                                            <td>
                                                {email}
                                                {inviteRecipientNames[email.toLowerCase()] && (
                                                    <span className="invite-recipient-name"> ({inviteRecipientNames[email.toLowerCase()]})</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <footer className="invite-modal-footer">
                            <span className="helper">Diese Adressen werden im BCC-Feld verwendet.</span>
                            <button className="btn primary" onClick={() => setShowInviteRecipients(false)}>Fertig</button>
                        </footer>
                    </div>
                </div>,
                document.body
            )}
            {showPayments && (
                <PaymentsAssignModal onClose={() => setShowPayments(false)} />
            )}
            {showExport && (
                <MembersExportModal
                    open={showExport}
                    onClose={() => setShowExport(false)}
                    currentFilter={status}
                    currentQuery={q}
                />
            )}
            {missingRequired.length > 0 && (
                createPortal(
                    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setMissingRequired([])}>
                        <div className="modal" onClick={(e)=>e.stopPropagation()} style={{ maxWidth: 520, display: 'grid', gap: 10 }}>
                            <ModalHeader
                              title="Pflichtfelder fehlen"
                              onClose={() => setMissingRequired([])}
                              closeLabel="Schließen"
                              closeOnEscape={false}
                            />
                            <div className="card" style={{ padding: 10 }}>
                                <div>Bitte ergänze die folgenden Felder:</div>
                                <ul className="helper" style={{ marginTop: 6 }}>
                                    {missingRequired.map((f) => (<li key={f}>{f}</li>))}
                                </ul>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button className="btn primary" onClick={() => setMissingRequired([])}>OK</button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )
            )}
            {deleteConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="modal" onClick={(e)=>e.stopPropagation()} style={{ maxWidth: 520, display: 'grid', gap: 10 }}>
                        <ModalHeader title="Mitglied löschen" onClose={() => setDeleteConfirm(null)} closeOnEscape={false} />
                        <div className="card" style={{ padding: 10 }}>
                            <div style={{ marginBottom: 6 }}>Soll das folgende Mitglied wirklich gelöscht werden?</div>
                            <div className="helper" style={{ fontWeight: 600 }}>{deleteConfirm.label}</div>
                            <div className="helper" style={{ color: 'var(--danger)', marginTop: 8 }}>Dieser Vorgang kann nicht rückgängig gemacht werden.</div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn" onClick={() => setDeleteConfirm(null)} disabled={deleteBusy}>Abbrechen</button>
                            <button className="btn danger" disabled={deleteBusy} onClick={async () => {
                                setDeleteBusy(true)
                                try {
                                    await (window as any).api?.members?.delete?.({ id: deleteConfirm.id })
                                    setDeleteConfirm(null)
                                    setForm(null)
                                    await load()
                                    dispatchDataChanged(['members'])
                                } catch (e: any) { alert(e?.message || String(e)) }
                                finally { setDeleteBusy(false) }
                            }}>Endgültig löschen</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

interface VoucherSuggestion {
    id: number
    voucherNo: string
    date: string
    description?: string | null
    counterparty?: string | null
    gross: number
    score?: number
}

function MemberFilterDropdown({
    status,
    contributionFilter,
    intervalFilter,
    boardFilter,
    onApply
}: {
    status: 'ALL' | 'ACTIVE' | 'NEW' | 'PAUSED' | 'LEFT'
    contributionFilter: MemberContributionFilter
    intervalFilter: MemberIntervalFilter
    boardFilter: MemberBoardFilter
    onApply: (values: {
        status: 'ALL' | 'ACTIVE' | 'NEW' | 'PAUSED' | 'LEFT'
        contributionFilter: MemberContributionFilter
        intervalFilter: MemberIntervalFilter
        boardFilter: MemberBoardFilter
    }) => void
}) {
    const closeRef = useRef<(() => void) | null>(null)
    const [draftStatus, setDraftStatus] = useState(status)
    const [draftContributionFilter, setDraftContributionFilter] = useState(contributionFilter)
    const [draftIntervalFilter, setDraftIntervalFilter] = useState(intervalFilter)
    const [draftBoardFilter, setDraftBoardFilter] = useState(boardFilter)

    useEffect(() => {
        setDraftStatus(status)
        setDraftContributionFilter(contributionFilter)
        setDraftIntervalFilter(intervalFilter)
        setDraftBoardFilter(boardFilter)
    }, [status, contributionFilter, intervalFilter, boardFilter])

    const hasFilters = status !== 'ALL' || contributionFilter !== 'ALL' || intervalFilter !== 'ALL' || boardFilter !== 'ALL'

    function apply(values?: {
        status: 'ALL' | 'ACTIVE' | 'NEW' | 'PAUSED' | 'LEFT'
        contributionFilter: MemberContributionFilter
        intervalFilter: MemberIntervalFilter
        boardFilter: MemberBoardFilter
    }) {
        onApply(values || {
            status: draftStatus,
            contributionFilter: draftContributionFilter,
            intervalFilter: draftIntervalFilter,
            boardFilter: draftBoardFilter
        })
        closeRef.current?.()
    }

    function reset() {
        const values = {
            status: 'ALL' as const,
            contributionFilter: 'ALL' as const,
            intervalFilter: 'ALL' as const,
            boardFilter: 'ALL' as const
        }
        setDraftStatus(values.status)
        setDraftContributionFilter(values.contributionFilter)
        setDraftIntervalFilter(values.intervalFilter)
        setDraftBoardFilter(values.boardFilter)
        apply(values)
    }

    return (
        <FilterDropdown
            trigger={<AppIcon icon={IconFilter} size="action" />}
            title="Filter"
            hasActiveFilters={hasFilters}
            alignRight
            width={420}
            ariaLabel="Mitglieder filtern"
            buttonTitle="Filter"
            colorVariant="filter"
            closeRef={closeRef}
        >
            <div className="filter-dropdown__grid">
                <div className="filter-dropdown__field">
                    <label className="filter-dropdown__label">Status</label>
                    <select className="input" value={draftStatus} onChange={(e) => setDraftStatus(e.target.value as typeof draftStatus)}>
                        <option value="ALL">Alle</option>
                        <option value="ACTIVE">Aktiv</option>
                        <option value="NEW">Neu</option>
                        <option value="PAUSED">Pause</option>
                        <option value="LEFT">Ausgetreten</option>
                    </select>
                </div>
                <div className="filter-dropdown__field">
                    <label className="filter-dropdown__label">Beiträge</label>
                    <select className="input" value={draftContributionFilter} onChange={(e) => setDraftContributionFilter(e.target.value as MemberContributionFilter)}>
                        <option value="ALL">Alle</option>
                        <option value="DUE">Fällig</option>
                        <option value="NOT_DUE">Nicht fällig</option>
                        <option value="NO_PLAN">Ohne Beitragsplan</option>
                    </select>
                </div>
                <div className="filter-dropdown__field">
                    <label className="filter-dropdown__label">Intervall</label>
                    <select className="input" value={draftIntervalFilter} onChange={(e) => setDraftIntervalFilter(e.target.value as MemberIntervalFilter)}>
                        <option value="ALL">Alle</option>
                        <option value="MONTHLY">Monatlich</option>
                        <option value="QUARTERLY">Quartal</option>
                        <option value="YEARLY">Jährlich</option>
                    </select>
                </div>
                <div className="filter-dropdown__field">
                    <label className="filter-dropdown__label">Vorstand</label>
                    <select className="input" value={draftBoardFilter} onChange={(e) => setDraftBoardFilter(e.target.value as MemberBoardFilter)}>
                        <option value="ALL">Alle</option>
                        <option value="ANY">Mit Funktion</option>
                        <option value="NONE">Ohne Funktion</option>
                        <option value="V1">1. Vorsitz</option>
                        <option value="V2">2. Vorsitz</option>
                        <option value="KASSIER">Kassier</option>
                        <option value="SCHRIFT">Schriftführer</option>
                        <option value="KASSENPR1">1. Kassenprüfer</option>
                        <option value="KASSENPR2">2. Kassenprüfer</option>
                    </select>
                </div>
            </div>
            <div className="filter-dropdown__actions">
                <button className="btn" type="button" onClick={reset}>Zurücksetzen</button>
                <div className="filter-dropdown__actions-right">
                    <button className="btn primary" type="button" onClick={() => apply()}>Übernehmen</button>
                </div>
            </div>
        </FilterDropdown>
    )
}

function MemberStatusButton({ memberId, name, memberNo }: { memberId: number; name: string; memberNo?: string }) {
    const [open, setOpen] = useState(false)
    const [status, setStatus] = useState<any>(null)
    useEffect(() => {
        let live = true
        const load = () => { window.api.payments.status({ memberId }).then(s => { if (live) setStatus(s) }).catch(() => { if (live) setStatus(null) }) }
        load()
        const off = addDataChangedListener(['members', 'vouchers'], load)
        return () => { live = false; off() }
    }, [memberId])
    return <><button className="btn ghost" title="Beitragsstatus & Historie" aria-label="Beitragsstatus & Historie" onClick={() => setOpen(true)} style={{ marginLeft: 6, width: 24, height: 24, padding: 0, display: 'inline-grid', placeItems: 'center', color: status?.state === 'OVERDUE' ? 'var(--danger)' : 'var(--success)' }}>
        <AppIcon icon={status?.state === 'OVERDUE' ? IconCalendarDue : IconCalendarCheck} size="control" />
    </button>{open && <MemberContributionDialog memberId={memberId} name={name} memberNo={memberNo} onClose={() => setOpen(false)} />}</>
}

function PaymentsAssignModal({ onClose }: { onClose: () => void }) {
    const [interval, setInterval] = useState<'MONTHLY'|'QUARTERLY'|'YEARLY'>('MONTHLY')
    const [mode, setMode] = useState<'PERIOD'|'RANGE'>('PERIOD')
    const [periodKey, setPeriodKey] = useState<string>(() => {
        const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    })
    const [from, setFrom] = useState<string>('')
    const [to, setTo] = useState<string>('')
    const [q, setQ] = useState('')
    const [rows, setRows] = useState<Array<{ memberId: number; name: string; memberNo?: string|null; status: string; periodKey: string; interval: 'MONTHLY'|'QUARTERLY'|'YEARLY'; amount: number; paid: number; voucherId?: number|null; verified?: number }>>([])
    const [busy, setBusy] = useState(false)

    async function load() {
        setBusy(true)
        try {
            const payload = mode === 'PERIOD' ? { interval, periodKey, q } : { interval, from, to, q }
            const res = await (window as any).api?.payments?.listDue?.(payload)
            setRows(res?.rows || [])
        } finally { setBusy(false) }
    }
    useEffect(() => { load() }, [interval, mode, periodKey, from, to, q])

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal booking-modal" onClick={e => e.stopPropagation()} style={{ display: 'grid', gap: 10 }}>
                <ModalHeader 
                    title="Mitgliedsbeiträge zuordnen" 
                    onClose={onClose} 
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select className="input" value={interval} onChange={e => {
                        const v = e.target.value as any; setInterval(v)
                        const d = new Date()
                        setPeriodKey(v==='MONTHLY' ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` : v==='QUARTERLY' ? `${d.getFullYear()}-Q${Math.floor(d.getMonth()/3)+1}` : String(d.getFullYear()))
                    }} title="Intervall">
                        <option value="MONTHLY">Monat</option>
                        <option value="QUARTERLY">Quartal</option>
                        <option value="YEARLY">Jahr</option>
                    </select>
                    <select className="input" value={mode} onChange={e => setMode(e.target.value as any)} title="Modus">
                        <option value="PERIOD">Periode</option>
                        <option value="RANGE">Zeitraum</option>
                    </select>
                    {mode === 'PERIOD' ? (
                        <input className="input" value={periodKey} onChange={e => setPeriodKey(sanitizePeriodKey(e.target.value, interval))} title="Periode: YYYY-MM | YYYY-Q1..Q4 | YYYY" />
                    ) : (
                        <>
                            <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
                            <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} />
                        </>
                    )}
                    <input className="input" placeholder="Mitglied suchen…" value={q} onChange={e => setQ(e.target.value)} />
                    <div className="helper">{busy ? 'Lade…' : `${rows.length} Einträge`}</div>
                </div>
                <table style={{ width: '100%' }} cellPadding={6}>
                    <thead>
                        <tr>
                            <th align="left">Mitglied</th>
                            <th>Periode</th>
                            <th>Intervall</th>
                            <th align="right">Betrag</th>
                            <th>Vorschläge</th>
                            <th>Status</th>
                            <th>Aktionen</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <PaymentsRow key={`${r.memberId}-${r.periodKey}`} row={r} onChanged={load} />
                        ))}
                        {rows.length === 0 && <tr><td colSpan={7}><div className="helper">Keine fälligen Beiträge</div></td></tr>}
                    </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="btn" onClick={onClose}>Schließen</button>
                </div>
            </div>
        </div>
    )
}

function PaymentsRow({ row, onChanged }: { row: { memberId: number; name: string; memberNo?: string|null; periodKey: string; interval: string; amount: number; paid: number; paidAmount?: number }; onChanged: () => void }) {
    const [open, setOpen] = useState(false)
    const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
    return <tr><td>{row.name}{open && <MemberContributionDialog memberId={row.memberId} name={row.name} memberNo={row.memberNo || undefined} onClose={() => setOpen(false)} onChanged={onChanged} />}</td>
        <td>{row.periodKey}</td><td>{row.interval === 'MONTHLY' ? 'Monatlich' : row.interval === 'QUARTERLY' ? 'Quartalsweise' : 'Jährlich'}</td><td align="right">{euro.format(row.amount)}</td><td>Automatische Verrechnung</td>
        <td>{row.paid ? 'Bezahlt' : row.paidAmount ? 'Teilbezahlt' : 'Offen'}</td><td><button className="btn" onClick={() => setOpen(true)}>Zahlung zuordnen</button></td></tr>
}

function sanitizePeriodKey(s: string, interval: 'MONTHLY'|'QUARTERLY'|'YEARLY'): string {
    const t = s.trim().toUpperCase()
    if (interval === 'MONTHLY') {
        const m = /^(\d{4})-(\d{1,2})$/.exec(t)
        if (!m) return t
        const y = m[1]; const mo = String(Math.max(1, Math.min(12, Number(m[2])))).padStart(2,'0')
        return `${y}-${mo}`
    }
    if (interval === 'QUARTERLY') {
        const m = /^(\d{4})-Q(\d)$/i.exec(t)
        if (!m) return t
        const y = m[1]; const q = Math.max(1, Math.min(4, Number(m[2])))
        return `${y}-Q${q}`
    }
    const y = /^\d{4}$/.exec(t)?.[0]
    return y || t
}

function periodRangeLocal(periodKey: string): { start: string; end: string } {
    const [yStr, rest] = periodKey.split('-'); const y = Number(yStr)
    if (/^Q\d$/.test(rest||'')) {
        const q = Number((rest||'Q1').replace('Q',''))
        const start = new Date(Date.UTC(y, (q-1)*3, 1))
        const end = new Date(Date.UTC(y, q*3, 0))
        return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10) }
    }
    if (rest) {
        const m = Number(rest)
        const start = new Date(Date.UTC(y, m-1, 1))
        const end = new Date(Date.UTC(y, m, 0))
        return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10) }
    }
    const start = new Date(Date.UTC(y, 0, 1))
    const end = new Date(Date.UTC(y, 12, 0))
    return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10) }
}
