import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { K1UploadDialog } from './K1UploadDialog'

const mutateAsync = vi.fn()

vi.mock('../hooks/useK1Queries', () => ({
  useK1Lookups: () => ({
    isLoading: false,
    data: { entities: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Family Trust' }] },
  }),
  useK1BatchUpload: () => ({ mutateAsync, isPending: false }),
}))

const renderDialog = (overrides: Partial<React.ComponentProps<typeof K1UploadDialog>> = {}) => {
  const props = {
    open: true,
    onClose: vi.fn(),
    onUploaded: vi.fn(),
    ...overrides,
  }
  render(<MemoryRouter><K1UploadDialog {...props} /></MemoryRouter>)
  return props
}

const pdf = (name: string, size = 32) =>
  new File([new Uint8Array(size)], name, { type: 'application/pdf' })

describe('K1UploadDialog batch upload', () => {
  beforeEach(() => mutateAsync.mockReset())

  it('accepts multiple PDFs in one selection and exposes accessible removal controls', async () => {
    renderDialog()
    const input = screen.getByLabelText('PDF files') as HTMLInputElement
    expect(input.multiple).toBe(true)
    fireEvent.change(input, { target: { files: [pdf('alpha.pdf'), pdf('beta.pdf')] } })

    expect(screen.getByText('alpha.pdf')).toBeTruthy()
    expect(screen.getByText('beta.pdf')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove alpha.pdf' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Remove alpha.pdf' }))
    expect(screen.queryByText('alpha.pdf')).toBeNull()
    expect(screen.getByText('beta.pdf')).toBeTruthy()
  })

  it('validates PDF type, per-file size, and the 25-file batch limit before upload', () => {
    renderDialog()
    const input = screen.getByLabelText('PDF files')
    const wrongType = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [wrongType] } })
    expect(screen.getByText(/notes\.txt must be a PDF/i)).toBeTruthy()

    const tooMany = Array.from({ length: 26 }, (_, index) => pdf(`k1-${index}.pdf`))
    fireEvent.change(input, { target: { files: tooMany } })
    expect(screen.getByText(/up to 25 PDFs/i)).toBeTruthy()
  })

  it('shows per-file progress, preserves partial failures, and retries only failed files', async () => {
    const onUploaded = vi.fn()
    mutateAsync
      .mockImplementationOnce(async ({ onProgress }: { onProgress: (name: string, progress: number) => void }) => {
        onProgress('alpha.pdf', 45)
        onProgress('alpha.pdf', 100)
        onProgress('beta.pdf', 100)
        return {
          id: 'batch-1',
          status: 'PARTIAL_FAILURE',
          items: [
            { id: 'item-1', fileName: 'alpha.pdf', status: 'QUEUED', error: null },
            { id: 'item-2', fileName: 'beta.pdf', status: 'FAILED', error: { code: 'PDF_INVALID', message: 'PDF is invalid.', retryable: true } },
          ],
        }
      })
      .mockResolvedValueOnce({
        id: 'batch-2',
        status: 'PROCESSING',
        items: [{ id: 'item-3', fileName: 'beta.pdf', status: 'QUEUED', error: null }],
      })

    renderDialog({ onUploaded })
    await userEvent.selectOptions(screen.getByLabelText('Entity'), '11111111-1111-4111-8111-111111111111')
    fireEvent.change(screen.getByLabelText('PDF files'), {
      target: { files: [pdf('alpha.pdf'), pdf('beta.pdf')] },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Upload 2 files' }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    const failedRow = screen.getByTestId('upload-file-beta.pdf')
    expect(within(failedRow).getByText('PDF is invalid.')).toBeTruthy()
    expect(within(screen.getByTestId('upload-file-alpha.pdf')).getByText('Queued')).toBeTruthy()
    expect(onUploaded).toHaveBeenCalledOnce()

    await userEvent.click(within(failedRow).getByRole('button', { name: 'Retry beta.pdf' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2))
    expect(mutateAsync.mock.calls[1]?.[0].files).toEqual([expect.objectContaining({ name: 'beta.pdf' })])
  })

  it('supports drag-and-drop and explains duplicate content without replacing the accepted file', async () => {
    mutateAsync.mockResolvedValue({
      id: 'batch-1',
      status: 'PARTIAL_FAILURE',
      items: [{
        id: 'item-1',
        fileName: 'duplicate.pdf',
        status: 'FAILED',
        error: {
          code: 'DUPLICATE_K1_CONTENT',
          message: 'This exact PDF was already uploaded.',
          retryable: false,
        },
      }],
    })
    renderDialog()
    await userEvent.selectOptions(screen.getByLabelText('Entity'), '11111111-1111-4111-8111-111111111111')
    fireEvent.drop(screen.getByTestId('k1-drop-zone'), {
      dataTransfer: { files: [pdf('duplicate.pdf')] },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Upload 1 file' }))
    expect(await screen.findByText('This exact PDF was already uploaded.')).toBeTruthy()
    expect(screen.queryByText(/replace/i)).toBeNull()
  })

  it('locks uploads to the partnership owner when opened from a partnership workspace', async () => {
    mutateAsync.mockResolvedValue({
      id: 'batch-scoped',
      status: 'PROCESSING',
      items: [{ id: 'item-scoped', fileName: 'redwood-2025.pdf', status: 'QUEUED', error: null }],
    })
    renderDialog({ entityScope: { id: 'entity-redwood', name: 'Jackson Family Trust' } })

    expect(screen.queryByLabelText('Entity')).toBeNull()
    expect(screen.getByText('Jackson Family Trust')).toBeTruthy()
    expect(screen.getByText(/Documents are matched to a partnership and tax year/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('PDF files'), { target: { files: [pdf('redwood-2025.pdf')] } })
    await userEvent.click(screen.getByRole('button', { name: 'Upload 1 file' }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      entityScopeId: 'entity-redwood',
      files: [expect.objectContaining({ name: 'redwood-2025.pdf' })],
    })))
  })
})
