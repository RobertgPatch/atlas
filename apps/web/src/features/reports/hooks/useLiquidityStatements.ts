import { useQuery,useQueryClient } from '@tanstack/react-query'
import { liquidityStatementsClient as api } from '../api/liquidityStatementsClient'
const processingStatuses=['UPLOAD_PENDING','VALIDATING','QUEUED','PARSING']
export function useLiquidityStatements(entityId?:string,statementId?:string){
  const client=useQueryClient()
  const accounts=useQuery({queryKey:['liquidity','accounts',entityId],queryFn:()=>api.accounts(entityId)})
  const custodians=useQuery({queryKey:['liquidity','custodians',entityId],enabled:!!entityId,queryFn:()=>api.custodians(entityId!)})
  const imports=useQuery({queryKey:['liquidity','imports',entityId],queryFn:()=>api.list(entityId),refetchInterval:query=>query.state.data?.items.some(item=>processingStatuses.includes(item.status))?1500:false})
  const detail=useQuery({queryKey:['liquidity','import',entityId,statementId],enabled:!!statementId,queryFn:()=>api.detail(statementId!),refetchInterval:query=>processingStatuses.includes(query.state.data?.summary.status??'')?1500:false})
  async function invalidate(){
    await client.cancelQueries({queryKey:['reports','consolidated-holdings']})
    await Promise.all([client.invalidateQueries({queryKey:['liquidity']}),client.invalidateQueries({queryKey:['reports']}),client.invalidateQueries({queryKey:['dashboard']})])
  }
  async function reprocess(reason:string,adapter?:{id:string;version:string}){
    if(!statementId||!detail.data)throw new Error('Choose an applied statement first.')
    await api.reprocess(statementId,detail.data.summary.version,reason,adapter);await invalidate()
  }
  async function abandon(){
    if(!statementId||!detail.data)throw new Error('Choose a correction draft first.')
    await api.abandon(statementId,detail.data.summary.version);await invalidate()
  }
  return {accounts,custodians,imports,detail,invalidate,reprocess,abandon}
}
