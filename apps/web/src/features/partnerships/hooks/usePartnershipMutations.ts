import { useMutation, useQueryClient } from '@tanstack/react-query'
import { partnershipsClient } from '../api/partnershipsClient'
import type { CreatePartnershipRequest, UpdatePartnershipRequest, DuplicatePartnershipNameError } from 'packages/types/src'

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
      if ('kind' in result) return result
      return { ok: true as const, id: result.id }
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
      const result = await partnershipsClient.update(id, body)
      if ('kind' in result) return result
      return { ok: true as const }
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
