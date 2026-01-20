import React from 'react'
import FilterDropdown from './FilterDropdown'

type ColumnKey = string

export interface ColumnSelectDropdownProps {
  columns: Array<{
    key: ColumnKey
    label: string
    checked: boolean
    onChange: (checked: boolean) => void
    disabled?: boolean
  }>
  title?: string
  tip?: string
  alignRight?: boolean
}

export default function ColumnSelectDropdown({ columns, title = 'Spalten', tip, alignRight = true }: ColumnSelectDropdownProps) {
  return (
    <FilterDropdown
      trigger={
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
        </svg>
      }
      title={title}
      hasActiveFilters={false}
      alignRight={alignRight}
      width={360}
      ariaLabel={title}
      buttonTitle={title}
      colorVariant="display"
    >
      <div className="filter-dropdown__field">
        {columns.map((c) => (
          <label key={c.key} className="filter-dropdown__checkbox">
            <input
              type="checkbox"
              checked={c.checked}
              disabled={c.disabled}
              onChange={(e) => c.onChange(e.target.checked)}
            />
            <span>{c.label}</span>
          </label>
        ))}
      </div>

      {tip && <div className="filter-dropdown__info">{tip}</div>}
    </FilterDropdown>
  )
}
