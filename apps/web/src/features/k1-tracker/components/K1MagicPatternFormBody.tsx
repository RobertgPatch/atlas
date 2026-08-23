import type { ReactNode } from 'react'
import type {
  K1TrackerOfficialFormData,
  K1TrackerOfficialFormFieldKey,
  K1TrackerWritableFieldKey,
} from '../../../../../../packages/types/src/k1-tracker'
import {
  isOfficialPartThreePlacementVisible,
  isTrackedPartThreePlacementVisible,
  officialPlacementsForRegion,
  placementsForRegion,
  type K1FormOfficialPlacement,
  type K1FormPlacement,
} from '../k1FormLayout'
import { K1_OFFICIAL_FORM_FIELD_BY_KEY } from '../k1OfficialFormFields'
import { K1FormFieldCell, type K1FormFieldStateGetter } from './K1FormFieldCell'
import { K1OfficialFormField, type K1OfficialFormFieldStateGetter } from './K1OfficialFormField'

function PartHeading({ badge, title, id }: { badge: string; title: string; id: string }) {
  return <div className="flex items-stretch border-b border-gray-950 bg-[#e7edf4]">
    <span aria-hidden="true" className="flex w-[5.5rem] shrink-0 items-center justify-center bg-[#0f1b2d] px-2 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white">{badge}</span>
    <h4 id={id} className="px-3 py-2 text-[11px] font-bold uppercase leading-tight tracking-[0.035em] text-gray-950">
      <span className="sr-only">{badge} - </span>{title}
    </h4>
  </div>
}

function ItemHeading({ badge, title, id }: { badge: string; title: string; id: string }) {
  return <div className="flex items-stretch border-b border-gray-950 bg-[#e7edf4]">
    <span aria-hidden="true" className="flex w-[5.5rem] shrink-0 items-center justify-center bg-[#0f1b2d] px-2 py-2 font-mono text-xs font-bold text-white">{badge}</span>
    <h5 id={id} className="px-3 py-2 text-[11px] font-bold uppercase leading-tight tracking-[0.035em] text-gray-950">{title}</h5>
  </div>
}

function OfficialRow({ item, children, className = '' }: { item: string; children: ReactNode; className?: string }) {
  return <div className={`grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] border-b border-gray-400 ${className}`}>
    <span className="flex items-start justify-center border-r border-gray-400 bg-[#eef2f6] px-1 py-2 font-mono text-[10px] font-bold text-gray-800">{item}</span>
    <div className="min-w-0 bg-white p-2.5">{children}</div>
  </div>
}

const itemJRows: Array<{ label: string; beginning: K1TrackerOfficialFormFieldKey; ending: K1TrackerOfficialFormFieldKey }> = [
  { label: 'Profit', beginning: 'part_ii_j_profit_beginning_pct', ending: 'part_ii_j_profit_ending_pct' },
  { label: 'Loss', beginning: 'part_ii_j_loss_beginning_pct', ending: 'part_ii_j_loss_ending_pct' },
  { label: 'Capital', beginning: 'part_ii_j_capital_beginning_pct', ending: 'part_ii_j_capital_ending_pct' },
]

const itemKRows: Array<{ label: string; beginning: K1TrackerWritableFieldKey; ending: K1TrackerWritableFieldKey }> = [
  { label: 'Nonrecourse', beginning: 'liability_nonrecourse_beginning', ending: 'liability_nonrecourse_ending' },
  { label: 'Qualified nonrecourse financing', beginning: 'liability_qualified_nonrecourse_beginning', ending: 'liability_qualified_nonrecourse_ending' },
  { label: 'Recourse', beginning: 'liability_recourse_beginning', ending: 'liability_recourse_ending' },
]

type PartThreeEntry =
  | { kind: 'tracked'; order: number; placement: K1FormPlacement }
  | { kind: 'official'; order: number; placement: K1FormOfficialPlacement }

const partThreeEntries = (officialFormData: K1TrackerOfficialFormData): PartThreeEntry[] => [
  ...placementsForRegion('part-iii-left').map((placement) => ({ kind: 'tracked' as const, order: placement.order, placement })),
  ...officialPlacementsForRegion('part-iii-left').map((placement) => ({ kind: 'official' as const, order: placement.order, placement })),
  ...placementsForRegion('part-iii-right').map((placement) => ({ kind: 'tracked' as const, order: placement.order, placement })),
  ...officialPlacementsForRegion('part-iii-right').map((placement) => ({ kind: 'official' as const, order: placement.order, placement })),
]
  .filter((entry) => entry.kind === 'tracked'
    ? isTrackedPartThreePlacementVisible(entry.placement, officialFormData)
    : isOfficialPartThreePlacementVisible(entry.placement, officialFormData))
  .sort((left, right) => left.order - right.order)

const visibleLineLabel = (label: string): string => label.replace(/^Line\s+[^-]+\s+-\s+/, '')

export function K1MagicPatternFormBody({ fieldStateFor, officialFieldStateFor, officialFormData, endingOutsideBasis }: {
  fieldStateFor: K1FormFieldStateGetter
  officialFieldStateFor: K1OfficialFormFieldStateGetter
  officialFormData: K1TrackerOfficialFormData
  endingOutsideBasis: string | null
}) {
  const officialField = (key: K1TrackerOfficialFormFieldKey, label?: string) => {
    const definition = K1_OFFICIAL_FORM_FIELD_BY_KEY.get(key)
    if (!definition) throw new Error(`Missing official K-1 field definition for ${key}`)
    return <K1OfficialFormField {...officialFieldStateFor(key)} field={label ? { ...definition, label } : definition} compact />
  }
  const sectionL = placementsForRegion('section-l')
  const beginningOutsideBasis = fieldStateFor('opening_outside_basis')
  const endingOutsideBasisDisplay = endingOutsideBasis == null
    ? ''
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(Number(endingOutsideBasis))

  return <div className="min-w-0 bg-white" data-testid="k1-magic-pattern-form-body">
    <div className="grid min-w-0 grid-cols-1 lg:grid-cols-2">
      <section aria-labelledby="k1-part-i-heading" className="min-w-0 border-b border-gray-950 lg:border-r">
        <PartHeading badge="Part I" title="Information about the partnership" id="k1-part-i-heading" />
        <OfficialRow item="A">{officialField('part_i_a_partnership_ein', "Partnership's employer identification number")}</OfficialRow>
        <OfficialRow item="B">{officialField('part_i_b_partnership_name_address', "Partnership's name, address, city, state, and ZIP code")}</OfficialRow>
        <OfficialRow item="C">{officialField('part_i_c_irs_center', 'IRS center where partnership filed return')}</OfficialRow>
        <OfficialRow item="D" className="last:border-b-0">{officialField('part_i_d_publicly_traded_partnership', 'Publicly traded partnership (PTP)')}</OfficialRow>
      </section>

      <section aria-labelledby="k1-part-ii-heading" className="min-w-0 border-b border-gray-950">
        <PartHeading badge="Part II" title="Information about the partner" id="k1-part-ii-heading" />
        <OfficialRow item="E">{officialField('part_ii_e_partner_tin', "Partner's identifying number")}</OfficialRow>
        <OfficialRow item="F">{officialField('part_ii_f_partner_name_address', 'Name, address, city, state, and ZIP code for the partner')}</OfficialRow>
        <OfficialRow item="G">{officialField('part_ii_g_partner_classification', 'Partner type')}</OfficialRow>
        <OfficialRow item="H1">{officialField('part_ii_h1_partner_residency', 'Partner residency')}</OfficialRow>
        <OfficialRow item="H2"><div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2">{officialField('part_ii_h2_disregarded_entity', 'Partner is a disregarded entity')}</div>
          {officialField('part_ii_h2_disregarded_entity_tin', 'Disregarded entity TIN')}
          {officialField('part_ii_h2_disregarded_entity_name', 'Disregarded entity name')}
        </div></OfficialRow>
        <OfficialRow item="I1">{officialField('part_ii_i1_partner_entity_type', 'Partner entity type')}</OfficialRow>
        <OfficialRow item="I2" className="last:border-b-0">{officialField('part_ii_i2_retirement_plan', 'Partner is a retirement plan')}</OfficialRow>
      </section>
    </div>

    <section aria-labelledby="k1-item-j-heading" className="border-b border-gray-950">
      <ItemHeading badge="J" title="Partner's share of profit, loss, and capital" id="k1-item-j-heading" />
      <div className="grid grid-cols-[minmax(7rem,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-gray-400 bg-[#eef2f6] text-center text-[9px] font-bold uppercase tracking-[0.08em] text-gray-600">
        <span className="border-r border-gray-400 px-3 py-1.5 text-left">Share</span>
        <span className="border-r border-gray-400 px-2 py-1.5">Beginning</span>
        <span className="px-2 py-1.5">Ending</span>
      </div>
      {itemJRows.map((row) => <div key={row.label} className="grid min-w-0 grid-cols-[minmax(7rem,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-gray-400">
        <p className="border-r border-gray-400 px-3 py-2 text-[10px] font-semibold text-gray-700">{row.label}</p>
        <div className="min-w-0 border-r border-gray-400 p-1.5">{officialField(row.beginning, `${row.label} beginning`)}</div>
        <div className="min-w-0 p-1.5">{officialField(row.ending, `${row.label} ending`)}</div>
      </div>)}
      <div className="px-3 py-2">
        {officialField('part_ii_j_decrease_sale', 'Decrease due to sale or exchange of partnership interest')}
      </div>
    </section>

    <section aria-labelledby="k1-item-k-heading" className="border-b border-gray-950">
      <ItemHeading badge="K" title="Partner's share of liabilities" id="k1-item-k-heading" />
      <div className="grid grid-cols-[minmax(10rem,1fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-gray-400 bg-[#eef2f6] text-center text-[9px] font-bold uppercase tracking-[0.08em] text-gray-600">
        <span className="border-r border-gray-400 px-3 py-1.5 text-left">Liability type</span>
        <span className="border-r border-gray-400 px-2 py-1.5">Beginning</span>
        <span className="px-2 py-1.5">Ending</span>
      </div>
      {itemKRows.map((row) => <div key={row.label} className="grid min-w-0 grid-cols-[minmax(10rem,1fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-gray-400">
        <p className="border-r border-gray-400 px-3 py-2 text-[10px] font-semibold leading-tight text-gray-700">{row.label}</p>
        <div className="min-w-0 border-r border-gray-400 p-1.5"><K1FormFieldCell {...fieldStateFor(row.beginning)} visibleLabel={`${row.label} beginning`} compact /></div>
        <div className="min-w-0 p-1.5"><K1FormFieldCell {...fieldStateFor(row.ending)} visibleLabel={`${row.label} ending`} compact /></div>
      </div>)}
      <div className="grid gap-2 px-3 py-2 sm:grid-cols-2">
        {officialField('part_ii_k2_lower_tier_liabilities', 'Includes liabilities from lower-tier partnerships')}
        {officialField('part_ii_k3_guaranteed_liabilities', 'Liability subject to guarantees or partner payment obligations')}
      </div>
    </section>

    <div className="grid min-w-0 grid-cols-1 lg:grid-cols-2">
      <section aria-labelledby="k1-part-iii-heading" className="min-w-0 border-b border-gray-950 lg:border-b-0 lg:border-r">
        <PartHeading badge="Part III" title="Partner's share of current year income and deductions" id="k1-part-iii-heading" />
        {partThreeEntries(officialFormData).map((entry) => {
          if (entry.kind === 'official') {
            return <OfficialRow key={entry.placement.fieldKey} item={entry.placement.itemOrLine}>
              {officialField(entry.placement.fieldKey, entry.placement.label)}
            </OfficialRow>
          }
          const state = fieldStateFor(entry.placement.fieldKey)
          const label = entry.placement.sublabel ?? visibleLineLabel(state.field.label)
          return <div key={entry.placement.fieldKey} className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] border-b border-gray-400">
            <span className="flex items-start justify-center border-r border-gray-400 bg-white px-1 py-2 font-mono text-[10px] font-bold text-gray-800">{entry.placement.itemOrLine}</span>
            <div className="min-w-0 p-2.5"><K1FormFieldCell {...state} officialFieldKey={entry.placement.officialFieldKey} visibleLabel={entry.placement.code ? `${entry.placement.code} - ${label}` : label} compact /></div>
          </div>
        })}
      </section>

      <div className="min-w-0">
        <section aria-labelledby="k1-section-l-heading" className="border-b border-gray-950">
          <ItemHeading badge="L" title="Partner's capital account analysis and outside basis" id="k1-section-l-heading" />
          {sectionL.map((placement) => <div key={placement.fieldKey} className="grid min-w-0 grid-cols-[minmax(10rem,1fr)_minmax(0,1fr)] border-b border-gray-400">
            <p className="border-r border-gray-400 px-3 py-2 text-[10px] font-semibold leading-tight text-gray-700">{placement.sublabel}</p>
            <div className="min-w-0 p-1.5"><K1FormFieldCell {...fieldStateFor(placement.fieldKey)} visibleLabel={false} compact /></div>
          </div>)}
          <div className="grid min-w-0 grid-cols-[minmax(10rem,1fr)_minmax(0,1fr)] border-b border-gray-400">
            <p className="border-r border-gray-400 px-3 py-2 text-[10px] font-semibold leading-tight text-gray-700">Beginning outside basis (workpaper)</p>
            <div className="min-w-0 p-1.5"><K1FormFieldCell {...beginningOutsideBasis} visibleLabel={false} compact /></div>
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(10rem,1fr)_minmax(0,1fr)] border-b border-gray-400">
            <p className="border-r border-gray-400 px-3 py-2 text-[10px] font-semibold leading-tight text-gray-700">Ending outside basis (workpaper)</p>
            <label className="min-w-0 p-1.5">
              <span className="sr-only">Ending outside basis (calculated)</span>
              <input aria-label="Ending outside basis (calculated)" readOnly value={endingOutsideBasisDisplay} className="min-h-9 w-full min-w-0 rounded-none border border-gray-400 bg-gray-100 px-2.5 py-1.5 text-right font-mono text-xs tabular-nums text-gray-700" />
            </label>
          </div>
          <OfficialRow item="M">{officialField('part_ii_m_built_in_gain_loss', 'Contributed property with built-in gain or loss')}</OfficialRow>
          <OfficialRow item="N"><div className="grid min-w-0 gap-2 sm:grid-cols-2">
            {officialField('part_ii_n_704c_gain_loss_beginning', 'Net unrecognized Section 704(c) gain or loss, beginning')}
            {officialField('part_ii_n_704c_gain_loss_ending', 'Net unrecognized Section 704(c) gain or loss, ending')}
          </div></OfficialRow>
        </section>
      </div>
    </div>
  </div>
}
