import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { EntityDetail } from 'packages/types/src'
import { entitiesClient, type EntityListItem } from '../api/entitiesClient'

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
    mutationFn: (name: string) => entitiesClient.create(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entities'] })
      qc.invalidateQueries({ queryKey: ['k1', 'lookups'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useUpdateEntity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => entitiesClient.update(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entities'] })
      qc.invalidateQueries({ queryKey: ['k1', 'lookups'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useDeleteEntity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => entitiesClient.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entities'] })
      qc.invalidateQueries({ queryKey: ['k1', 'lookups'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
