import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { EntityDetail } from 'packages/types/src'
import {
  entitiesClient,
  type CreateEntityInput,
  type EntityListItem,
} from '../api/entitiesClient'

const invalidateOwnerReads = (qc: ReturnType<typeof useQueryClient>) => Promise.all([
  qc.invalidateQueries({ queryKey: ['entity'] }),
  qc.invalidateQueries({ queryKey: ['entities'] }),
  qc.invalidateQueries({ queryKey: ['k1'] }),
  qc.invalidateQueries({ queryKey: ['k1-tracker'] }),
  qc.invalidateQueries({ queryKey: ['partnership-tracker'] }),
  qc.invalidateQueries({ queryKey: ['partnership-tracker', 'aggregation'] }),
  qc.invalidateQueries({ queryKey: ['partnerships-list'] }),
  qc.invalidateQueries({ queryKey: ['partnership'] }),
  qc.invalidateQueries({ queryKey: ['dashboard'] }),
  qc.invalidateQueries({ queryKey: ['reports'] }),
])

export function useEntityDetail(id: string | undefined) {
  return useQuery<EntityDetail, Error>({
    queryKey: ['entity', id],
    queryFn: () => entitiesClient.get(id!),
    enabled: !!id,
  })
}

export function useEntityList() {
  return useQuery<{ items: EntityListItem[] }, Error>({
    queryKey: ['entities'],
    queryFn: () => entitiesClient.list(),
  })
}

export function useCreateEntity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: string | CreateEntityInput) => entitiesClient.create(input),
    onSuccess: () => invalidateOwnerReads(qc),
  })
}

export function useUpdateEntity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => entitiesClient.update(id, name),
    onSuccess: () => invalidateOwnerReads(qc),
  })
}

export function useDeleteEntity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => entitiesClient.remove(id),
    onSuccess: () => invalidateOwnerReads(qc),
  })
}
