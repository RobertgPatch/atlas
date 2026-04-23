import React, { useEffect, useMemo, useState } from 'react'
import { Plus, ShieldAlert, UserCog } from 'lucide-react'
import { AppShell } from '../components/shared/AppShell'
import { DataTable, type Column } from '../components/shared/DataTable'
import { FilterToolbar } from '../components/shared/FilterToolbar'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/shared/PageHeader'
import { StatusBadge } from '../components/shared/StatusBadge'
import { RolePill } from '../components/shared/RolePill'
import { authClient, type AtlasRole, type UserSummary } from '../auth/authClient'
import { useSession } from '../auth/sessionStore'

export function UserManagementPage() {
  const { session } = useSession()
  const [items, setItems] = useState<UserSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<AtlasRole>('User')

  const loadUsers = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await authClient.listUsers()
      setItems(response.items)
    } catch {
      setError('Unable to load users right now.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  const handleInvite = async () => {
    if (!inviteEmail) return
    try {
      await authClient.inviteUser(inviteEmail, inviteRole)
      setInviteEmail('')
      setInviteRole('User')
      await loadUsers()
    } catch {
      setError('Invite failed. Please try again.')
    }
  }

  const columns = useMemo<Column<UserSummary>[]>(
    () => [
      { key: 'email', header: 'Email', sortable: true },
      {
        key: 'role',
        header: 'Role',
        accessor: (row) => <RolePill role={row.role} />,
      },
      {
        key: 'status',
        header: 'Status',
        accessor: (row) => <StatusBadge status={row.status} />,
      },
      {
        key: 'actions',
        header: 'Actions',
        accessor: (row) => (
          <div className="flex items-center gap-2 justify-end">
            <button
              className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
              onClick={async (event) => {
                event.stopPropagation()
                const nextRole: AtlasRole = row.role === 'Admin' ? 'User' : 'Admin'
                await authClient.changeRole(row.id, nextRole)
                await loadUsers()
              }}
            >
              Toggle Role
            </button>
            <button
              className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
              onClick={async (event) => {
                event.stopPropagation()
                if (row.status === 'Inactive') {
                  await authClient.reactivateUser(row.id)
                } else {
                  await authClient.deactivateUser(row.id)
                }
                await loadUsers()
              }}
            >
              {row.status === 'Inactive' ? 'Reactivate' : 'Deactivate'}
            </button>
            <button
              className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
              onClick={async (event) => {
                event.stopPropagation()
                await authClient.resetMfa(row.id)
                await loadUsers()
              }}
            >
              Reset MFA
            </button>
          </div>
        ),
        align: 'right',
      },
    ],
    [],
  )

  if (session?.role !== 'Admin') {
    return (
      <AppShell currentPath="/admin/users" userRole={session?.role ?? 'User'}>
        <PageHeader title="User Management" />
        <EmptyState
          title="Admin access required"
          description="Only administrators can access user management."
          icon={<ShieldAlert className="w-5 h-5 text-warning" />}
        />
      </AppShell>
    )
  }

  return (
    <AppShell
      currentPath="/admin/users"
      userRole={session?.role ?? 'Admin'}
      userEmail={session?.user.email}
    >
      <PageHeader
        title="User Management"
        subtitle="Invite users, assign roles, and manage account access."
      />

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <input
          value={inviteEmail}
          onChange={(event) => setInviteEmail(event.target.value)}
          placeholder="new.user@atlas.com"
          type="email"
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg"
        />
        <select
          value={inviteRole}
          onChange={(event) => setInviteRole(event.target.value as AtlasRole)}
          className="px-3 py-2 border border-gray-200 rounded-lg"
        >
          <option value="User">User</option>
          <option value="Admin">Admin</option>
        </select>
        <button
          onClick={() => void handleInvite()}
          className="inline-flex items-center px-4 py-2 rounded-lg bg-atlas-gold text-white hover:bg-atlas-hover"
        >
          <Plus className="w-4 h-4 mr-2" />
          Invite
        </button>
      </div>

      <FilterToolbar />

      {isLoading && <LoadingState rows={5} columns={4} />}
      {error && <ErrorState title="Unable to load users" message={error} onRetry={() => void loadUsers()} />}
      {!isLoading && !error && items.length === 0 && (
        <EmptyState
          title="No users found"
          description="Invite your first user to begin collaboration."
          icon={<UserCog className="w-5 h-5 text-text-tertiary" />}
        />
      )}
      {!isLoading && !error && items.length > 0 && (
        <DataTable columns={columns} data={items} />
      )}
    </AppShell>
  )
}
