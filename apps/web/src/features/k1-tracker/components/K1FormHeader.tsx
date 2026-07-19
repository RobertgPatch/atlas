export function K1FormHeader({ taxYear, hasDatedActivity }: { taxYear: number; hasDatedActivity: boolean }) {
  return <header className="border-b-2 border-gray-950 bg-white" data-testid="k1-form-header">
    <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] divide-x-2 divide-gray-950 sm:grid-cols-[9rem_minmax(0,1fr)_8rem]">
      <div className="hidden bg-gray-100 px-3 py-3 sm:block">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-600">Department of the Treasury</p>
        <p className="mt-1 text-xs leading-tight text-gray-700">Jackson annual partnership workpaper</p>
      </div>
      <div className="min-w-0 px-4 py-3 sm:px-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Partner’s share of income, deductions, credits, etc.</p>
        <h3 id="k1-form-title" className="mt-1 text-xl font-black tracking-tight text-gray-950 sm:text-2xl">Schedule K-1 (Form 1065)</h3>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-600">Jackson data-entry view inspired by Schedule K-1. This screen is not an official filed tax document.</p>
      </div>
      <div className="flex flex-col justify-between bg-gray-950 px-3 py-3 text-white">
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-gray-300">Tax year</span>
        <strong className="font-mono text-2xl tabular-nums sm:text-3xl">{taxYear}</strong>
      </div>
    </div>
    {hasDatedActivity && <p className="border-t border-gray-400 bg-amber-50 px-4 py-2 text-xs leading-relaxed text-gray-800 sm:px-5">
      <span className="mr-2 inline-block bg-jackson-gold px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">Cash activity</span>
      Annual contributions and distributions are read-only where dated activity is present. Update the dated rows above to recalculate totals and XIRR.
    </p>}
  </header>
}

