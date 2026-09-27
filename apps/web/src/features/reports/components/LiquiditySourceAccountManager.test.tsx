import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { LiquiditySourceAccountManager } from './LiquiditySourceAccountManager'
const mocks=vi.hoisted(()=>({update:vi.fn(async()=>({})),create:vi.fn(async()=>({}))}))
vi.mock('../api/liquidityStatementsClient',()=>({liquidityStatementsClient:{updateAccount:mocks.update,createAccount:mocks.create}}))
it('changes only the selected account and uses optimistic versions',async()=>{
  const user=userEvent.setup(),changed=vi.fn(async()=>undefined)
  render(<LiquiditySourceAccountManager entityId="e" custodian="Broker" onChanged={changed} accounts={[{id:'a',entityId:'e',custodian:'Broker',name:'Synthetic',accountMask:'1234',currency:'USD',included:true,cadence:'ON_DEMAND',version:4,holdingsAsOfDate:'2026-09-01',nextExpectedDate:null,latestSnapshotId:'s',uploadedAt:'2026-09-02',activeSource:'CSV'}]}/>)
  expect(screen.queryByText(/Next expected/)).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Upload cadence for Synthetic'),'CALENDAR_MONTHLY')
  await waitFor(()=>expect(mocks.update).toHaveBeenCalledWith('a',{expectedVersion:4,cadence:'CALENDAR_MONTHLY'}))
  expect(changed).toHaveBeenCalled()
})
