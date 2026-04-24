import { useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  CreateAssetFmvSnapshotRequest,
  CreatePartnershipAssetRequest,
} from '../../../../../packages/types/src/partnership-management'
import { assetsClient } from '../api/assetsClient'

export function useCreatePartnershipAsset(partnershipId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreatePartnershipAssetRequest) => assetsClient.create(partnershipId, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['partnership-assets', partnershipId] }),
        queryClient.invalidateQueries({ queryKey: ['partnership', partnershipId] }),
      ])
    },
  })
}

export function useRecordAssetFmvSnapshot(partnershipId: string, assetId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateAssetFmvSnapshotRequest) =>
      assetsClient.createFmvSnapshot(partnershipId, assetId, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['partnership-assets', partnershipId] }),
        queryClient.invalidateQueries({ queryKey: ['partnership-asset-detail', partnershipId, assetId] }),
        queryClient.invalidateQueries({ queryKey: ['partnership-asset-fmv-history', partnershipId, assetId] }),
        queryClient.invalidateQueries({ queryKey: ['partnership', partnershipId] }),
      ])
    },
  })
}