import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import ModalHeader from '../../components/ModalHeader'
import LoadingState from '../../components/LoadingState'

export default function MembersView() {
    const [q, setQ] = useState('')
    const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'NEW' | 'PAUSED' | 'LEFT'>('ALL')
    const [sortBy, setSortBy] = useState<'memberNo'|'name'|'email'|'status'>(() => { try { return (localStorage.getItem('members.sortBy') as any) || 'name' } catch { return 'name' } })
    const [sort, setSort] = useState<'ASC'|'DESC'>(() => { try { return (localStorage.getItem('members.sort') as any) || 'ASC' } catch { return 'ASC' } })
    useEffect(() => { try { localStorage.setItem('members.sortBy', sortBy) } catch { } }, [sortBy])
    useEffect(() => { try { localStorage.setItem('members.sort', sort) } catch { } }, [sort])
    const [rows, setRows] = useState<Array<{ id: number; memberNo?: string | null; name: string; email?: string | null; phone?: string | null; address?: string | null; status: string; boardRole?: 'V1'|'V2'|'KASSIER'|'KASSENPR1'|'KASSENPR2'|'SCHRIFT' | null; iban?: string | null; bic?: string | null; contribution_amount?: number | null; contribution_interval?: 'MONTHLY'|'QUARTERLY'|'YEARLY' | null; mandate_ref?: string | null; mandate_date?: string | null; join_date?: string | null; leave_date?: string | null; notes?: string | null; next_due_date?: string | null }>>([])
    const [total, setTotal] = useState(0)
    const [limit, setLimit] = useState(50)
    const [offset, setOffset] = useState(0)
    const [busy, setBusy] = useState(false)
    const [showPayments, setShowPayments] = useState(false)
    const [form, setForm] = useState<null | { mode: 'create' | 'edit'; draft: { id?: number; memberNo?: string | null; name: string; email?: string | null; phone?: string | null; address?: string | null; status?: 'ACTIVE'|'NEW'|'PAUSED'|'LEFT'; boardRole?: 'V1'|'V2'|'KASSIER'|'KASSENPR1'|'KASSENPR2'|'SCHRIFT' | null;
        iban?: string | null; bic?: string | null; contribution_amount?: number | null; contribution_interval?: 'MONTHLY'|'QUARTERLY'|'YEARLY' | null;
        mandate_ref?: string | null; mandate_date?: string | null; join_date?: string | null; leave_date?: string | null; notes?: string | null; next_due_date?: string | null; } }>(null)
    const [deleteConfirm, setDeleteConfirm] = useState<null | { id: number; label: string }>(null)
    const [deleteBusy, setDeleteBusy] = useState(false)
    const [boardRoleError, setBoardRoleError] = useState<string | null>(null)
    const [showInvite, setShowInvite] = useState(false)
    const [inviteBusy, setInviteBusy] = useState(false)
    const [inviteEmails, setInviteEmails] = useState<string[]>([])
    const [inviteSubject, setInviteSubject] = useState<string>(() => { try { return localStorage.getItem('invite.subject') || 'Einladung zur Sitzung' } catch { return 'Einladung zur Sitzung' } })
    const [inviteBody, setInviteBody] = useState<string>(() => { try { return localStorage.getItem('invite.body') || 'Hallo zusammen,\n\nwir laden euch zur Sitzung ein.\n\nViele Grüße' } catch { return 'Hallo zusammen,\n\nwir laden euch zur Sitzung ein.\n\nViele Grüße' } })
    const [inviteActiveOnly, setInviteActiveOnly] = useState<boolean>(() => { try { return localStorage.getItem('invite.activeOnly') === '1' } catch { return false } })
    useEffect(() => { try { localStorage.setItem('invite.subject', inviteSubject) } catch {} }, [inviteSubject])
    useEffect(() => { try { localStorage.setItem('invite.body', inviteBody) } catch {} }, [inviteBody])
    useEffect(() => { try { localStorage.setItem('invite.activeOnly', inviteActiveOnly ? '1' : '0') } catch {} }, [inviteActiveOnly])

    const [showColumnsModal, setShowColumnsModal] = useState(false)
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
        try { window.addEventListener('data-changed', onChanged) } catch {}
        return () => { alive = false; try { window.removeEventListener('data-changed', onChanged) } catch {} }
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
    function nextDuePreview(amount?: number | null, interval?: 'MONTHLY'|'QUARTERLY'|'YEARLY' | null, anchor?: string | null): string | null {
        if (!amount || !interval) return null
        let d = anchor ? new Date(anchor) : new Date()
        if (isNaN(d.getTime())) d = new Date()
        const add = interval === 'MONTHLY' ? 1 : interval === 'QUARTERLY' ? 3 : 12
        d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + add, 1))
        const iso = d.toISOString().slice(0, 10)
        return `${interval === 'MONTHLY' ? 'Monatlich' : interval === 'QUARTERLY' ? 'Quartal' : 'Jährlich'}: ${eurFmt.format(amount)} → Initiale Fälligkeit ca. ${iso}`
    }

    const [requiredTouched, setRequiredTouched] = useState(false)
    const [missingRequired, setMissingRequired] = useState<string[]>([])

    const [addrStreet, setAddrStreet] = useState<string>('')
    const [addrZip, setAddrZip] = useState<string>('')
    const [addrCity, setAddrCity] = useState<string>('')
    useEffect(() => {
        if (!form) return
        const a = (form.draft.address || '').trim()
        const m = /^(.*?)(?:,\s*)?(\d{4,5})?\s*([^,]*)$/.exec(a)
        if (m) { setAddrStreet(m[1]?.trim() || ''); setAddrZip(m[2]?.trim() || ''); setAddrCity(m[3]?.trim() || '') }
        else { setAddrStreet(a); setAddrZip(''); setAddrCity('') }
    }, [form?.draft.address])

    async function load() {
        setBusy(true)
        try {
            const res = await (window as any).api?.members?.list?.({ q: q || undefined, status, limit, offset, sortBy, sort })
            setRows(res?.rows || []); setTotal(res?.total || 0)
        } catch (e: any) {
            console.error('members.list failed', e)
        } finally { setBusy(false) }
    }
    useEffect(() => { load() }, [q, status, limit, offset, sortBy, sort])
    useEffect(() => {
        if (!showInvite) return
        let alive = true
        ;(async () => {
            setInviteBusy(true)
            try {
                const pageSize = 200
                let ofs = 0
                let emails: string[] = []
                let totalCount = 0
                do {
                    const effectiveStatus = inviteActiveOnly ? 'ACTIVE' : status
                    const res = await (window as any).api?.members?.list?.({ q: q || undefined, status: effectiveStatus, limit: pageSize, offset: ofs })
                    const rows = res?.rows || []
                    totalCount = res?.total || rows.length
                    emails = emails.concat(rows.map((r: any) => String(r.email || '').trim()).filter((e: string) => !!e && /@/.test(e)))
                    ofs += pageSize
                } while (ofs < totalCount)
                const seen = new Set<string>()
                const unique = emails.filter(e => { const k = e.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
                if (alive) setInviteEmails(unique)
            } catch { if (alive) setInviteEmails([]) }
            finally { if (alive) setInviteBusy(false) }
        })()
        return () => { alive = false }
    }, [showInvite, q, status, inviteActiveOnly])

    useEffect(() => {
        if (!form) return
        // Keyboard shortcuts: Ctrl+S to save, Esc to close
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') { setForm(null); e.preventDefault(); return }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault()
                // Trigger save
                ;(async () => {
                    try {
                        setRequiredTouched(true)
                        const missing: string[] = []
                        if (!form.draft.name || !form.draft.name.trim()) missing.push('Name')
                        if (form.mode === 'create') {
                            if (!form.draft.memberNo || !String(form.draft.memberNo).trim()) missing.push('Mitglieds-Nr.')
                            if (!form.draft.join_date || !String(form.draft.join_date).trim()) missing.push('Eintritt')
                        }
                        if (missing.length) { setMissingRequired(missing); return }
                        
                        // Check for duplicate board roles
                        setBoardRoleError(null)
                        if (form.draft.boardRole) {
                            // Load all members in batches (max 200 per request)
                            const allMembers: any[] = []
                            let offset = 0
                            const pageSize = 200
                            let hasMore = true
                            while (hasMore) {
                                const batch = await (window as any).api?.members?.list?.({ limit: pageSize, offset })
                                const rows = batch?.rows || []
                                allMembers.push(...rows)
                                hasMore = rows.length === pageSize
                                offset += pageSize
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
                        setForm(null); setRequiredTouched(false); setMissingRequired([]); await load()
                        window.dispatchEvent(new Event('data-changed'))
                    } catch (e: any) { alert(e?.message || String(e)) }
                })()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [form?.mode, form?.draft, addrStreet, addrZip, addrCity])

    const pages = Math.max(1, Math.ceil(total / Math.max(1, limit)))
    const page = Math.floor(offset / Math.max(1, limit)) + 1

    return (
        <div className="card members-header">
            <div className="members-header-top">
                <div className="members-header-left">
                    <h1 className="members-title">Mitglieder</h1>
                    <input className="input members-search" placeholder="Suche (Name, E-Mail, Tel., Nr.)" value={q} onChange={(e) => { setOffset(0); setQ(e.target.value) }} />
                    <select className="input" value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value as any) }}>
                        <option value="ALL">Alle</option>
                        <option value="ACTIVE">Aktiv</option>
                        <option value="NEW">Neu</option>
                        <option value="PAUSED">Pause</option>
                        <option value="LEFT">Ausgetreten</option>
                    </select>
                    <button className="btn ghost" title="Anzuzeigende Spalten wählen" onClick={() => setShowColumnsModal(true)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
                    </button>
                    {(() => { const hasFilters = !!(q.trim() || status !== 'ALL'); return hasFilters ? (
                        <button className="btn btn-accent" onClick={() => { setQ(''); setStatus('ALL'); setOffset(0) }} title="Filter zurücksetzen">✕</button>
                    ) : null })()}
                </div>
                <div className="members-header-right">
                    <div className="helper">{busy ? <LoadingState size="small" message="" /> : `Seite ${page}/${pages} – ${total} Einträge`}</div>
                    <button className="btn" title="Alle gefilterten Mitglieder per E-Mail einladen" onClick={() => setShowInvite(true)}>✉ Einladen (E-Mail)</button>
                    <button className="btn btn-accent" onClick={() => { setRequiredTouched(false); setMissingRequired([]); setAddrStreet(''); setAddrZip(''); setAddrCity(''); setForm({ mode: 'create', draft: {
                        name: '', status: 'ACTIVE', boardRole: null, memberNo: null, email: null, phone: null, address: null,
                        iban: null, bic: null, contribution_amount: null, contribution_interval: null,
                        mandate_ref: null, mandate_date: null, join_date: null, leave_date: null, notes: null, next_due_date: null
                    } }) }}>+ Neu</button>
                </div>
            </div>
            <div className="card members-board-card">
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
                )}
            </div>
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
                            {colPrefs.showContribution && (<td align="right">{r.contribution_amount != null ? eurFmt.format(r.contribution_amount) : '—'}</td>)}
                            <td>{(() => { const s = String(r.status || '').toUpperCase(); const c = (s === 'ACTIVE') ? '#00C853' : (s === 'LEFT') ? 'var(--danger)' : '#FFD600'; return (
                                <span title={s} aria-label={`Status: ${s}`} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c }} />
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
                                } })}>✎</button>
                            </td>
                        </tr>
                    ))}
                    {rows.length === 0 && (() => { const base = 6; const colSpan = base + (colPrefs.showAddress ? 1 : 0) + (colPrefs.showIBAN ? 1 : 0) + (colPrefs.showContribution ? 1 : 0) + (colPrefs.showNotes ? 1 : 0); return (
                        <tr><td colSpan={colSpan}><div className="helper">Keine Einträge</div></td></tr>
                    )})()}
                </tbody>
            </table>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                <div className="helper">{total} Einträge</div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn" onClick={() => setOffset(0)} disabled={offset <= 0} title="Erste">«</button>
                    <button className="btn" onClick={() => setOffset(v => Math.max(0, v - limit))} disabled={offset <= 0} title="Zurück">‹</button>
                    <button className="btn" onClick={() => setOffset(v => (v + limit < total ? v + limit : v))} disabled={offset + limit >= total} title="Weiter">›</button>
                </div>
            </div>

            {form && (
                <div className="modal-overlay" onClick={() => setForm(null)}>
                    <div className="modal member-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                            <h2 style={{ margin: 0 }}>{form.mode === 'create' ? 'Mitglied anlegen' : 'Mitglied bearbeiten'}</h2>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <span className="badge" title="Status" style={{ background: (form.draft.status === 'ACTIVE' ? '#00C853' : form.draft.status === 'NEW' ? '#2196F3' : form.draft.status === 'PAUSED' ? '#FF9800' : 'var(--danger)'), color: '#fff' }}>{form.draft.status || '—'}</span>
                                <button className="btn ghost" onClick={() => setForm(null)} aria-label="Schließen (ESC)" title="Schließen (ESC)">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                                    </svg>
                                </button>
                            </div>
                        </header>

                        {/* Two-column layout with all fields visible */}
                        <div className="block-grid" style={{ marginTop: 12, gap: 8 }}>
                            {/* Left column: Basis */}
                            <div className="card" style={{ padding: 12 }}>
                                <div className="helper" style={{ marginBottom: 8 }}>Basis</div>
                                <div className="row">
                                    <div className="field">
                                        <label>Mitglieds-Nr. <span style={{ color: 'var(--danger)' }} title="Pflichtfeld">*</span></label>
                                        <input className="input" placeholder="z.B. 12345" value={form.draft.memberNo ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, memberNo: e.target.value || null } })} style={requiredTouched && (!form.draft.memberNo || !String(form.draft.memberNo).trim()) ? { borderColor: 'var(--danger)' } : undefined} />
                                        {requiredTouched && (!form.draft.memberNo || !String(form.draft.memberNo).trim()) && (<div className="helper" style={{ color: 'var(--danger)' }}>Pflichtfeld</div>)}
                                    </div>
                                    <div className="field">
                                        <label>Name <span style={{ color: 'var(--danger)' }} title="Pflichtfeld">*</span></label>
                                        <input className="input" placeholder="Max Mustermann" value={form.draft.name} onChange={(e) => setForm({ ...form, draft: { ...form.draft, name: e.target.value } })} style={requiredTouched && (!form.draft.name || !form.draft.name.trim()) ? { borderColor: 'var(--danger)' } : undefined} />
                                        {requiredTouched && (!form.draft.name || !form.draft.name.trim()) && (<div className="helper" style={{ color: 'var(--danger)' }}>Pflichtfeld</div>)}
                                    </div>
                                    <div className="field"><label>E-Mail</label><input className="input" type="email" placeholder="max@example.org" value={form.draft.email ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, email: e.target.value || null } })} /></div>
                                    <div className="field"><label>Telefon</label><input className="input" type="tel" inputMode="numeric" placeholder="0123 4567890" value={form.draft.phone ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, phone: e.target.value.replace(/[^0-9\s\-\+]/g, '') || null } })} /></div>
                                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                                        <label>Adresse</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 70px 1fr', gap: 6 }}>
                                            <input className="input" placeholder="Straße und Nr." value={addrStreet} onChange={(e) => setAddrStreet(e.target.value)} />
                                            <input className="input" inputMode="numeric" placeholder="PLZ" value={addrZip} onChange={(e) => setAddrZip(e.target.value.replace(/[^0-9]/g, ''))} maxLength={5} />
                                            <input className="input" placeholder="Ort" value={addrCity} onChange={(e) => setAddrCity(e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right column: Mitgliedschaft + Anmerkungen */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div className="card" style={{ padding: 12 }}>
                                    <div className="helper" style={{ marginBottom: 8 }}>Mitgliedschaft</div>
                                    <div className="row">
                                        <div className="field">
                                            <label>Eintritt <span style={{ color: 'var(--danger)' }} title="Pflichtfeld">*</span></label>
                                            <input className="input" type="date" value={form.draft.join_date ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, join_date: e.target.value || null } })} style={requiredTouched && (!form.draft.join_date || !String(form.draft.join_date).trim()) ? { borderColor: 'var(--danger)' } : undefined} />
                                            {requiredTouched && (!form.draft.join_date || !String(form.draft.join_date).trim()) && (<div className="helper" style={{ color: 'var(--danger)' }}>Pflichtfeld</div>)}
                                        </div>
                                        <div className="field"><label>Austritt</label><input className="input" type="date" value={form.draft.leave_date ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, leave_date: e.target.value || null } })} /></div>
                                        <div className="field">
                                            <label>Status</label>
                                            <select className="input" value={form.draft.status ?? 'ACTIVE'} onChange={(e) => setForm({ ...form, draft: { ...form.draft, status: e.target.value as any } })}>
                                                <option value="ACTIVE">Aktiv</option>
                                                <option value="NEW">Neu</option>
                                                <option value="PAUSED">Pause</option>
                                                <option value="LEFT">Ausgetreten</option>
                                            </select>
                                        </div>
                                        <div className="field">
                                            <label>Vorstandsfunktion</label>
                                            <select className="input" value={form.draft.boardRole ?? ''} onChange={(e) => { setBoardRoleError(null); setForm({ ...form, draft: { ...form.draft, boardRole: (e.target.value || null) as any } }) }}>
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
                                    <div className="helper" style={{ marginBottom: 6 }}>Anmerkungen</div>
                                    <textarea className="input" rows={2} placeholder="Freitext …" value={form.draft.notes ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, notes: e.target.value || null } })} style={{ resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
                                </div>
                            </div>
                        </div>

                        {/* Finanzen block - full width, more compact */}
                        <div className="card" style={{ padding: 12, marginTop: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
                                <div className="helper">Finanzen & SEPA-Mandat</div>
                                <div className="helper" style={{ fontSize: '0.85em' }} aria-live="polite">{nextDuePreview(form.draft.contribution_amount ?? null, form.draft.contribution_interval ?? null, form.draft.next_due_date ?? form.draft.mandate_date ?? form.draft.join_date ?? null) || ''}</div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                                {(() => { const v = validateIBAN(form.draft.iban); return (
                                    <div className="field" style={{ gridColumn: 'span 2' }}>
                                        <label title="IBAN mit Prüfziffer">IBAN</label>
                                        <input className="input" placeholder="DE12 3456 7890 1234 5678 90" value={form.draft.iban ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, iban: e.target.value || null } })} style={{ borderColor: v.ok ? undefined : 'var(--danger)' }} />
                                        {!v.ok && <div className="helper" style={{ color: 'var(--danger)' }}>{v.msg}</div>}
                                    </div>
                                ) })()}
                                {(() => { const v = validateBIC(form.draft.bic); return (
                                    <div className="field">
                                        <label title="8 oder 11 Zeichen">BIC</label>
                                        <input className="input" placeholder="BANKDEFFXXX" value={form.draft.bic ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, bic: e.target.value || null } })} style={{ borderColor: v.ok ? undefined : 'var(--danger)' }} />
                                        {!v.ok && <div className="helper" style={{ color: 'var(--danger)' }}>{v.msg}</div>}
                                    </div>
                                ) })()}
                                <div className="field">
                                    <label>Mandats-Ref.</label>
                                    <input className="input" placeholder="M-2025-001" value={form.draft.mandate_ref ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, mandate_ref: e.target.value || null } })} />
                                </div>
                                <div className="field">
                                    <label>Beitrag (EUR)</label>
                                    <input className="input" type="number" step="0.01" placeholder="z.B. 12,00" value={form.draft.contribution_amount ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, contribution_amount: e.target.value ? Number(e.target.value) : null } })} />
                                </div>
                                <div className="field">
                                    <label>Intervall</label>
                                    <select className="input" value={form.draft.contribution_interval ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, contribution_interval: (e.target.value || null) as any } })}>
                                        <option value="">—</option>
                                        <option value="MONTHLY">Monatlich</option>
                                        <option value="QUARTERLY">Quartal</option>
                                        <option value="YEARLY">Jährlich</option>
                                    </select>
                                </div>
                                <div className="field">
                                    <label>Mandats-Datum</label>
                                    <input className="input" type="date" value={form.draft.mandate_date ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, mandate_date: e.target.value || null } })} />
                                </div>
                                <div className="field">
                                    <label>Nächste Fälligkeit</label>
                                    <input className="input" type="date" value={form.draft.next_due_date ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, next_due_date: e.target.value || null } })} />
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 12 }}>
                            <div className="helper">Ctrl+S = Speichern · Esc = Abbrechen</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {form.mode === 'edit' && (
                                    <button className="btn danger modal-delete-btn" onClick={() => {
                                        if (!form?.draft?.id) return
                                        const label = `${form.draft.name}${form.draft.memberNo ? ` (${form.draft.memberNo})` : ''}`
                                        setDeleteConfirm({ id: form.draft.id, label })
                                    }}>🗑 Löschen</button>
                                )}
                                <button className="btn" onClick={() => setForm(null)}>Abbrechen</button>
                                <button className="btn primary" onClick={async () => {
                                try {
                                    setRequiredTouched(true)
                                    const missing: string[] = []
                                    if (!form.draft.name || !form.draft.name.trim()) missing.push('Name')
                                    if (form.mode === 'create') {
                                        if (!form.draft.memberNo || !String(form.draft.memberNo).trim()) missing.push('Mitglieds-Nr.')
                                        if (!form.draft.join_date || !String(form.draft.join_date).trim()) missing.push('Eintritt')
                                    }
                                    if (missing.length) { setMissingRequired(missing); return }
                                    
                                    // Check for duplicate board roles
                                    setBoardRoleError(null)
                                    if (form.draft.boardRole) {
                                        // Load all members in batches (max 200 per request)
                                        const allMembers: any[] = []
                                        let offset = 0
                                        const pageSize = 200
                                        let hasMore = true
                                        while (hasMore) {
                                            const batch = await (window as any).api?.members?.list?.({ limit: pageSize, offset })
                                            const rows = batch?.rows || []
                                            allMembers.push(...rows)
                                            hasMore = rows.length === pageSize
                                            offset += pageSize
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
                                    setForm(null); setRequiredTouched(false); setMissingRequired([]); setBoardRoleError(null); await load()
                                    window.dispatchEvent(new Event('data-changed'))
                                } catch (e: any) { alert(e?.message || String(e)) }
                            }}>Speichern</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showColumnsModal && (
                <div className="modal-overlay" onClick={() => setShowColumnsModal(false)}>
                    <div className="modal" onClick={(e)=>e.stopPropagation()} style={{ maxWidth: 480, display: 'grid', gap: 10 }}>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Spalten auswählen</h3>
                            <button className="btn" onClick={() => setShowColumnsModal(false)}>×</button>
                        </header>
                        <div className="card" style={{ padding: 10 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input type="checkbox" checked={colPrefs.showMemberNo} onChange={(e)=>setColPrefs(p=>({ ...p, showMemberNo: e.target.checked }))} />
                                Nr. anzeigen
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                <input type="checkbox" checked={colPrefs.showIBAN} onChange={(e)=>setColPrefs(p=>({ ...p, showIBAN: e.target.checked }))} />
                                IBAN anzeigen
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                <input type="checkbox" checked={colPrefs.showContribution} onChange={(e)=>setColPrefs(p=>({ ...p, showContribution: e.target.checked }))} />
                                Beitrag anzeigen
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                <input type="checkbox" checked={colPrefs.showAddress} onChange={(e)=>setColPrefs(p=>({ ...p, showAddress: e.target.checked }))} />
                                Adresse anzeigen
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                <input type="checkbox" checked={colPrefs.showNotes} onChange={(e)=>setColPrefs(p=>({ ...p, showNotes: e.target.checked }))} />
                                Anmerkungen anzeigen
                            </label>
                            <div className="helper" style={{ marginTop: 8 }}>Tipp: Du kannst IBAN/Beitrag ausblenden und stattdessen die Adresse anzeigen.</div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn" onClick={() => setShowColumnsModal(false)}>Schließen</button>
                        </div>
                    </div>
                </div>
            )}
            {showInvite && (
                <div className="modal-overlay" onClick={() => setShowInvite(false)}>
                    <div className="modal invite-modal" onClick={(e)=>e.stopPropagation()} style={{ display: 'grid', gap: 10 }}>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Einladung per E-Mail</h3>
                            <button className="btn" onClick={()=>setShowInvite(false)}>×</button>
                        </header>
                        <div className="card" style={{ padding: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <div className="helper">Aktuelle Filter: Status = {status}, Suche = {q ? `"${q}"` : '—'}</div>
                                <label className="helper" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <input type="checkbox" checked={inviteActiveOnly} onChange={(e)=>setInviteActiveOnly(e.target.checked)} />
                                    Nur aktive einladen
                                </label>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                                <div className="field">
                                    <label>Betreff</label>
                                    <input className="input" value={inviteSubject} onChange={(e)=>setInviteSubject(e.target.value)} />
                                </div>
                                <div className="field">
                                    <label>Anzahl Empfänger (BCC)</label>
                                    <input className="input" value={inviteEmails.length || 0} readOnly />
                                </div>
                                <div className="field" style={{ gridColumn: '1 / span 2' }}>
                                    <label>Nachricht</label>
                                    <textarea className="input" rows={6} value={inviteBody} onChange={(e)=>setInviteBody(e.target.value)} style={{ resize: 'vertical' }} />
                                </div>
                                <div className="field" style={{ gridColumn: '1 / span 2' }}>
                                    <label>Empfänger (BCC)</label>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <input className="input" readOnly value={inviteEmails.join('; ')} style={{ flex: 1 }} />
                                        <button className="btn" onClick={async ()=>{ try { await navigator.clipboard.writeText(inviteEmails.join('; ')); alert('E-Mail-Adressen kopiert') } catch { alert('Kopieren nicht möglich') } }}>Kopieren</button>
                                    </div>
                                    <div className="helper">Die Liste basiert auf der aktuellen Ansicht (Filter & Suche) und enthält nur Kontakte mit E-Mail.</div>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="helper">{inviteBusy ? 'Sammle E-Mail-Adressen…' : `${inviteEmails.length} Empfänger gefunden`}</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn" onClick={()=>setShowInvite(false)}>Abbrechen</button>
                                <button className="btn" onClick={async ()=>{ try { await navigator.clipboard.writeText(inviteEmails.join('; ')); alert(`${inviteEmails.length} E-Mail-Adressen kopiert (BCC).`) } catch { alert('Kopieren nicht möglich') } }}>Nur BCC kopieren</button>
                                <button className="btn primary" disabled={!inviteEmails.length} onClick={() => {
                                    const subject = encodeURIComponent(inviteSubject || '')
                                    const body = encodeURIComponent(inviteBody || '')
                                    const bccRaw = inviteEmails.join(',')
                                    const mailto = `mailto:?bcc=${encodeURIComponent(bccRaw)}&subject=${subject}&body=${body}`
                                    if (mailto.length <= 1800 && inviteEmails.length <= 50) {
                                        try { window.location.href = mailto } catch { /* ignore */ }
                                    } else {
                                        (async () => { try { await navigator.clipboard.writeText(inviteEmails.join('; ')); alert(`${inviteEmails.length} E-Mail-Adressen in die Zwischenablage kopiert. Füge sie als BCC in dein E-Mail-Programm ein.`) } catch { alert('Link zu lang – E-Mail-Adressen konnten nicht automatisch kopiert werden.') } })()
                                    }
                                }}>Im Mail-Programm öffnen</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showPayments && (
                <PaymentsAssignModal onClose={() => setShowPayments(false)} />
            )}
            {missingRequired.length > 0 && (
                createPortal(
                    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setMissingRequired([])}>
                        <div className="modal" onClick={(e)=>e.stopPropagation()} style={{ maxWidth: 520, display: 'grid', gap: 10 }}>
                            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0 }}>Pflichtfelder fehlen</h3>
                                <button className="btn" onClick={() => setMissingRequired([])} aria-label="Schließen">×</button>
                            </header>
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
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Mitglied löschen</h3>
                            <button className="btn" onClick={() => setDeleteConfirm(null)}>×</button>
                        </header>
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

function MemberStatusButton({ memberId, name, memberNo }: { memberId: number; name: string; memberNo?: string }) {
    const [open, setOpen] = useState(false)
    const [status, setStatus] = useState<any>(null)
    const [history, setHistory] = useState<any[]>([])
    const [historyPage, setHistoryPage] = useState(1)
    const historyPageSize = 5
    const [memberData, setMemberData] = useState<any>(null)
    const [due, setDue] = useState<Array<{ periodKey: string; interval: 'MONTHLY'|'QUARTERLY'|'YEARLY'; amount: number; paid: number; voucherId?: number|null; verified?: number }>>([])
    const [selVoucherByPeriod, setSelVoucherByPeriod] = useState<Record<string, number | null>>({})
    const [manualListByPeriod, setManualListByPeriod] = useState<Record<string, Array<{ id: number; voucherNo: string; date: string; description?: string|null; counterparty?: string|null; gross: number }>>>({})
    const [searchByPeriod, setSearchByPeriod] = useState<Record<string, string>>({})
    const [duePage, setDuePage] = useState(1)
    const pageSize = 5
    useEffect(() => {
        let alive = true
        async function loadStatusAndBasics() {
            try {
                const s = await (window as any).api?.payments?.status?.({ memberId })
                if (alive) setStatus(s || null)
            } catch { /* noop */ }
        }
        loadStatusAndBasics()
        const onChanged = () => loadStatusAndBasics()
        try { window.addEventListener('data-changed', onChanged) } catch {}
        return () => { alive = false; try { window.removeEventListener('data-changed', onChanged) } catch {} }
    }, [memberId])

    useEffect(() => {
        if (!open) return
        let alive = true
        ;(async () => {
            try {
                const s = await (window as any).api?.payments?.status?.({ memberId })
                const h = await (window as any).api?.payments?.history?.({ memberId, limit: 24 })
                const member = await (window as any).api?.members?.get?.({ id: memberId })
                if (alive) {
                    setStatus(s || null)
                    setMemberData(member || null)
                    setHistory(h?.rows || [])
                    if (s?.interval) {
                        const today = new Date()
                        const from = (s?.nextDue || s?.joinDate || new Date(today.getUTCFullYear(), 0, 1).toISOString().slice(0,10))
                        const to = today.toISOString().slice(0,10)
                        const res = await (window as any).api?.payments?.listDue?.({ interval: s.interval, from, to, memberId, includePaid: false })
                        const rows = (res?.rows || []).filter((r: any) => r.memberId === memberId && !r.paid)
                        setDue(rows.map((r: any) => ({ periodKey: r.periodKey, interval: r.interval, amount: r.amount, paid: r.paid, voucherId: r.voucherId, verified: r.verified })))
                    } else { setDue([]) }
                }
            } catch { }
        })()
        return () => { alive = false }
    }, [open, memberId])
    useEffect(() => { setDuePage(1) }, [due.length])
    useEffect(() => { setHistoryPage(1) }, [history.length])
    useEffect(() => {
        if (!open) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                setOpen(false)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [open])
    const color = status?.state === 'OVERDUE' ? 'var(--danger)' : status?.state === 'OK' ? 'var(--success)' : 'var(--text-dim)'
    return (
        <>
            <button className="btn ghost" title="Beitragsstatus & Historie" aria-label="Beitragsstatus & Historie" onClick={() => setOpen(true)} style={{ marginLeft: 6, width: 24, height: 24, padding: 0, borderRadius: 6, display: 'inline-grid', placeItems: 'center', color }}>
                {/* Money bill SVG icon */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="2" y="6" width="20" height="12" rx="2" fill="currentColor"/>
                    <circle cx="12" cy="12" r="3.2" fill="#fff"/>
                    <rect x="4" y="8" width="2" height="2" rx="1" fill="#fff"/>
                    <rect x="18" y="8" width="2" height="2" rx="1" fill="#fff"/>
                </svg>
            </button>
            {open && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, background: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal" onClick={(e)=>e.stopPropagation()} style={{ width: 'min(96vw, 1000px)', maxWidth: 1000, display: 'grid', gap: 10, margin: '32px auto 0 auto' }}>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Beitragsstatus</h3>
                            <button className="btn" onClick={()=>setOpen(false)}>×</button>
                        </header>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                            <div className="helper" style={{ fontWeight: 600 }}>{name}{memberNo ? ` (${memberNo})` : ''}</div>
                            <span className="helper">•</span>
                            <span className="helper">Eintritt: {status?.joinDate || '—'}</span>
                            <span className="helper">•</span>
                            <span className="helper">Status: {status?.state === 'OVERDUE' ? `Überfällig (${status?.overdue})` : status?.state === 'OK' ? 'OK' : '—'}</span>
                            <span className="helper">•</span>
                            <span className="helper">Letzte Zahlung: {status?.lastPeriod ? `${status.lastPeriod} (${status?.lastDate||''})` : '—'}</span>
                            <span className="helper">•</span>
                            <span className="helper">Initiale Fälligkeit: {status?.nextDue || '—'}</span>
                        </div>
                        <MemberTimeline status={status} history={history} />
                        <div className="card" style={{ padding: 10 }}>
                            <strong>Fällige Beiträge</strong>
                            {due.length === 0 ? (
                                <div className="helper" style={{ marginTop: 6 }}>Aktuell keine offenen Perioden.</div>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                                        <div className="helper">Seite {duePage} von {Math.max(1, Math.ceil(due.length / pageSize))} — {due.length} offen</div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn" onClick={() => setDuePage(1)} disabled={duePage <= 1} style={duePage <= 1 ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>«</button>
                                            <button className="btn" onClick={() => setDuePage(p => Math.max(1, p - 1))} disabled={duePage <= 1} style={duePage <= 1 ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>‹</button>
                                            <button className="btn" onClick={() => setDuePage(p => Math.min(Math.max(1, Math.ceil(due.length / pageSize)), p + 1))} disabled={duePage >= Math.max(1, Math.ceil(due.length / pageSize))} style={duePage >= Math.max(1, Math.ceil(due.length / pageSize)) ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>›</button>
                                            <button className="btn" onClick={() => setDuePage(Math.max(1, Math.ceil(due.length / pageSize)))} disabled={duePage >= Math.max(1, Math.ceil(due.length / pageSize))} style={duePage >= Math.max(1, Math.ceil(due.length / pageSize)) ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>»</button>
                                        </div>
                                    </div>
                                    <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                                        <thead>
                                            <tr>
                                                <th align="left">Periode</th>
                                                <th align="right">Betrag</th>
                                                <th align="left">Verknüpfen</th>
                                                <th align="left">Aktion</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {due.slice((duePage-1)*pageSize, duePage*pageSize).map((r) => {
                                                const selVoucher = selVoucherByPeriod[r.periodKey] ?? null
                                                const manualList = manualListByPeriod[r.periodKey] || []
                                                const search = searchByPeriod[r.periodKey] || ''
                                                return (
                                                    <tr key={r.periodKey}>
                                                        <td>{r.periodKey}</td>
                                                        <td align="right">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(r.amount)}</td>
                                                        <td>
                                                            <div style={{ display: 'grid', gap: 6 }}>
                                                                <select className="input" value={selVoucher ?? ''} onChange={e => setSelVoucherByPeriod(prev => ({ ...prev, [r.periodKey]: e.target.value ? Number(e.target.value) : null }))} title="Passende Buchung verknüpfen">
                                                                    <option value="">— ohne Verknüpfung —</option>
                                                                    {manualList.map(s => (
                                                                        <option key={`m-${s.id}`} value={s.id}>{s.voucherNo || s.id} · {s.date} · {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(s.gross)} · {(s.description || s.counterparty || '')}</option>
                                                                    ))}
                                                                </select>
                                                                <div style={{ display: 'flex', gap: 6 }}>
                                                                    <input className="input" placeholder="Buchung suchen…" value={search} onChange={e => setSearchByPeriod(prev => ({ ...prev, [r.periodKey]: e.target.value }))} title="Suche in Buchungen (Betrag/Datum/Text)" />
                                                                    <button className="btn" onClick={async () => {
                                                                        try {
                                                                            const { start } = periodRangeLocal(r.periodKey)
                                                                            const s = new Date(start); s.setUTCDate(s.getUTCDate() - 90)
                                                                            const todayISO = new Date().toISOString().slice(0,10)
                                                                            const fromISO = s.toISOString().slice(0,10)
                                                                            const res = await (window as any).api?.vouchers?.list?.({ from: fromISO, to: todayISO, q: search || undefined, limit: 50 })
                                                                            const list = (res?.rows || []).map((v: any) => ({ id: v.id, voucherNo: v.voucherNo, date: v.date, description: v.description, counterparty: v.counterparty, gross: v.grossAmount }))
                                                                            setManualListByPeriod(prev => ({ ...prev, [r.periodKey]: list }))
                                                                        } catch {}
                                                                    }}>Suchen</button>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <button className="btn primary" onClick={async () => {
                                                                try {
                                                                    await (window as any).api?.payments?.markPaid?.({ memberId, periodKey: r.periodKey, interval: r.interval, amount: r.amount, voucherId: selVoucher || null })
                                                                    const s = await (window as any).api?.payments?.status?.({ memberId })
                                                                    const h = await (window as any).api?.payments?.history?.({ memberId, limit: 24 })
                                                                    setStatus(s || null)
                                                                    setHistory(h?.rows || [])
                                                                    const nextDueList = due.filter((d) => d.periodKey !== r.periodKey)
                                                                    setDue(nextDueList)
                                                                    setSelVoucherByPeriod(prev => { const { [r.periodKey]: _, ...rest } = prev; return rest })
                                                                    setManualListByPeriod(prev => { const { [r.periodKey]: _, ...rest } = prev; return rest })
                                                                    setSearchByPeriod(prev => { const { [r.periodKey]: _, ...rest } = prev; return rest })
                                                                    const newTotalPages = Math.max(1, Math.ceil(nextDueList.length / pageSize))
                                                                    setDuePage(p => Math.min(p, newTotalPages))
                                                                    window.dispatchEvent(new Event('data-changed'))
                                                                } catch (e: any) { alert(e?.message || String(e)) }
                                                            }}>Bezahlen</button>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
                            <button className="btn primary" onClick={async ()=>{
                                try {
                                    const addr = memberData?.address || null
                                    const res = await (window as any).api?.members?.writeLetter?.({ id: memberId, name, address: addr, memberNo })
                                    if (!(res?.ok)) alert(res?.error || 'Konnte Brief nicht öffnen')
                                } catch (e: any) { alert(e?.message || String(e)) }
                            }}>Mitglied anschreiben</button>
                        </div>
                        <div className="card" style={{ padding: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong>Historie</strong>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button className="btn" onClick={() => setHistoryPage(1)} disabled={historyPage <= 1} style={historyPage <= 1 ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>«</button>
                                    <button className="btn" onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage <= 1} style={historyPage <= 1 ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>‹</button>
                                    <button className="btn" onClick={() => setHistoryPage(p => Math.min(Math.max(1, Math.ceil(history.length / historyPageSize)), p + 1))} disabled={historyPage >= Math.max(1, Math.ceil(history.length / historyPageSize))} style={historyPage >= Math.max(1, Math.ceil(history.length / historyPageSize)) ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>›</button>
                                    <button className="btn" onClick={() => setHistoryPage(Math.max(1, Math.ceil(history.length / historyPageSize)))} disabled={historyPage >= Math.max(1, Math.ceil(history.length / historyPageSize))} style={historyPage >= Math.max(1, Math.ceil(history.length / historyPageSize)) ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>»</button>
                                </div>
                            </div>
                            <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                                <thead>
                                    <tr>
                                        <th align="left">Periode</th>
                                        <th align="left">Datum</th>
                                        <th align="right">Betrag</th>
                                        <th align="left">Beleg</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.slice((historyPage-1)*historyPageSize, historyPage*historyPageSize).map((r,i)=> (
                                        <tr key={i+(historyPage-1)*historyPageSize}>
                                            <td>{r.periodKey}</td>
                                            <td>{r.datePaid}</td>
                                            <td align="right">{new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(r.amount)}</td>
                                            <td>{r.voucherNo ? `#${r.voucherNo}` : '—'} {r.description ? `· ${r.description}` : ''}</td>
                                        </tr>
                                    ))}
                                    {history.length===0 && <tr><td colSpan={4}><div className="helper">Keine Zahlungen</div></td></tr>}
                                </tbody>
                            </table>
                            <div className="helper" style={{ marginTop: 6, textAlign: 'right' }}>Seite {historyPage} von {Math.max(1, Math.ceil(history.length / historyPageSize))} – {history.length} Einträge</div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                            <div className="helper">Esc = Abbrechen</div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

function MemberTimeline({ status, history }: { status: any; history: Array<{ periodKey: string; datePaid: string; amount: number }> }) {
    const interval: 'MONTHLY'|'QUARTERLY'|'YEARLY' = status?.interval || 'MONTHLY'
    const today = new Date()
    const currentKey = (() => {
        const y = today.getUTCFullYear(); const m = today.getUTCMonth()+1
        if (interval==='MONTHLY') return `${y}-${String(m).padStart(2,'0')}`
        if (interval==='QUARTERLY') return `${y}-Q${Math.floor((m-1)/3)+1}`
        return String(y)
    })()
    function prevKeyLocal(key: string): string {
        const [yStr, rest] = key.split('-'); const y = Number(yStr)
        if (/^Q\d$/.test(rest||'')) { const q = Number((rest||'Q1').slice(1)); if (q>1) return `${y}-Q${q-1}`; return `${y-1}-Q4` }
        if (rest) { const m = Number(rest); if (m>1) return `${y}-${String(m-1).padStart(2,'0')}`; return `${y-1}-12` }
        return String(y-1)
    }
    function nextKeyLocal(key: string): string {
        const [yStr, rest] = key.split('-'); const y = Number(yStr)
        if (/^Q\d$/.test(rest||'')) { const q = Number((rest||'Q1').slice(1)); if (q<4) return `${y}-Q${q+1}`; return `${y+1}-Q1` }
        if (rest) { const m = Number(rest); if (m<12) return `${y}-${String(m+1).padStart(2,'0')}`; return `${y+1}-01` }
        return String(y+1)
    }
    function compareKeysLocal(a: string, b: string): number {
        if (interval === 'MONTHLY') {
            const [ay, am] = a.split('-'); const [by, bm] = b.split('-')
            const ai = Number(ay)*12 + Number(am)
            const bi = Number(by)*12 + Number(bm)
            return ai === bi ? 0 : (ai < bi ? -1 : 1)
        }
        if (interval === 'QUARTERLY') {
            const [ay, aqS] = a.split('-'); const [by, bqS] = b.split('-')
            const aq = Number((aqS||'Q1').replace('Q','')); const bq = Number((bqS||'Q1').replace('Q',''))
            const ai = Number(ay)*4 + aq
            const bi = Number(by)*4 + bq
            return ai === bi ? 0 : (ai < bi ? -1 : 1)
        }
        const ai = Number(a); const bi = Number(b)
        return ai === bi ? 0 : (ai < bi ? -1 : 1)
    }
    function periodKeyFromDateLocal(d: Date): string { return (interval==='MONTHLY' ? `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}` : interval==='QUARTERLY' ? `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth()/3)+1}` : String(d.getUTCFullYear())) }
    const joinKey = (() => { try { if (!status?.joinDate) return null; const jd = new Date(status.joinDate); if (isNaN(jd.getTime())) return null; return periodKeyFromDateLocal(jd) } catch { return null } })()
    const pastCount = interval==='QUARTERLY' ? 2 : 5
    const futureCount = 3
    const startFromCurrent = (() => { let k = currentKey; for (let i=0;i<pastCount;i++) k = prevKeyLocal(k); return k })()
    let startKey = startFromCurrent
    if (joinKey && compareKeysLocal(joinKey, startKey) > 0) startKey = joinKey
    const firstDueKeyForClamp = (() => {
        if (status?.nextDue) { try { return periodKeyFromDateLocal(new Date(status.nextDue)) } catch { /* ignore */ } }
        return null
    })()
    if (firstDueKeyForClamp && compareKeysLocal(firstDueKeyForClamp, startKey) > 0) startKey = firstDueKeyForClamp
    const forward = futureCount
    let endKey = currentKey
    for (let i=0;i<forward;i++){ endKey = nextKeyLocal(endKey) }
    const keys: string[] = []
    let k = startKey
    keys.push(k)
    while (compareKeysLocal(k, endKey) < 0) { k = nextKeyLocal(k); keys.push(k) }
    const paidSet = new Set((history||[]).map(h=>h.periodKey))
    const nextDue = status?.nextDue || null
    const firstDueKey = (() => {
        if (nextDue) {
            try { const d = new Date(nextDue); return periodKeyFromDateLocal(d) } catch { /* ignore */ }
        }
        return currentKey
    })()
    return (
        <div className="card" style={{ padding: 10 }}>
            <strong>Zeitstrahl</strong>
            <div style={{ marginTop: 8, overflowX: 'auto' }}>
                <svg width={Math.max(640, keys.length*56)} height={58} role="img" aria-label="Zeitstrahl Zahlungen">
                    <line x1={12} y1={28} x2={Math.max(640, keys.length*56)-12} y2={28} stroke="var(--border)" strokeWidth={2} />
                    {keys.map((pk, i) => {
                        const x = 28 + i*56
                        const isCurrent = pk===currentKey
                        const isPaid = paidSet.has(pk)
                        const isBeforeOrEqCurrent = compareKeysLocal(pk, currentKey) <= 0
                        const isOnOrAfterFirstDue = compareKeysLocal(pk, firstDueKey) >= 0
                        const isOverdue = !isPaid && isBeforeOrEqCurrent && isOnOrAfterFirstDue
                        const color = isPaid ? 'var(--success)' : (isOverdue ? 'var(--danger)' : (isCurrent ? 'var(--warning)' : 'var(--muted)'))
                        return (
                            <g key={pk}>
                                <circle cx={x} cy={28} r={6} fill={color}>
                                    <title>{`${pk} · ${isPaid ? 'bezahlt' : (isOverdue ? 'überfällig' : (isCurrent ? 'aktuell' : 'offen'))}`}</title>
                                </circle>
                                <text x={x} y={12} textAnchor="middle" fontSize={10} fill="var(--text-dim)">{pk}</text>
                                <text x={x} y={50} textAnchor="middle" fontSize={10} fill={isPaid ? 'var(--success)' : (isOverdue ? 'var(--danger)' : 'var(--text-dim)')}>
                                    {isPaid ? 'bezahlt' : (isOverdue ? 'überfällig' : (isCurrent ? 'jetzt' : ''))}
                                </text>
                            </g>
                        )
                    })}
                </svg>
            </div>
        </div>
    )
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

function PaymentsRow({ row, onChanged }: { row: { memberId: number; name: string; memberNo?: string|null; status: string; periodKey: string; interval: 'MONTHLY'|'QUARTERLY'|'YEARLY'; amount: number; paid: number; voucherId?: number|null; verified?: number }; onChanged: () => void }) {
    const [suggestions, setSuggestions] = useState<Array<{ id: number; voucherNo: string; date: string; description?: string|null; counterparty?: string|null; gross: number }>>([])
    const [selVoucher, setSelVoucher] = useState<number | null>(row.voucherId ?? null)
    const [busy, setBusy] = useState(false)
    const [search, setSearch] = useState('')
    const [manualList, setManualList] = useState<Array<{ id: number; voucherNo: string; date: string; description?: string|null; counterparty?: string|null; gross: number }>>([])
    const [showStatus, setShowStatus] = useState(false)
    const [statusData, setStatusData] = useState<any>(null)
    const [historyRows, setHistoryRows] = useState<any[]>([])
    useEffect(() => {
        let alive = true
        async function loadStatus() {
            try { const s = await (window as any).api?.payments?.status?.({ memberId: row.memberId }); if (alive) setStatusData(s || null) } catch { }
        }
        loadStatus()
        const onChanged = () => loadStatus()
        try { window.addEventListener('data-changed', onChanged) } catch {}
        return () => { alive = false; try { window.removeEventListener('data-changed', onChanged) } catch {} }
    }, [row.memberId])

    useEffect(() => {
        if (!showStatus) return
        let alive = true
        ;(async () => {
            try {
                const s = await (window as any).api?.payments?.status?.({ memberId: row.memberId })
                const h = await (window as any).api?.payments?.history?.({ memberId: row.memberId, limit: 20 })
                if (alive) { setStatusData(s || null); setHistoryRows(h?.rows || []) }
            } catch { /* ignore */ }
        })()
        return () => { alive = false }
    }, [showStatus, row.memberId])

    useEffect(() => {
        let active = true
        ;(async () => {
            try {
                const res = await (window as any).api?.payments?.suggestVouchers?.({ name: row.name, amount: row.amount, periodKey: row.periodKey })
                if (active) setSuggestions(res?.rows || [])
            } catch { /* ignore */ }
        })()
        return () => { active = false }
    }, [row.memberId, row.periodKey, row.amount])

    const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
    return (
        <tr>
            <td title={row.memberNo || undefined}>
                <span>{row.name}{row.memberNo ? ` (${row.memberNo})` : ''}</span>
                <button
                    className="btn ghost"
                    title="Beitragsstatus & Historie"
                    aria-label="Beitragsstatus & Historie"
                    onClick={() => setShowStatus(true)}
                    style={{ marginLeft: 6, width: 24, height: 24, padding: 0, borderRadius: 6, display: 'inline-grid', placeItems: 'center', color: (statusData?.state === 'OVERDUE' ? 'var(--danger)' : statusData?.state === 'OK' ? 'var(--success)' : 'var(--text-dim)') }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3zm1 5h-2v6h6v-2h-4V8z"/></svg>
                </button>
                {showStatus && (
                    <div className="modal-overlay" onClick={() => setShowStatus(false)}>
                        <div className="modal" onClick={(e)=>e.stopPropagation()} style={{ width: 'min(96vw, 1100px)', maxWidth: 1100, display: 'grid', gap: 10 }}>
                            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0 }}>Beitragsstatus</h3>
                                <button className="btn" onClick={()=>setShowStatus(false)}>×</button>
                            </header>
                            <div className="helper" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <span>{row.name}{row.memberNo ? ` (${row.memberNo})` : ''}</span>
                                <span className="badge" style={{ background: (statusData?.state === 'OVERDUE' ? 'var(--danger)' : statusData?.state === 'OK' ? 'var(--success)' : 'var(--muted)'), color: '#fff' }}>
                                    {statusData?.state === 'OVERDUE' ? `Überfällig (${statusData?.overdue})` : statusData?.state === 'OK' ? 'OK' : '—'}
                                </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div className="card" style={{ padding: 10 }}>
                                    <strong>Überblick</strong>
                                    <ul style={{ margin: '6px 0 0 16px' }}>
                                        <li>Eintritt: {statusData?.joinDate || '—'}</li>
                                        <li>Letzte Zahlung: {statusData?.lastPeriod ? `${statusData.lastPeriod} (${statusData?.lastDate||''})` : '—'}</li>
                                        <li>Initiale Fälligkeit: {statusData?.nextDue || '—'}</li>
                                    </ul>
                                </div>
                                <div className="card" style={{ padding: 10 }}>
                                    <strong>Historie</strong>
                                    <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                                        <thead>
                                            <tr>
                                                <th align="left">Periode</th>
                                                <th align="left">Datum</th>
                                                <th align="right">Betrag</th>
                                                <th align="left">Beleg</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {historyRows.map((r,i)=> (
                                                <tr key={i}>
                                                    <td>{r.periodKey}</td>
                                                    <td>{r.datePaid}</td>
                                                    <td align="right">{eur.format(r.amount)}</td>
                                                    <td>
                                                        {r.voucherNo ? (
                                                            <a href="#" onClick={(e)=>{ e.preventDefault(); if (r.voucherId) { const ev = new CustomEvent('apply-voucher-jump', { detail: { voucherId: r.voucherId } }); window.dispatchEvent(ev) } }}>{`#${r.voucherNo}`}</a>
                                                        ) : '—'}
                                                        {r.description ? ` · ${r.description}` : ''}
                                                    </td>
                                                </tr>
                                            ))}
                                            {historyRows.length===0 && <tr><td colSpan={4}><div className="helper">Keine Zahlungen</div></td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                                <button className="btn" onClick={()=>setShowStatus(false)}>Schließen</button>
                            </div>
                        </div>
                    </div>
                )}
            </td>
            <td>{row.periodKey}</td>
            <td>{row.interval}</td>
            <td align="right">{eur.format(row.amount)}</td>
            <td>
                <div style={{ display: 'grid', gap: 6 }}>
                    <select className="input" value={selVoucher ?? ''} onChange={e => setSelVoucher(e.target.value ? Number(e.target.value) : null)} title="Passende Buchung verknüpfen">
                        <option value="">— ohne Verknüpfung —</option>
                        {suggestions.map(s => (
                            <option key={s.id} value={s.id}>{s.voucherNo || s.id} · {s.date} · {eur.format(s.gross)} · {(s.description || s.counterparty || '')}</option>
                        ))}
                        {manualList.map(s => (
                            <option key={`m-${s.id}`} value={s.id}>{s.voucherNo || s.id} · {s.date} · {eur.format(s.gross)} · {(s.description || s.counterparty || '')}</option>
                        ))}
                    </select>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <input className="input" placeholder="Buchung suchen…" value={search} onChange={e => setSearch(e.target.value)} title="Suche in Buchungen (Betrag/Datum/Text)" />
                        <button className="btn" onClick={async () => {
                            try {
                                const { start } = periodRangeLocal(row.periodKey)
                                const s = new Date(start); s.setUTCDate(s.getUTCDate() - 90)
                                const todayISO = new Date().toISOString().slice(0,10)
                                const fromISO = s.toISOString().slice(0,10)
                                const res = await (window as any).api?.vouchers?.list?.({ from: fromISO, to: todayISO, q: search || undefined, limit: 50 })
                                const list = (res?.rows || []).map((v: any) => ({ id: v.id, voucherNo: v.voucherNo, date: v.date, description: v.description, counterparty: v.counterparty, gross: v.grossAmount }))
                                setManualList(list)
                            } catch {}
                        }}>Suchen</button>
                    </div>
                </div>
            </td>
            <td>{row.paid ? (row.verified ? 'bezahlt ✔︎ (verifiziert)' : 'bezahlt') : 'offen'}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
                {row.paid ? (
                    <button className="btn" onClick={async () => { setBusy(true); try { await (window as any).api?.payments?.unmark?.({ memberId: row.memberId, periodKey: row.periodKey }); onChanged() } finally { setBusy(false) } }}>Rückgängig</button>
                ) : (
                    <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); try { await (window as any).api?.payments?.markPaid?.({ memberId: row.memberId, periodKey: row.periodKey, interval: row.interval, amount: row.amount, voucherId: selVoucher || null }); onChanged() } finally { setBusy(false) } }}>Als bezahlt markieren</button>
                )}
            </td>
        </tr>
    )
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
