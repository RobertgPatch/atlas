import type { AdmissionDecision, AdmissionRejected } from './protection.types.js'

export class WorkloadAdmissionError extends Error {
  readonly code: AdmissionRejected['error']
  readonly reasonCode: string
  readonly retryAfterSeconds: number
  readonly workloadKey?: string

  constructor(decision: AdmissionRejected) {
    super(decision.reasonCode)
    this.name = 'WorkloadAdmissionError'
    this.code = decision.error
    this.reasonCode = decision.reasonCode
    this.retryAfterSeconds = decision.retryAfterSeconds
    this.workloadKey = decision.workloadKey
  }
}

export class WorkloadDeduplicatedError extends Error {
  readonly code = 'IDEMPOTENT_REPLAY'

  constructor(
    readonly operationId: string,
    readonly operationState: string,
    readonly resultReference: string | null,
  ) {
    super('The same protected operation was already admitted.')
    this.name = 'WorkloadDeduplicatedError'
  }
}

export const requireWorkloadAdmission = (
  decision: AdmissionDecision,
): Extract<AdmissionDecision, { decision: 'allowed' }> => {
  if (decision.decision === 'allowed') return decision
  if (decision.decision === 'deduplicated') {
    throw new WorkloadDeduplicatedError(
      decision.operationId,
      decision.operationState,
      decision.resultReference,
    )
  }
  throw new WorkloadAdmissionError(decision)
}
