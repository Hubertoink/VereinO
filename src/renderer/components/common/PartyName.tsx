import React from 'react'
import { IconUser } from '@tabler/icons-react'
import './party.css'

export default function PartyName({ name }: { name: string }) {
  return <span className="party-name" title="Kunde / Dienstleister"><IconUser size={16} aria-hidden="true" /><span>{name}</span></span>
}
