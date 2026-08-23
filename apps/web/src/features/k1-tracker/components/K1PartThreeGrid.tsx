import type { K1TrackerOfficialFormData, K1TrackerWritableFieldKey } from '../../../../../../packages/types/src/k1-tracker'
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

type PartThreeEntry =
  | { kind: 'tracked'; order: number; placement: K1FormPlacement }
  | { kind: 'official'; order: number; placement: K1FormOfficialPlacement }

const entriesFor = (
  region: 'part-iii-left' | 'part-iii-right',
  officialFormData: K1TrackerOfficialFormData,
): PartThreeEntry[] => [
  ...placementsForRegion(region).map((placement) => ({ kind: 'tracked' as const, order: placement.order, placement })),
  ...officialPlacementsForRegion(region).map((placement) => ({ kind: 'official' as const, order: placement.order, placement })),
]
  .filter((entry) => entry.kind === 'tracked'
    ? isTrackedPartThreePlacementVisible(entry.placement, officialFormData)
    : isOfficialPartThreePlacementVisible(entry.placement, officialFormData))
  .sort((left, right) => left.order - right.order)

const visibleLineLabel = (label: string): string => label.replace(/^Line\s+[^-]+\s+-\s+/, '')

function PartThreeColumn({ region, fieldStateFor, officialFieldStateFor, officialFormData, workspace }: {
  region: 'part-iii-left' | 'part-iii-right'
  fieldStateFor: K1FormFieldStateGetter
  officialFieldStateFor: K1OfficialFormFieldStateGetter
  officialFormData: K1TrackerOfficialFormData
  workspace: boolean
}) {
  return <div className={workspace ? 'min-w-0 border-x border-b border-slate-300 lg:first:border-r-0' : 'min-w-0 border-x border-b border-gray-950 first:border-l-2 last:border-r-2 lg:first:border-r-0'} data-k1-column={region}>
    {entriesFor(region, officialFormData).map((entry) => {
      if (entry.kind === 'official') {
        const definition = K1_OFFICIAL_FORM_FIELD_BY_KEY.get(entry.placement.fieldKey)
        if (!definition) throw new Error(`Missing official K-1 field definition for ${entry.placement.fieldKey}`)
        const state = officialFieldStateFor(entry.placement.fieldKey)
        return <div key={entry.placement.fieldKey} data-k1-official-row={entry.placement.itemOrLine} className="grid min-w-0 grid-cols-[2.6rem_minmax(0,1fr)] border-b border-gray-500 last:border-b-0">
          <span className="flex items-start justify-center border-r border-gray-400 bg-gray-100 px-1 py-2 font-mono text-xs font-black text-gray-950">{entry.placement.itemOrLine}</span>
          <div className="min-w-0 bg-white p-2">
            <K1OfficialFormField {...state} field={{ ...definition, label: entry.placement.label }} />
          </div>
        </div>
      }

      const state = fieldStateFor(entry.placement.fieldKey as K1TrackerWritableFieldKey)
      const label = entry.placement.sublabel ?? visibleLineLabel(state.field.label)
      return <div key={entry.placement.fieldKey} className="grid min-w-0 grid-cols-[2.6rem_minmax(0,1fr)] border-b border-gray-500 last:border-b-0">
        <span className="flex items-start justify-center border-r border-gray-400 bg-white px-1 py-2 font-mono text-xs font-black text-gray-950">{entry.placement.itemOrLine}</span>
        <div className="min-w-0 p-2">
          <K1FormFieldCell {...state} officialFieldKey={entry.placement.officialFieldKey} visibleLabel={entry.placement.code ? `${entry.placement.code} - ${label}` : label} compact />
        </div>
      </div>
    })}
  </div>
}

export function K1PartThreeGrid({ fieldStateFor, officialFieldStateFor, officialFormData, appearance = 'default' }: {
  fieldStateFor: K1FormFieldStateGetter
  officialFieldStateFor: K1OfficialFormFieldStateGetter
  officialFormData: K1TrackerOfficialFormData
  appearance?: 'default' | 'workspace'
}) {
  const workspace = appearance === 'workspace'
  return <section aria-labelledby="k1-part-iii-heading" className="min-w-0 bg-white" data-testid="k1-part-three">
    <div className={workspace ? 'flex items-stretch border-y border-slate-300 bg-slate-50' : 'flex items-stretch border-y-2 border-gray-950 bg-gray-100'}>
      <span aria-hidden="true" className={workspace ? 'flex w-16 shrink-0 items-center justify-center bg-primary px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-white' : 'flex w-16 shrink-0 items-center justify-center bg-gray-950 px-2 py-2 text-[10px] font-black uppercase tracking-[0.13em] text-white'}>Part III</span>
      <h4 id="k1-part-iii-heading" className={workspace ? 'px-3 py-2 text-xs font-semibold uppercase leading-tight tracking-[0.035em] text-slate-950' : 'px-3 py-2 text-xs font-black uppercase leading-tight tracking-[0.035em] text-gray-950'}><span className="sr-only">Part III - </span>Partner's Share of Current Year Income, Deductions, Credits, and Other Items</h4>
    </div>
    <div className="grid min-w-0 grid-cols-1 lg:grid-cols-2" data-testid="k1-part-three-grid">
      <PartThreeColumn region="part-iii-left" fieldStateFor={fieldStateFor} officialFieldStateFor={officialFieldStateFor} officialFormData={officialFormData} workspace={workspace} />
      <PartThreeColumn region="part-iii-right" fieldStateFor={fieldStateFor} officialFieldStateFor={officialFieldStateFor} officialFormData={officialFormData} workspace={workspace} />
    </div>
  </section>
}
