import React, { useId, type ReactNode } from 'react'

export function SettingsSection({
  title,
  description,
  actions,
  children
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const id = useId()
  return (
    <section className="settings-section" aria-labelledby={id}>
      <div className="settings-section-heading">
        <div>
          <h3 id={id}>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="settings-section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

export function SettingsRow({
  title,
  description,
  htmlFor,
  children
}: {
  title: string
  description?: ReactNode
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        {htmlFor ? <label htmlFor={htmlFor}>{title}</label> : <strong>{title}</strong>}
        {description && <div className="helper">{description}</div>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}
