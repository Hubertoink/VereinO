import { useState, type FocusEvent } from 'react'

export type BankSourceField = 'date' | 'amount' | 'account' | 'description' | 'party' | 'direction'

export function useBankDraftSourceHighlight(enabled: boolean) {
  const [hovered, setHovered] = useState<BankSourceField | null>(null)
  const [focused, setFocused] = useState<BankSourceField | null>(null)
  const active = enabled ? hovered || focused : null
  return {
    active,
    fieldProps: (field: BankSourceField) => enabled ? {
      'data-bank-review-field': field,
      'data-bank-review-active': active === field || undefined,
      onMouseEnter: () => setHovered(field),
      onMouseLeave: () => setHovered(null),
      onFocusCapture: () => setFocused(field),
      onBlurCapture: (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(null)
      }
    } : {}
  }
}
