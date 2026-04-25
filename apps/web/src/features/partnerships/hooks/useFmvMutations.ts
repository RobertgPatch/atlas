import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fmvClient } from '../api/fmvClient'
import type { CreateFmvSnapshotRequest, FmvSnapshot } from 'packages/types/src'

type CreateFmvVars = { partnershipId: string; body: CreateFmvSnapshotRequest }

export function useRecordFmvSnapshot() {
  const qc = useQueryClient()
  return useMutation<FmvSnapshot, Error, CreateFmvVars>({
    mutationFn: ({ partnershipId, body }) => fmvClient.create(partnershipId, body),
    onSuccess: (_snapshot, vars) => {
      void qc.invalidateQueries({ queryKey: ['partnership', vars.partnershipId] })
      void qc.invalidateQueries({ queryKey: ['partnerships-list'] })
    },
  })
}
