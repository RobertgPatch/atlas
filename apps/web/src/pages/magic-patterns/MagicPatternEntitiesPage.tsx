import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from '@headlessui/react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Ban,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  CircleDashed,
  Clock,
  Ellipsis,
  Handshake,
  Loader2,
  Plus,
  Search,
  Users2,
  Wallet,
  X,
} from 'lucide-react'
import {
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
  type InputHTMLAttributes,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { authClient } from '../../auth/authClient'
import { sessionStore, useSession } from '../../auth/sessionStore'
import { AppShell } from '../../components/shared/AppShell'
import { Button } from '../../components/shared/Button'
import type {
  CreateEntityInput,
  EntityKind,
  EntityListItem,
} from '../../features/partnerships/api/entitiesClient'
import {
  useCreateEntity,
  useDeleteEntity,
  useEntityList,
} from '../../features/partnerships/hooks/useEntityQueries'
import {
  ENTITY_KIND_LABELS as ENTITY_KIND_LABEL,
  normalizeEntityKind as normalizeKind,
} from '../../features/partnerships/entityTypeLabels'
import { errorMessage } from '../entitiesPageUtils'

type EntitySortKey =
  | 'name'
  | 'kind'
  | 'owners'
  | 'partnerships'
  | 'investments'
  | 'holdingsValue'
  | 'status'
type SortDirection = 'asc' | 'desc'

const ENTITY_KIND_OPTIONS = (Object.keys(ENTITY_KIND_LABEL) as EntityKind[]).map((value) => ({
  value,
  label: ENTITY_KIND_LABEL[value],
}))

const EMPTY_FORM: CreateEntityInput = {
  name: '',
  kind: 'llc',
  jurisdiction: '',
  taxId: '',
  formedOn: '',
}


const normalizeStatus = (value: string) => {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'active') return 'validated'
  if (normalized === 'inactive') return 'inactive'
  if (normalized === 'pending') return 'pending'
  if (normalized === 'error') return 'error'
  if (normalized === 'validated') return 'validated'
  return 'draft'
}

const formatCount = (value: number) => new Intl.NumberFormat('en-US').format(value)

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

const formatCompactCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value)

const DesignButton = Button

function StatTile({
  label,
  value,
  helperText,
  icon: Icon,
  loading,
}: {
  label: string
  value: string | number
  helperText: string
  icon: ComponentType<{ className?: string }>
  loading: boolean
}) {
  return (
    <div className="w-full rounded-lg border border-[#DAE2EC] bg-white p-4 text-left shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[#3E5169]">{label}</p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#DAE2EC] bg-[#E8EEF5] text-[#3E5169]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3 flex min-h-9 items-center">
        {loading ? (
          <span className="block h-8 w-24 animate-pulse rounded bg-slate-200 motion-reduce:animate-none">
            <span className="sr-only">Loading {label}</span>
          </span>
        ) : (
          <span className="text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
            {value}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">{helperText}</p>
    </div>
  )
}

function FieldInput({
  label,
  hint,
  error,
  required,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
}) {
  const messageId = `${id}-message`
  return (
    <div className="w-full">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-900">
        {label}
        {required ? (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <div
        className={`flex h-10 items-center rounded-md border bg-white px-3 transition-colors focus-within:ring-2 focus-within:ring-offset-0 ${
          error
            ? 'border-red-500 focus-within:border-red-500 focus-within:ring-red-500/30'
            : 'border-gray-300 hover:border-gray-400 focus-within:border-gray-900 focus-within:ring-gray-900/15'
        }`}
      >
        <input
          {...props}
          id={id}
          aria-required={required || undefined}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none placeholder:text-gray-400"
        />
      </div>
      {error || hint ? (
        <p id={messageId} className={`mt-1.5 text-xs ${error ? 'text-red-600' : 'text-gray-500'}`}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  )
}

function EntityKindSelect({
  value,
  onChange,
}: {
  value: EntityKind
  onChange: (value: EntityKind) => void
}) {
  return (
    <Listbox value={value} onChange={onChange}>
      <div className="relative w-full">
        <Listbox.Label className="mb-1.5 block text-sm font-medium text-gray-900">
          Entity type
        </Listbox.Label>
        <ListboxButton className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-3 text-left text-sm text-gray-900 transition-colors hover:border-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1">
          <span>{ENTITY_KIND_LABEL[value]}</span>
          <ChevronDown className="h-4 w-4 text-gray-500 data-[open]:rotate-180" aria-hidden="true" />
        </ListboxButton>
        <ListboxOptions
          transition
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg transition duration-100 ease-out focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0"
        >
          {ENTITY_KIND_OPTIONS.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className="flex h-9 cursor-pointer items-center justify-between gap-2 px-3 text-sm text-gray-700 data-[focus]:bg-gray-100"
            >
              {({ selected }) => (
                <>
                  <span className={selected ? 'font-medium' : undefined}>{option.label}</span>
                  {selected ? <Check className="h-4 w-4 text-gray-900" aria-hidden="true" /> : null}
                </>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  )
}

function AddEntityDialog({
  open,
  pending,
  apiError,
  onClose,
  onCreate,
}: {
  open: boolean
  pending: boolean
  apiError: string | null
  onClose: () => void
  onCreate: (input: CreateEntityInput) => void | Promise<void>
}) {
  const [form, setForm] = useState<CreateEntityInput>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const close = () => {
    if (pending) return
    setForm(EMPTY_FORM)
    setErrors({})
    onClose()
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (!form.name.trim()) nextErrors.name = 'Legal name is required.'
    if (!form.jurisdiction.trim()) {
      nextErrors.jurisdiction = 'Jurisdiction of formation is required.'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    void onCreate({
      ...form,
      name: form.name.trim(),
      jurisdiction: form.jurisdiction.trim(),
      taxId: form.taxId.trim(),
      formedOn: form.formedOn.trim(),
    })
  }

  return (
    <Dialog open={open} onClose={close} className="relative z-[70]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-150 data-[closed]:opacity-0 motion-reduce:transition-none"
      />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4 sm:p-6">
        <DialogPanel
          transition
          className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl transition duration-200 ease-out data-[closed]:translate-y-2 data-[closed]:scale-[0.96] data-[closed]:opacity-0 motion-reduce:transform-none motion-reduce:transition-none"
        >
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold text-slate-900">Add entity</DialogTitle>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  The entity is created as a draft. Link owners, partnerships, and investments after it is saved.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={pending}
                aria-label="Close dialog"
                className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:opacity-40"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-slate-700">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FieldInput
                    id="entity-legal-name"
                    label="Legal name"
                    placeholder="Cascade Ridge Properties, LLC"
                    required
                    autoFocus
                    value={form.name}
                    error={errors.name}
                    onChange={(event) => {
                      setForm((current) => ({ ...current, name: event.target.value }))
                      if (errors.name) setErrors((current) => ({ ...current, name: '' }))
                    }}
                  />
                </div>
                <EntityKindSelect
                  value={form.kind}
                  onChange={(kind) => setForm((current) => ({ ...current, kind }))}
                />
                <FieldInput
                  id="entity-jurisdiction"
                  label="Jurisdiction"
                  placeholder="Delaware"
                  required
                  value={form.jurisdiction}
                  error={errors.jurisdiction}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, jurisdiction: event.target.value }))
                    if (errors.jurisdiction) {
                      setErrors((current) => ({ ...current, jurisdiction: '' }))
                    }
                  }}
                />
                <FieldInput
                  id="entity-tax-id"
                  label="Tax ID (EIN)"
                  placeholder="00-0000000"
                  hint="Leave blank if the EIN letter has not been received."
                  value={form.taxId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, taxId: event.target.value }))
                  }
                />
                <FieldInput
                  id="entity-formation-date"
                  label="Formation date"
                  placeholder="MM/DD/YYYY"
                  inputMode="numeric"
                  value={form.formedOn}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, formedOn: event.target.value }))
                  }
                />
              </div>
              {apiError ? (
                <p role="alert" className="mt-4 text-sm text-red-600">
                  {apiError}
                </p>
              ) : null}
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-[#F4F7FA] px-6 py-4 sm:flex-row sm:justify-end">
              <DesignButton type="button" variant="secondary" onClick={close} disabled={pending}>
                Cancel
              </DesignButton>
              <DesignButton type="submit" disabled={pending}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : null}
                {pending ? 'Saving…' : 'Create entity'}
              </DesignButton>
            </footer>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

function RemoveEntityDialog({
  entity,
  pending,
  onCancel,
  onConfirm,
}: {
  entity: EntityListItem | null
  pending: boolean
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}) {
  const close = () => {
    if (!pending) onCancel()
  }

  return (
    <Dialog open={entity !== null} onClose={close} className="relative z-[80]" role="alertdialog">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-slate-900/50 transition-opacity duration-150 data-[closed]:opacity-0 motion-reduce:transition-none"
      />
      <div className="fixed inset-0 flex items-end justify-center p-4 sm:items-center">
        <DialogPanel
          transition
          className="relative w-full max-w-md rounded-xl bg-white shadow-xl ring-1 ring-slate-900/5 transition duration-200 ease-out data-[closed]:translate-y-3 data-[closed]:scale-[0.98] data-[closed]:opacity-0 motion-reduce:transform-none motion-reduce:transition-none"
        >
          <button
            type="button"
            onClick={close}
            disabled={pending}
            aria-label="Close dialog"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>

          <div className="flex gap-4 p-6 pb-4">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600"
              aria-hidden="true"
            >
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0 pr-6 pt-1">
              <DialogTitle className="text-base font-semibold leading-6 text-slate-900">
                Remove {entity?.name ?? 'this entity'}?
              </DialogTitle>
              <p className="mt-1.5 text-sm leading-5 text-slate-600">
                The entity is removed from the directory along with its links to owners, partnerships, and investments. This cannot be undone.
              </p>
            </div>
          </div>

          <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
            <DesignButton type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </DesignButton>
            <DesignButton
              type="button"
              variant="danger"
              autoFocus
              onClick={() => void onConfirm()}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : null}
              {pending ? 'Removing…' : 'Remove entity'}
            </DesignButton>
          </footer>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

function EntityActions({
  isAdmin,
  onOpen,
  onRemove,
}: {
  isAdmin: boolean
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Menu as="div" className="relative inline-block text-left">
        <MenuButton
          aria-label="Row actions"
          className="grid h-7 w-7 place-items-center rounded p-1 text-[#5F7185] transition-colors hover:bg-[#E8EEF5] hover:text-[#17263A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus data-[open]:bg-[#E8EEF5]"
        >
          <Ellipsis className="h-4 w-4" aria-hidden="true" />
        </MenuButton>
        <MenuItems
          transition
          className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-md border border-[#BFCBD9] bg-white py-1 shadow-lg transition duration-100 ease-out focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0"
        >
          <MenuItem>
            <button
              type="button"
              onClick={onOpen}
              className="block w-full px-3 py-1.5 text-left text-sm text-[#3E5169] data-[focus]:bg-[#F4F7FA]"
            >
              Open entity
            </button>
          </MenuItem>
          {isAdmin ? (
            <MenuItem>
              <button
                type="button"
                onClick={onRemove}
                className="block w-full px-3 py-1.5 text-left text-sm text-[#B91C1C] data-[focus]:bg-[#FDECEC]"
              >
                Remove entity
              </button>
            </MenuItem>
          ) : null}
        </MenuItems>
      </Menu>
    </div>
  )
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 text-[#8C9CB0]" aria-hidden="true" />
  return direction === 'asc' ? (
    <ArrowUp className="h-3 w-3" aria-hidden="true" />
  ) : (
    <ArrowDown className="h-3 w-3" aria-hidden="true" />
  )
}

function EntityKindBadge({ kind }: { kind: EntityKind }) {
  const style =
    kind === 'trust'
      ? 'bg-sky-50 text-sky-700 ring-sky-200'
      : kind === 'individual'
        ? 'bg-slate-100 text-slate-700 ring-slate-200'
        : 'bg-indigo-50 text-indigo-700 ring-indigo-200'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium leading-none ring-1 ring-inset ${style}`}>
      {ENTITY_KIND_LABEL[kind]}
    </span>
  )
}

function StatusChip({ status }: { status: string }) {
  const normalized = normalizeStatus(status)
  const config = {
    validated: {
      label: 'Validated',
      style: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
      Icon: CheckCircle2,
    },
    draft: {
      label: 'Draft',
      style: 'bg-slate-50 text-slate-600 ring-slate-500/20',
      Icon: CircleDashed,
    },
    pending: {
      label: 'Pending',
      style: 'bg-amber-50 text-amber-700 ring-amber-600/20',
      Icon: Clock,
    },
    error: {
      label: 'Error',
      style: 'bg-red-50 text-red-700 ring-red-600/20',
      Icon: AlertCircle,
    },
    inactive: {
      label: 'Inactive',
      style: 'bg-zinc-100 text-zinc-600 ring-zinc-500/20',
      Icon: Ban,
    },
  }[normalized]
  const Icon = config.Icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${config.style}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  )
}

export function MagicPatternEntitiesPage() {
  const { session } = useSession()
  const isAdmin = session?.role === 'Admin'
  const navigate = useNavigate()
  const list = useEntityList()
  const create = useCreateEntity()
  const remove = useDeleteEntity()

  const [kindFilter, setKindFilter] = useState<'all' | EntityKind>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: EntitySortKey; direction: SortDirection }>({
    key: 'name',
    direction: 'asc',
  })
  const [addOpen, setAddOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EntityListItem | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const items = useMemo(() => list.data?.items ?? [], [list.data?.items])
  const totals = useMemo(
    () =>
      items.reduce(
        (current, item) => ({
          owners: current.owners + item.ownerCount,
          partnerships: current.partnerships + item.partnershipCount,
          holdings: current.holdings + item.holdingsValueUsd,
        }),
        { owners: 0, partnerships: 0, holdings: 0 },
      ),
    [items],
  )

  const filterItems = useMemo(() => {
    const kinds = Object.keys(ENTITY_KIND_LABEL) as EntityKind[]
    return [
      { value: 'all' as const, label: 'All entities', count: items.length },
      ...kinds
        .map((kind) => ({
          value: kind,
          label: ENTITY_KIND_LABEL[kind],
          count: items.filter((entity) => normalizeKind(entity.entityType) === kind).length,
        }))
        .filter((item) => item.count > 0),
    ]
  }, [items])

  const visibleItems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    const filtered = items.filter((item) => {
      if (kindFilter !== 'all' && normalizeKind(item.entityType) !== kindFilter) return false
      if (!normalizedSearch) return true
      return [item.name, item.entityType, item.jurisdiction, item.taxId]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(normalizedSearch))
    })

    return [...filtered].sort((left, right) => {
      const direction = sort.direction === 'asc' ? 1 : -1
      const leftKind = ENTITY_KIND_LABEL[normalizeKind(left.entityType)]
      const rightKind = ENTITY_KIND_LABEL[normalizeKind(right.entityType)]
      const values: Record<EntitySortKey, [string | number, string | number]> = {
        name: [left.name, right.name],
        kind: [leftKind, rightKind],
        owners: [left.ownerCount, right.ownerCount],
        partnerships: [left.partnershipCount, right.partnershipCount],
        investments: [left.investmentCount, right.investmentCount],
        holdingsValue: [left.holdingsValueUsd, right.holdingsValueUsd],
        status: [normalizeStatus(left.status), normalizeStatus(right.status)],
      }
      const [leftValue, rightValue] = values[sort.key]
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return (leftValue - rightValue) * direction
      }
      return String(leftValue).localeCompare(String(rightValue), undefined, {
        numeric: true,
        sensitivity: 'base',
      }) * direction
    })
  }, [items, kindFilter, search, sort])

  const changeSort = (key: EntitySortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const handleCreate = async (input: CreateEntityInput) => {
    setCreateError(null)
    try {
      const created = await create.mutateAsync(input)
      setAddOpen(false)
      navigate(`/entities/${created.id}`)
    } catch (error) {
      setCreateError(errorMessage(error))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setActionError(null)
    try {
      await remove.mutateAsync(target.id)
      setDeleteTarget(null)
    } catch (error) {
      setActionError(errorMessage(error))
      setDeleteTarget(null)
    }
  }

  const headers: Array<{
    key: EntitySortKey
    label: string
    align?: 'left' | 'right'
    className?: string
  }> = [
    { key: 'name', label: 'Entity', className: 'min-w-[26rem]' },
    { key: 'kind', label: 'Type' },
    { key: 'owners', label: 'Owners', align: 'right' },
    { key: 'partnerships', label: 'Partnerships', align: 'right' },
    { key: 'investments', label: 'Investments', align: 'right' },
    { key: 'holdingsValue', label: 'Holdings value (USD)', align: 'right' },
    { key: 'status', label: 'Status' },
  ]

  return (
    <AppShell
      currentPath="/entities"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
      mainClassName="bg-[#E7EDF4]"
      topBarBreadcrumbs={[{ label: 'Records' }, { label: 'Entities & Owners' }]}
    >
      <div className="w-full min-w-0" data-design-variant="magic-patterns-entities">
        <header className="border-b border-[#BFCBD9] pb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-[#17263A]">Entities & Owners</h1>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-[#3E5169]">
            Every legal entity, trust, and individual in the structure — and the partnerships and investments each one holds.
          </p>
          {isAdmin ? (
            <DesignButton
              type="button"
              className="mt-4"
              onClick={() => {
                setAddOpen(true)
                setCreateError(null)
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add entity
            </DesignButton>
          ) : null}
        </header>

        <section
          aria-label="Directory summary"
          className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <StatTile
            label="Entities on file"
            value={list.isError ? '—' : formatCount(items.length)}
            helperText="Includes trusts and individuals"
            icon={Building2}
            loading={list.isLoading}
          />
          <StatTile
            label="Owners of record"
            value={list.isError ? '—' : formatCount(totals.owners)}
            helperText="Across all entities"
            icon={Users2}
            loading={list.isLoading}
          />
          <StatTile
            label="Partnership interests"
            value={list.isError ? '—' : formatCount(totals.partnerships)}
            helperText="Held by these entities"
            icon={Handshake}
            loading={list.isLoading}
          />
          <StatTile
            label="Holdings value"
            value={list.isError ? '—' : formatCompactCurrency(totals.holdings)}
            helperText="USD, latest available valuations"
            icon={Wallet}
            loading={list.isLoading}
          />
        </section>

        {actionError ? (
          <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {actionError}
          </div>
        ) : null}

        <section
          aria-label="Entity directory"
          className="mt-6 min-w-0 max-w-full overflow-hidden rounded-lg border border-[#DAE2EC] bg-white shadow-sm"
        >
          <div className="overflow-x-auto border-b border-[#DAE2EC] bg-[#F4F7FA] px-4 py-3">
            <div
              role="tablist"
              aria-label="Filter entities by type"
              className="inline-flex min-w-max items-center gap-1 rounded-lg bg-gray-100 p-1"
            >
              {filterItems.map((item) => {
                const selected = kindFilter === item.value
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setKindFilter(item.value)}
                    className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
                      selected ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {item.label}
                    <span
                      className={`ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                        selected ? 'bg-primary-subtle text-primary' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {list.isLoading || list.isError ? '—' : item.count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex min-h-[53px] flex-col gap-2 border-b border-[#DAE2EC] px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
            <label className="relative block w-full sm:w-64">
              <span className="sr-only">Search entities, jurisdictions, EINs…</span>
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5F7185]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search entities, jurisdictions, EINs…"
                aria-label="Search entities, jurisdictions, EINs…"
                className="w-full rounded-md border border-border-control bg-surface py-1.5 pl-8 pr-3 text-sm text-content-primary outline-none placeholder:text-content-muted focus:border-focus focus:ring-2 focus:ring-focus"
              />
            </label>
          </div>

          <div className="max-w-full overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[1180px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#BFCBD9] bg-[#EDF2F8]">
                  {headers.map((header) => (
                    <th
                      key={header.key}
                      scope="col"
                      aria-sort={
                        sort.key === header.key
                          ? sort.direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                      className={`whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#3E5169] ${
                        header.align === 'right' ? 'text-right' : 'text-left'
                      } ${header.className ?? ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => changeSort(header.key)}
                        className={`inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                          header.align === 'right' ? 'ml-auto' : ''
                        }`}
                      >
                        {header.label}
                        <SortIcon active={sort.key === header.key} direction={sort.direction} />
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="w-10 px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-[#3E5169]">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      Loading entities…
                    </td>
                  </tr>
                ) : list.isError ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <p className="text-sm font-medium text-[#17263A]">Entity records could not be loaded.</p>
                      <p className="mt-1 text-sm text-[#5F7185]">Try again to refresh the directory.</p>
                      <DesignButton type="button" variant="secondary" className="mt-4" onClick={() => void list.refetch()}>
                        Try again
                      </DesignButton>
                    </td>
                  </tr>
                ) : visibleItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-[#3E5169]">
                      No entities match this filter. Clear the filter or add an entity to get started.
                    </td>
                  </tr>
                ) : (
                  visibleItems.map((entity, index) => {
                    const kind = normalizeKind(entity.entityType)
                    return (
                      <tr
                        key={entity.id}
                        onClick={() => navigate(`/entities/${entity.id}`)}
                        className={`cursor-pointer border-b border-[#DAE2EC] transition-colors last:border-0 hover:bg-[#E4ECF6] ${
                          index % 2 === 1 ? 'bg-[#F4F7FA]' : 'bg-white'
                        }`}
                      >
                        <td className="max-w-[26rem] px-3 py-2.5">
                          <p className="truncate font-medium text-[#17263A]">{entity.name}</p>
                          <p className="truncate text-xs text-[#5F7185]">
                            {entity.jurisdiction ?? 'Jurisdiction not on file'} · Formed {entity.formedOn ?? '—'} · EIN {entity.taxId || 'Pending'}
                          </p>
                        </td>
                        <td className="px-3 py-2.5">
                          <EntityKindBadge kind={kind} />
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-[#17263A] tabular-nums">
                          {formatCount(entity.ownerCount)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-[#17263A] tabular-nums">
                          {formatCount(entity.partnershipCount)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-[#17263A] tabular-nums">
                          {formatCount(entity.investmentCount)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {entity.holdingsValueUsd > 0 ? (
                            <span className="font-mono text-[#17263A] tabular-nums">
                              {formatCurrency(entity.holdingsValueUsd)}
                            </span>
                          ) : (
                            <span className="text-xs text-[#5F7185]">No holdings linked</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusChip status={entity.status} />
                        </td>
                        <td className="relative px-3 py-2.5 text-right">
                          <EntityActions
                            isAdmin={isAdmin}
                            onOpen={() => navigate(`/entities/${entity.id}`)}
                            onRemove={() => {
                              setDeleteTarget(entity)
                              setActionError(null)
                            }}
                          />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {!list.isLoading ? (
            <p className="px-3 py-2 text-xs text-[#5F7185]">
              {visibleItems.length} of {items.length} {items.length === 1 ? 'row' : 'rows'}
            </p>
          ) : null}
        </section>

        <AddEntityDialog
          open={addOpen}
          pending={create.isPending}
          apiError={createError}
          onClose={() => {
            setAddOpen(false)
            setCreateError(null)
          }}
          onCreate={handleCreate}
        />

        <RemoveEntityDialog
          entity={deleteTarget}
          pending={remove.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      </div>
    </AppShell>
  )
}
