
import { DATE_FORMAT_OPTIONS } from '../../../utils/appearanceOptions'
import { TablePaneProps, ColKey } from '../types'
import { DnDOrder, SettingsPageHeader, SettingsSection, SettingsRow } from '../components'
import { IconPaperclip, IconSettings } from '@tabler/icons-react'

/**
 * TablePane - Table Column Configuration
 *
 * Handles:
 * - Column visibility (checkboxes)
 * - Column order (drag & drop via DnDOrder component)
 * - Preset configurations (Standard, Minimal, Details)
 */
export function TablePane({
  journalRowStyle,
  setJournalRowStyle,
  journalRowDensity,
  setJournalRowDensity,
  dateFmt,
  setDateFmt,
  cols,
  setCols,
  order,
  setOrder,
  defaultCols,
  defaultOrder,
  journalLimit,
  setJournalLimit,
  labelForCol,
  allowVoucherDeletion
}: TablePaneProps) {
  const hiddenKeys = new Set<ColKey>(allowVoucherDeletion ? [] : ['type'])
  const visibleConfigKeys = (Object.keys(defaultCols) as ColKey[]).filter(
    (key) => !hiddenKeys.has(key)
  )
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
      gross: true
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
      'vat'
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
      gross: true
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
      'vat'
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
      'gross'
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
    <div className="settings-page settings-table-pane">
      <SettingsPageHeader
        title="Tabelle"
        description="Gestalte Lesbarkeit, Spalten und Reihenfolge der klassischen Buchungstabelle."
        meta="Änderungen werden automatisch übernommen. Das Datumsformat gilt in der gesamten App."
      />
      <SettingsSection title="Lesbarkeit" description="Die Vorschau zeigt deine aktuelle Auswahl.">
        <SettingsRow
          title="Zeilenhöhe"
          description="Normal für mehr Luft, kompakt für mehr Buchungen auf einmal."
        >
          <div className="btn-group" role="group" aria-label="Zeilenhöhe">
            {(['normal', 'compact'] as const).map((value) => (
              <button
                key={value}
                className={`btn-option ${journalRowDensity === value ? 'active' : ''}`}
                aria-pressed={journalRowDensity === value}
                onClick={() => setJournalRowDensity(value)}
              >
                {value === 'normal' ? 'Normal' : 'Kompakt'}
              </button>
            ))}
          </div>
        </SettingsRow>
        <SettingsRow
          title="Zeilenlayout"
          description="Linien und Zebra-Muster trennen Buchungen optisch."
          htmlFor="select-row-style"
        >
          <select
            id="select-row-style"
            className="input"
            value={journalRowStyle}
            onChange={(e) =>
              setJournalRowStyle(e.target.value as TablePaneProps['journalRowStyle'])
            }
          >
            <option value="both">Linien + Zebra</option>
            <option value="lines">Nur Linien</option>
            <option value="zebra">Nur Zebra</option>
            <option value="none">Ohne Linien/Zebra</option>
          </select>
        </SettingsRow>
        <SettingsRow
          title="Einträge pro Seite"
          description="Anzahl der Buchungen in der Übersicht."
        >
          <div className="btn-group" role="group" aria-label="Einträge pro Seite">
            {[20, 50, 100].map((value) => (
              <button
                key={value}
                className={`btn-option ${journalLimit === value ? 'active' : ''}`}
                aria-pressed={journalLimit === value}
                onClick={() => setJournalLimit(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </SettingsRow>
        <SettingsRow
          title="Datumsformat"
          description="Einheitliches Format für Datumsangaben in VereinO."
        >
          <div className="btn-group" role="group" aria-label="Datumsformat">
            {DATE_FORMAT_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`btn-option ${dateFmt === option.id ? 'active' : ''}`}
                aria-pressed={dateFmt === option.id}
                onClick={() => setDateFmt(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection
        title="Spalten"
        description="Wähle sichtbare Angaben aus und ziehe die Spalten in die gewünschte Reihenfolge."
      >
        {/* Column Visibility Checkboxes */}
        <div className="settings-column-options">
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
      </SettingsSection>
      {/* Table Preview */}
      <SettingsSection title="Vorschau" description="Beispieldaten – keine echten Buchungen.">
        <div>
          <div
            style={{
              overflowX: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 8,
              background: 'var(--surface)'
            }}
          >
            <table
              className="settings-table-preview"
              data-density={journalRowDensity}
              data-row-style={journalRowStyle}
              cellPadding={6}
              style={{ width: '100%', fontSize: 13 }}
            >
              <thead>
                <tr>
                  {effectiveOrder
                    .filter((k) => cols[k])
                    .map((k) => (
                      <th
                        key={k}
                        align="left"
                        style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6 }}
                      >
                        {labelForCol(k)}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2].map((row) => (
                  <tr key={row}>
                    {effectiveOrder
                      .filter((k) => cols[k])
                      .map((k) => (
                        <td key={k} style={{ paddingTop: 6, color: 'var(--text-dim)' }}>
                          {k === 'actions' ? (
                            <IconSettings size={16} aria-label="Aktionen" />
                          ) : k === 'date' ? (
                            dateFmt === 'ISO' ? (
                              '2025-01-15'
                            ) : dateFmt === 'DOT' ? (
                              '15.01.2025'
                            ) : (
                              '15. Jan 2025'
                            )
                          ) : k === 'voucherNo' ? (
                            'B-001'
                          ) : k === 'type' ? (
                            'IN'
                          ) : k === 'sphere' ? (
                            'IDEELL'
                          ) : k === 'description' ? (
                            'Beispiel'
                          ) : k === 'note' ? (
                            'Kommentar'
                          ) : k === 'earmark' ? (
                            '—'
                          ) : k === 'budget' ? (
                            '—'
                          ) : k === 'paymentMethod' ? (
                            'BANK'
                          ) : k === 'attachments' ? (
                            <IconPaperclip size={16} aria-label="Anhang" />
                          ) : k === 'net' ? (
                            '42,02'
                          ) : k === 'vat' ? (
                            '7,98'
                          ) : k === 'gross' ? (
                            '50,00'
                          ) : (
                            '—'
                          )}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SettingsSection>
      <SettingsSection
        title="Vorlagen"
        description="Übernimm eine Spaltenauswahl oder setze Spalten und Eintragsanzahl zurück."
      >
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
      </SettingsSection>
    </div>
  )
}
