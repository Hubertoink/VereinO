import { IconX } from '@tabler/icons-react'
import AppIcon from './common/AppIcon'

export default function FlyoutHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <header className="filter-dropdown__header">
      <h3 className="filter-dropdown__title">{title}</h3>
      <button
        type="button"
        className="btn ghost filter-dropdown__close"
        aria-label="Schließen"
        title="Schließen"
        onClick={onClose}
      >
        <AppIcon icon={IconX} size="control" />
      </button>
    </header>
  )
}
