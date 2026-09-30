import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { LiquidityCsvUploadDialog } from './LiquidityCsvUploadDialog'
import { statementFormatGuidance } from './LiquidityCsvDialog'
const mocks=vi.hoisted(()=>({upload:vi.fn(),invalidate:vi.fn(async()=>undefined),hook:vi.fn(),accounts:[] as Array<Record<string,unknown>>,detail:{} as Record<string,unknown>}))
vi.mock('../api/liquidityStatementsClient',()=>({liquidityStatementsClient:{upload:mocks.upload}}))
vi.mock('../../partnerships/api/entitiesClient',()=>({entitiesClient:{list:async()=>({items:[{id:'entity-1',name:'Synthetic Trust'}]})}}))
vi.mock('../hooks/useLiquidityStatements',()=>({useLiquidityStatements:(entity?:string,id?:string)=>{mocks.hook(entity,id);const names=[...new Set(mocks.accounts.map(account=>String(account.custodian)))];return {accounts:{data:{items:mocks.accounts,legacyCandidates:[]}},custodians:{data:{items:names.map(name=>({entityId:entity??'',name,accountCount:1,statementCount:0,draftCount:0,appliedStatementCount:0,snapshotCount:0,deletable:true}))}},imports:{data:{items:[]}},detail:mocks.detail,invalidate:mocks.invalidate}}}))
beforeEach(()=>{mocks.upload.mockReset();mocks.invalidate.mockClear();mocks.hook.mockClear();mocks.accounts=[];mocks.detail={}})
it('requires entity, custodian and a statement, then opens the returned durable draft',async()=>{
  mocks.upload.mockResolvedValue('import-1')
  mocks.accounts=[{id:'account-1',entityId:'entity-1',custodian:'Synthetic Broker',name:'Brokerage',accountMask:'1234',currency:'USD',included:true,cadence:'ON_DEMAND',version:1,holdingsAsOfDate:null,nextExpectedDate:null,latestSnapshotId:null,uploadedAt:null,activeSource:'CSV'}]
  const user=userEvent.setup(),client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  render(<QueryClientProvider client={client}><LiquidityCsvUploadDialog onClose={vi.fn()}/></QueryClientProvider>)
  expect(screen.getByRole('button',{name:'Upload statement'})).toBeDisabled()
  await screen.findByRole('option',{name:'Synthetic Trust'})
  await user.selectOptions(screen.getByLabelText('Entity'),'entity-1')
  await user.selectOptions(screen.getByLabelText('Custodian'),'Synthetic Broker')
  const file=new File(['Ticker,Value\nTEST,800'],'synthetic.csv',{type:'text/csv'})
  const fileInput=screen.getByLabelText(/Complete holdings statement/)
  expect(fileInput).toHaveAttribute('accept',expect.stringContaining('.xlsx'))
  await user.upload(fileInput,file)
  expect(screen.getByRole('button',{name:'Upload statement'})).toBeEnabled()
  expect((fileInput as HTMLInputElement).files?.[0]).toBe(file)
  // user-event installs a mock FileList; jsdom's native required-file validator
  // reads its internal empty list. Exercise the submit handler after selection.
  fireEvent.submit(screen.getByRole('button',{name:'Upload statement'}).closest('form')!)
  await waitFor(()=>expect(mocks.upload).toHaveBeenCalledWith(file,'entity-1','Synthetic Broker',expect.any(Function)))
  await waitFor(()=>expect(mocks.hook).toHaveBeenLastCalledWith('entity-1','import-1'))
  expect(mocks.invalidate).toHaveBeenCalled()
})

it('uses an explicit add-new path instead of permitting arbitrary custodian text',async()=>{
  mocks.upload.mockResolvedValue('import-2')
  mocks.accounts=[{id:'account-1',entityId:'entity-1',custodian:'Merrill Lynch',name:'Brokerage',accountMask:'1234',currency:'USD',included:true,cadence:'ON_DEMAND',version:1,holdingsAsOfDate:null,nextExpectedDate:null,latestSnapshotId:null,uploadedAt:null,activeSource:'CSV'}]
  const user=userEvent.setup(),client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  render(<QueryClientProvider client={client}><LiquidityCsvUploadDialog onClose={vi.fn()}/></QueryClientProvider>)
  await screen.findByRole('option',{name:'Synthetic Trust'})
  await user.selectOptions(screen.getByLabelText('Entity'),'entity-1')
  expect(screen.getByRole('option',{name:'Merrill Lynch'})).toBeInTheDocument()
  expect(screen.queryByLabelText('New custodian name')).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Custodian'),'__new__')
  await user.type(screen.getByLabelText('New custodian name'),'  New   Brokerage  ')
  const file=new File(['Ticker,Value\nTEST,800'],'synthetic.csv',{type:'text/csv'})
  await user.upload(screen.getByLabelText(/Complete holdings statement/),file)
  fireEvent.submit(screen.getByRole('button',{name:'Upload statement'}).closest('form')!)
  await waitFor(()=>expect(mocks.upload).toHaveBeenCalledWith(file,'entity-1','New Brokerage',expect.any(Function)))
})

it('lets the user retry a draft detail request that failed',async()=>{
  const refetch=vi.fn(async()=>undefined)
  mocks.detail={isError:true,refetch}
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  render(<QueryClientProvider client={client}><LiquidityCsvUploadDialog onClose={vi.fn()}/></QueryClientProvider>)
  await userEvent.click(screen.getByRole('button',{name:'Retry loading draft'}))
  expect(refetch).toHaveBeenCalledOnce()
})

it('distinguishes reusable XLSX adapters, one-time CSV mapping and transient retry guidance',()=>{
  expect(statementFormatGuidance('NEEDS_ADAPTER','XLSX')).toMatch(/reusable, tested adapter/i)
  expect(statementFormatGuidance('NEEDS_ADAPTER','XLSX')).toMatch(/cannot be published through one-time column mapping/i)
  expect(statementFormatGuidance('NEEDS_MAPPING','CSV')).toMatch(/one-time, import-only column mapping/i)
  expect(statementFormatGuidance('FAILED','CSV','TRANSIENT_FAILURE')).toMatch(/do not upload the same file again/i)
})
