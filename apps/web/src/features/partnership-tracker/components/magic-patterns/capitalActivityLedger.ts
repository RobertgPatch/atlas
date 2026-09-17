import type { K1TrackerCashFlowEvent } from '../../../../../../../packages/types/src/k1-tracker'

const units = (value: string | undefined): bigint => {
  const text = value ?? '0'
  const unsigned = text.startsWith('-') ? text.slice(1) : text
  const [whole = '0', fraction = ''] = unsigned.split('.')
  const parsed = BigInt(whole) * 10_000n + BigInt((fraction + '0000').slice(0, 4))
  return text.startsWith('-') ? -parsed : parsed
}

export function formatLedgerMoney(value: bigint | null): string {
  if (value == null) return '—'
  const negative = value < 0n
  const magnitude = negative ? -value : value
  const cents = (magnitude + 50n) / 100n
  const formatted = `$${new Intl.NumberFormat('en-US').format(cents / 100n)}.${String(cents % 100n).padStart(2, '0')}`
  return negative && cents !== 0n ? `(${formatted})` : formatted
}

export function capitalActivityLedger(events: K1TrackerCashFlowEvent[], residualValue: string) {
  const ordered = events.map((event, index) => ({ event, index }))
    .sort((left, right) => left.event.activityDate.localeCompare(right.event.activityDate) || left.index - right.index)
  const residual = units(residualValue)
  const amounts = new Map<string, { gross: bigint; feesAndCarry: bigint; net: bigint; cumulativeNet: bigint | null; netIncludingResidual: bigint | null }>()
  let cumulative = 0n
  for (const { event } of ordered) {
    const rawGross = units(event.amount)
    const magnitude = rawGross < 0n ? -rawGross : rawGross
    const gross = event.kind === 'CAPITAL_CALL' ? -magnitude : magnitude
    const feesAndCarry = -units(event.feesAndCarry)
    const net = gross + feesAndCarry
    const settled = event.settlementStatus !== 'ANNOUNCED'
    if (settled) cumulative += net
    amounts.set(event.id, {
      gross,
      feesAndCarry,
      net,
      cumulativeNet: settled ? cumulative : null,
      // Workbook column I: net flow, with residual NAV only on the final distribution.
      netIncludingResidual: settled ? net + (event.isFinalLiquidation ? residual : 0n) : null,
    })
  }
  return amounts
}
