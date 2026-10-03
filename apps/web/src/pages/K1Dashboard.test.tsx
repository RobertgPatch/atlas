import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { K1Dashboard } from './K1Dashboard'
import { useK1Documents, useK1Kpis } from '../features/k1/hooks/useK1Queries'

vi.mock('../auth/sessionStore', () => ({ useSession: () => ({ session: { role: 'Admin', user: {} } }), sessionStore: {} }))
vi.mock('../components/shared/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../features/k1/components/K1UploadDialog', () => ({ K1UploadDialog: ({ open }: { open: boolean }) => open ? <div role="dialog">Upload form</div> : null }))
vi.mock('../features/k1/components/K1BatchQueue', () => ({ K1BatchQueue: ({ partnershipIds }: { partnershipIds?: string[] }) => <output aria-label="Queue partnerships">{partnershipIds?.join(',') ?? 'all'}</output> }))
vi.mock('../features/k1/hooks/useK1Queries', () => ({
  useK1Lookups: () => ({ data: { entities: [] } }), useK1Reparse: () => ({}), useK1Batch: () => ({}),
  useK1Documents: vi.fn(() => ({ data: { pages: [{ items: [] }] } })),
  useK1Kpis: vi.fn(() => ({})),
}))
vi.mock('../features/investment-tracker/hooks/useInvestmentTrackerData', () => ({ useInvestmentTrackerData: () => ({ data: { items: [{ members: [
  { partnership: { id: 'alpha', name: 'Alpha Fund', entity: { id: 'owner-a', name: 'First Trust' } } },
  { partnership: { id: 'beta', name: 'Beta Fund', entity: { id: 'owner-b', name: 'Second Trust' } } },
] }] } }) }))

describe('K1 Management', () => {
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
