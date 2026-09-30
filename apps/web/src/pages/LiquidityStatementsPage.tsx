import { ArrowLeftIcon, FileSpreadsheetIcon, ShieldCheckIcon } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { AppShell } from '../components/shared/AppShell'
import { LiquidityStatementWorkspace } from '../features/reports/components/LiquidityCsvUploadDialog'

export function LiquidityStatementsPage() {
  const { session } = useSession()
  const [searchParams] = useSearchParams()

  if (session?.role !== 'Admin') return <Navigate to="/liquidity" replace />

  return <AppShell
    currentPath="/liquidity/statements"
    userRole={session.role}
    userAccessLevel={session.user.accessLevel}
    userEmail={session.user.email}
    onSignOut={() => void authClient.logout().finally(() => sessionStore.setUnauthenticated())}
  >
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/liquidity" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-primary">
            <ArrowLeftIcon className="h-4 w-4" /> Back to Liquidity
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Statement workspace</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Upload complete account snapshots, review imports, and manage custodian names and statement history.
          </p>
        </div>
      </header>

      <aside className="grid gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 md:grid-cols-[auto_1fr]">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white">
          <ShieldCheckIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold text-emerald-950">Adapter onboarding is review-first</h2>
          <p className="mt-1 text-sm leading-6 text-emerald-900">
            Merrill Lynch CSV, Charles Schwab CSV, and Morgan Stanley XLSX layouts are supported. Upload a representative file for a new layout; it remains unpublished while its reusable adapter is implemented and tested. Unknown CSV layouts can use reviewed column mapping when safe, while unknown XLSX layouts require a tested adapter before applying.
          </p>
          <p className="mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">
            <FileSpreadsheetIcon className="h-4 w-4" /> Custodian identity and statement format are managed separately
          </p>
        </div>
      </aside>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <LiquidityStatementWorkspace initialEntityId={searchParams.get('entityId') ?? undefined} />
      </section>
    </div>
  </AppShell>
}
