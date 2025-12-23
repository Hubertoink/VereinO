import React from 'react'
import { OrgPaneProps } from '../types'
import TaxExemptionModal from '../../../components/modals/TaxExemptionModal'
import type { TaxExemptionCertificate } from '../../../../../shared/types'

interface ActiveOrg {
  id: string
  name: string
  dbRoot: string
}

/**
 * OrgPane - Organization Settings
 * 
 * Handles:
 * - Organization name (for active organization in switcher)
 * - Organization display name (org.name setting)
 * - Cashier name
 * - Tax Exemption Certificate (Steuerbefreiungsbescheid)
 */
export function OrgPane({ notify }: OrgPaneProps) {
  // Active organization (for the switcher)
  const [activeOrg, setActiveOrg] = React.useState<ActiveOrg | null>(null)
  const [activeOrgName, setActiveOrgName] = React.useState<string>('')
  const [savingOrg, setSavingOrg] = React.useState(false)
  
  // Organization display settings
  const [orgName, setOrgName] = React.useState<string>('')
  const [cashier, setCashier] = React.useState<string>('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>('')
  const [showTaxExemptionModal, setShowTaxExemptionModal] = React.useState(false)
  const [taxCertificate, setTaxCertificate] = React.useState<TaxExemptionCertificate | null>(null)

  async function loadTaxCertificate() {
    try {
      const res = await (window as any).api?.taxExemption?.get?.()
      setTaxCertificate(res?.certificate || null)
    } catch (e: any) {
      console.error('Error loading tax certificate:', e)
    }
  }

  async function loadActiveOrg() {
    try {
      const res = await (window as any).api?.organizations?.active?.()
      if (res?.organization) {
        setActiveOrg(res.organization)
        setActiveOrgName(res.organization.name || '')
      }
    } catch (e: any) {
      console.error('Error loading active organization:', e)
    }
  }

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const on = await (window as any).api?.settings?.get?.({ key: 'org.name' })
        const cn = await (window as any).api?.settings?.get?.({ key: 'org.cashier' })
        if (!cancelled) {
          setOrgName((on?.value as any) || '')
          setCashier((cn?.value as any) || '')
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e))
      }
    }
    load()
    loadTaxCertificate()
    loadActiveOrg()
    return () => { cancelled = true }
  }, [])

  async function saveOrgName() {
    if (!activeOrg || !activeOrgName.trim()) return
    setSavingOrg(true)
    try {
      await (window as any).api?.organizations?.rename?.({ orgId: activeOrg.id, name: activeOrgName.trim() })
      notify('success', 'Organisationsname geändert')
      await loadActiveOrg()
      window.dispatchEvent(new Event('data-changed'))
    } catch (e: any) {
      notify('error', e?.message || String(e))
    } finally { setSavingOrg(false) }
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      await (window as any).api?.settings?.set?.({ key: 'org.name', value: orgName })
      await (window as any).api?.settings?.set?.({ key: 'org.cashier', value: cashier })
      notify('success', 'Einstellungen gespeichert')
      window.dispatchEvent(new Event('data-changed'))
    } catch (e: any) {
      setError(e?.message || String(e))
      notify('error', e?.message || String(e))
    } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Active Organization Name (for switcher) */}
      {activeOrg && (
        <div style={{ marginBottom: 12, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={{ marginBottom: 8 }}>
            <strong>🏢 Aktive Organisation</strong>
            <div className="helper">Name der Organisation im Organisations-Wechsler</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, maxWidth: 400 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Organisationsname</label>
              <input 
                className="input" 
                value={activeOrgName} 
                onChange={(e) => setActiveOrgName(e.target.value)} 
                placeholder="z. B. Hauptverein" 
              />
            </div>
            <button 
              className="btn" 
              disabled={savingOrg || !activeOrgName.trim() || activeOrgName === activeOrg.name} 
              onClick={saveOrgName}
            >
              Umbenennen
            </button>
          </div>
        </div>
      )}

      {/* Organization Display Settings */}
      <div>
        <strong>📋 Anzeige-Einstellungen</strong>
        <div className="helper">Diese Angaben erscheinen in der Titelleiste und in Exporten.</div>
      </div>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      <div className="row">
        <div className="field">
          <label>Vollständiger Vereinsname</label>
          <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="z. B. Förderverein Muster e.V." />
        </div>
        <div className="field">
          <label>Name (Kassier)</label>
          <input className="input" value={cashier} onChange={(e) => setCashier(e.target.value)} placeholder="z. B. Max Mustermann" />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn primary" disabled={busy} onClick={save}>Speichern</button>
      </div>

      {/* Tax Exemption Certificate Section */}
      <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
        <div style={{ marginBottom: 12 }}>
          <strong>📄 Steuerbefreiungsbescheid</strong>
          <div className="helper">Gemeinnützigkeitsbescheid für Spendenbescheinigungen hinterlegen</div>
        </div>

        {taxCertificate ? (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'color-mix(in oklab, var(--accent) 5%, transparent)'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 20 }}>📎</span>
                <strong>{taxCertificate.fileName}</strong>
              </div>
              <div className="helper">
                Hochgeladen: {new Date(taxCertificate.uploadDate).toLocaleDateString('de-DE')}
                {taxCertificate.validFrom && taxCertificate.validUntil && (
                  <> · Gültig: {new Date(taxCertificate.validFrom).toLocaleDateString('de-DE')} bis{' '}
                    {new Date(taxCertificate.validUntil).toLocaleDateString('de-DE')}</>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn"
                onClick={() => setShowTaxExemptionModal(true)}
              >
                Ansehen
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              border: '2px dashed var(--border)',
              borderRadius: 8,
              padding: 24,
              textAlign: 'center',
              color: 'var(--text-dim)'
            }}
          >
            <div style={{ marginBottom: 12 }}>Kein Bescheid hinterlegt</div>
            <button
              className="btn primary"
              onClick={() => setShowTaxExemptionModal(true)}
            >
              + Bescheid hochladen
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showTaxExemptionModal && (
        <TaxExemptionModal
          onClose={() => setShowTaxExemptionModal(false)}
          onSaved={() => {
            loadTaxCertificate()
            notify('success', 'Steuerbefreiungsbescheid aktualisiert')
          }}
        />
      )}
    </div>
  )
}
