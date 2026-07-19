import { useMutation, useQueryClient } from '@tanstack/react-query'
import { partnershipsClient } from '../api/partnershipsClient'
import type {
  CreatePartnershipRequest,
  UpdatePartnershipRequest,
  DuplicatePartnershipNameError,
  CreatePartnershipCommitmentRequest,
  CreateCapitalActivityEventRequest,
} from 'packages/types/src'

const invalidatePartnershipReads = (qc: ReturnType<typeof useQueryClient>) => Promise.all([
  qc.invalidateQueries({ queryKey: ['partnerships-list'] }),
  qc.invalidateQueries({ queryKey: ['partnership'] }),
  qc.invalidateQueries({ queryKey: ['entity'] }),
  qc.invalidateQueries({ queryKey: ['entities'] }),
  qc.invalidateQueries({ queryKey: ['k1'] }),
  qc.invalidateQueries({ queryKey: ['k1-tracker'] }),
  qc.invalidateQueries({ queryKey: ['partnership-tracker'] }),
  qc.invalidateQueries({ queryKey: ['dashboard'] }),
  qc.invalidateQueries({ queryKey: ['reports'] }),
])

// ---------------------------------------------------------------------------
// Create Partnership
// ---------------------------------------------------------------------------

type CreateResult =
  | { ok: true; id: string }
  | DuplicatePartnershipNameError

export function useCreatePartnership() {
  const qc = useQueryClient()
  return useMutation<CreateResult, Error, CreatePartnershipRequest>({
    mutationFn: async (body) => {
      const result = await partnershipsClient.create(body)
      if (result.kind === 'duplicate-name') return result
      return { ok: true as const, id: result.id }
    },
    onSuccess: (result, vars) => {
      if ('ok' in result && result.ok) {
        void qc.invalidateQueries({ queryKey: ['partnerships-list'] })
        void qc.invalidateQueries({ queryKey: ['entity', vars.entityId] })
        void qc.invalidateQueries({ queryKey: ['dashboard', 'summary'] })
        void qc.invalidateQueries({ queryKey: ['reports'] })
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Update Partnership
// ---------------------------------------------------------------------------

type UpdateVars = { id: string; entityId: string; body: UpdatePartnershipRequest }

type UpdateResult =
  | { ok: true }
  | DuplicatePartnershipNameError

export function useUpdatePartnership() {
  const qc = useQueryClient()
  return useMutation<UpdateResult, Error, UpdateVars>({
    mutationFn: async ({ id, body }) => {
      const result = await partnershipsClient.update(id, body)
      if (result.kind === 'duplicate-name') return result
      return { ok: true as const }
    },
    onSuccess: (result, vars) => {
      if ('ok' in result && result.ok) {
        void invalidatePartnershipReads(qc)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Create Commitment
// ---------------------------------------------------------------------------

export function useCreateCommitment() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { partnershipId: string; body: CreatePartnershipCommitmentRequest }>(
    {
      mutationFn: async ({ partnershipId, body }) => {
        return partnershipsClient.createCommitment(partnershipId, body)
      },
      onSuccess: (_result, vars) => {
        void qc.invalidateQueries({ queryKey: ['partnership', vars.partnershipId] })
        void qc.invalidateQueries({ queryKey: ['partnerships-list'] })
        void qc.invalidateQueries({ queryKey: ['dashboard', 'summary'] })
      },
    },
  )
}

// ---------------------------------------------------------------------------
// Create Capital Activity
// ---------------------------------------------------------------------------

export function useCreateCapitalActivity() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { partnershipId: string; body: CreateCapitalActivityEventRequest }>(
    {
      mutationFn: async ({ partnershipId, body }) => {
        return partnershipsClient.createCapitalActivity(partnershipId, body)
      },
      onSuccess: (_result, vars) => {
        void qc.invalidateQueries({ queryKey: ['partnership', vars.partnershipId] })
        void qc.invalidateQueries({ queryKey: ['partnerships-list'] })
        void qc.invalidateQueries({ queryKey: ['dashboard', 'summary'] })
      },
    },
  )
}
