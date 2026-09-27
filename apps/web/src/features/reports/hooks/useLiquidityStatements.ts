import { useQuery,useQueryClient } from '@tanstack/react-query'
import { liquidityStatementsClient as api } from '../api/liquidityStatementsClient'
const processingStatuses=['UPLOAD_PENDING','VALIDATING','QUEUED','PARSING']
export function useLiquidityStatements(entityId?:string,statementId?:string){
  const client=useQueryClient()
  const accounts=useQuery({queryKey:['liquidity','accounts',entityId],queryFn:()=>api.accounts(entityId)})
  const imports=useQuery({queryKey:['liquidity','imports',entityId],queryFn:()=>api.list(entityId),refetchInterval:query=>query.state.data?.items.some(item=>processingStatuses.includes(item.status))?1500:false})
  const detail=useQuery({queryKey:['liquidity','import',entityId,statementId],enabled:!!statementId,queryFn:()=>api.detail(statementId!),refetchInterval:query=>processingStatuses.includes(query.state.data?.summary.status??'')?1500:false})
  async function invalidate(){
    await client.cancelQueries({queryKey:['reports','consolidated-holdings']})
    await Promise.all([client.invalidateQueries({queryKey:['liquidity']}),client.invalidateQueries({queryKey:['reports','consolidated-holdings']}),client.invalidateQueries({queryKey:['reports','liquidity-performance']}),client.invalidateQueries({queryKey:['dashboard']})])
  }
  return {accounts,imports,detail,invalidate}
}
