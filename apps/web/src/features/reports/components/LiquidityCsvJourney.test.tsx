import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { consolidatedHoldingsFixture } from '../fixtures/consolidatedHoldingsFixture'
import { ConsolidatedHoldingsReport } from './ConsolidatedHoldingsReport'
import { LiquidityCsvReview } from './LiquidityCsvReview'
import type { CsvDetail } from '../../../../../../packages/types/src/liquidity-statements'

const mocks=vi.hoisted(()=>({role:'Admin',preview:vi.fn(),apply:vi.fn(),refresh:vi.fn()}))
vi.mock('../../../auth/sessionStore',()=>({useSession:()=>({session:{role:mocks.role}})}))
vi.mock('../hooks/useLiquidityPerformance',()=>({useLiquidityPerformance:()=>({data:{points:[]},isLoading:false,isError:false,refetch:vi.fn()})}))
vi.mock('../hooks/useConsolidatedHoldings',()=>({useConsolidatedHoldings:()=>({query:{data:consolidatedHoldingsFixture,isLoading:false,isError:false},filters:{search:'',sort:'symbol',direction:'asc'},refresh:{mutate:mocks.refresh},updateFilter:vi.fn()})}))
vi.mock('./LiquidityCsvUploadDialog',()=>({LiquidityCsvUploadDialog:()=> <div role="dialog">CSV upload workflow</div>}))
vi.mock('../api/liquidityStatementsClient',()=>({liquidityStatementsClient:{preview:mocks.preview,apply:mocks.apply}}))
beforeEach(()=>{mocks.role='Admin';mocks.preview.mockReset();mocks.apply.mockReset()})

it('offers the CSV workflow only to administrators',async()=>{
  const user=userEvent.setup(),view=render(<ConsolidatedHoldingsReport/>)
  await user.click(screen.getByRole('button',{name:/Upload CSV/}))
  expect(screen.getByRole('dialog')).toHaveTextContent('CSV upload workflow')
  view.unmount();mocks.role='User';render(<ConsolidatedHoldingsReport/>)
  expect(screen.queryByRole('button',{name:/Upload CSV/})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Refresh'})).toBeEnabled()
})

it('requires a preview before applying and refreshes the saved data after success',async()=>{
  const user=userEvent.setup(),changed=vi.fn(async()=>undefined)
  const detail:CsvDetail={summary:{id:'import',entityId:'entity',custodian:'Synthetic',version:4,status:'READY_TO_APPLY',adapterId:'positions_v1',uploadedAt:'2026-09-01',safeErrorCode:null},canonicalDraft:null,reviewRevision:1,issues:[],records:[],reconciliations:{},accountBindings:[]}
  const preview={id:'preview',expectedVersion:4,summaryHash:'hash',expiresAt:'2026-10-01',canApply:true,accounts:[]}
  mocks.preview.mockResolvedValue(preview);mocks.apply.mockResolvedValue({snapshotIds:['snapshot']})
  render(<LiquidityCsvReview detail={detail} accounts={[]} onChanged={changed}/>)
  expect(screen.queryByRole('button',{name:'Apply snapshot'})).not.toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:'Preview changes'}))
  await user.click(await screen.findByRole('button',{name:'Apply snapshot'}))
  await waitFor(()=>expect(changed).toHaveBeenCalledOnce())
  expect(mocks.apply).toHaveBeenCalledWith('import',preview,expect.any(String))
})

it('shows stale-review errors without claiming publication',async()=>{
  const user=userEvent.setup(),changed=vi.fn(async()=>undefined)
  const detail:CsvDetail={summary:{id:'import',entityId:'entity',custodian:'Synthetic',version:4,status:'READY_TO_APPLY',adapterId:'positions_v1',uploadedAt:'2026-09-01',safeErrorCode:null},canonicalDraft:null,reviewRevision:1,issues:[],records:[],reconciliations:{},accountBindings:[]}
  mocks.preview.mockRejectedValue(new Error('The import changed. Reload and review it again.'))
  render(<LiquidityCsvReview detail={detail} accounts={[]} onChanged={changed}/>)
  await user.click(screen.getByRole('button',{name:'Preview changes'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Reload and review')
  expect(mocks.apply).not.toHaveBeenCalled();expect(changed).not.toHaveBeenCalled()
})
