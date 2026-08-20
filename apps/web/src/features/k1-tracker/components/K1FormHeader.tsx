import { K1_OFFICIAL_FORM_FIELD_BY_KEY } from '../k1OfficialFormFields'
import { K1OfficialFormField, type K1OfficialFormFieldStateGetter } from './K1OfficialFormField'

export function K1FormHeader({ taxYear, hasDatedActivity, officialFieldStateFor, appearance = 'default', datedActivityLocation = 'above' }: {
  taxYear: number
  hasDatedActivity: boolean
  officialFieldStateFor: K1OfficialFormFieldStateGetter
  appearance?: 'default' | 'workspace' | 'magic-pattern'
  datedActivityLocation?: 'above' | 'capital-activity-tab'
}) {
  const workspace = appearance === 'workspace'
  const magicPattern = appearance === 'magic-pattern'
  const officialField = (key: Parameters<K1OfficialFormFieldStateGetter>[0]) => {
    const definition = K1_OFFICIAL_FORM_FIELD_BY_KEY.get(key)
    if (!definition) throw new Error(`Missing official K-1 field definition for ${key}`)
    return <K1OfficialFormField {...officialFieldStateFor(key)} field={definition} />
  }

  const periodBeginning = officialFieldStateFor('tax_period_beginning')
  const periodEnding = officialFieldStateFor('tax_period_ending')
  const finalK1 = officialFieldStateFor('k1_status_final')
  const amendedK1 = officialFieldStateFor('k1_status_amended')

  return <header className={workspace ? 'border-b border-slate-300 bg-white' : 'border-b border-gray-950 bg-white'} data-testid="k1-form-header">
    <div className={workspace ? 'grid grid-cols-[minmax(0,1fr)_6.5rem] divide-x divide-slate-300 sm:grid-cols-[9rem_minmax(0,1fr)_8rem]' : 'grid grid-cols-[minmax(0,1fr)_6.5rem] divide-x-2 divide-gray-950 sm:grid-cols-[9rem_minmax(0,1fr)_8rem]'}>
      <div className={workspace ? 'hidden bg-slate-50 px-3 py-3 sm:block' : 'hidden bg-gray-100 px-3 py-3 sm:block'}>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-600">Department of the Treasury</p>
        <p className="mt-1 text-xs leading-tight text-gray-700">{magicPattern ? 'Annual partnership workpaper' : 'Jackson annual partnership workpaper'}</p>
      </div>
      <div className="min-w-0 px-4 py-3 sm:px-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Partner’s share of income, deductions, credits, etc.</p>
        <h3 id="k1-form-title" className={workspace ? 'mt-1 text-lg font-semibold tracking-tight text-slate-950' : 'mt-1 text-xl font-black tracking-tight text-gray-950 sm:text-2xl'}>Schedule K-1 (Form 1065)</h3>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-600">{magicPattern
          ? 'Data-entry view modeled on Schedule K-1. This screen is a workpaper, not an official filed tax document.'
          : 'Jackson data-entry view inspired by Schedule K-1. This screen is not an official filed tax document.'}</p>
      </div>
      <div className={workspace ? 'flex flex-col justify-between bg-[#166534] px-3 py-3 text-white' : 'flex flex-col justify-between bg-gray-950 px-3 py-3 text-white'}>
        <span className={workspace ? 'text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-100' : 'text-[9px] font-bold uppercase tracking-[0.16em] text-gray-300'}>Tax year</span>
        <strong className="font-mono text-2xl tabular-nums sm:text-3xl">{taxYear}</strong>
      </div>
    </div>
    {magicPattern ? <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 border-t border-gray-400 bg-[#eef2f6] px-4 py-2 text-[11px] text-gray-700">
      <div className="flex min-w-0 flex-wrap items-center gap-2 font-mono tabular-nums">
        <span>Tax period</span>
        <label data-k1-official-field="tax_period_beginning" className="min-w-0">
          <span className="sr-only">Tax period beginning</span>
          <input aria-label="Tax period beginning" type="date" disabled={!periodBeginning.canEdit} value={typeof periodBeginning.value === 'string' ? periodBeginning.value : ''} onChange={(event) => periodBeginning.onChange(event.target.value)} className="w-[8.25rem] border-0 bg-transparent p-0 font-mono text-[11px] tabular-nums text-gray-800 focus:outline-none focus:ring-2 focus:ring-jackson-gold disabled:text-gray-500" />
        </label>
        <span aria-hidden="true">–</span>
        <label data-k1-official-field="tax_period_ending" className="min-w-0">
          <span className="sr-only">Tax period ending</span>
          <input aria-label="Tax period ending" type="date" disabled={!periodEnding.canEdit} value={typeof periodEnding.value === 'string' ? periodEnding.value : ''} onChange={(event) => periodEnding.onChange(event.target.value)} className="w-[8.25rem] border-0 bg-transparent p-0 font-mono text-[11px] tabular-nums text-gray-800 focus:outline-none focus:ring-2 focus:ring-jackson-gold disabled:text-gray-500" />
        </label>
      </div>
      <label data-k1-official-field="k1_status_final" className="cursor-pointer">
        <input aria-label="Final K-1" type="checkbox" disabled={!finalK1.canEdit} checked={finalK1.value === true} onChange={(event) => finalK1.onChange(event.target.checked)} className="sr-only" />
        <span>{finalK1.value === true ? 'Final K-1' : 'Not a final K-1'}</span>
      </label>
      <label data-k1-official-field="k1_status_amended" className="cursor-pointer">
        <input aria-label="Amended K-1" type="checkbox" disabled={!amendedK1.canEdit} checked={amendedK1.value === true} onChange={(event) => amendedK1.onChange(event.target.checked)} className="sr-only" />
        <span>{amendedK1.value === true ? 'Amended K-1' : 'Original K-1'}</span>
      </label>
    </div> : <div className={workspace ? 'grid min-w-0 gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(12rem,0.8fr)]' : 'grid min-w-0 gap-3 border-t border-gray-500 bg-gray-50 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(12rem,0.8fr)] sm:px-5'}>
      <div className="grid grid-cols-2 gap-3">
        {officialField('k1_status_final')}
        {officialField('k1_status_amended')}
      </div>
      {officialField('tax_period_beginning')}
      {officialField('tax_period_ending')}
    </div>}
    {hasDatedActivity && !magicPattern && <p className={workspace ? 'border-t border-slate-200 bg-amber-50 px-4 py-2 text-xs leading-relaxed text-slate-700' : 'border-t border-gray-400 bg-amber-50 px-4 py-2 text-xs leading-relaxed text-gray-800 sm:px-5'}>
      <span className={workspace ? 'mr-2 inline-block rounded bg-[#166534] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white' : 'mr-2 inline-block bg-jackson-gold px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white'}>Cash activity</span>
      Annual contributions and distributions are read-only where dated activity is present. {datedActivityLocation === 'capital-activity-tab'
        ? 'Open Capital Activity to update dated rows and recalculate totals and XIRR.'
        : 'Update the dated rows above to recalculate totals and XIRR.'}
    </p>}
  </header>
}

