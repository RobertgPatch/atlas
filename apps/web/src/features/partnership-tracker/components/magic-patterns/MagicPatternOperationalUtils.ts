import type { PartnershipTrackerYearDetail } from '../../../../../../../packages/types/src/partnership-tracker'
import type { K1TrackerCashFlowEvent } from '../../../../../../../packages/types/src/k1-tracker'

export interface MagicPatternInKindSecurity {
  ticker: string
  name: string
  shares: number
  costBasisPerShare: number
  fmvPerShare: number
  note: string | null
  source: string | null
}

export function extractActivitySource(note: string | null): { source: string; note: string } {
  if (!note?.startsWith('Source: ')) return { source: 'Source not recorded', note: note ?? '—' }
  const separator = note.indexOf(' — ')
  if (separator < 0) return { source: note.slice(8), note: '—' }
  return { source: note.slice(8, separator), note: note.slice(separator + 3) }
}

const numericValue = (value: string): number => Number(value.replaceAll(',', ''))

export function formatInKindActivityNote({
  ticker,
  securityName,
  shares,
  costBasisPerShare,
  fmvPerShare,
  source,
  note,
}: {
  ticker: string
  securityName: string
  shares: number
  costBasisPerShare: number
  fmvPerShare: number
  source: string
  note: string
}): string {
  const identifier = ticker.trim().toUpperCase()
  const securityDetail = [
    `In kind · ${shares.toLocaleString('en-US', { maximumFractionDigits: 8 })} ${identifier} at $${fmvPerShare.toFixed(2)} FMV per share · cost basis $${costBasisPerShare.toFixed(2)} per share`,
    securityName.trim(),
  ].filter(Boolean).join(' · ')
  const activityDetail = note.trim() ? `${securityDetail} — ${note.trim()}` : securityDetail
  return source.trim() ? `Source: ${source.trim()} — ${activityDetail}` : activityDetail
}

/**
 * The current cash-flow contract persists a note but has no security-lot columns.
 * Keep the note human-readable while parsing the same stable structure back into
 * the in-kind positions table. This also supports entries created before the table
 * was wired up because the drawer already emitted this exact sentence structure.
 */
export function parseInKindActivityNote(note: string | null): MagicPatternInKindSecurity | null {
  if (!note) return null
  const parsedSource = extractActivitySource(note)
  const [structured, ...noteParts] = parsedSource.note.split(' — ')
  const match = /^In kind · ([\d,.]+) (.+?) at \$([\d,.]+) FMV per share · cost basis \$([\d,.]+) per share(?: · (.+))?$/.exec(structured)
  if (!match) return null

  const shares = numericValue(match[1]!)
  const fmvPerShare = numericValue(match[3]!)
  const costBasisPerShare = numericValue(match[4]!)
  if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(fmvPerShare) || fmvPerShare <= 0 || !Number.isFinite(costBasisPerShare) || costBasisPerShare < 0) {
    return null
  }

  return {
    ticker: match[2]!.trim().toUpperCase(),
    name: match[5]?.trim() || match[2]!.trim().toUpperCase(),
    shares,
    costBasisPerShare,
    fmvPerShare,
    note: noteParts.join(' — ').trim() || null,
    source: parsedSource.source === 'Source not recorded' ? null : parsedSource.source,
  }
}

export interface MagicPatternInKindLot {
  activity: K1TrackerCashFlowEvent
  security: MagicPatternInKindSecurity
}

export function inKindLotsFor(events: K1TrackerCashFlowEvent[]): MagicPatternInKindLot[] {
  return events.flatMap((activity) => {
    if (activity.kind === 'CAPITAL_CALL') return []
    const security = parseInKindActivityNote(activity.note)
    return security ? [{ activity, security }] : []
  })
}

export function allCashFlows(years: Array<PartnershipTrackerYearDetail | undefined>) {
  return years
    .flatMap((year) => year?.cashFlowEvents ?? [])
    .sort((a, b) => b.activityDate.localeCompare(a.activityDate))
}
