import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { LiquiditySourceAccountManager } from './LiquiditySourceAccountManager'
const mocks=vi.hoisted(()=>({update:vi.fn(async()=>({})),create:vi.fn(async()=>({}))}))
vi.mock('../api/liquidityStatementsClient',()=>({liquidityStatementsClient:{updateAccount:mocks.update,createAccount:mocks.create}}))
beforeEach(()=>{mocks.update.mockClear();mocks.create.mockClear()})
it('changes only the selected account and uses optimistic versions',async()=>{
  const user=userEvent.setup(),changed=vi.fn(async()=>undefined)
  render(<LiquiditySourceAccountManager entityId="e" custodian="Broker" onChanged={changed} accounts={[{id:'a',entityId:'e',custodian:'Broker',name:'Synthetic',accountMask:'1234',currency:'USD',included:true,cadence:'ON_DEMAND',version:4,holdingsAsOfDate:'2026-09-01',nextExpectedDate:null,latestSnapshotId:'s',uploadedAt:'2026-09-02',activeSource:'CSV'}]}/>)
  expect(screen.queryByText(/Next expected/)).not.toBeInTheDocument()
  expect(screen.queryByRole('checkbox',{name:/Include .* in Liquidity/})).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Upload cadence for Synthetic'),'CALENDAR_MONTHLY')
  await waitFor(()=>expect(mocks.update).toHaveBeenCalledWith('a',{expectedVersion:4,cadence:'CALENDAR_MONTHLY'}))
  expect(changed).toHaveBeenCalled()
})

it('edits an existing account name using its current version',async()=>{
  const user=userEvent.setup(),changed=vi.fn(async()=>undefined)
  render(<LiquiditySourceAccountManager entityId="e" custodian="Broker" onChanged={changed} accounts={[{id:'a',entityId:'e',custodian:'Broker',name:'Joint Holdings Schab',accountMask:'4514',currency:'USD',included:true,cadence:'ON_DEMAND',version:7,holdingsAsOfDate:'2026-09-21',nextExpectedDate:null,latestSnapshotId:'s',uploadedAt:'2026-09-26',activeSource:'CSV'}]}/>)
  await user.click(screen.getByRole('button',{name:'Edit account details for Joint Holdings Schab'}))
  const editForm=screen.getByRole('button',{name:'Save account details'}).closest('form')!
  const input=within(editForm).getByRole('textbox',{name:'Account name'})
  await user.clear(input);await user.type(input,'Joint Holdings Schwab')
  await user.click(screen.getByRole('button',{name:'Save account details'}))
  await waitFor(()=>expect(mocks.update).toHaveBeenCalledWith('a',{expectedVersion:7,name:'Joint Holdings Schwab',accountMask:'4514'}))
  expect(changed).toHaveBeenCalled()
})

it('corrects the last four characters for an existing account',async()=>{
  const user=userEvent.setup(),changed=vi.fn(async()=>undefined)
  render(<LiquiditySourceAccountManager entityId="e" custodian="Merrill Lynch" onChanged={changed} accounts={[{id:'a',entityId:'e',custodian:'Merrill Lynch',name:'Merrill Lynch account',accountMask:'3432',currency:'USD',included:true,cadence:'ON_DEMAND',version:9,holdingsAsOfDate:'2026-09-18',nextExpectedDate:null,latestSnapshotId:'s',uploadedAt:'2026-09-25',activeSource:'STATEMENT'}]}/>)
  await user.click(screen.getByRole('button',{name:'Edit account details for Merrill Lynch account'}))
  const save=screen.getByRole('button',{name:'Save account details'}),editForm=save.closest('form')!
  const mask=within(editForm).getByRole('textbox',{name:'Last four characters'})
  expect(mask).toHaveClass('h-10')
  expect(save).toHaveClass('h-10')
  const cadence=screen.getByRole('combobox',{name:'Upload cadence for Merrill Lynch account'})
  expect(cadence).toHaveClass('h-10','w-full','lg:col-start-2')
  expect(cadence.parentElement).toHaveClass('lg:grid-cols-[minmax(0,1fr)_9.5rem_23.5rem]')
  await user.clear(mask);await user.type(mask,'7794')
  await user.click(save)
  await waitFor(()=>expect(mocks.update).toHaveBeenCalledWith('a',{expectedVersion:9,name:'Merrill Lynch account',accountMask:'7794'}))
  expect(changed).toHaveBeenCalled()
})
