import type { K1TrackerWritableFieldKey } from '../../../../../../packages/types/src/k1-tracker'
import { placementsForRegion, type K1FormIdentityContext } from '../k1FormLayout'
import { K1FormFieldCell, type K1FormFieldStateGetter } from './K1FormFieldCell'

const unavailable = (value: string | null | undefined): string => value?.trim() || 'Not available'

function PartHeading({ part, title, id }: { part: string; title: string; id: string }) {
  return <div className="flex items-stretch border-y-2 border-gray-950 bg-gray-100">
    <span aria-hidden="true" className="flex w-16 shrink-0 items-center justify-center bg-gray-950 px-2 py-2 text-[10px] font-black uppercase tracking-[0.13em] text-white">{part}</span>
    <h4 id={id} className="px-3 py-2 text-xs font-black uppercase tracking-[0.04em] text-gray-950"><span className="sr-only">{part} — </span>{title}</h4>
  </div>
}

function IdentityRow({ item, label, value, multiline = false }: { item: string; label: string; value: string | null | undefined; multiline?: boolean }) {
  return <div className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] border-b border-gray-400">
    <span className="flex items-start justify-center border-r border-gray-400 bg-gray-100 px-1 py-2 font-mono text-xs font-black text-gray-900">{item}</span>
    <div className="min-w-0 px-2.5 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-gray-500">{label}</p>
      <p className={`${multiline ? 'min-h-10' : ''} mt-1 break-words text-xs font-semibold leading-snug text-gray-900`}>{unavailable(value)}</p>
    </div>
  </div>
}

const itemKRows: Array<{ label: string; beginning: K1TrackerWritableFieldKey; ending: K1TrackerWritableFieldKey }> = [
  { label: 'Nonrecourse liabilities', beginning: 'liability_nonrecourse_beginning', ending: 'liability_nonrecourse_ending' },
  { label: 'Qualified nonrecourse financing', beginning: 'liability_qualified_nonrecourse_beginning', ending: 'liability_qualified_nonrecourse_ending' },
  { label: 'Recourse liabilities', beginning: 'liability_recourse_beginning', ending: 'liability_recourse_ending' },
]

export function K1FormIdentityPanel({ identity, fieldStateFor }: {
  identity?: K1FormIdentityContext
  fieldStateFor: K1FormFieldStateGetter
}) {
  const sectionL = placementsForRegion('section-l')

  return <div className="min-w-0 border-x-2 border-b-2 border-gray-950 bg-white" data-testid="k1-identity-panel">
    <section aria-labelledby="k1-part-i-heading">
      <PartHeading part="Part I" title="Information About the Partnership" id="k1-part-i-heading" />
      <IdentityRow item="A" label="Partnership’s employer identification number" value={identity?.partnershipEin} />
      <IdentityRow item="B" label="Partnership name" value={identity?.partnershipName} />
      <IdentityRow item="C" label="Partnership address" value={identity?.partnershipAddress} multiline />
      <IdentityRow item="D" label="IRS center / publicly traded partnership status" value={null} />
    </section>

    <section aria-labelledby="k1-part-ii-heading">
      <PartHeading part="Part II" title="Information About the Partner" id="k1-part-ii-heading" />
      <IdentityRow item="E" label="Partner’s identifying number" value={null} />
      <IdentityRow item="F" label="Partner name" value={identity?.partnerName} />
      <IdentityRow item="G–J" label="Partner classification and ownership percentages" value="Not tracked in Jackson" multiline />

      <section aria-labelledby="k1-item-k-heading" className="border-t-2 border-gray-950">
        <div className="flex items-stretch border-b border-gray-950 bg-gray-100">
          <span className="flex w-9 shrink-0 items-center justify-center bg-gray-950 px-1 py-2 font-mono text-xs font-black text-white">K</span>
          <h5 id="k1-item-k-heading" className="px-2.5 py-2 text-[11px] font-black uppercase tracking-[0.035em] text-gray-950">Item K — Partner’s Share of Liabilities</h5>
        </div>
        <div className="grid grid-cols-[minmax(6.5rem,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-gray-500 bg-gray-100 text-center text-[9px] font-bold uppercase tracking-[0.08em] text-gray-600">
          <span className="border-r border-gray-400 px-2 py-1.5 text-left">Liability type</span>
          <span className="border-r border-gray-400 px-1 py-1.5">Beginning of year</span>
          <span className="px-1 py-1.5">End of year</span>
        </div>
        {itemKRows.map((row) => <div key={row.label} className="grid min-w-0 grid-cols-[minmax(6.5rem,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-gray-400 last:border-b-0">
          <p className="border-r border-gray-400 px-2 py-2 text-[10px] font-semibold leading-tight text-gray-700">{row.label}</p>
          <div className="min-w-0 border-r border-gray-400 p-1.5"><K1FormFieldCell {...fieldStateFor(row.beginning)} visibleLabel={false} compact /></div>
          <div className="min-w-0 p-1.5"><K1FormFieldCell {...fieldStateFor(row.ending)} visibleLabel={false} compact /></div>
        </div>)}
      </section>

      <section aria-labelledby="k1-section-l-heading" className="border-t-2 border-gray-950">
        <div className="flex items-stretch border-b border-gray-950 bg-gray-100">
          <span className="flex w-9 shrink-0 items-center justify-center bg-gray-950 px-1 py-2 font-mono text-xs font-black text-white">L</span>
          <h5 id="k1-section-l-heading" className="px-2.5 py-2 text-[11px] font-black uppercase tracking-[0.035em] text-gray-950">Section L — Partner’s Capital Account Analysis</h5>
        </div>
        {sectionL.map((placement) => <div key={placement.fieldKey} className="grid min-w-0 grid-cols-[minmax(7.5rem,1.15fr)_minmax(0,1fr)] border-b border-gray-400 last:border-b-0">
          <p className="border-r border-gray-400 px-2.5 py-2 text-[10px] font-semibold leading-tight text-gray-700">{placement.sublabel}</p>
          <div className="min-w-0 p-1.5"><K1FormFieldCell {...fieldStateFor(placement.fieldKey)} visibleLabel={false} compact /></div>
        </div>)}
      </section>

      <IdentityRow item="M–N" label="Built-in gain/loss and section 704(c) information" value="Not tracked in Jackson" multiline />
    </section>
  </div>
}
