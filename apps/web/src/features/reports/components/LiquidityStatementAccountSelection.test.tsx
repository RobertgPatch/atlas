import { render,screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe,expect,it,vi } from 'vitest'
import type { AccountBinding,ExcludedAccountDecision,SourceAccount,StatementAccount,StatementField } from '../../../../../../packages/types/src/liquidity-statements'
import { LiquidityStatementAccountSelection } from './LiquidityStatementAccountSelection'

const field=(value:string|null):StatementField=>({value,raw:[],origin:'IMPORTED',availability:value===null?'UNAVAILABLE':'COMPLETE',evidence:[],derivation:null,reason:null,interpretation:null})
const account=(quality:StatementAccount['identifierQuality']='MASKED'):StatementAccount=>({
  occurrenceId:`account-${quality}`,identifierFingerprints:quality==='FULL_RELIABLE'?['fingerprint']:[],identifierQuality:quality,
  displayName:field('Living Trust'),accountMask:field('4514'),currency:field('USD'),asOfDate:field('2026-09-21'),asOfAt:field(null),sourceZone:field('America/New_York'),asOfPrecision:'DATE',completeness:'SUPPORTED_COMPLETE',sourceSections:['Holdings'],positions:[],
})
const target:SourceAccount={id:'11111111-1111-4111-8111-111111111111',entityId:'entity',custodian:'Morgan Stanley',name:'Living Trust',accountMask:'4514',currency:'USD',included:true,cadence:'CALENDAR_MONTHLY',version:3,holdingsAsOfDate:null,nextExpectedDate:null,latestSnapshotId:null,uploadedAt:null,activeSource:'STATEMENT'}

function Harness({source,binding:initial}:{source:StatementAccount;binding?:AccountBinding}){
  const [binding,setBinding]=useState(initial),[excluded,setExcluded]=useState<ExcludedAccountDecision|undefined>()
  return <LiquidityStatementAccountSelection account={source} eligible={[target]} binding={binding} excluded={excluded} onBinding={next=>{setBinding(next);setExcluded(undefined)}} onExcluded={decision=>{setBinding(undefined);setExcluded(decision)}}/>
}

describe('statement account selection',()=>{
  it('shows section, completeness, mask, identity quality and a reliable prebinding',()=>{
    const source=account('FULL_RELIABLE'),binding={occurrenceId:source.occurrenceId,accountId:target.id,expectedAccountVersion:3,completeAccount:true as const,emptyAccountConfirmed:false}
    render(<Harness source={source} binding={binding}/>)
    expect(screen.getByText(/Source account 4514.*Holdings.*supported complete/)).toBeInTheDocument()
    expect(screen.getByText(/Identity quality: full reliable/)).toBeInTheDocument()
    expect(screen.getByRole('combobox',{name:'Replace holdings in account'})).toHaveValue(target.id)
  })

  it('requires manual target confirmation for masked identity and retains an explicit exclusion reason',async()=>{
    const user=userEvent.setup();render(<Harness source={account()}/>)
    expect(screen.getByText(/manual confirmation required/)).toBeInTheDocument()
    expect(screen.getByRole('combobox',{name:'Replace holdings in account'})).toHaveValue('')
    await user.click(screen.getByRole('radio',{name:'Exclude this account from this application'}))
    const reason=screen.getByRole('textbox',{name:'Exclusion reason'})
    await user.clear(reason);await user.type(reason,'Apply this complete account in a later reviewed run')
    expect(reason).toHaveValue('Apply this complete account in a later reviewed run')
  })

  it('does not invent or render a hidden-sheet account candidate',()=>{
    const onBinding=vi.fn(),source=account()
    render(<LiquidityStatementAccountSelection account={source} eligible={[target]} onBinding={onBinding} onExcluded={vi.fn()}/>)
    expect(screen.queryByText(/Hidden Holdings/)).not.toBeInTheDocument()
    expect(onBinding).not.toHaveBeenCalled()
  })
})
