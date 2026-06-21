import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { reportsClient } from '../api/reportsClient'

export const plaidAccountKeys = {
  accounts: ['plaid', 'investment-accounts'] as const,
}

export const usePlaidAccounts = () => {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: plaidAccountKeys.accounts,
    queryFn: () => reportsClient.getPlaidInvestmentAccounts(),
  })

  const updateSelection = useMutation({
    mutationFn: (selectedAccountIds: string[]) =>
      reportsClient.updatePlaidInvestmentAccounts({ selectedAccountIds }),
    onSuccess: (data) => {
      queryClient.setQueryData(plaidAccountKeys.accounts, data)
      void queryClient.invalidateQueries({ queryKey: ['reports', 'consolidated-holdings'] })
    },
  })

  const clearAccounts = useMutation({
    mutationFn: () => reportsClient.clearPlaidInvestmentAccounts(),
    onSuccess: (data) => {
      queryClient.setQueryData(plaidAccountKeys.accounts, data)
      void queryClient.invalidateQueries({ queryKey: ['reports', 'consolidated-holdings'] })
    },
  })

  return {
    accounts: query.data?.accounts ?? [],
    query,
    updateSelection,
    clearAccounts,
  }
}
