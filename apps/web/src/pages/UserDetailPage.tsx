import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, KeyRound, Loader2, Shield, UserCog, UserX } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/shared/AppShell'
import { PageHeader } from '../components/shared/PageHeader'
import { DataTable, type Column } from '../components/shared/DataTable'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { EmptyState } from '../components/EmptyState'
import { RolePill } from '../components/shared/RolePill'
import { StatusBadge } from '../components/shared/StatusBadge'
import { authClient, type AtlasRole, type UserDetailResponse } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'

type PermissionRow = {
  id: string
  module: string
  view: boolean
  edit: boolean
  delete: boolean
  admin: boolean
}

const MODULES = [
  'Dashboard',
  'K-1 Processing',
  'Upload Center',
  'Review Workspace',
  'Partnerships',
  'Entities',
  'Reports',
  'User Management',
] as const

const formatDateTime = (value: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

const initialsFor = (email: string) =>
  email
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U'

const permissionRowsForRole = (role: AtlasRole): PermissionRow[] =>
  MODULES.map((module) => {
    if (role === 'Admin') {
      return {
        id: module,
        module,
        view: true,
        edit: true,
        delete: true,
        admin: true,
      }
    }

    const editable = ['K-1 Processing', 'Upload Center', 'Review Workspace'].includes(module)
    return {
      id: module,
      module,
      view: module !== 'User Management',
      edit: editable,
      delete: false,
      admin: false,
    }
  })

export function UserDetailPage() {
  const { session } = useSession()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<UserDetailResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<null | 'role' | 'status' | 'mfa'>(null)

  const loadDetail = async () => {
    if (!id) return
    try {
      setIsLoading(true)
      setError(null)
      const detail = await authClient.getUserDetail(id)
      setData(detail)
    } catch {
      setError('Unable to load this user right now.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadDetail()
  }, [id])

  const permissionColumns = useMemo<Column<PermissionRow>[]>(
    () => [
      { key: 'module', header: 'Module' },
      {
        key: 'view',
        header: 'View',
        align: 'center',
        accessor: (row) => (
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${row.view ? 'bg-atlas-gold' : 'bg-gray-300'}`} />
        ),
      },
      {
        key: 'edit',
        header: 'Edit',
        align: 'center',
        accessor: (row) => (
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${row.edit ? 'bg-atlas-gold' : 'bg-gray-300'}`} />
        ),
      },
      {
        key: 'delete',
        header: 'Delete',
        align: 'center',
        accessor: (row) => (
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${row.delete ? 'bg-error' : 'bg-gray-300'}`} />
        ),
      },
      {
        key: 'admin',
        header: 'Admin',
        align: 'center',
        accessor: (row) => (
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${row.admin ? 'bg-error' : 'bg-gray-300'}`} />
        ),
      },
    ],
    [],
  )

  const activityColumns = useMemo<Column<UserDetailResponse['activity'][number]>[]>(
    () => [
      {
        key: 'date',
        header: 'Date',
        width: '180px',
        accessor: (row) => <span className="text-text-secondary">{formatDateTime(row.date)}</span>,
      },
      { key: 'action', header: 'Action', width: '180px' },
      { key: 'detail', header: 'Detail' },
    ],
    [],
  )

  const handleToggleRole = async () => {
    if (!data || action) return
    const nextRole: AtlasRole = data.user.role === 'Admin' ? 'User' : 'Admin'
    setAction('role')
    try {
      await authClient.changeRole(data.user.id, nextRole)
      await loadDetail()
    } catch {
      setError('Unable to update this user right now.')
    } finally {
      setAction(null)
    }
  }

  const handleToggleStatus = async () => {
    if (!data || action) return
    setAction('status')
    try {
      if (data.user.status === 'Inactive') {
        await authClient.reactivateUser(data.user.id)
      } else {
        await authClient.deactivateUser(data.user.id)
      }
      await loadDetail()
    } catch {
      setError('Unable to update this user right now.')
    } finally {
      setAction(null)
    }
  }

  const handleResetMfa = async () => {
    if (!data || action) return
    setAction('mfa')
    try {
      await authClient.resetMfa(data.user.id)
      await loadDetail()
    } catch {
      setError('Unable to reset MFA right now.')
    } finally {
      setAction(null)
    }
  }

  const permissionRows = data ? permissionRowsForRole(data.user.role) : []

  if (session?.role !== 'Admin') {
    return (
      <AppShell
        currentPath="/admin/users"
        userRole={session?.role ?? 'User'}
        userEmail={session?.user.email}
        onSignOut={() => {
          void authClient.logout().finally(() => sessionStore.setUnauthenticated())
        }}
      >
        <PageHeader title="User Detail" />
        <EmptyState
          title="Admin access required"
          description="Only administrators can access user details."
          icon={<Shield className="w-5 h-5 text-warning" />}
        />
      </AppShell>
    )
  }

  return (
    <AppShell
      currentPath="/admin/users"
      userRole={session?.role ?? 'Admin'}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
    >
      <PageHeader
        title={data?.user.email ?? 'User Detail'}
        subtitle="Account profile, access, and recent activity."
        breadcrumbs={[
          { label: 'Admin' },
          { label: 'User Management', href: '/admin/users' },
          { label: data?.user.email ?? 'User Detail' },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => navigate('/admin/users')}
              className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </button>
            <button
              onClick={() => void handleToggleStatus()}
              disabled={action !== null || !data}
              className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-60 disabled:cursor-wait"
            >
              {action === 'status' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserX className="w-4 h-4 mr-2" />}
              {data?.user.status === 'Inactive' ? 'Reactivate' : 'Deactivate'}
            </button>
            <button
              onClick={() => void handleToggleRole()}
              disabled={action !== null || !data}
              className="inline-flex items-center px-3 py-2 rounded-lg bg-atlas-gold text-white text-sm hover:bg-atlas-hover disabled:opacity-60 disabled:cursor-wait"
            >
              {action === 'role' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserCog className="w-4 h-4 mr-2" />}
              Toggle Role
            </button>
          </div>
        }
      />

      {isLoading && <LoadingState rows={5} columns={4} />}
      {error && !data && <ErrorState title="Unable to load user" message={error} onRetry={() => void loadDetail()} />}

      {!isLoading && !error && !data && (
        <EmptyState
          title="User not found"
          description="That account could not be located."
          icon={<UserCog className="w-5 h-5 text-text-tertiary" />}
        />
      )}

      {data && (
        <>
          {error && <div className="mb-4 rounded-lg border border-error/20 bg-error-light px-4 py-3 text-sm text-error">{error}</div>}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <section className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="mb-6 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 text-lg font-semibold text-white">
                  {initialsFor(data.user.email)}
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">{data.user.email}</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <RolePill role={data.user.role} />
                    <StatusBadge status={data.user.status} />
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t border-gray-100 pt-4">
                {[
                  ['Email', data.user.email],
                  ['Created', formatDateTime(data.user.createdAt)],
                  ['Last Login', formatDateTime(data.user.lastLoginAt)],
                  ['Login Count', String(data.user.loginCount)],
                  ['MFA', data.user.mfaEnabled ? 'Enabled' : 'Not enabled'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 border-b border-gray-100 pb-3 text-sm last:border-b-0 last:pb-0">
                    <span className="text-text-secondary">{label}</span>
                    <span className="text-right font-medium text-text-primary">{value}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="space-y-6">
              <section className="rounded-lg border border-gray-200 bg-white p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-atlas-gold" />
                  <h3 className="text-lg font-semibold text-text-primary">Security Settings</h3>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-4">
                    <div>
                      <p className="text-sm font-medium text-text-primary">Multi-Factor Authentication</p>
                      <p className="text-sm text-text-secondary">Require MFA for all sign-in attempts.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={data.user.mfaEnabled ? 'Enabled' : 'Disabled'} type={data.user.mfaEnabled ? 'success' : 'warning'} />
                      <button
                        onClick={() => void handleResetMfa()}
                        disabled={action !== null}
                        className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-60 disabled:cursor-wait"
                      >
                        {action === 'mfa' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
                        Reset MFA
                      </button>
                    </div>
                  </div>

                  <div className="border-b border-gray-100 pb-4">
                    <p className="mb-2 text-sm font-medium text-text-primary">Assigned Entities</p>
                    {data.assignedEntities.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {data.assignedEntities.map((entity) => (
                          <span key={entity.id} className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-text-primary">
                            {entity.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-text-secondary">No entity assignments yet.</p>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium text-text-primary">Role</p>
                    <div className="flex flex-wrap gap-2">
                      {(['Admin', 'User'] as AtlasRole[]).map((role) => (
                        <span
                          key={role}
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border ${role === data.user.role ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-text-primary'}`}
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-6">
                <h3 className="mb-3 text-lg font-semibold text-text-primary">Permissions Matrix</h3>
                <div className="mb-4 rounded-lg border border-atlas-gold/20 bg-atlas-light px-4 py-3 text-sm text-text-secondary">
                  Permissions are role-driven in the current admin model. Changing the role updates access across the app.
                </div>
                <DataTable columns={permissionColumns} data={permissionRows} />
              </section>
            </div>
          </div>

          <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">Activity Log</h3>
            <DataTable
              columns={activityColumns}
              data={data.activity}
              emptyMessage="No recent activity recorded for this user."
            />
          </section>
        </>
      )}
    </AppShell>
  )
}