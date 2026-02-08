export type Sphere = 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'

export type CommonFilters = {
  from: string
  to: string
  sphere?: Sphere
}

export type Money = number // EUR as number; format with Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

// Props contracts for the dashboard components; data fetching can be injected later.
export type BalanceAreaChartProps = CommonFilters & { activateKey?: number; refreshKey?: number; baseSaldo?: number }
export type IncomeExpenseBarsProps = CommonFilters & { refreshKey?: number }
export type EarmarksUsageBarsProps = CommonFilters & { limit?: number }
export type BudgetDeviationListProps = CommonFilters & { limit?: number }
export type WorkQueueCardProps = CommonFilters & {
  // optionally pass precomputed values; if undefined, component may fetch later
  unlinkedReceiptsCount?: number
  lockedEntriesCount?: number
}
export type LiquidityForecastAreaProps = CommonFilters & { horizonDays?: number }
