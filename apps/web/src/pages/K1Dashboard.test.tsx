import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { K1Dashboard } from './K1Dashboard'
import { useK1Batch, useK1Documents, useK1Kpis } from '../features/k1/hooks/useK1Queries'

vi.mock('../auth/sessionStore', () => ({ useSession: () => ({ session: { role: 'Admin', user: {} } }), sessionStore: {} }))
vi.mock('../components/shared/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../features/k1/components/K1UploadDialog', () => ({
  K1UploadDialog: ({ open, onBatchCreated, onClose }: { open: boolean; onBatchCreated: (batch: { id: string }) => void; onClose: () => void }) => open ? (
    <div role="dialog">Upload form<button onClick={() => { onBatchCreated({ id: 'new-batch' }); onClose() }}>Start upload</button></div>
  ) : null,
}))
vi.mock('../features/k1/components/K1BatchQueue', () => ({ K1BatchQueue: ({ partnershipIds }: { partnershipIds?: string[] }) => <output aria-label="Queue partnerships">{partnershipIds?.join(',') ?? 'all'}</output> }))
vi.mock('../features/k1/hooks/useK1Queries', () => ({
  useK1Lookups: () => ({ data: { entities: [] } }), useK1Reparse: () => ({}), useK1Batch: vi.fn(() => ({})),
  useK1Documents: vi.fn(() => ({ data: { pages: [{ items: [] }] } })),
  useK1Kpis: vi.fn(() => ({})),
}))
vi.mock('../features/investment-tracker/hooks/useInvestmentTrackerData', () => ({ useInvestmentTrackerData: () => ({ data: { items: [{ members: [
  { partnership: { id: 'alpha', name: 'Alpha Fund', entity: { id: 'owner-a', name: 'First Trust' } } },
  { partnership: { id: 'beta', name: 'Beta Fund', entity: { id: 'owner-b', name: 'Second Trust' } } },
] }] } }) }))

describe('K1 Management', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(useK1Batch).mockReset()
    vi.mocked(useK1Batch).mockReturnValue({} as ReturnType<typeof useK1Batch>)
  })

  it.each(['PROCESSING', 'FAILED'] as const)('keeps a new %s upload visible before partnership matching', async (itemStatus) => {
    const user = userEvent.setup()
    vi.mocked(useK1Batch).mockImplementation((batchId) => ({
      data: batchId ? {
        id: batchId,
        status: itemStatus === 'FAILED' ? 'PARTIAL_FAILURE' : 'PROCESSING',
        counts: { total: 1, active: itemStatus === 'PROCESSING' ? 1 : 0, actionRequired: 0, failed: itemStatus === 'FAILED' ? 1 : 0, applied: 0 },
        items: [{ id: 'new-item', fileName: 'new-upload.pdf', status: itemStatus, partnershipId: null, k1DocumentId: null }],
      } : undefined,
    }) as ReturnType<typeof useK1Batch>)
    render(<MemoryRouter initialEntries={['/k1?partnerships=alpha']}><K1Dashboard /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Upload K-1' }))
    await user.click(screen.getByRole('button', { name: 'Start upload' }))

    const activeBatch = screen.getByRole('region', { name: 'Active K-1 upload batch' })
    expect(within(activeBatch).getByText('new-upload.pdf')).toBeInTheDocument()
    expect(within(activeBatch).getAllByText(itemStatus).length).toBeGreaterThan(0)
    expect(screen.getByRole('status', { name: 'Queue partnerships' })).toHaveTextContent('alpha')
    await user.click(within(activeBatch).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('region', { name: 'Active K-1 upload batch' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem('k1.activeBatchId')).toBeNull()
  })

  it('starts with all years and partnerships, then filters documents, counts, queue, and history together', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><K1Dashboard /></MemoryRouter>)
    expect(useK1Documents).toHaveBeenLastCalledWith(expect.objectContaining({ taxYear: undefined, partnershipIds: undefined }))
    expect(screen.getByRole('combobox', { name: 'Tax year' })).toHaveValue('0')
    await user.click(screen.getByRole('button', { name: 'Partnership filter: All partnerships' }))
    await user.click(screen.getByRole('checkbox', { name: /Alpha Fund First Trust/ }))
    expect(useK1Documents).toHaveBeenLastCalledWith(expect.objectContaining({ partnershipIds: ['alpha'] }))
    expect(useK1Kpis).toHaveBeenLastCalledWith(expect.objectContaining({ partnershipIds: ['alpha'] }))
    expect(screen.getByRole('status', { name: 'Queue partnerships' })).toHaveTextContent('alpha')
    const history = screen.getByRole('region', { name: 'Partnership K-1 history' })
    expect(within(history).queryByText('Beta Fund')).not.toBeInTheDocument()
    expect(within(history).getByRole('link')).toHaveAttribute('href', '/k1?partnerships=alpha&partnership=alpha')
    await user.click(screen.getByRole('checkbox', { name: /Beta Fund Second Trust/ }))
    expect(useK1Kpis).toHaveBeenLastCalledWith(expect.objectContaining({ partnershipIds: ['alpha', 'beta'] }))
    await user.click(screen.getByRole('button', { name: 'All partnerships' }))
    expect(useK1Documents).toHaveBeenLastCalledWith(expect.objectContaining({ partnershipIds: undefined }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Upload K-1' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Upload form')
  })
})
