import { placementsForRegion } from '../k1FormLayout'
import { K1FormFieldCell, type K1FormFieldStateGetter } from './K1FormFieldCell'

export function K1SupplementalWorkpaper({
  fieldStateFor,
  appearance = 'default',
  showOpeningBasis = true,
}: {
  fieldStateFor: K1FormFieldStateGetter
  appearance?: 'default' | 'magic-pattern'
  showOpeningBasis?: boolean
}) {
  const magicPattern = appearance === 'magic-pattern'
  const opening = placementsForRegion('supplemental-opening')
    .filter((placement) => showOpeningBasis || placement.fieldKey !== 'opening_outside_basis')
  const bookTax = placementsForRegion('supplemental-book-tax')

  return <section aria-labelledby="k1-workpaper-heading" className={magicPattern ? 'border-y border-slate-300 bg-[#f8faf9]' : 'border-2 border-gray-950 bg-[#f7f5ef]'} data-testid="k1-supplemental-workpaper">
    <div className={magicPattern ? 'flex flex-wrap items-end justify-between gap-2 border-b border-emerald-900/20 bg-[#183f2e] px-4 py-3 text-white sm:px-5' : 'flex flex-wrap items-end justify-between gap-2 border-b-2 border-gray-950 bg-gray-950 px-4 py-3 text-white sm:px-5'}>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-300">Jackson support schedule</p>
        <h4 id="k1-workpaper-heading" className="mt-1 text-sm font-black uppercase tracking-[0.05em]">{magicPattern ? 'Reconciliation workpaper' : 'Jackson supplemental workpaper'}</h4>
      </div>
      <p className="max-w-md text-[10px] leading-relaxed text-gray-300">These supporting values are not printed K-1 boxes, but they are required to finish the annual basis reconciliation.</p>
    </div>

    <div className={`grid min-w-0 grid-cols-1 divide-y divide-gray-300 ${magicPattern ? '' : 'xl:grid-cols-[0.72fr_1.28fr] xl:divide-x xl:divide-y-0'}`}>
      <section aria-labelledby="k1-opening-workpaper-heading" className="min-w-0 p-4 sm:p-5">
        <h5 id="k1-opening-workpaper-heading" className="text-xs font-black uppercase tracking-[0.08em] text-gray-950">{showOpeningBasis ? 'Opening basis and loss limitations' : 'Opening loss carryforward'}</h5>
        <p className="mt-1 text-[10px] leading-relaxed text-gray-600">Nonnegative balances. Leave a carried value blank when the prior-year amount applies.</p>
        <div className="mt-4 grid min-w-0 gap-4">
          {opening.map((placement) => <K1FormFieldCell key={placement.fieldKey} {...fieldStateFor(placement.fieldKey)} />)}
        </div>
      </section>

      <section aria-labelledby="k1-book-tax-heading" className="min-w-0 p-4 sm:p-5">
        <h5 id="k1-book-tax-heading" className="text-xs font-black uppercase tracking-[0.08em] text-gray-950">Book-tax reconciliation</h5>
        <p className="mt-1 text-[10px] leading-relaxed text-gray-600">Enter signed book and reconciling amounts exactly as supported by the workpapers.</p>
        <div className="mt-4 grid min-w-0 gap-x-4 gap-y-3 sm:grid-cols-2">
          {bookTax.map((placement) => <K1FormFieldCell key={placement.fieldKey} {...fieldStateFor(placement.fieldKey)} />)}
        </div>
      </section>
    </div>
  </section>
}

