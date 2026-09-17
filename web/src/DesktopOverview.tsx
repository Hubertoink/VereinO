import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import DashboardPlusView from '../../src/renderer/views/DashboardPlus/DashboardPlusView'
import ReportsView from '../../src/renderer/views/Reports/ReportsView'
import type {
  Sphere,
  VoucherType,
  PaymentMethod
} from '../../src/renderer/components/reports/types'
import type { RendererApi } from '../../src/types/api'
import { addDataChangedListener } from '../../src/renderer/utils/refresh'
import { api, ApiError, type Entry, type User } from './api'
import { usePlanningOptions } from './usePlanningOptions'
import { createReportingReadApi, overviewMonths } from './reportingApi'
import ReportCsvExport from './ReportCsvExport'
import { filteredBookings } from './rendererApi'
type PrimaryClassification = Awaited<ReturnType<RendererApi['classifications']['primary']['list']>>

export type DesktopOverviewProps = {
  user: User
  page: 'dashboard' | 'reports'
  onGoToBookings: () => void
  onSessionExpired: () => void
}

export default function DesktopOverview({
  user,
  page,
  onGoToBookings,
  onSessionExpired
}: DesktopOverviewProps) {
  const planning = usePlanningOptions(onSessionExpired, page === 'reports')
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [classification, setClassification] = useState<PrimaryClassification | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [ready, setReady] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [category, setCategory] = useState<number | null>(null)
  const [sphere, setSphere] = useState<Sphere | null>(null)
  const [type, setType] = useState<VoucherType | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [earmark, setEarmark] = useState<number | null>(null)
  const [budget, setBudget] = useState<number | null>(null)
  const [showExportOptions, setShowExportOptions] = useState(false)
  const exportFilters = { primaryClassificationValueId: category ?? undefined, from: from || undefined, to: to || undefined, sphere: sphere || undefined, type: type || undefined, paymentMethod: paymentMethod || undefined, budgetId: budget || undefined, earmarkId: earmark || undefined }
  useEffect(() => addDataChangedListener(['vouchers'], () => setRevision((value) => value + 1)), [])
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1)
    window.addEventListener('focus', refresh)
    window.addEventListener('web-profile-changed', refresh)
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('web-profile-changed', refresh) }
  }, [])
  useEffect(() => {
    let active = true
    setEntries(null)
    setError('')
    Promise.all([api<{ bookings: Entry[] }>('/bookings'), api<PrimaryClassification>('/classifications/primary')])
      .then(([result, primary]) => {
        if (active) { setClassification(primary); setEntries(result.bookings) }
      })
      .catch((error) => {
        if (!active) return
        if (error instanceof ApiError && error.status === 401) onSessionExpired()
        setError(error instanceof Error ? error.message : 'Buchungen konnten nicht geladen werden.')
      })
    return () => {
      active = false
    }
  }, [user.id, page, revision, onSessionExpired])
  useLayoutEffect(() => {
    setReady(false)
    if (!entries || !classification) return
    const previous = window.api
    window.api = {
      ...previous,
      reports: createReportingReadApi(entries, classification.profile),
      classifications: {
        primary: { list: async () => classification }
      }
    } as unknown as RendererApi
    setReady(true)
    return () => {
      window.api = previous
    }
  }, [entries, classification])
  const loadFinancialMonths = useCallback(
    async (today: string) => overviewMonths(entries || [], today),
    [entries]
  )
  if (error)
    return (
      <div className="card" role="alert">
        <h2>Auswertung konnte nicht geladen werden</h2>
        <p>{error}</p>
        <button className="btn" onClick={() => setRevision((value) => value + 1)}>
          Erneut versuchen
        </button>
      </div>
    )
  if (!entries || !ready)
    return (
      <div className="card" role="status">
        Auswertung wird geladen …
      </div>
    )
  if (page === 'dashboard')
    return (
      <DashboardPlusView
        generalProfile={classification?.profile === 'GENERAL'}
        today={new Date().toLocaleDateString('sv-SE')}
        loadFinancialMonths={loadFinancialMonths}
        onGoToBookings={onGoToBookings}
        onGoToVoucher={onGoToBookings}
        onGoToInvoices={onGoToBookings}
        onGoToMembers={onGoToBookings}
        onGoToBudgets={onGoToBookings}
        onGoToBindings={onGoToBookings}
        onGoToAI={onGoToBookings}
      />
    )
  return (
    <>
      {planning.error && (
        <div className="card" role="alert">
          {planning.error}
        </div>
      )}
      <ReportsView
        primaryClassificationValueId={category}
        setPrimaryClassificationValueId={setCategory}
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        yearsAvail={[...new Set(entries.map((row) => Number(row.date.slice(0, 4))))].sort(
          (a, b) => b - a
        )}
        filterSphere={sphere}
        setFilterSphere={setSphere}
        filterType={type}
        setFilterType={setType}
        filterPM={paymentMethod}
        setFilterPM={setPaymentMethod}
        filterEarmark={earmark}
        setFilterEarmark={setEarmark}
        filterBudgetId={budget}
        setFilterBudgetId={setBudget}
        budgets={planning.budgets}
        earmarks={planning.earmarks}
        showExportOptions={showExportOptions}
        setShowExportOptions={setShowExportOptions}
        exportContent={<ReportCsvExport profile={classification?.profile} filters={exportFilters} count={filteredBookings(entries, exportFilters).length} onSessionExpired={onSessionExpired} />}
        showActivityReportEditor={false}
        setShowActivityReportEditor={() => {}}
        refreshKey={revision}
        activateKey={revision}
      />
    </>
  )
}
