import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { K1TrackerFieldChange, K1TrackerImportDecision } from '../../../../../packages/types/src/k1-tracker'
import { k1TrackerClient } from '../api/k1TrackerClient'

export const k1TrackerKeys = {
  all: ['k1-tracker'] as const,
  list: (search: string) => ['k1-tracker', 'list', search] as const,
  partnership: (id: string) => ['k1-tracker', 'partnership', id] as const,
  year: (id: string, year: number) => ['k1-tracker', 'year', id, year] as const,
}

export const useK1TrackerList = (search: string) => useQuery({ queryKey: k1TrackerKeys.list(search), queryFn: () => k1TrackerClient.list(search || undefined) })
export const useK1TrackerPartnership = (id?: string) => useQuery({ queryKey: k1TrackerKeys.partnership(id ?? ''), queryFn: () => k1TrackerClient.partnership(id!), enabled: Boolean(id) })
export const useK1TrackerYear = (id?: string, year?: number) => useQuery({ queryKey: k1TrackerKeys.year(id ?? '', year ?? 0), queryFn: () => k1TrackerClient.year(id!, year!), enabled: Boolean(id && year) })

export function useK1TrackerYearPrefetch(partnershipId?: string) {
  const client = useQueryClient()
  return (taxYear: number) => {
    if (!partnershipId) return
    void client.prefetchQuery({ queryKey: k1TrackerKeys.year(partnershipId, taxYear), queryFn: () => k1TrackerClient.year(partnershipId, taxYear), staleTime: 30_000 })
  }
}

export function useK1TrackerActions() {
  const client = useQueryClient()
  const refresh = async (partnershipId: string, years: number[] = []) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['k1-tracker', 'list'] }),
      client.invalidateQueries({ queryKey: k1TrackerKeys.partnership(partnershipId) }),
      ...years.map((year) => client.invalidateQueries({ queryKey: k1TrackerKeys.year(partnershipId, year) })),
    ])
  }
  const refreshOnError = (_: unknown, variables: { id: string; year?: number }) => refresh(variables.id, variables.year == null ? [] : [variables.year])

  return {
    createYear: useMutation({ mutationFn: ({ id, year }: { id: string; year: number }) => k1TrackerClient.createYear(id, year), onSuccess: (result, variables) => refresh(variables.id, [result.taxYear]) }),
    updateYear: useMutation({ mutationFn: ({ id, year, revision, changes }: { id: string; year: number; revision: number; changes: K1TrackerFieldChange[] }) => k1TrackerClient.updateYear(id, year, revision, changes), onSuccess: (result, variables) => refresh(variables.id, [variables.year, ...result.invalidatedTaxYears]), onError: refreshOnError }),
    calculate: useMutation({ mutationFn: ({ id, year, revision, changes }: { id: string; year: number; revision: number; changes: K1TrackerFieldChange[] }) => k1TrackerClient.calculate(id, year, revision, changes), onError: refreshOnError }),
    deleteYear: useMutation({ mutationFn: ({ id, year, revision }: { id: string; year: number; revision: number }) => k1TrackerClient.deleteYear(id, year, revision), onSuccess: (_, variables) => refresh(variables.id, [variables.year]), onError: refreshOnError }),
    previewImport: useMutation({ mutationFn: ({ file, id, onProgress }: { file: File; id: string; onProgress?: (progress: number) => void }) => k1TrackerClient.previewImport(file, id, onProgress) }),
    commitImport: useMutation({ mutationFn: ({ batch, id, decisions }: { batch: string; id: string; decisions: K1TrackerImportDecision[] }) => k1TrackerClient.commitImport(batch, id, decisions), onSuccess: (result, variables) => refresh(variables.id, result.importedTaxYears), onError: refreshOnError }),
    signoff: useMutation({ mutationFn: ({ id, year, revision, action }: { id: string; year: number; revision: number; action: 'PREPARED' | 'REVIEWED' | 'INVALIDATED' }) => k1TrackerClient.signoff(id, year, revision, action), onSuccess: (_, variables) => refresh(variables.id, [variables.year]), onError: refreshOnError }),
  }
}
