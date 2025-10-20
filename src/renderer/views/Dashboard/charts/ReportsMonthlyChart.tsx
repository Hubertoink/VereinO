import React, { useEffect, useMemo, useRef } from 'react'

export default function ReportsMonthlyChart(props: { activateKey?: number; refreshKey?: number; from?: string; to?: string; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; type?: 'IN' | 'OUT' | 'TRANSFER'; paymentMethod?: 'BAR' | 'BANK' }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  useEffect(() => {
    // Placeholder chart rendering; original detailed chart code can be moved here in a follow-up
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.fillStyle = '#ccc'
    ctx.fillRect(10, 10, ctx.canvas.width - 20, ctx.canvas.height - 20)
    ctx.fillStyle = '#333'
    ctx.fillText('Monatsverlauf (placeholder)', 20, 30)
  }, [props.activateKey, props.refreshKey, props.from, props.to, props.sphere, props.type, props.paymentMethod])
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="helper">Monatsverlauf</div>
      <canvas ref={canvasRef} width={480} height={180} style={{ width: '100%', height: 180, background: 'white' }} />
    </div>
  )
}
