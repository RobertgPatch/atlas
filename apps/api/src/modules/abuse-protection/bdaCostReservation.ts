/**
 * BDA custom output for the committed 78-field K-1 blueprint costs $0.064/page:
 * $0.040 for 30 fields plus 48 * $0.0005. Reserve every permitted SDK attempt,
 * rounding upward to whole cents. Failed or uncertain calls keep their reserve.
 * Source: https://aws.amazon.com/bedrock/pricing/ (checked 2026-09-04).
 */
export const reserveBdaCostCents = (
  pageCount: number | null | undefined,
  maximumPages: number,
  maximumAttempts: number,
): number => {
  const pages = pageCount ?? maximumPages
  if (!Number.isSafeInteger(pages) || pages < 1 || pages > maximumPages
    || !Number.isSafeInteger(maximumPages) || maximumPages < 1
    || !Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1) {
    throw new Error('INVALID_BDA_COST_RESERVATION')
  }
  const cents = Math.ceil(pages * 64 * maximumAttempts / 10)
  if (!Number.isSafeInteger(cents)) throw new Error('INVALID_BDA_COST_RESERVATION')
  return cents
}
