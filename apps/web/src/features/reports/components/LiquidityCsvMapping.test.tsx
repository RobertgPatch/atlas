import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { LiquidityCsvMapping } from './LiquidityCsvMapping'
import type { CsvDetail } from '../../../../../../packages/types/src/liquidity-statements'
it('submits declarative header bindings and keeps unmapped columns as evidence',async()=>{
  const user=userEvent.setup(),save=vi.fn()
  const detail:CsvDetail={summary:{id:'i',entityId:'e',custodian:'Synthetic',version:1,status:'NEEDS_MAPPING',uploadedAt:'2026-09-01',adapterId:null,safeErrorCode:null},canonicalDraft:null,reviewRevision:0,issues:[],accountBindings:[],reconciliations:{},records:[{ordinal:1,lineStart:1,lineEnd:1,role:'UNSUPPORTED',cells:['Ticker','Value','Instructions']}]}
  render(<LiquidityCsvMapping detail={detail} busy={false} onSave={save}/>)
  await user.selectOptions(screen.getByLabelText('Column 1: Ticker'),'symbol')
  await user.selectOptions(screen.getByLabelText('Column 2: Value'),'marketValue')
  await user.click(screen.getByRole('button',{name:'Save mapping and parse again'}))
  expect(save.mock.calls[0]![0].columns).toEqual([{sourceIndex:0,sourceHeader:'Ticker',target:'symbol'},{sourceIndex:1,sourceHeader:'Value',target:'marketValue'},{sourceIndex:2,sourceHeader:'Instructions',target:'ignoredEvidence'}])
})
