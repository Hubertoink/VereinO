import React from 'react'

export type AppIconSize = 'inline' | 'control' | 'action' | 'hero'

const SIZE_BY_VARIANT: Record<AppIconSize, number> = {
  inline: 14,
  control: 16,
  action: 18,
  hero: 32
}

export default function AppIcon({
  icon: Icon,
  size = 'action',
  className,
  stroke = 1.8
}: {
  icon: React.ElementType
  size?: AppIconSize
  className?: string
  stroke?: number
}) {
  return (
    <Icon
      aria-hidden="true"
      className={`app-icon app-icon--${size}${className ? ` ${className}` : ''}`}
      size={SIZE_BY_VARIANT[size]}
      stroke={stroke}
    />
  )
}
