/** Tick spacing shared by on-screen charts and exported charts. */
export function niceStep(max: number, maxTicks = 8): number {
  if (max <= 0) return 1
  const base = Math.pow(10, Math.floor(Math.log10(max)))
  const magnitude = max / base
  let step = base
  if (magnitude <= 2) step = base / 5
  else if (magnitude <= 5) step = base / 2
  if (Math.max(1, Math.round(max / step)) > maxTicks) step *= 2
  return step
}
