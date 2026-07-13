import { useState } from 'react'
import type { K1TrackerYearDetail } from '../../../../../packages/types/src/k1-tracker'
import { K1InputsPanel } from './K1InputsPanel'
import { LiabilitiesPanel } from './LiabilitiesPanel'
import { OutsideBasisPanel } from './OutsideBasisPanel'
import { ReconciliationPanel } from './ReconciliationPanel'
import { YearSummaryCards } from './YearSummaryCards'
import { YearStatusPanel } from './YearStatusPanel'

const tabs = ['Summary', 'Inputs', 'Basis', 'Liabilities', 'Reconciliation'] as const
export function SelectedYearTabs({ detail }: { detail: K1TrackerYearDetail }) { const [tab, setTab] = useState<(typeof tabs)[number]>('Summary'); return <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div role="tablist" aria-label="Selected year workspace" className="flex gap-1 overflow-x-auto border-b border-gray-100 pb-3">{tabs.map((item) => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`rounded-md px-3 py-2 text-sm font-medium ${tab === item ? 'bg-gray-950 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{item}</button>)}</div><div className="mt-4">{tab === 'Summary' && <div className="space-y-4"><YearSummaryCards detail={detail} /><YearStatusPanel detail={detail} /></div>}{tab === 'Inputs' && <K1InputsPanel detail={detail} />}{tab === 'Basis' && <OutsideBasisPanel calculation={detail.calculation} detail={detail} />}{tab === 'Liabilities' && <LiabilitiesPanel calculation={detail.calculation} detail={detail} />}{tab === 'Reconciliation' && <ReconciliationPanel calculation={detail.calculation} detail={detail} />}</div></section> }
