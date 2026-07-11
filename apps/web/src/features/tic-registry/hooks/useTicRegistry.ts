import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateTicInterestRequest,
  CreateTicOwnerRequest,
  CreateTicPropertyRequest,
  TicRegistryQuery,
  UpdateTicInterestRequest,
  UpdateTicOwnerRequest,
  UpdateTicPropertyRequest,
} from '../../../../../../packages/types/src/tic-registry'
import { ticRegistryClient } from '../api/ticRegistryClient'

export const ticRegistryKeys = {
  all: ['tic-registry'] as const,
  properties: (query?: TicRegistryQuery) =>
    ['tic-registry', 'properties', query ?? {}] as const,
  property: (propertyId: string) => ['tic-registry', 'property', propertyId] as const,
}

export function useTicRegistry(query?: TicRegistryQuery) {
  return useQuery({
    queryKey: ticRegistryKeys.properties(query),
    queryFn: () => ticRegistryClient.listProperties(query),
  })
}

export function useTicProperty(propertyId: string | undefined) {
  return useQuery({
    queryKey: propertyId ? ticRegistryKeys.property(propertyId) : ticRegistryKeys.property(''),
    queryFn: () => ticRegistryClient.getProperty(propertyId!),
    enabled: Boolean(propertyId),
  })
}

export function useCreateTicProperty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateTicPropertyRequest) => ticRegistryClient.createProperty(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticRegistryKeys.all })
    },
  })
}

export function useUpdateTicProperty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      propertyId,
      payload,
    }: {
      propertyId: string
      payload: UpdateTicPropertyRequest
    }) => ticRegistryClient.updateProperty(propertyId, payload),
    onSuccess: (property) => {
      queryClient.invalidateQueries({ queryKey: ticRegistryKeys.all })
      queryClient.setQueryData(ticRegistryKeys.property(property.id), property)
    },
  })
}

export function useDeleteTicProperty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      propertyId,
      expectedUpdatedAt,
    }: {
      propertyId: string
      expectedUpdatedAt: string
    }) => ticRegistryClient.deleteProperty(propertyId, expectedUpdatedAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticRegistryKeys.all })
    },
  })
}

export function useCreateTicInterest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      propertyId,
      payload,
    }: {
      propertyId: string
      payload: CreateTicInterestRequest
    }) => ticRegistryClient.createInterest(propertyId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticRegistryKeys.all })
    },
  })
}

export function useUpdateTicInterest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      interestId,
      payload,
    }: {
      interestId: string
      payload: UpdateTicInterestRequest
    }) => ticRegistryClient.updateInterest(interestId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticRegistryKeys.all })
    },
  })
}

export function useDeleteTicInterest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      interestId,
      expectedUpdatedAt,
    }: {
      interestId: string
      expectedUpdatedAt: string
    }) => ticRegistryClient.deleteInterest(interestId, expectedUpdatedAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticRegistryKeys.all })
    },
  })
}

export function useCreateTicOwner() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ interestId, payload }: { interestId: string; payload: CreateTicOwnerRequest }) =>
      ticRegistryClient.createOwner(interestId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticRegistryKeys.all })
    },
  })
}

export function useUpdateTicOwner() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ownerId, payload }: { ownerId: string; payload: UpdateTicOwnerRequest }) =>
      ticRegistryClient.updateOwner(ownerId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticRegistryKeys.all })
    },
  })
}

export function useDeleteTicOwner() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      ownerId,
      expectedUpdatedAt,
    }: {
      ownerId: string
      expectedUpdatedAt: string
    }) => ticRegistryClient.deleteOwner(ownerId, expectedUpdatedAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticRegistryKeys.all })
    },
  })
}
