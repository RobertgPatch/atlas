import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Cloud, Pause, Play, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { AppShell } from '../components/shared/AppShell'
import {
  adminClient,
  type AdminUserSummary,
  type ApplicationLogResult,
} from '../features/admin/adminClient'

const time = (value: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Never'

const compactLog = (message: string) => {
  try {
    return JSON.stringify(JSON.parse(message), null, 2)
  } catch {
    return message
  }
}

export function AdminOperationsPage() {
  const { session } = useSession()
  const [users, setUsers] = useState<AdminUserSummary[]>([])
  const [logs, setLogs] = useState<ApplicationLogResult | null>(null)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [directory, applicationLogs] = await Promise.all([
        adminClient.listUsers(),
        adminClient.listApplicationLogs(),
      ])
      setUsers(directory.users)
      setLogs(applicationLogs)
    } catch {
      setError('Operations data could not be loaded. Confirm the API and AWS log permissions are available.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (paused) return
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, Math.max(15, logs?.refreshAfterSeconds ?? 15) * 1_000)
    return () => window.clearInterval(interval)
  }, [logs?.refreshAfterSeconds, paused, refresh])

  const activeUsers = useMemo(() => users.filter((user) => user.status === 'Active').length, [users])
  const enrolledUsers = useMemo(() => users.filter((user) => user.mfaEnrollmentState === 'ENROLLED').length, [users])

  return (
    <AppShell
      currentPath="/admin"
      userRole={session?.role ?? 'User'}
      userAccessLevel={session?.user.accessLevel}
      userEmail={session?.user.email}
      onSignOut={() => void authClient.logout().finally(() => sessionStore.setUnauthenticated())}
      mainClassName="bg-slate-100"
      topBarBreadcrumbs={[{ label: 'Administration' }, { label: 'Operations' }]}
    >
      <div data-design-variant="operations-console" className="space-y-6">
        <header className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 px-5 py-6 text-white shadow-sm sm:px-7">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-400">Super admin / live control plane</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Application operations</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">A protected view of Jackson identities and redacted AWS application events. Log messages are read on demand and are not copied into the application database.</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPaused((value) => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm text-slate-200 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
                {paused ? 'Resume live view' : 'Pause live view'}
              </button>
              <button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-500 px-3 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" /> Refresh
              </button>
            </div>
          </div>
        </header>

        {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

        <section aria-labelledby="identity-title" className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-100 text-emerald-800"><Users className="h-5 w-5" aria-hidden="true" /></div>
              <div><h2 id="identity-title" className="font-semibold text-slate-950">Identity registry</h2><p className="text-sm text-slate-500">{users.length} accounts · {activeUsers} active · {enrolledUsers} MFA enrolled</p></div>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Robert Patch only</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 font-mono text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Identity</th><th className="px-4 py-3">Access</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">MFA</th><th className="px-4 py-3">Last login</th><th className="px-5 py-3 text-right">Logins</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => <tr key={user.id} className="hover:bg-slate-50"><td className="px-5 py-4"><p className="font-medium text-slate-950">{user.displayName}</p><p className="text-xs text-slate-500">{user.email}</p></td><td className="px-4 py-4"><span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{user.accessLevel}</span></td><td className="px-4 py-4 text-slate-700">{user.status}{user.passwordChangeRequired ? <span className="ml-2 text-xs text-amber-700">Password change due</span> : null}</td><td className="px-4 py-4 text-slate-700">{user.mfaEnrollmentState.replace('_', ' ')}</td><td className="px-4 py-4 text-slate-600">{time(user.lastLoginAt)}</td><td className="px-5 py-4 text-right font-mono tabular-nums text-slate-700">{user.loginCount}</td></tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="logs-title" className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-100 shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-800 px-5 py-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-800 text-emerald-400"><Activity className="h-5 w-5" aria-hidden="true" /></div><div><h2 id="logs-title" className="font-semibold">Live application logs</h2><p className="text-sm text-slate-400">CloudWatch · last 15 minutes · refreshes every 15 seconds</p></div></div>
            <div className="flex items-center gap-2 text-xs text-slate-400" aria-live="polite"><span className={`h-2 w-2 rounded-full ${paused ? 'bg-amber-400' : 'bg-emerald-400'}`} />{paused ? 'Paused' : 'Live'}{logs ? ` · checked ${time(logs.checkedAt)}` : ''}</div>
          </div>
          {!logs?.available ? <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center"><Cloud className="h-8 w-8 text-slate-600" aria-hidden="true" /><p className="mt-3 font-medium">CloudWatch log view is unavailable</p><p className="mt-1 max-w-lg text-sm text-slate-400">The local environment does not query AWS by default. Production enables the exact log groups through least-privilege task permissions.</p></div> : logs.events.length === 0 ? <div className="min-h-40 px-5 py-8 text-sm text-slate-400">No application events were returned for this window.</div> : <ol className="max-h-[38rem] divide-y divide-slate-800 overflow-y-auto" aria-label="Application log events">{logs.events.map((event) => <li key={`${event.source}-${event.id}`} className="grid gap-2 px-5 py-4 hover:bg-slate-900 md:grid-cols-[9rem_8rem_1fr]"><time className="font-mono text-xs text-slate-500" dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleTimeString()}</time><span className="w-fit rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-emerald-300">{event.source}</span><pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-300">{compactLog(event.message)}</pre></li>)}</ol>}
          {logs?.failures.length ? <div className="border-t border-amber-900/60 bg-amber-950/30 px-5 py-3 text-xs text-amber-300">Unavailable sources: {logs.failures.join(', ')}</div> : null}
        </section>
      </div>
    </AppShell>
  )
}
