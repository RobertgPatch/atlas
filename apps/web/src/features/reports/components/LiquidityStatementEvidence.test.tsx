import { render,screen,waitFor } from '@testing-library/react'
import { expect,it,vi } from 'vitest'
import { LiquidityStatementEvidence,statementRecordLocation } from './LiquidityStatementEvidence'

const mocks=vi.hoisted(()=>({records:vi.fn()}))
vi.mock('../api/liquidityStatementsClient',()=>({liquidityStatementsClient:{records:mocks.records}}))

it('distinguishes CSV lines and XLSX cells, hides metadata, and follows a finding across pages',async()=>{
  mocks.records.mockResolvedValue({items:[{ordinal:102,lineStart:null,lineEnd:null,role:'POSITION',cells:['100.00000000'],sourceKind:'XLSX',sourceLocation:{kind:'XLSX',sheetId:'sheet-2',sheetName:'Holdings',row:44,column:5,address:'E44',header:'Market Value'}}],nextCursor:null})
  const initial=[
    {ordinal:1,lineStart:1,lineEnd:1,role:'METADATA' as const,cells:['private title omitted']},
    {ordinal:2,lineStart:2,lineEnd:3,role:'POSITION' as const,cells:['DEMO','100.00']},
  ]
  expect(statementRecordLocation(initial[1]!)).toBe('CSV line 2–3')
  render(<LiquidityStatementEvidence statementId="statement-1" initialRecords={initial} nextCursor="MTAw" targetOrdinal={102} totalRecords={102}/>)
  expect(screen.getByText('Content hidden')).toBeInTheDocument()
  expect(screen.queryByText('private title omitted')).not.toBeInTheDocument()
  await waitFor(()=>expect(mocks.records).toHaveBeenCalledWith('statement-1','MTAw'))
  const xlsx=await screen.findByText('Holdings!E44')
  expect(xlsx).toBeInTheDocument()
  expect(screen.getByText('100.00000000')).toBeInTheDocument()
  await waitFor(()=>expect(xlsx.closest('tr')).toHaveFocus())
  expect(screen.getByText('3 of 102 records loaded')).toBeInTheDocument()
})
