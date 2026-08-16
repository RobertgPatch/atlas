import { AlertTriangle, ArrowUpRight, Download, Plus, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useEntityList } from '../../../partnerships/hooks/useEntityQueries'
import { PartnershipTrackerApiError } from '../../../partnership-tracker/api/partnershipTrackerClient'
import { usePartnershipTrackerDetail } from '../../../partnership-tracker/hooks/usePartnershipTracker'
import { MagicPatternCashActivityDrawer } from '../../../partnership-tracker/components/magic-patterns/MagicPatternOperationalDrawers'
import {
  MagicButton,
  MagicCard,
  MagicModal,
} from '../../../partnership-tracker/components/magic-patterns/MagicPatternPrimitives'
import { useInvestmentTrackerData } from '../../hooks/useInvestmentTrackerData'
import {
  buildFundOptions,
  buildInvestmentCsv,
  formatCompactCurrency,
  formatDate,
  formatMultiple,
  multipleOf,
  recordsFromAggregation,
  totalsOf,
  type InvestmentActivityRecord,
  type InvestmentGroupBy,
} from '../../investmentTrackerModel'
import { MagicPatternCapitalActivityTable } from './MagicPatternCapitalActivityTable'
import {
  FundOwnerFilter,
  InvestmentFilterChip,
  InvestmentSearch,
  InvestmentSelect,
} from './MagicPatternInvestmentControls'

const groupByOptions = [
  { value: 'fund', label: 'Fund', description: 'Owner entities roll up under each fund' },
  { value: 'assetClass', label: 'Asset class', description: 'Real estate, private equity, credit…' },
  { value: 'entity', label: 'Owner entity', description: 'Trusts, LLCs and individuals' },
  { value: 'none', label: 'No grouping', description: 'Every owner record as a flat list' },
]

function StatTile({
  label,
  value,
  helperText,
  change,
  loading,
}: {
  label: string
  value: string
  helperText: string
  change?: string
  loading: boolean
}) {
  return (
    <MagicCard className="min-h-32 border-[#dae2ec] p-4">
      <p className="text-sm text-[#3e5169]">{label}</p>
      {loading ? (
        <div className="mt-3 h-9 w-2/3 animate-pulse rounded bg-[#e8eef5] motion-reduce:animate-none" />
      ) : (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <span className="font-mono text-[2rem] font-medium leading-none tracking-tight text-[#17263a]">
            {value}
          </span>
          {change ? (
            <span className="mb-0.5 inline-flex items-center gap-1 rounded-full bg-[#d3f5dd] px-2 py-0.5 font-mono text-[0.68rem] font-medium text-[#166534]">
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              {change}
            </span>
          ) : null}
        </div>
      )}
      <p className="mt-3 text-xs text-[#5f7185]">{helperText}</p>
    </MagicCard>
  )
}

function downloadCsv(records: InvestmentActivityRecord[], asOfDate: string) {
  const blob = new Blob([buildInvestmentCsv(records)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `investment-tracker-${asOfDate || 'export'}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

function RecordActivityFlow({
  records,
  selectedId,
  pickerOpen,
  drawerOpen,
  onSelectedIdChange,
  onPickerClose,
  onDrawerOpen,
  onDrawerClose,
}: {
  records: InvestmentActivityRecord[]
  selectedId: string | undefined
  pickerOpen: boolean
  drawerOpen: boolean
  onSelectedIdChange: (id: string) => void
  onPickerClose: () => void
  onDrawerOpen: () => void
  onDrawerClose: () => void
}) {
  const detail = usePartnershipTrackerDetail(selectedId)
  const selectedRecord = records.find((record) => record.id === selectedId)

  return (
    <>
      <MagicModal
        open={pickerOpen}
        onClose={onPickerClose}
        size="md"
        title="Choose an owner record"
        description="Capital activity is recorded against one fund and owning entity."
        footer={
          <>
            <MagicButton type="button" variant="secondary" onClick={onPickerClose}>
              Cancel
            </MagicButton>
            <MagicButton
              type="button"
              disabled={!selectedId || detail.isLoading || detail.isError}
              onClick={onDrawerOpen}
            >
              {detail.isLoading ? 'Loading…' : 'Continue'}
            </MagicButton>
          </>
        }
      >
        <label className="block text-sm font-medium text-slate-800">
          Fund and owner entity
          <select
            value={selectedId ?? ''}
            onChange={(event) => onSelectedIdChange(event.target.value)}
            className="mt-1 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#166534] focus:ring-2 focus:ring-[#166534]/15"
          >
            {records.map((record) => (
              <option key={record.id} value={record.id}>
                {record.fundName} — {record.ownerName}
              </option>
            ))}
          </select>
        </label>
        {detail.isError ? (
          <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            This partnership record could not be loaded. Choose another owner record or try again.
          </p>
        ) : null}
      </MagicModal>

      {drawerOpen && detail.data && selectedRecord ? (
        <MagicPatternCashActivityDrawer
          open
          onClose={onDrawerClose}
          partnershipId={selectedRecord.id}
          fundName={`${selectedRecord.fundName} · ${selectedRecord.ownerName}`}
          existingYears={detail.data.years.map((year) => year.taxYear)}
        />
      ) : null}
    </>
  )
}

export function MagicPatternInvestmentTrackerPageContent({ canEdit }: { canEdit: boolean }) {
  const investmentData = useInvestmentTrackerData()
  const entities = useEntityList()
  const [groupBy, setGroupBy] = useState<InvestmentGroupBy>('fund')
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([])
  const [assetClass, setAssetClass] = useState('all')
  const [query, setQuery] = useState('')
  const [recordPickerOpen, setRecordPickerOpen] = useState(false)
  const [selectedActivityId, setSelectedActivityId] = useState<string>()
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false)

  const entityTypes = useMemo(
    () => new Map(entities.data?.items.map((entity) => [entity.id, entity.entityType]) ?? []),
    [entities.data?.items],
  )
  const allRecords = useMemo(
    () => investmentData.data ? recordsFromAggregation(investmentData.data, entityTypes) : [],
    [entityTypes, investmentData.data],
  )
  const funds = useMemo(() => buildFundOptions(allRecords), [allRecords])
  const assetClassOptions = useMemo(
    () => [
      { value: 'all', label: 'All asset classes' },
      ...[...new Set(allRecords.map((record) => record.assetClass))]
        .sort()
        .map((value) => ({ value, label: value })),
    ],
    [allRecords],
  )
  const filteredRecords = useMemo(() => {
    const selected = new Set(selectedRecordIds)
    const needle = query.trim().toLocaleLowerCase()
    return allRecords.filter((record) => {
      if (selected.size && !selected.has(record.id)) return false
      if (assetClass !== 'all' && record.assetClass !== assetClass) return false
      if (!needle) return true
      return [
        record.fundName,
        record.sponsor,
        record.ownerName,
        record.ownerType,
        record.assetClass,
        record.status,
      ].some((value) => value?.toLocaleLowerCase().includes(needle))
    })
  }, [allRecords, assetClass, query, selectedRecordIds])

  const totals = useMemo(() => totalsOf(filteredRecords), [filteredRecords])
  const netMultiple = multipleOf(totals)
  const asOfDate = investmentData.data?.rollup.asOfDate ?? ''
  const selectedFunds = useMemo(
    () => funds.filter((fund) => fund.owners.some((owner) => selectedRecordIds.includes(owner.recordId))),
    [funds, selectedRecordIds],
  )
  const hasFilters = selectedRecordIds.length > 0 || assetClass !== 'all' || query.trim().length > 0

  const clearFund = (fundId: string) => {
    const fund = funds.find((candidate) => candidate.id === fundId)
    if (!fund) return
    const ids = new Set(fund.owners.map((owner) => owner.recordId))
    setSelectedRecordIds((current) => current.filter((id) => !ids.has(id)))
  }
  const clearAllFilters = () => {
    setSelectedRecordIds([])
    setAssetClass('all')
    setQuery('')
  }
  const openRecordPicker = () => {
    const firstId = filteredRecords[0]?.id ?? allRecords[0]?.id
    if (!firstId) return
    setSelectedActivityId((current) => current && allRecords.some((record) => record.id === current) ? current : firstId)
    setRecordPickerOpen(true)
  }

  return (
    <div
      className="-m-4 min-h-[calc(100vh-4rem)] bg-[#e7edf4] p-4 pb-10 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8"
      data-design-variant="magic-patterns-investment-tracker"
    >
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-[#bfcbd9] pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#17263a]">Investment tracker</h1>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-[#3e5169]">
            Capital activity across every partnership, rolled up by fund with each owner entity underneath.
            {' '}Lifetime figures in USD{asOfDate ? ` as of ${formatDate(asOfDate)}` : ''}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MagicButton
            type="button"
            variant="secondary"
            disabled={!allRecords.length}
            onClick={() => downloadCsv(filteredRecords, asOfDate)}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </MagicButton>
          <MagicButton
            type="button"
            disabled={!canEdit || !allRecords.length}
            title={!canEdit ? 'Only administrators can record capital activity.' : undefined}
            onClick={openRecordPicker}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Record activity
          </MagicButton>
        </div>
      </header>

      {investmentData.isError ? (
        <MagicCard className="mt-6 border-red-200 bg-red-50 p-6">
          <div className="flex gap-3 text-red-900">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="font-semibold">The investment tracker could not be loaded</h2>
              <p className="mt-1 text-sm">
                {investmentData.error instanceof PartnershipTrackerApiError && investmentData.error.code === 'DATABASE_UNAVAILABLE'
                  ? 'The tracker needs the configured database connection before investment activity can load.'
                  : 'There was a problem loading partnership capital activity.'}
              </p>
            </div>
          </div>
          <MagicButton type="button" variant="secondary" className="mt-4" onClick={() => void investmentData.refetch()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </MagicButton>
        </MagicCard>
      ) : (
        <>
          <section aria-label="Investment totals" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Total invested"
              value={formatCompactCurrency(totals.invested)}
              helperText={`of ${formatCompactCurrency(totals.commitment)} committed`}
              loading={investmentData.isLoading}
            />
            <StatTile
              label="Current value"
              value={formatCompactCurrency(totals.currentValue)}
              helperText={asOfDate ? `Reported NAV as of ${formatDate(asOfDate)}` : 'Reported NAV'}
              loading={investmentData.isLoading}
            />
            <StatTile
              label="Distributions"
              value={formatCompactCurrency(totals.distributions)}
              change={netMultiple == null ? undefined : formatMultiple(netMultiple)}
              helperText="Lifetime, net multiple on invested capital"
              loading={investmentData.isLoading}
            />
            <StatTile
              label="Unfunded commitment"
              value={formatCompactCurrency(totals.unfunded)}
              helperText="Callable across open funds"
              loading={investmentData.isLoading}
            />
          </section>

          <section aria-label="Filters" className="mt-6 rounded-lg border border-[#dae2ec] bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InvestmentSelect
                label="Group rows by"
                options={groupByOptions}
                value={groupBy}
                onChange={(value) => setGroupBy(value as InvestmentGroupBy)}
              />
              <FundOwnerFilter
                funds={funds}
                selectedRecordIds={selectedRecordIds}
                onChange={setSelectedRecordIds}
              />
              <InvestmentSelect
                label="Asset class"
                options={assetClassOptions}
                value={assetClass}
                onChange={setAssetClass}
              />
              <InvestmentSearch value={query} onChange={setQuery} />
            </div>

            {hasFilters ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#dae2ec] pt-3">
                {selectedFunds.map((fund) => {
                  const selectedCount = fund.owners.filter((owner) => selectedRecordIds.includes(owner.recordId)).length
                  return (
                    <InvestmentFilterChip key={fund.id} label="Fund" onRemove={() => clearFund(fund.id)}>
                      {selectedCount === fund.owners.length
                        ? fund.name
                        : `${fund.name} (${selectedCount}/${fund.owners.length})`}
                    </InvestmentFilterChip>
                  )
                })}
                {assetClass !== 'all' ? (
                  <InvestmentFilterChip label="Asset class" onRemove={() => setAssetClass('all')}>
                    {assetClass}
                  </InvestmentFilterChip>
                ) : null}
                {query.trim() ? (
                  <InvestmentFilterChip label="Search" onRemove={() => setQuery('')}>
                    {query.trim()}
                  </InvestmentFilterChip>
                ) : null}
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="rounded px-2 py-1 text-xs font-semibold text-[#3e5169] hover:bg-[#e8eef5] hover:text-[#17263a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
                >
                  Clear all filters
                </button>
              </div>
            ) : null}
          </section>

          <div className="mt-6">
            <MagicPatternCapitalActivityTable
              records={filteredRecords}
              groupBy={groupBy}
              loading={investmentData.isLoading}
              asOfDate={asOfDate}
            />
          </div>
        </>
      )}

      <RecordActivityFlow
        records={allRecords}
        selectedId={selectedActivityId}
        pickerOpen={recordPickerOpen}
        drawerOpen={activityDrawerOpen}
        onSelectedIdChange={setSelectedActivityId}
        onPickerClose={() => setRecordPickerOpen(false)}
        onDrawerOpen={() => {
          setRecordPickerOpen(false)
          setActivityDrawerOpen(true)
        }}
        onDrawerClose={() => setActivityDrawerOpen(false)}
      />
    </div>
  )
}
