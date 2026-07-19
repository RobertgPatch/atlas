import type { K1TrackerWritableFieldKey } from '../../../../../../packages/types/src/k1-tracker'
import { placementsForRegion, type K1FormPlacement } from '../k1FormLayout'
import { K1FormFieldCell, type K1FormFieldStateGetter } from './K1FormFieldCell'

type PartThreeEntry = { order: number; placement: K1FormPlacement }

const entriesFor = (region: 'part-iii-left' | 'part-iii-right'): PartThreeEntry[] => [
  ...placementsForRegion(region).map((placement) => ({ order: placement.order, placement })),
].sort((left, right) => left.order - right.order)

const visibleLineLabel = (label: string): string => label.replace(/^Line\s+[^-]+\s+-\s+/, '')

function PartThreeColumn({ region, fieldStateFor }: {
  region: 'part-iii-left' | 'part-iii-right'
  fieldStateFor: K1FormFieldStateGetter
}) {
  return <div className="min-w-0 border-x border-b border-gray-950 first:border-l-2 last:border-r-2 lg:first:border-r-0" data-k1-column={region}>
    {entriesFor(region).map((entry) => {
      const state = fieldStateFor(entry.placement.fieldKey as K1TrackerWritableFieldKey)
      const label = entry.placement.sublabel ?? visibleLineLabel(state.field.label)
      return <div key={entry.placement.fieldKey} className="grid min-w-0 grid-cols-[2.6rem_minmax(0,1fr)] border-b border-gray-500 last:border-b-0">
        <span className="flex items-start justify-center border-r border-gray-400 bg-white px-1 py-2 font-mono text-xs font-black text-gray-950">{entry.placement.itemOrLine}</span>
        <div className="min-w-0 p-2">
          <K1FormFieldCell {...state} visibleLabel={entry.placement.code ? `${entry.placement.code} — ${label}` : label} compact />
        </div>
      </div>
    })}
  </div>
}

export function K1PartThreeGrid({ fieldStateFor }: { fieldStateFor: K1FormFieldStateGetter }) {
  return <section aria-labelledby="k1-part-iii-heading" className="min-w-0 bg-white" data-testid="k1-part-three">
    <div className="flex items-stretch border-y-2 border-gray-950 bg-gray-100">
      <span aria-hidden="true" className="flex w-16 shrink-0 items-center justify-center bg-gray-950 px-2 py-2 text-[10px] font-black uppercase tracking-[0.13em] text-white">Part III</span>
      <h4 id="k1-part-iii-heading" className="px-3 py-2 text-xs font-black uppercase leading-tight tracking-[0.035em] text-gray-950"><span className="sr-only">Part III — </span>Partner’s Share of Current Year Income, Deductions, Credits, and Other Items</h4>
    </div>
    <div className="grid min-w-0 grid-cols-1 lg:grid-cols-2" data-testid="k1-part-three-grid">
      <PartThreeColumn region="part-iii-left" fieldStateFor={fieldStateFor} />
      <PartThreeColumn region="part-iii-right" fieldStateFor={fieldStateFor} />
    </div>
  </section>
}
