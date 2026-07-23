import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreatePartnershipCommitmentEntryRequest,
  CreatePartnershipCashFlowRequest,
  CreatePartnershipCashFlowsRequest,
  CreatePartnershipNavEntryRequest,
  CreateTrackedPartnershipRequest,
  K1TrackerFieldChange,
  PartnershipTrackerSignoffAction,
  UpdatePartnershipCommitmentEntryRequest,
  UpdatePartnershipNavEntryRequest,
  UpdateTrackedPartnershipRequest,
} from '../../../../../../packages/types/src/partnership-tracker'
import type { K1TrackerOfficialFormData } from '../../../../../../packages/types/src/k1-tracker'
import { partnershipTrackerClient, type PartnershipAggregationParams, type PartnershipTrackerListParams } from '../api/partnershipTrackerClient'

export const partnershipTrackerKeys = {
  all: ['partnership-tracker'] as const,
  lists: () => ['partnership-tracker', 'list'] as const,
  list: (params: PartnershipTrackerListParams) => ['partnership-tracker', 'list', params] as const,
  aggregations: () => ['partnership-tracker', 'aggregation'] as const,
  aggregation: (params: PartnershipAggregationParams) => ['partnership-tracker', 'aggregation', params] as const,
  detail: (id: string) => ['partnership-tracker', 'detail', id] as const,
  commitments: (id: string, asOfDate?: string) => ['partnership-tracker', 'commitments', id, asOfDate ?? 'current'] as const,
  managementFees: (id: string, asOfDate?: string) => ['partnership-tracker', 'management-fees', id, asOfDate ?? 'current'] as const,
  nav: (id: string) => ['partnership-tracker', 'nav', id] as const,
  year: (id: string, year: number) => ['partnership-tracker', 'year', id, year] as const,
}

export const usePartnershipTrackerList = (params: PartnershipTrackerListParams = {}) => useQuery({ queryKey: partnershipTrackerKeys.list(params), queryFn: () => partnershipTrackerClient.list(params) })
export const usePartnershipAggregation = (params: PartnershipAggregationParams = {}) => useQuery({
  queryKey: partnershipTrackerKeys.aggregation(params),
  queryFn: () => partnershipTrackerClient.aggregation(params),
  placeholderData: keepPreviousData,
})
export const usePartnershipTrackerDetail = (id?: string) => useQuery({ queryKey: partnershipTrackerKeys.detail(id ?? ''), queryFn: () => partnershipTrackerClient.get(id!), enabled: Boolean(id) })
export const usePartnershipTrackerCommitments = (id?: string, asOfDate?: string) => useQuery({ queryKey: partnershipTrackerKeys.commitments(id ?? '', asOfDate), queryFn: () => partnershipTrackerClient.listCommitments(id!, asOfDate), enabled: Boolean(id) })
export const usePartnershipManagementFees = (id?: string, asOfDate?: string) => useQuery({ queryKey: partnershipTrackerKeys.managementFees(id ?? '', asOfDate), queryFn: () => partnershipTrackerClient.managementFees(id!, asOfDate), enabled: Boolean(id) })
export const usePartnershipTrackerNav = (id?: string) => useQuery({ queryKey: partnershipTrackerKeys.nav(id ?? ''), queryFn: () => partnershipTrackerClient.listNav(id!), enabled: Boolean(id) })
export const usePartnershipTrackerYear = (id?: string, year?: number) => useQuery({ queryKey: partnershipTrackerKeys.year(id ?? '', year ?? 0), queryFn: () => partnershipTrackerClient.getYear(id!, year!), enabled: Boolean(id && year) })

export function usePartnershipTrackerActions() {
  const queryClient = useQueryClient()
  const refreshPartnership = async (id: string, year?: number) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: partnershipTrackerKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: partnershipTrackerKeys.aggregations() }),
      queryClient.invalidateQueries({ queryKey: partnershipTrackerKeys.detail(id) }),
      queryClient.invalidateQueries({ queryKey: ['partnership-tracker', 'commitments', id] }),
      queryClient.invalidateQueries({ queryKey: ['partnership-tracker', 'management-fees', id] }),
      queryClient.invalidateQueries({ queryKey: ['entity'] }),
      queryClient.invalidateQueries({ queryKey: ['entities'] }),
      queryClient.invalidateQueries({ queryKey: ['k1'] }),
      queryClient.invalidateQueries({ queryKey: ['k1-tracker'] }),
      queryClient.invalidateQueries({ queryKey: ['partnerships-list'] }),
      queryClient.invalidateQueries({ queryKey: ['partnership'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ...(year == null ? [] : [queryClient.invalidateQueries({ queryKey: partnershipTrackerKeys.year(id, year) })]),
    ])
  }
  const refreshCapital = async (id: string) => Promise.all([
    queryClient.invalidateQueries({ queryKey: partnershipTrackerKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: partnershipTrackerKeys.aggregations() }),
    queryClient.invalidateQueries({ queryKey: partnershipTrackerKeys.detail(id) }),
    queryClient.invalidateQueries({ queryKey: ['partnership-tracker', 'commitments', id] }),
  ])
  const refreshNav = async (id: string) => Promise.all([
    queryClient.invalidateQueries({ queryKey: partnershipTrackerKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: partnershipTrackerKeys.aggregations() }),
    queryClient.invalidateQueries({ queryKey: partnershipTrackerKeys.detail(id) }),
    queryClient.invalidateQueries({ queryKey: partnershipTrackerKeys.nav(id) }),
  ])
  return {
    createPartnership: useMutation({ mutationFn: (body: CreateTrackedPartnershipRequest) => partnershipTrackerClient.create(body), onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: partnershipTrackerKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: partnershipTrackerKeys.aggregations() }),
    ]) }),
    updatePartnership: useMutation({ mutationFn: ({ id, body }: { id: string; body: UpdateTrackedPartnershipRequest }) => partnershipTrackerClient.update(id, body), onSuccess: (_, variables) => refreshPartnership(variables.id), onError: (_, variables) => refreshPartnership(variables.id) }),
    deletePartnership: useMutation({
      mutationFn: (id: string) => partnershipTrackerClient.delete(id),
      onSuccess: async (_, id) => {
        queryClient.removeQueries({ queryKey: partnershipTrackerKeys.detail(id) })
        queryClient.removeQueries({ queryKey: ['partnership-tracker', 'commitments', id] })
        queryClient.removeQueries({ queryKey: partnershipTrackerKeys.nav(id) })
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: partnershipTrackerKeys.lists() }),
          queryClient.invalidateQueries({ queryKey: partnershipTrackerKeys.aggregations() }),
          queryClient.invalidateQueries({ queryKey: ['partnerships-list'] }),
          queryClient.invalidateQueries({ queryKey: ['partnership'] }),
          queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
          queryClient.invalidateQueries({ queryKey: ['reports'] }),
        ])
      },
    }),
    createCommitment: useMutation({ mutationFn: ({ id, body }: { id: string; body: CreatePartnershipCommitmentEntryRequest }) => partnershipTrackerClient.createCommitment(id, body), onSuccess: (_, variables) => refreshCapital(variables.id) }),
    updateCommitment: useMutation({ mutationFn: ({ id, entryId, body }: { id: string; entryId: string; body: UpdatePartnershipCommitmentEntryRequest }) => partnershipTrackerClient.updateCommitment(id, entryId, body), onSuccess: (_, variables) => refreshCapital(variables.id), onError: (_, variables) => refreshCapital(variables.id) }),
    deleteCommitment: useMutation({ mutationFn: ({ id, entryId, expectedUpdatedAt }: { id: string; entryId: string; expectedUpdatedAt: string }) => partnershipTrackerClient.deleteCommitment(id, entryId, expectedUpdatedAt), onSuccess: (_, variables) => refreshCapital(variables.id), onError: (_, variables) => refreshCapital(variables.id) }),
    createNav: useMutation({ mutationFn: ({ id, body }: { id: string; body: CreatePartnershipNavEntryRequest }) => partnershipTrackerClient.createNav(id, body), onSuccess: (_, variables) => refreshNav(variables.id) }),
    updateNav: useMutation({ mutationFn: ({ id, entryId, body }: { id: string; entryId: string; body: UpdatePartnershipNavEntryRequest }) => partnershipTrackerClient.updateNav(id, entryId, body), onSuccess: (_, variables) => refreshNav(variables.id), onError: (_, variables) => refreshNav(variables.id) }),
    deleteNav: useMutation({ mutationFn: ({ id, entryId, expectedUpdatedAt }: { id: string; entryId: string; expectedUpdatedAt: string }) => partnershipTrackerClient.deleteNav(id, entryId, expectedUpdatedAt), onSuccess: (_, variables) => refreshNav(variables.id), onError: (_, variables) => refreshNav(variables.id) }),
    createYear: useMutation({ mutationFn: ({ id, year }: { id: string; year: number }) => partnershipTrackerClient.createYear(id, year), onSuccess: (_, variables) => refreshPartnership(variables.id, variables.year) }),
    updateYear: useMutation({ mutationFn: ({ id, year, expectedRevision, changes, officialFormData }: { id: string; year: number; expectedRevision: number; changes: K1TrackerFieldChange[]; officialFormData?: K1TrackerOfficialFormData }) => partnershipTrackerClient.updateYear(id, year, { expectedRevision, changes, officialFormData }), onSuccess: (_, variables) => refreshPartnership(variables.id, variables.year), onError: (_, variables) => refreshPartnership(variables.id, variables.year) }),
    deleteYear: useMutation({ mutationFn: ({ id, year, expectedRevision }: { id: string; year: number; expectedRevision: number }) => partnershipTrackerClient.deleteYear(id, year, expectedRevision), onSuccess: (_, variables) => refreshPartnership(variables.id, variables.year), onError: (_, variables) => refreshPartnership(variables.id, variables.year) }),
    calculate: useMutation({ mutationFn: ({ id, year, expectedRevision, changes }: { id: string; year: number; expectedRevision: number; changes: K1TrackerFieldChange[] }) => partnershipTrackerClient.calculate(id, year, expectedRevision, { changes }) }),
    createCashFlow: useMutation({ mutationFn: ({ id, year, body }: { id: string; year: number; body: CreatePartnershipCashFlowRequest }) => partnershipTrackerClient.createCashFlow(id, year, body), onSuccess: (_, variables) => refreshPartnership(variables.id, variables.year) }),
    createCashFlows: useMutation({ mutationFn: ({ id, year, body }: { id: string; year: number; body: CreatePartnershipCashFlowsRequest }) => partnershipTrackerClient.createCashFlows(id, year, body), onSuccess: (_, variables) => refreshPartnership(variables.id, variables.year) }),
    deleteCashFlow: useMutation({ mutationFn: ({ id, year, cashFlowId, expectedUpdatedAt }: { id: string; year: number; cashFlowId: string; expectedUpdatedAt: string }) => partnershipTrackerClient.deleteCashFlow(id, year, cashFlowId, expectedUpdatedAt), onSuccess: (_, variables) => refreshPartnership(variables.id, variables.year), onError: (_, variables) => refreshPartnership(variables.id, variables.year) }),
    signoff: useMutation({ mutationFn: ({ id, year, expectedRevision, action, reason }: { id: string; year: number; expectedRevision: number; action: PartnershipTrackerSignoffAction; reason?: string }) => partnershipTrackerClient.signoff(id, year, expectedRevision, action, reason), onSuccess: (_, variables) => refreshPartnership(variables.id, variables.year), onError: (_, variables) => refreshPartnership(variables.id, variables.year) }),
  }
}
