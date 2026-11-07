import ModalHeader from './components/ModalHeader'
import React from 'react'

type Props = (
    | { mode: 'useOrMigrate'; root: string; dbPath: string; busy?: boolean; onCancel: () => void; onUse: () => void; onMigrate: () => void }
    | { mode: 'migrateEmpty'; root: string; busy?: boolean; onCancel: () => void; onMigrate: () => void }
)

export default function DbMigrateModal(props: Props) {
    const { busy } = props as any
    return (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => busy ? undefined : props.onCancel()}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
                <ModalHeader
                  title="Datenbank-Speicherort"
                  onClose={() => props.onCancel()}
                  closeDisabled={!!busy}
                  closeOnEscape={false}
                />
                {props.mode === 'useOrMigrate' ? (
                    <>
                        <div>Im gewählten Ordner wurde eine vorhandene Datenbank gefunden:</div>
                        <div className="card" style={{ padding: 8, wordBreak: 'break-all' }}><code>{props.dbPath}</code></div>
                        <div className="helper">Möchtest du diese bestehende Datenbank verwenden, oder deine aktuelle in diesen Ordner kopieren (migrieren)?</div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                            <button className="btn" onClick={() => (props as any).onUse?.()} disabled={!!busy}>Bestehende verwenden</button>
                            <button className="btn primary" onClick={() => props.onMigrate()} disabled={!!busy}>Aktuelle migrieren</button>
                        </div>
                    </>
                ) : (
                    <>
                        <div>In diesem Ordner ist noch keine Datenbank vorhanden.</div>
                        <div className="helper">Soll die aktuelle Datenbank in diesen Ordner kopiert werden (migrieren)?</div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn" onClick={() => props.onCancel()} disabled={!!busy}>Abbrechen</button>
                            <button className="btn primary" onClick={() => props.onMigrate()} disabled={!!busy}>OK</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
