import React from 'react'
import { TablePaneProps, ColKey } from '../types'
import { DnDOrder } from '../components'

/**
 * TablePane - Table Column Configuration
 * 
 * Handles:
 * - Column visibility (checkboxes)
 * - Column order (drag & drop via DnDOrder component)
 * - Preset configurations (Standard, Minimal, Details)
 */
export function TablePane({
  cols,
  setCols,
  order,
  setOrder,
  defaultCols,
  defaultOrder,
  journalLimit,
  setJournalLimit,
  labelForCol,
  allowVoucherDeletion,
}: TablePaneProps) {
  const hiddenKeys = new Set<ColKey>(allowVoucherDeletion ? [] : ['type'])
  const visibleConfigKeys = (Object.keys(defaultCols) as ColKey[]).filter((key) => !hiddenKeys.has(key))
  const effectiveOrder = order.filter((key) => !hiddenKeys.has(key))

  // Preset configurations
  const presetStandard = () => {
    const standardCols: Record<string, boolean> = {
      actions: true,
      date: true,
      voucherNo: false,
      type: allowVoucherDeletion,
      sphere: true,
      description: true,
      note: true,
      earmark: true,
      budget: true,
      paymentMethod: true,
      attachments: true,
      net: false,
      vat: false,
      gross: true,
    }
    const standardOrder: ColKey[] = [
      'actions',
      'date',
      'sphere',
      'description',
      'earmark',
      'budget',
      'paymentMethod',
      'attachments',
      'gross',
      'voucherNo',
      'net',
      'vat',
    ]
    if (allowVoucherDeletion) standardOrder.splice(2, 0, 'type')
    setCols(standardCols as any)
    setOrder(standardOrder)
  }

  const presetMinimal = () => {
    const minimalCols: Record<string, boolean> = {
      actions: true,
      date: true,
      voucherNo: false,
      type: false,
      sphere: false,
      description: true,
      note: false,
      earmark: false,
      budget: false,
      paymentMethod: false,
      attachments: false,
      net: false,
      vat: false,
      gross: true,
    }
    const minimalOrder: ColKey[] = [
      'actions',
      'date',
      'description',
      'gross',
      'voucherNo',
      'sphere',
      'earmark',
      'budget',
      'paymentMethod',
      'attachments',
      'net',
      'vat',
    ]
    if (allowVoucherDeletion) minimalOrder.splice(5, 0, 'type')
    setCols(minimalCols as any)
    setOrder(minimalOrder)
  }

  const presetDetails = () => {
    const detailsCols = { ...defaultCols, type: allowVoucherDeletion ? defaultCols.type : false }
    const detailsOrder: ColKey[] = [
      'actions',
      'date',
      'voucherNo',
      'sphere',
      'description',
      'earmark',
      'budget',
      'paymentMethod',
      'attachments',
      'net',
      'vat',
      'gross',
    ]
    if (allowVoucherDeletion) detailsOrder.splice(3, 0, 'type')
    setCols(detailsCols)
    setOrder(detailsOrder)
  }

  const resetAll = () => {
    setCols({ ...defaultCols, type: allowVoucherDeletion ? defaultCols.type : false })
    setOrder(defaultOrder.filter((key) => !hiddenKeys.has(key)))
    setJournalLimit(20)
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <strong>Tabelle & Darstellung</strong>
        <div className="helper">
          Sichtbarkeit der Spalten und Reihenfolge. Drag & Drop zum Umordnen.
        </div>
      </div>

      {/* Column Visibility Checkboxes */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {visibleConfigKeys.map((k) => (
          <label
            key={k}
            title={k === 'actions' ? 'Empfohlen aktiviert' : ''}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <input
              type="checkbox"
              checked={!!cols[k]}
              onChange={(e) => setCols({ ...cols, [k]: e.target.checked })}
            />
            {labelForCol(k)}
          </label>
        ))}
      </div>

      {/* Warning if Actions column is hidden */}
      {!cols['actions'] && (
        <div className="helper" style={{ color: 'var(--danger)' }}>
          Ohne „Aktionen" kannst du Zeilen nicht bearbeiten oder löschen.
        </div>
      )}

      {/* Column Order (Drag & Drop) */}
      <div>
        <div className="helper">Reihenfolge:</div>
        <DnDOrder
          order={effectiveOrder as string[]}
          cols={cols as Record<string, boolean>}
          onChange={(o) => setOrder(o as ColKey[])}
          labelFor={labelForCol}
        />
      </div>

      {/* Table Preview */}
      <div>
        <div className="helper" style={{ marginBottom: 6 }}>Vorschau:</div>
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8, background: 'var(--surface)' }}>
          <table cellPadding={6} style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {effectiveOrder.filter(k => cols[k]).map(k => (
                  <th key={k} align="left" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                    {labelForCol(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {effectiveOrder.filter(k => cols[k]).map(k => (
                  <td key={k} style={{ paddingTop: 6, color: 'var(--text-dim)' }}>
                    {k === 'actions' ? '⚙️' : k === 'date' ? '2025-01-15' : k === 'voucherNo' ? 'B-001' : k === 'type' ? 'IN' : k === 'sphere' ? 'IDEELL' : k === 'description' ? 'Beispiel' : k === 'note' ? 'Kommentar' : k === 'earmark' ? '—' : k === 'budget' ? '—' : k === 'paymentMethod' ? 'BANK' : k === 'attachments' ? '📎' : k === 'net' ? '42,02' : k === 'vat' ? '7,98' : k === 'gross' ? '50,00' : '—'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Preset Buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" onClick={presetStandard}>
          Voreinstellung: Standard
        </button>
        <button className="btn" onClick={presetMinimal}>
          Voreinstellung: Minimal
        </button>
        <button className="btn" onClick={presetDetails}>
          Voreinstellung: Details
        </button>
        <button className="btn" onClick={resetAll}>
          Zurücksetzen
        </button>
      </div>
    </div>
  )
}
