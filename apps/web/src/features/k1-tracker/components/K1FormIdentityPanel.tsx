import type { ReactNode } from 'react'
import type { K1TrackerOfficialFormFieldKey, K1TrackerWritableFieldKey } from '../../../../../../packages/types/src/k1-tracker'
import { placementsForRegion } from '../k1FormLayout'
import { K1_OFFICIAL_FORM_FIELD_BY_KEY } from '../k1OfficialFormFields'
import { K1FormFieldCell, type K1FormFieldStateGetter } from './K1FormFieldCell'
import { K1OfficialFormField, type K1OfficialFormFieldStateGetter } from './K1OfficialFormField'

function PartHeading({ part, title, id }: { part: string; title: string; id: string }) {
  return <div className="flex items-stretch border-y-2 border-gray-950 bg-gray-100">
    <span aria-hidden="true" className="flex w-16 shrink-0 items-center justify-center bg-gray-950 px-2 py-2 text-[10px] font-black uppercase tracking-[0.13em] text-white">{part}</span>
    <h4 id={id} className="px-3 py-2 text-xs font-black uppercase tracking-[0.04em] text-gray-950"><span className="sr-only">{part} - </span>{title}</h4>
  </div>
}

function OfficialRow({ item, children }: { item: string; children: ReactNode }) {
  return <div className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] border-b border-gray-400">
    <span className="flex items-start justify-center border-r border-gray-400 bg-gray-100 px-1 py-2 font-mono text-xs font-black text-gray-900">{item}</span>
    <div className="min-w-0 p-2.5">{children}</div>
  </div>
}

const itemKRows: Array<{ label: string; beginning: K1TrackerWritableFieldKey; ending: K1TrackerWritableFieldKey }> = [
  { label: 'Nonrecourse liabilities', beginning: 'liability_nonrecourse_beginning', ending: 'liability_nonrecourse_ending' },
  { label: 'Qualified nonrecourse financing', beginning: 'liability_qualified_nonrecourse_beginning', ending: 'liability_qualified_nonrecourse_ending' },
  { label: 'Recourse liabilities', beginning: 'liability_recourse_beginning', ending: 'liability_recourse_ending' },
]

const itemJRows: Array<{ label: string; beginning: K1TrackerOfficialFormFieldKey; ending: K1TrackerOfficialFormFieldKey }> = [
  { label: 'Profit', beginning: 'part_ii_j_profit_beginning_pct', ending: 'part_ii_j_profit_ending_pct' },
  { label: 'Loss', beginning: 'part_ii_j_loss_beginning_pct', ending: 'part_ii_j_loss_ending_pct' },
  { label: 'Capital', beginning: 'part_ii_j_capital_beginning_pct', ending: 'part_ii_j_capital_ending_pct' },
]

export function K1FormIdentityPanel({ fieldStateFor, officialFieldStateFor }: {
  fieldStateFor: K1FormFieldStateGetter
  officialFieldStateFor: K1OfficialFormFieldStateGetter
}) {
  const sectionL = placementsForRegion('section-l')
  const officialField = (key: K1TrackerOfficialFormFieldKey) => {
    const definition = K1_OFFICIAL_FORM_FIELD_BY_KEY.get(key)
    if (!definition) throw new Error(`Missing official K-1 field definition for ${key}`)
    return <K1OfficialFormField {...officialFieldStateFor(key)} field={definition} />
  }

  return <div className="min-w-0 border-x-2 border-b-2 border-gray-950 bg-white" data-testid="k1-identity-panel">
    <section aria-labelledby="k1-part-i-heading">
      <PartHeading part="Part I" title="Information About the Partnership" id="k1-part-i-heading" />
      <OfficialRow item="A">{officialField('part_i_a_partnership_ein')}</OfficialRow>
      <OfficialRow item="B">{officialField('part_i_b_partnership_name_address')}</OfficialRow>
      <OfficialRow item="C">{officialField('part_i_c_irs_center')}</OfficialRow>
      <OfficialRow item="D">{officialField('part_i_d_publicly_traded_partnership')}</OfficialRow>
    </section>

    <section aria-labelledby="k1-part-ii-heading">
      <PartHeading part="Part II" title="Information About the Partner" id="k1-part-ii-heading" />
      <OfficialRow item="E">{officialField('part_ii_e_partner_tin')}</OfficialRow>
      <OfficialRow item="F">{officialField('part_ii_f_partner_name_address')}</OfficialRow>
      <OfficialRow item="G">{officialField('part_ii_g_partner_classification')}</OfficialRow>
      <OfficialRow item="H1">{officialField('part_ii_h1_partner_residency')}</OfficialRow>
      <OfficialRow item="H2"><div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">{officialField('part_ii_h2_disregarded_entity')}</div>
        {officialField('part_ii_h2_disregarded_entity_tin')}
        {officialField('part_ii_h2_disregarded_entity_name')}
      </div></OfficialRow>
      <OfficialRow item="I1">{officialField('part_ii_i1_partner_entity_type')}</OfficialRow>
      <OfficialRow item="I2">{officialField('part_ii_i2_retirement_plan')}</OfficialRow>

      <section aria-labelledby="k1-item-j-heading" className="border-t-2 border-gray-950">
        <div className="flex items-stretch border-b border-gray-950 bg-gray-100">
          <span className="flex w-9 shrink-0 items-center justify-center bg-gray-950 px-1 py-2 font-mono text-xs font-black text-white">J</span>
          <h5 id="k1-item-j-heading" className="px-2.5 py-2 text-[11px] font-black uppercase tracking-[0.035em] text-gray-950">Partner's Share of Profit, Loss, and Capital</h5>
        </div>
        <div className="grid grid-cols-[minmax(5.5rem,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-gray-500 bg-gray-100 text-center text-[9px] font-bold uppercase tracking-[0.08em] text-gray-600">
          <span className="border-r border-gray-400 px-2 py-1.5 text-left">Share</span>
          <span className="border-r border-gray-400 px-1 py-1.5">Beginning</span>
          <span className="px-1 py-1.5">Ending</span>
        </div>
        {itemJRows.map((row) => <div key={row.label} className="grid min-w-0 grid-cols-[minmax(5.5rem,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-gray-400">
          <p className="border-r border-gray-400 px-2 py-2 text-[10px] font-semibold text-gray-700">{row.label}</p>
          <div className="min-w-0 border-r border-gray-400 p-1.5">{officialField(row.beginning)}</div>
          <div className="min-w-0 p-1.5">{officialField(row.ending)}</div>
        </div>)}
        <div className="grid gap-1 border-b border-gray-400 px-2.5 py-2 sm:grid-cols-2">
          {officialField('part_ii_j_decrease_sale')}
          {officialField('part_ii_j_decrease_exchange')}
        </div>
      </section>

      <section aria-labelledby="k1-item-k-heading" className="border-t-2 border-gray-950">
        <div className="flex items-stretch border-b border-gray-950 bg-gray-100">
          <span className="flex w-9 shrink-0 items-center justify-center bg-gray-950 px-1 py-2 font-mono text-xs font-black text-white">K</span>
          <h5 id="k1-item-k-heading" className="px-2.5 py-2 text-[11px] font-black uppercase tracking-[0.035em] text-gray-950">Partner's Share of Liabilities</h5>
        </div>
        <div className="grid grid-cols-[minmax(6.5rem,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-gray-500 bg-gray-100 text-center text-[9px] font-bold uppercase tracking-[0.08em] text-gray-600">
          <span className="border-r border-gray-400 px-2 py-1.5 text-left">Liability type</span>
          <span className="border-r border-gray-400 px-1 py-1.5">Beginning of year</span>
          <span className="px-1 py-1.5">End of year</span>
        </div>
        {itemKRows.map((row) => <div key={row.label} className="grid min-w-0 grid-cols-[minmax(6.5rem,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-gray-400">
          <p className="border-r border-gray-400 px-2 py-2 text-[10px] font-semibold leading-tight text-gray-700">{row.label}</p>
          <div className="min-w-0 border-r border-gray-400 p-1.5"><K1FormFieldCell {...fieldStateFor(row.beginning)} visibleLabel={false} compact /></div>
          <div className="min-w-0 p-1.5"><K1FormFieldCell {...fieldStateFor(row.ending)} visibleLabel={false} compact /></div>
        </div>)}
        <div className="space-y-1 border-b border-gray-400 px-2.5 py-2">
          {officialField('part_ii_k2_lower_tier_liabilities')}
          {officialField('part_ii_k3_guaranteed_liabilities')}
        </div>
      </section>

      <section aria-labelledby="k1-section-l-heading" className="border-t-2 border-gray-950">
        <div className="flex items-stretch border-b border-gray-950 bg-gray-100">
          <span className="flex w-9 shrink-0 items-center justify-center bg-gray-950 px-1 py-2 font-mono text-xs font-black text-white">L</span>
          <h5 id="k1-section-l-heading" className="px-2.5 py-2 text-[11px] font-black uppercase tracking-[0.035em] text-gray-950">Partner's Capital Account Analysis</h5>
        </div>
        {sectionL.map((placement) => <div key={placement.fieldKey} className="grid min-w-0 grid-cols-[minmax(7.5rem,1.15fr)_minmax(0,1fr)] border-b border-gray-400 last:border-b-0">
          <p className="border-r border-gray-400 px-2.5 py-2 text-[10px] font-semibold leading-tight text-gray-700">{placement.sublabel}</p>
          <div className="min-w-0 p-1.5"><K1FormFieldCell {...fieldStateFor(placement.fieldKey)} visibleLabel={false} compact /></div>
        </div>)}
      </section>

      <OfficialRow item="M">{officialField('part_ii_m_built_in_gain_loss')}</OfficialRow>
      <OfficialRow item="N"><div className="grid min-w-0 gap-2 sm:grid-cols-2">
        {officialField('part_ii_n_704c_gain_loss_beginning')}
        {officialField('part_ii_n_704c_gain_loss_ending')}
      </div></OfficialRow>
    </section>
  </div>
}
