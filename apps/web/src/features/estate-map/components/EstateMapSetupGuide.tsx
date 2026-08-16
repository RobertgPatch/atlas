import {
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Link2,
  MapPinned,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { MagicButton, MagicModal } from '../../partnership-tracker/components/magic-patterns/MagicPatternPrimitives'

const steps = [
  {
    icon: Users,
    title: 'Create every person, trust, and legal entity',
    description: 'Use Entities & Owners for family members, trusts, LLCs, corporations, and family partnerships. Choose the correct record type and record jurisdiction and formation date.',
    link: '/entities',
    linkLabel: 'Open Entities & Owners',
  },
  {
    icon: Link2,
    title: 'Record ownership and control',
    description: 'Open each investment partnership, use Overview → Ownership and control relationships, and link the trust, person, or entity that owns or directs the holding entity. Ownership percentages should total 100%.',
    link: '/partnership-tracker',
    linkLabel: 'Open Partnerships',
  },
  {
    icon: CircleDollarSign,
    title: 'Add and classify underlying assets',
    description: 'Open Partnership → Underlying Assets. Choose an Estate Map Category, enter the short map detail, and add the latest FMV and valuation date. Only active assets appear on the map.',
    link: '/partnership-tracker',
    linkLabel: 'Open Underlying Assets',
  },
  {
    icon: MapPinned,
    title: 'Choose the map root and review the projection',
    description: 'Create an Estate Map rooted at the principal trust or individual. Atlas follows the recorded relationships, groups assets into the five design categories, and derives values and allocation percentages.',
    link: '/estate-maps',
    linkLabel: 'Return to Estate Maps',
  },
]

export function EstateMapSetupGuide({
  open,
  onClose,
  counts,
}: {
  open: boolean
  onClose: () => void
  counts: {
    people: number
    trusts: number
    relationships: number
    holdings: number
    assets: number
    valuedAssets: number
  }
}) {
  return (
    <MagicModal
      open={open}
      onClose={onClose}
      size="lg"
      title="Build an estate map"
      description="Enter source records in this order. The map is a projection; values and nodes are not manually entered on the canvas."
      footer={<MagicButton type="button" onClick={onClose}>Done</MagicButton>}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Estate map readiness">
        {[
          ['People', counts.people],
          ['Trusts', counts.trusts],
          ['Relationships', counts.relationships],
          ['Holding branches', counts.holdings],
          ['Assets', counts.assets],
          ['Valued assets', counts.valuedAssets],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <ol className="mt-6 space-y-3">
        {steps.map((step, index) => {
          const Icon = step.icon
          return (
            <li key={step.title} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
              <div className="relative grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-slate-950 font-mono text-[0.62rem] font-semibold text-white">{index + 1}</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-950">{step.title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">{step.description}</p>
              </div>
              <Link
                to={step.link}
                onClick={onClose}
                className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {step.linkLabel}
              </Link>
            </li>
          )
        })}
      </ol>

      <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-800" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-blue-950">How the tiers are derived</h3>
            <p className="mt-1 text-xs leading-5 text-blue-900">
              Individuals become Family & Key Roles; trusts become Trust Structures; each partnership’s owning entity and investment become Holding Companies & Partnerships; active classified assets become Underlying Assets. Solid connectors are ownership, while dashed connectors are control or management.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Never add partnership NAV to the same partnership’s underlying-asset FMVs. Atlas uses NAV for the legal-value rollup and uses asset FMVs for the look-through allocation.
      </div>
    </MagicModal>
  )
}
