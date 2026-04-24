import { useMutation, useQueryClient } from '@tanstack/react-query'
import { partnershipsClient, PartnershipsApiError } from '../api/partnershipsClient'
import type {
  CreatePartnershipRequest,
  UpdatePartnershipRequest,
  DuplicatePartnershipNameError,
  CreatePartnershipCommitmentRequest,
  CreateCapitalActivityEventRequest,
} from 'packages/types/src'

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
      try {
        const p = await partnershipsClient.create(body)
        return { ok: true as const, id: p.id }
      } catch (err) {
        if (err instanceof PartnershipsApiError && err.status === 409) {
          return { kind: 'duplicate-name' as const }
        }
        throw err
      }
    },
    onSuccess: (result, vars) => {
      if ('ok' in result && result.ok) {
        void qc.invalidateQueries({ queryKey: ['partnerships-list'] })
        void qc.invalidateQueries({ queryKey: ['entity', vars.entityId] })
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
      try {
        await partnershipsClient.update(id, body)
        return { ok: true as const }
      } catch (err) {
        if (err instanceof PartnershipsApiError && err.status === 409) {
          return { kind: 'duplicate-name' as const }
        }
        throw err
      }
    },
    onSuccess: (result, vars) => {
      if ('ok' in result && result.ok) {
        void qc.invalidateQueries({ queryKey: ['partnerships-list'] })
        void qc.invalidateQueries({ queryKey: ['partnership', vars.id] })
        void qc.invalidateQueries({ queryKey: ['entity', vars.entityId] })
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
