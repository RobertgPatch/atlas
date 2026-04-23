import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { AppShell } from '../components/shared/AppShell'
import { PageHeader } from '../components/shared/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { useSession, sessionStore } from '../auth/sessionStore'
import { authClient } from '../auth/authClient'
import {
  useCreateEntity,
  useDeleteEntity,
  useEntityList,
  useUpdateEntity,
} from '../features/partnerships/hooks/useEntityQueries'
import { EntitiesApiError } from '../features/partnerships/api/entitiesClient'

function formatUsd(value: number | null | undefined): string {
  if (value == null || value === 0) return '—'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toLocaleString()}`
}

function errorMessage(err: unknown, fallback = 'Action failed. Please try again.'): string {
  if (err instanceof EntitiesApiError) {
    if (err.code === 'DUPLICATE_ENTITY_NAME') return 'An entity with that name already exists.'
    if (err.code === 'ENTITY_HAS_PARTNERSHIPS')
      return 'This entity has partnerships attached. Move or delete them before removing the entity.'
    if (err.code === 'FORBIDDEN_ROLE') return 'Only Admins can manage entities.'
    if (err.code === 'VALIDATION_ERROR') return 'Please enter a valid entity name.'
    return err.code
  }
  return fallback
}

export function EntitiesPage() {
  const { session } = useSession()
  const isAdmin = session?.role === 'Admin'
  const navigate = useNavigate()

  const list = useEntityList()
  const create = useCreateEntity()
  const update = useUpdateEntity()
  const remove = useDeleteEntity()

  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)

  const handleCreate = async () => {
    const trimmed = newName.trim()
    if (!trimmed) {
      setCreateError('Enter an entity name.')
      return
    }
    setCreateError(null)
    try {
      await create.mutateAsync(trimmed)
      setNewName('')
    } catch (err) {
      setCreateError(errorMessage(err))
    }
  }

  const startEdit = (id: string, name: string) => {
    setEditId(id)
    setEditName(name)
    setRowError(null)
  }

  const cancelEdit = () => {
    setEditId(null)
    setEditName('')
    setRowError(null)
  }

  const saveEdit = async (id: string) => {
    const trimmed = editName.trim()
    if (!trimmed) {
      setRowError({ id, message: 'Name cannot be empty.' })
      return
    }
    try {
      await update.mutateAsync({ id, name: trimmed })
      cancelEdit()
    } catch (err) {
      setRowError({ id, message: errorMessage(err) })
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Remove the entity "${name}"? This cannot be undone.`)) return
    try {
      await remove.mutateAsync(id)
      if (editId === id) cancelEdit()
    } catch (err) {
      setRowError({ id, message: errorMessage(err) })
    }
  }

  const items = list.data?.items ?? []
  const empty = !list.isLoading && !list.isError && items.length === 0

  return (
    <AppShell
      currentPath="/entities"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
    >
      <PageHeader
        title="Entities"
        subtitle="Top-level investment containers. Partnerships and K-1s attach to an entity."
      />

      {/* Admin-only inline "Add entity" form */}
      {isAdmin && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Add a new entity
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate()
                }}
                placeholder="e.g. Whitfield Family Trust"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-atlas-gold focus:border-atlas-gold"
              />
              {createError && <p className="mt-1 text-xs text-error">{createError}</p>}
            </div>
            <button
              onClick={() => void handleCreate()}
              disabled={create.isPending}
              className={`inline-flex items-center px-4 py-2 rounded-lg bg-atlas-gold text-white text-sm hover:bg-atlas-hover sm:mt-[22px] ${
                create.isPending ? 'opacity-60 cursor-wait' : ''
              }`}
            >
              {create.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Add entity
            </button>
          </div>
        </div>
      )}

      {list.isLoading && <LoadingState rows={4} columns={3} />}
      {list.isError && (
        <ErrorState
          title="Unable to load entities"
          message="Please try again."
          onRetry={() => list.refetch()}
        />
      )}

      {empty && (
        <EmptyState
          title={isAdmin ? 'No entities yet' : 'No entities available'}
          description={
            isAdmin
              ? 'Create your first entity above to start uploading K-1s. Each K-1 must be attached to an entity.'
              : 'An Admin needs to create an entity and grant you access before K-1s can be uploaded.'
          }
          icon={<Building2 className="w-5 h-5 text-text-tertiary" />}
        />
      )}

      {!list.isLoading && !list.isError && items.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-700 uppercase tracking-wide px-4 py-3">
                  Name
                </th>
                <th className="text-right text-xs font-semibold text-gray-700 uppercase tracking-wide px-4 py-3 w-36">
                  Partnerships
                </th>
                <th className="text-right text-xs font-semibold text-gray-700 uppercase tracking-wide px-4 py-3 w-48">
                  Latest Distributions
                </th>
                <th className="w-40 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((row) => {
                const isEditing = editId === row.id
                const rowErr = rowError?.id === row.id ? rowError.message : null
                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      {isEditing ? (
                        <div>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveEdit(row.id)
                              if (e.key === 'Escape') cancelEdit()
                            }}
                            autoFocus
                            className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-atlas-gold focus:border-atlas-gold"
                          />
                          {rowErr && <p className="mt-1 text-xs text-error">{rowErr}</p>}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => navigate(`/entities/${row.id}`)}
                          className="text-atlas-gold hover:underline font-medium"
                        >
                          {row.name}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums">
                      {row.partnershipCount}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums">
                      {formatUsd(row.totalDistributionsUsd)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isAdmin && (
                        <div className="inline-flex items-center gap-1">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => void saveEdit(row.id)}
                                disabled={update.isPending}
                                className="p-1.5 rounded hover:bg-gray-100 text-emerald-600 disabled:opacity-50"
                                title="Save"
                              >
                                {update.isPending ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Check className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                                title="Cancel"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(row.id, row.name)}
                                className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                                title="Rename"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => void handleDelete(row.id, row.name)}
                                disabled={remove.isPending}
                                className="p-1.5 rounded hover:bg-gray-100 text-error disabled:opacity-50"
                                title={
                                  row.partnershipCount > 0
                                    ? 'Remove all partnerships before deleting'
                                    : 'Delete entity'
                                }
                              >
                                {remove.isPending ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {!isEditing && rowErr && (
                        <p className="mt-1 text-xs text-error">{rowErr}</p>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  )
}
