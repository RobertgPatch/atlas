import {
  useMutation,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query'
import { k1Client, type K1Filters } from '../api/k1Client'
import type { K1IngestionBatchFilters, K1Status } from '../../../../../../packages/types/src/k1-ingestion'

const POLL_MS = 5_000

export const k1Keys = {
  all: ['k1'] as const,
  list: (f: K1Filters) => ['k1', 'list', f] as const,
  kpis: (scope: { taxYear?: number; entityId?: string }) => ['k1', 'kpis', scope] as const,
  lookups: () => ['k1', 'lookups'] as const,
  detail: (id: string) => ['k1', 'detail', id] as const,
  batch: (id: string) => ['k1', 'batch', id] as const,
  batches: (filters: Omit<K1IngestionBatchFilters, 'cursor'>) => ['k1', 'batches', filters] as const,
}

const hasInFlightParsing = (statuses: K1Status[]) =>
  statuses.some((s) => s === 'UPLOADED' || s === 'PROCESSING')

export const useK1List = (filters: K1Filters) =>
  useQuery({
    queryKey: k1Keys.list(filters),
    queryFn: () => k1Client.listDocuments(filters),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => {
      const data = q.state.data
      if (!data) return false
      return hasInFlightParsing(data.items.map((i) => i.status)) ? POLL_MS : false
    },
  })

export const useK1Kpis = (scope: { taxYear?: number; entityId?: string }) =>
  useQuery({
    queryKey: k1Keys.kpis(scope),
    queryFn: () => k1Client.getKpis(scope),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => {
      const data = q.state.data
      if (!data) return false
      return (data.counts.UPLOADED + data.counts.PROCESSING) > 0 ? POLL_MS : false
    },
  })

export const useK1Lookups = () =>
  useQuery({
    queryKey: k1Keys.lookups(),
    queryFn: async () => ({
      entities: (await k1Client.listEntities()).items,
    }),
    staleTime: 60_000,
  })

export const useK1Upload = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: k1Client.upload,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: k1Keys.all })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export const useK1BatchUpload = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: k1Client.uploadBatch,
    onSuccess: (batch) => {
      qc.setQueryData(k1Keys.batch(batch.id), batch)
      qc.invalidateQueries({ queryKey: k1Keys.all })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export const useK1Batch = (batchId: string | null) => useQuery({
  queryKey: k1Keys.batch(batchId ?? ''),
  queryFn: () => k1Client.getBatch(batchId!),
  enabled: Boolean(batchId),
  refetchInterval: (query) => {
    const status = query.state.data?.status
    return status && ['OPEN', 'PROCESSING'].includes(status) ? POLL_MS : false
  },
})

export const useK1Batches = (filters: Omit<K1IngestionBatchFilters, 'cursor'> = {}) => useInfiniteQuery({
  queryKey: k1Keys.batches(filters),
  initialPageParam: null as string | null,
  queryFn: ({ pageParam }) => k1Client.listBatches({ ...filters, cursor: pageParam ?? undefined }),
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  refetchOnReconnect: true,
  refetchInterval: (query) => {
    const pages = query.state.data?.pages
    return pages?.some((page) => page.counts.active > 0) ? POLL_MS : false
  },
})

export const useCancelK1BatchItem = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => k1Client.cancelBatchItem(itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: k1Keys.all }),
  })
}

export const useDeleteK1BatchItem = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => k1Client.deleteBatchItem(itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: k1Keys.all }),
  })
}

export const useRetryK1Extraction = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { k1DocumentId: string; expectedDocumentVersion: number }) =>
      k1Client.retryExtraction(args.k1DocumentId, args.expectedDocumentVersion),
    onSuccess: () => qc.invalidateQueries({ queryKey: k1Keys.all }),
  })
}

export const useK1Reparse = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => k1Client.reparse(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: k1Keys.all })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
