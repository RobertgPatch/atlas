import { useQuery } from '@tanstack/react-query'
import type {
  AssetFmvSnapshot,
  PartnershipAssetDetail,
  PartnershipAssetsResponse,
} from '../../../../../packages/types/src/partnership-management'
import { assetsClient } from '../api/assetsClient'

export function usePartnershipAssets(partnershipId: string | undefined) {
  return useQuery<PartnershipAssetsResponse, Error>({
    queryKey: ['partnership-assets', partnershipId],
    queryFn: () => assetsClient.list(partnershipId!),
    enabled: Boolean(partnershipId),
  })
}

export function useAssetDetail(partnershipId: string | undefined, assetId: string | null) {
  return useQuery<PartnershipAssetDetail, Error>({
    queryKey: ['partnership-asset-detail', partnershipId, assetId],
    queryFn: () => assetsClient.get(partnershipId!, assetId!),
    enabled: Boolean(partnershipId && assetId),
  })
}

export function useAssetFmvHistory(partnershipId: string | undefined, assetId: string | null, enabled = true) {
  return useQuery<AssetFmvSnapshot[], Error>({
    queryKey: ['partnership-asset-fmv-history', partnershipId, assetId],
    queryFn: () => assetsClient.listFmvSnapshots(partnershipId!, assetId!),
    enabled: Boolean(enabled && partnershipId && assetId),
  })
}