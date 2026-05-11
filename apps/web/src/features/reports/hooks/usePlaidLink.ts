import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { usePlaidLink as useReactPlaidLink } from 'react-plaid-link'
import { reportsClient } from '../api/reportsClient'
import { plaidAccountKeys } from './usePlaidAccounts'

export const usePlaidLink = () => {
  const queryClient = useQueryClient()
  const [linkToken, setLinkToken] = useState<string | null>(null)

  const createToken = useMutation({
    mutationFn: () => reportsClient.createPlaidLinkToken({ mode: 'create' }),
    onSuccess: (data) => setLinkToken(data.linkToken),
  })

  const exchangeToken = useMutation({
    mutationFn: (payload: { publicToken: string; metadata?: Record<string, unknown> }) =>
      reportsClient.exchangePlaidPublicToken({
        publicToken: payload.publicToken,
        metadata: payload.metadata,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: plaidAccountKeys.accounts })
    },
  })

  const config = useMemo(
    () => ({
      token: linkToken,
      onSuccess: (publicToken: string, metadata: Record<string, unknown>) => {
        exchangeToken.mutate({ publicToken, metadata })
      },
    }),
    [exchangeToken, linkToken],
  )

  const plaid = useReactPlaidLink(config)

  const open = useCallback(async () => {
    if (!linkToken) {
      const token = await createToken.mutateAsync()
      setLinkToken(token.linkToken)
      return
    }

    if (plaid.ready) {
      plaid.open()
    }
  }, [createToken, linkToken, plaid])

  return {
    open,
    ready: plaid.ready,
    isLoading: createToken.isPending || exchangeToken.isPending,
    error: createToken.error ?? exchangeToken.error,
  }
}
