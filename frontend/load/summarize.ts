export type Summary = {
  n: number
  min: number
  mean: number
  p50: number
  p95: number
  max: number
}

export function summarize(values: readonly number[]): Summary | null {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return null
  const sorted = [...finite].sort((a, b) => a - b)
  const sum = sorted.reduce((total, value) => total + value, 0)
  return {
    n: sorted.length,
    min: sorted[0],
    mean: sum / sorted.length,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    max: sorted[sorted.length - 1],
  }
}

export function kbps(before: number, after: number, elapsedMs: number): number | null {
  if (elapsedMs <= 0) return null
  return ((after - before) * 8) / elapsedMs
}

function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 1) return sorted[0]
  const index = (sorted.length - 1) * p
  const lo = Math.floor(index)
  const hi = Math.ceil(index)
  if (lo === hi) return sorted[lo]
  const weight = index - lo
  return sorted[lo] * (1 - weight) + sorted[hi] * weight
}
