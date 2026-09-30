import { QueryClient,QueryClientProvider } from '@tanstack/react-query'
import { render,screen,waitFor,within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach,expect,it,vi } from 'vitest'
import type { CsvSummary,CustodianSummary } from '../../../../../../packages/types/src/liquidity-statements'
import { LiquidityStatementManager } from './LiquidityStatementManager'

const mocks=vi.hoisted(()=>({list:vi.fn(),archive:vi.fn(),archiveCustodian:vi.fn(),renameCustodian:vi.fn()}))
vi.mock('../api/liquidityStatementsClient',()=>({liquidityStatementsClient:mocks}))
const custodians:CustodianSummary[]=[
  {entityId:'entity-1',name:'Merrill Lynch',accountCount:1,statementCount:2,draftCount:1,appliedStatementCount:1,snapshotCount:1,deletable:false},
  {entityId:'entity-1',name:'Morgan Stanely',accountCount:1,statementCount:1,draftCount:1,appliedStatementCount:0,snapshotCount:0,deletable:true},
]
const statements:CsvSummary[]=[
  {id:'draft-1',entityId:'entity-1',custodian:'Morgan Stanely',version:2,status:'CANCELLED',uploadedAt:'2026-09-28T12:00:00.000Z',adapterId:null,safeErrorCode:null},
  {id:'applied-1',entityId:'entity-1',custodian:'Merrill Lynch',version:4,status:'APPLIED',uploadedAt:'2026-09-27T12:00:00.000Z',adapterId:'merrill_holdings_csv',safeErrorCode:null},
]
function renderManager(onChanged=vi.fn(async()=>undefined)){
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  return render(<QueryClientProvider client={client}><LiquidityStatementManager entities={[{id:'entity-1',name:'Gardner Family Trust'}]} entityId="entity-1" onEntityChange={vi.fn()} custodians={custodians} selectedStatementId={undefined} onSelectStatement={vi.fn()} onSelectionCleared={vi.fn()} onChanged={onChanged}/></QueryClientProvider>)
}
beforeEach(()=>{mocks.list.mockReset().mockResolvedValue({items:statements,nextCursor:null});mocks.archive.mockReset().mockResolvedValue(undefined);mocks.archiveCustodian.mockReset().mockResolvedValue(undefined);mocks.renameCustodian.mockReset().mockResolvedValue({...custodians[1],name:'Morgan Stanley'})})

it('filters the paged statement ledger by multiple selected custodians',async()=>{
  renderManager();const user=userEvent.setup()
  await screen.findByText('Pending detection')
  const filter=screen.getByText('Custodian filter').closest('details')!
  await user.click(within(filter).getByText('Custodian filter'))
  await user.click(within(filter).getByRole('checkbox',{name:/Morgan Stanely/}))
  await waitFor(()=>expect(mocks.list).toHaveBeenLastCalledWith('entity-1',{cursor:undefined,limit:10,custodians:['Morgan Stanely']}))
})

it('deletes an empty typo custodian but locks applied financial history',async()=>{
  const changed=vi.fn(async()=>undefined);renderManager(changed);const user=userEvent.setup()
  await screen.findByText('Pending detection')
  expect(screen.getByRole('button',{name:'Delete Merrill Lynch'})).toBeDisabled()
  await user.click(screen.getByRole('button',{name:'Delete Morgan Stanely'}))
  const confirmation=screen.getByRole('alertdialog')
  expect(confirmation).toHaveTextContent(/empty accounts and drafts/i)
  expect(confirmation.parentElement).toHaveClass('fixed','inset-0')
  expect(screen.getByRole('button',{name:'Keep entry'})).toHaveFocus()
  await user.click(screen.getByRole('button',{name:'Delete'}))
  await waitFor(()=>expect(mocks.archiveCustodian).toHaveBeenCalledWith('entity-1','Morgan Stanely'))
  expect(changed).toHaveBeenCalled()
})

it('dismisses the visible delete confirmation with Escape',async()=>{
  renderManager();const user=userEvent.setup()
  await screen.findByText('Pending detection')
  await user.click(screen.getByRole('button',{name:'Delete Morgan Stanely'}))
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

it('archives a non-applied statement and disables deletion for an applied statement',async()=>{
  renderManager();const user=userEvent.setup()
  await screen.findByText('Pending detection')
  expect(screen.getByRole('button',{name:/Delete Merrill Lynch statement/})).toBeDisabled()
  await user.click(screen.getByRole('button',{name:/Delete Morgan Stanely statement/}))
  await user.click(screen.getByRole('button',{name:'Delete'}))
  await waitFor(()=>expect(mocks.archive).toHaveBeenCalledWith('draft-1',2))
})

it('selects and deletes multiple non-applied statements while protecting applied history',async()=>{
  const secondDraft:CsvSummary={id:'draft-2',entityId:'entity-1',custodian:'Merrill Lynch',version:3,status:'NEEDS_REVIEW',uploadedAt:'2026-09-26T12:00:00.000Z',adapterId:'charles_schwab_positions_csv',safeErrorCode:null}
  mocks.list.mockResolvedValue({items:[statements[0]!,secondDraft,statements[1]!],nextCursor:null})
  const changed=vi.fn(async()=>undefined);renderManager(changed);const user=userEvent.setup()
  await screen.findByText('Pending detection')
  const selectAll=screen.getByRole('checkbox',{name:'Select all deletable statements on this page'})
  const appliedSelection=screen.getByRole('checkbox',{name:/Select Merrill Lynch statement from 9\/27\/2026/})
  expect(appliedSelection).toBeDisabled()
  await user.click(selectAll)
  expect(screen.getByRole('status')).toHaveTextContent('2 statements selected')
  await user.click(screen.getByRole('button',{name:'Delete selected'}))
  const confirmation=screen.getByRole('alertdialog')
  expect(confirmation).toHaveTextContent('Delete 2 statement entries?')
  await user.click(within(confirmation).getByRole('button',{name:'Delete selected'}))
  await waitFor(()=>expect(mocks.archive).toHaveBeenCalledTimes(2))
  expect(mocks.archive).toHaveBeenCalledWith('draft-1',2)
  expect(mocks.archive).toHaveBeenCalledWith('draft-2',3)
  expect(mocks.archive).not.toHaveBeenCalledWith('applied-1',4)
  expect(changed).toHaveBeenCalled()
})

it('renames a custodian without requiring financial history deletion',async()=>{
  const changed=vi.fn(async()=>undefined);renderManager(changed);const user=userEvent.setup()
  await screen.findByText('Pending detection')
  await user.click(screen.getByRole('button',{name:'Rename Morgan Stanely'}))
  const input=screen.getByRole('textbox',{name:'Custodian name'})
  await user.clear(input);await user.type(input,'Morgan Stanley')
  await user.click(screen.getByRole('button',{name:'Save name'}))
  await waitFor(()=>expect(mocks.renameCustodian).toHaveBeenCalledWith('entity-1','Morgan Stanely','Morgan Stanley'))
  expect(changed).toHaveBeenCalled()
})
