import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ImportWorkbookDialog } from '../components/ImportWorkbookDialog'

const previewImport = vi.fn().mockResolvedValue({ importBatchId: '00000000-0000-0000-0000-000000000001', expiresAt: new Date(Date.now() + 60_000).toISOString(), workbookHash: 'abc', proposedPartnershipId: '00000000-0000-0000-0000-000000000002', warnings: ['Formula-only years are skipped by default.'], sheets: [{ sheetName: 'Basis', proposedPartnershipName: 'Basis', proposedPartnershipId: null, years: [{ taxYear: 2024, state: 'POPULATED', mappedFieldCount: 2, conflicts: [], warnings: [], values: [] }, { taxYear: 2025, state: 'FORMULA_ONLY', mappedFieldCount: 0, conflicts: [], warnings: [], values: [] }] }] })
const commitImport = vi.fn().mockResolvedValue({ importedTaxYears: [2024], skippedTaxYears: [2025] })
vi.mock('../hooks/useK1Tracker', () => ({ useK1TrackerActions: () => ({ previewImport: { mutateAsync: previewImport, isPending: false }, commitImport: { mutateAsync: commitImport, isPending: false } }) }))

describe('ImportWorkbookDialog', () => {
  it('shows a staged preview and skips formula-only years by default', async () => {
    const completed = vi.fn()
    render(<ImportWorkbookDialog partnershipId="00000000-0000-0000-0000-000000000002" onClose={vi.fn()} onCompleted={completed} />)
    fireEvent.change(screen.getByLabelText(/choose an .xlsx workbook/i), { target: { files: [new File(['xlsx'], 'basis.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] } })
    fireEvent.click(screen.getByRole('button', { name: /preview workbook/i }))
    await screen.findByText(/preview ready/i)
    expect(screen.getByText(/formula-only/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /commit selected years/i }))
    await waitFor(() => expect(commitImport).toHaveBeenCalledWith(expect.objectContaining({ decisions: [{ sheetName: 'Basis', taxYear: 2024, action: 'MERGE' }, { sheetName: 'Basis', taxYear: 2025, action: 'SKIP' }] })))
    expect(completed).toHaveBeenCalledWith('Imported 1 year(s); skipped 1.')
  })
})
