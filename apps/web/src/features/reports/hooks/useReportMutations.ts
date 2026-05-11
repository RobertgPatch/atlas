import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { UpdatePortfolioOriginalCommitmentRequest } from '../../../../../../packages/types/src/reports'
import { reportsClient, ReportsApiError } from '../api/reportsClient'

interface SaveCommitmentInput {
  partnershipId: string
  commitmentId: string
  previousValue: number
  nextValue: number
  expectedUpdatedAt?: string
}

export interface ReportUndoState {
  partnershipId: string
  commitmentId: string
  previousValue: number
  expectedUpdatedAt: string
}

interface SaveActivityDetailInput {
  rowId: string
  expectedUpdatedAt?: string
  previousValues: {
    beginningBasisUsd: number | null
    contributionsUsd: number | null
    otherAdjustmentsUsd: number | null
    endingGlBalanceUsd: number | null
    notes: string | null
  }
  patch: {
    beginningBasisUsd?: number | null
    contributionsUsd?: number | null
    otherAdjustmentsUsd?: number | null
    endingGlBalanceUsd?: number | null
    notes?: string | null
  }
}

export interface ActivityDetailUndoState {
  rowId: string
  expectedUpdatedAt: string
  previousValues: {
    beginningBasisUsd: number | null
    contributionsUsd: number | null
    otherAdjustmentsUsd: number | null
    endingGlBalanceUsd: number | null
    notes: string | null
  }
}

export type SaveCommitmentResult =
  | { status: 'ok' }
  | { status: 'conflict'; message: string }

export type UndoCommitmentResult =
  | { status: 'ok' }
  | { status: 'noop' }
  | { status: 'conflict'; message: string }

export type SaveActivityDetailResult =
  | { status: 'ok' }
  | { status: 'conflict'; message: string }

export type UndoActivityDetailResult =
  | { status: 'ok' }
  | { status: 'noop' }
  | { status: 'conflict'; message: string }

export const useReportMutations = () => {
  const queryClient = useQueryClient()
  const [undoState, setUndoState] = useState<ReportUndoState | null>(null)
  const [activityUndoState, setActivityUndoState] = useState<ActivityDetailUndoState | null>(null)

  const invalidateReportQueries = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['reports', 'portfolio-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['reports', 'asset-class-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['reports', 'activity-detail'] }),
      queryClient.invalidateQueries({ queryKey: ['partnerships-list'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] }),
    ])

  const saveMutation = useMutation<SaveCommitmentResult, Error, SaveCommitmentInput>({
    mutationFn: async (input) => {
      const payload: UpdatePortfolioOriginalCommitmentRequest = {
        partnershipId: input.partnershipId,
        commitmentId: input.commitmentId,
        commitmentAmountUsd: input.nextValue,
        expectedUpdatedAt: input.expectedUpdatedAt,
      }

      try {
        const updated = await reportsClient.updatePortfolioOriginalCommitment(payload)

        setUndoState({
          partnershipId: input.partnershipId,
          commitmentId: input.commitmentId,
          previousValue: input.previousValue,
          expectedUpdatedAt: updated.updatedAt,
        })

        return { status: 'ok' }
      } catch (error) {
        if (error instanceof ReportsApiError && error.code === 'STALE_COMMITMENT_UPDATE') {
          return {
            status: 'conflict',
            message: 'This value changed in another session. Refresh and try again.',
          }
        }
        throw error
      }
    },
    onSuccess: () => {
      void invalidateReportQueries()
    },
  })

  const undoMutation = useMutation<UndoCommitmentResult, Error, void>({
    mutationFn: async () => {
      if (!undoState) return { status: 'noop' }

      try {
        await reportsClient.updatePortfolioOriginalCommitment({
          partnershipId: undoState.partnershipId,
          commitmentId: undoState.commitmentId,
          commitmentAmountUsd: undoState.previousValue,
          expectedUpdatedAt: undoState.expectedUpdatedAt,
        })

        setUndoState(null)
        return { status: 'ok' }
      } catch (error) {
        if (error instanceof ReportsApiError && error.code === 'STALE_COMMITMENT_UPDATE') {
          setUndoState(null)
          return {
            status: 'conflict',
            message: 'Undo failed because the value changed. Refresh to continue.',
          }
        }
        throw error
      }
    },
    onSuccess: () => {
      void invalidateReportQueries()
    },
  })

  const saveActivityDetailMutation = useMutation<SaveActivityDetailResult, Error, SaveActivityDetailInput>({
    mutationFn: async (input) => {
      try {
        const updated = await reportsClient.updateActivityDetailRow({
          rowId: input.rowId,
          ...input.patch,
          expectedUpdatedAt: input.expectedUpdatedAt,
        })

        setActivityUndoState({
          rowId: input.rowId,
          expectedUpdatedAt: updated.updatedAt,
          previousValues: input.previousValues,
        })

        return { status: 'ok' }
      } catch (error) {
        if (error instanceof ReportsApiError && error.code === 'STALE_ACTIVITY_DETAIL_UPDATE') {
          return {
            status: 'conflict',
            message: 'This row changed in another session. Refresh and try again.',
          }
        }
        throw error
      }
    },
    onSuccess: () => {
      void invalidateReportQueries()
    },
  })

  const undoActivityDetailMutation = useMutation<UndoActivityDetailResult, Error, void>({
    mutationFn: async () => {
      if (!activityUndoState) return { status: 'noop' }

      try {
        await reportsClient.undoActivityDetailEdit({ rowId: activityUndoState.rowId })
        setActivityUndoState(null)
        return { status: 'ok' }
      } catch (error) {
        if (error instanceof ReportsApiError) {
          if (
            error.code === 'STALE_ACTIVITY_DETAIL_UPDATE' ||
            error.code === 'ACTIVITY_DETAIL_UNDO_NOT_AVAILABLE'
          ) {
            setActivityUndoState(null)
            return {
              status: 'conflict',
              message: 'Undo failed because the row changed. Refresh to continue.',
            }
          }
        }
        throw error
      }
    },
    onSuccess: () => {
      void invalidateReportQueries()
    },
  })

  return {
    saveOriginalCommitment: saveMutation.mutateAsync,
    undoLatestCommitmentEdit: undoMutation.mutateAsync,
    saveActivityDetailRow: saveActivityDetailMutation.mutateAsync,
    undoLatestActivityDetailEdit: undoActivityDetailMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isUndoing: undoMutation.isPending,
    isSavingActivityDetail: saveActivityDetailMutation.isPending,
    isUndoingActivityDetail: undoActivityDetailMutation.isPending,
    undoState,
    activityUndoState,
    clearUndoState: () => setUndoState(null),
    clearActivityUndoState: () => setActivityUndoState(null),
    hasUndoAvailable: useMemo(() => undoState != null, [undoState]),
    hasActivityUndoAvailable: useMemo(() => activityUndoState != null, [activityUndoState]),
  }
}
