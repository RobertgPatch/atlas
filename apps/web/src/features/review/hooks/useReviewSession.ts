import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { reviewClient, K1ReviewError } from '../api/reviewClient'
import { k1Client, K1ApiError } from '../../k1/api/k1Client'
import type {
  K1ApplicationPreview,
  K1ApplyRequest,
  K1ApplyResponse,
} from '../../../../../../packages/types/src/k1-ingestion'
import type {
  K1CorrectionsRequest,
  K1MapEntityRequest,
  K1MapPartnershipRequest,
  K1OpenIssueRequest,
  K1ReviewSession,
  K1ResolveIssueRequest,
  K1ResolveMatchRequest,
} from '../../../../../../packages/types/src/review-finalization'

const sessionKey = (k1DocumentId: string) => ['review-session', k1DocumentId] as const

/** Returns the review session + track its version for optimistic-concurrency headers. */
export const useReviewSession = (k1DocumentId: string) =>
  useQuery({
    queryKey: sessionKey(k1DocumentId),
    queryFn: async () => {
      const r = await reviewClient.getSession(k1DocumentId)
      return { ...r.body, version: r.version } as K1ReviewSession
    },
    staleTime: 0, // always fresh
    refetchOnWindowFocus: false,
  })

const refetchSession =
  (qc: ReturnType<typeof useQueryClient>) =>
  async (k1DocumentId: string): Promise<void> => {
    await qc.invalidateQueries({ queryKey: sessionKey(k1DocumentId) })
  }

/** Mutations share a common post-success refetch + error surfacing. */
export const useSaveCorrections = (k1DocumentId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { body: K1CorrectionsRequest; version: number }) => {
      const r = await reviewClient.saveCorrections(k1DocumentId, args.body, args.version)
      return r.body
    },
    onSettled: () => refetchSession(qc)(k1DocumentId),
  })
}

export const useMapEntity = (k1DocumentId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { body: K1MapEntityRequest; version: number }) => {
      const r = await reviewClient.mapEntity(k1DocumentId, args.body, args.version)
      return r.body
    },
    onSettled: () => refetchSession(qc)(k1DocumentId),
  })
}

export const useMapPartnership = (k1DocumentId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { body: K1MapPartnershipRequest; version: number }) => {
      const r = await reviewClient.mapPartnership(k1DocumentId, args.body, args.version)
      return r.body
    },
    onSettled: () => refetchSession(qc)(k1DocumentId),
  })
}

export const useApproveK1 = (k1DocumentId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { version: number }) => {
      const r = await reviewClient.approve(k1DocumentId, args.version)
      return r.body
    },
    onSettled: () => refetchSession(qc)(k1DocumentId),
  })
}

export const useFinalizeK1 = (k1DocumentId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { version: number }) => {
      const r = await reviewClient.finalize(k1DocumentId, args.version)
      return r.body
    },
    onSettled: () => refetchSession(qc)(k1DocumentId),
  })
}

export const useOpenIssue = (k1DocumentId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { body: K1OpenIssueRequest; version: number }) => {
      const r = await reviewClient.openIssue(k1DocumentId, args.body, args.version)
      return r.body
    },
    onSettled: () => refetchSession(qc)(k1DocumentId),
  })
}

export const useResolveIssue = (k1DocumentId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { issueId: string; version: number; body?: K1ResolveIssueRequest }) => {
      const r = await reviewClient.resolveIssue(k1DocumentId, args.issueId, args.version, args.body)
      return r.body
    },
    onSettled: () => refetchSession(qc)(k1DocumentId),
  })
}

export const useResolveMatch = (k1DocumentId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: K1ResolveMatchRequest) => (await reviewClient.resolveMatch(k1DocumentId, body)).body,
    onSettled: () => refetchSession(qc)(k1DocumentId),
  })
}

export const useK1ApplyPreview = (k1DocumentId: string) => useMutation<
  K1ApplicationPreview,
  K1ApiError,
  { expectedDocumentVersion: number }
>({
  mutationFn: (body) => k1Client.previewApplication(k1DocumentId, body),
})

export const useApplyK1 = (k1DocumentId: string) => {
  const qc = useQueryClient()
  return useMutation<K1ApplyResponse, K1ApiError, K1ApplyRequest>({
    mutationFn: (body) => k1Client.apply(k1DocumentId, body),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: sessionKey(k1DocumentId) }),
        qc.invalidateQueries({ queryKey: ['k1'] }),
        qc.invalidateQueries({ queryKey: ['k1-tracker'] }),
        qc.invalidateQueries({ queryKey: ['partnership-tracker'] }),
      ])
    },
  })
}

export { K1ApiError, K1ReviewError }
