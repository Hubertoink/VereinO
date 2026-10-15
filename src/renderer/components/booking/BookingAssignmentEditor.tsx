import React from 'react'
import { IconPlus, IconX } from '@tabler/icons-react'
import BookingDetailPopover from './BookingDetailPopover'

type Assignment = { id: number; amount: number }
type Option = { id: number; label: string; unavailable?: boolean }

export default function BookingAssignmentEditor({
  label,
  value,
  options,
  onChange,
  gross,
  internal,
  disabled,
  money
}: {
  label: string
  value: Assignment[]
  options: Option[]
  onChange: (value: Assignment[]) => void
  gross: number
  internal: boolean
  disabled: boolean
  money: Intl.NumberFormat
}) {
  const name = (id: number) => options.find((option) => option.id === id)?.label || `#${id}`
  const remaining = options.filter(
    (option) => !option.unavailable && !value.some((item) => item.id === option.id)
  )
  return (
    <div className="bp-assignment-edit-row">
      <span>{label}</span>
      <div className="bp-assignment-values">
        {value.length ? (
          value.map((item) => (
            <span key={item.id}>
              {name(item.id)} <small>{money.format(item.amount)}</small>
            </span>
          ))
        ) : (
          <span className="bp-dim">—</span>
        )}
      </div>
      <BookingDetailPopover
        label={`${label} zuordnen`}
        trigger={<IconPlus size={16} />}
        disabled={disabled}
      >
        <div className="bp-assignment-fields">
          {value.map((item, index) => (
            <div key={item.id} className="bp-assignment-field">
              <label>
                <span>{name(item.id)}</span>
                <span className="bp-assignment-amount">
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min={internal ? undefined : '0.01'}
                    aria-label={`Betrag für ${name(item.id)}`}
                    value={item.amount || ''}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange(
                        value.map((entry, i) =>
                          i === index ? { ...entry, amount: Number(event.target.value) } : entry
                        )
                      )
                    }
                  />{' '}
                  €
                </span>
              </label>
              <button
                type="button"
                className="btn ghost"
                aria-label={`${label} ${name(item.id)} entfernen`}
                disabled={disabled}
                onClick={(event) => {
                  event.currentTarget.closest<HTMLElement>('[role="dialog"]')?.focus()
                  onChange(value.filter((_, i) => i !== index))
                }}
              >
                <IconX size={16} />
              </button>
            </div>
          ))}
          {internal && (
            <p className="bp-dim">Quelle negativ, Ziel positiv; die Summe muss 0 ergeben.</p>
          )}
          <div className="bp-assignment-options">
            {remaining.map((option) => (
              <button
                type="button"
                className="btn ghost"
                key={option.id}
                disabled={disabled}
                onClick={(event) => {
                  event.currentTarget.closest<HTMLElement>('[role="dialog"]')?.focus()
                  onChange([
                    ...value,
                    {
                      id: option.id,
                      amount: internal
                        ? value.length
                          ? -value.reduce((sum, item) => sum + item.amount, 0)
                          : -gross
                        : Math.max(
                            0,
                            Number(
                              (gross - value.reduce((sum, item) => sum + item.amount, 0)).toFixed(2)
                            )
                          )
                    }
                  ])
                }}
              >
                <IconPlus size={14} />
                {option.label}
              </button>
            ))}
          </div>
          {!remaining.length && <p className="bp-dim">Keine weiteren Zuordnungen verfügbar.</p>}
        </div>
      </BookingDetailPopover>
    </div>
  )
}
