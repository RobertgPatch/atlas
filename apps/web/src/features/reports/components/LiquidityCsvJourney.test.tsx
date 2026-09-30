import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { consolidatedHoldingsFixture } from '../fixtures/consolidatedHoldingsFixture'
import { ConsolidatedHoldingsReport } from './ConsolidatedHoldingsReport'
import { LiquidityCsvReview } from './LiquidityCsvReview'
import type { CsvDetail } from '../../../../../../packages/types/src/liquidity-statements'

const mocks=vi.hoisted(()=>({role:'Admin',preview:vi.fn(),apply:vi.fn(),reprocess:vi.fn(),abandon:vi.fn(),cancel:vi.fn()}))
vi.mock('../../../auth/sessionStore',()=>({useSession:()=>({session:{role:mocks.role}})}))
vi.mock('../hooks/useLiquidityPerformance',()=>({useLiquidityPerformance:()=>({data:{points:[]},isLoading:false,isError:false,refetch:vi.fn()})}))
vi.mock('../hooks/useConsolidatedHoldings',()=>({useConsolidatedHoldings:()=>({query:{data:consolidatedHoldingsFixture,isLoading:false,isError:false},filters:{search:'',sort:'symbol',direction:'asc',page:1},updateFilter:vi.fn(),setPage:vi.fn()})}))
vi.mock('../api/liquidityStatementsClient',()=>({liquidityStatementsClient:{preview:mocks.preview,apply:mocks.apply,reprocess:mocks.reprocess,abandon:mocks.abandon,cancel:mocks.cancel}}))
beforeEach(()=>{mocks.role='Admin';for(const mock of [mocks.preview,mocks.apply,mocks.reprocess,mocks.abandon,mocks.cancel])mock.mockReset()})

it('links administrators to the statement workspace and removes manual refresh',()=>{
  const view=render(<MemoryRouter><ConsolidatedHoldingsReport/></MemoryRouter>)
  expect(screen.getByRole('link',{name:/Statement workspace/})).toHaveAttribute('href','/liquidity/statements')
  expect(screen.queryByRole('button',{name:'Refresh'})).not.toBeInTheDocument()
  view.unmount();mocks.role='User';render(<MemoryRouter><ConsolidatedHoldingsReport/></MemoryRouter>)
  expect(screen.queryByRole('link',{name:/Statement workspace/})).not.toBeInTheDocument()
})

it('changes the displayed entity and allows it to become the default',async()=>{
  const user=userEvent.setup(),onEntityChange=vi.fn(),onMakeDefault=vi.fn()
  render(<MemoryRouter><ConsolidatedHoldingsReport
    entities={[{id:'garner',name:'Garner Family Trust'},{id:'personal',name:'Personal'}]}
    entityId="personal"
    defaultEntityId="garner"
    onEntityChange={onEntityChange}
    onMakeDefault={onMakeDefault}
  /></MemoryRouter>)
  await user.selectOptions(screen.getByRole('combobox',{name:'Liquidity entity'}),'garner')
  expect(onEntityChange).toHaveBeenCalledWith('garner')
  await user.click(screen.getByRole('button',{name:'Make default'}))
  expect(onMakeDefault).toHaveBeenCalledOnce()
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

it('creates an explicit new reprocess run while showing preserved prior approval provenance',async()=>{
  const user=userEvent.setup(),changed=vi.fn(async()=>undefined)
  const detail:CsvDetail={summary:{id:'import',entityId:'entity',custodian:'Synthetic',version:8,status:'APPLIED',adapterId:'merrill_holdings_csv',uploadedAt:'2026-09-01',safeErrorCode:null},canonicalDraft:null,reviewRevision:2,issues:[],records:[],reconciliations:{},accountBindings:[],activeRunId:'run-applied',priorApplications:[{id:'approval-1',runId:'run-applied',status:'APPLIED',appliedAt:'2026-09-02T12:00:00.000Z',snapshotIds:['snapshot-1']}],availableAdapterVersions:[{id:'merrill_holdings_csv',version:'1.0.0',fileKind:'CSV',current:true}]}
  mocks.reprocess.mockResolvedValue({status:'QUEUED'});render(<LiquidityCsvReview detail={detail} accounts={[]} onChanged={changed}/>)
  expect(screen.getByText(/1 applied approval remains immutable/)).toBeInTheDocument()
  expect(screen.getByText(/does not copy prior review edits/)).toBeInTheDocument()
  await user.clear(screen.getByRole('textbox',{name:'Reason'}));await user.type(screen.getByRole('textbox',{name:'Reason'}),'Use the newly tested adapter recipe')
  await user.click(screen.getByRole('button',{name:'Reprocess with latest adapter'}))
  await waitFor(()=>expect(mocks.reprocess).toHaveBeenCalledWith('import',8,'Use the newly tested adapter recipe'))
  expect(changed).toHaveBeenCalledOnce()
})

it('labels a new run as a correction and safely restores the applied view when abandoned',async()=>{
  const user=userEvent.setup(),changed=vi.fn(async()=>undefined)
  const detail:CsvDetail={summary:{id:'import',entityId:'entity',custodian:'Synthetic',version:10,status:'NEEDS_REVIEW',adapterId:'merrill_holdings_csv',uploadedAt:'2026-09-01',safeErrorCode:null},canonicalDraft:null,reviewRevision:2,issues:[],records:[],reconciliations:{},accountBindings:[],activeRunId:'run-correction',priorApplications:[{id:'approval-1',runId:'run-applied',status:'APPLIED',appliedAt:'2026-09-02T12:00:00.000Z',snapshotIds:['snapshot-1']}]}
  mocks.abandon.mockResolvedValue(undefined);render(<LiquidityCsvReview detail={detail} accounts={[]} onChanged={changed}/>)
  expect(screen.getByRole('status')).toHaveTextContent(/Earlier approvals remain active.*not copied/)
  await user.click(screen.getByRole('button',{name:'Abandon correction and restore applied view'}))
  await waitFor(()=>expect(mocks.abandon).toHaveBeenCalledWith('import',10));expect(changed).toHaveBeenCalledOnce();expect(mocks.cancel).not.toHaveBeenCalled()
})
