import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePlaidLink as useReactPlaidLink } from 'react-plaid-link'
import { reportsClient } from '../api/reportsClient'
import { plaidAccountKeys } from './usePlaidAccounts'

export const usePlaidLink = () => {
  const queryClient = useQueryClient()
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const shouldOpenWhenReady = useRef(false)

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
      setLinkToken(null)
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

  useEffect(() => {
    if (!shouldOpenWhenReady.current || !plaid.ready) return
    shouldOpenWhenReady.current = false
    plaid.open()
  }, [plaid])

  const prepare = useCallback(async () => {
    if (linkToken || createToken.isPending) return
    await createToken.mutateAsync()
  }, [createToken, linkToken])

  const open = useCallback(async () => {
    if (plaid.ready) {
      plaid.open()
      return
    }

    shouldOpenWhenReady.current = true

    if (!linkToken && !createToken.isPending) {
      try {
        await createToken.mutateAsync()
      } catch {
        shouldOpenWhenReady.current = false
      }
    }
  }, [createToken, linkToken, plaid])

  return {
    open,
    prepare,
    ready: plaid.ready,
    isLoading: createToken.isPending || exchangeToken.isPending,
    error: createToken.error ?? exchangeToken.error,
  }
}
