import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authenticatedFetch } from '../../../auth/authenticatedFetch'
import { PdfPanel } from './PdfPanel'

vi.mock('../../../auth/authenticatedFetch', () => ({ authenticatedFetch: vi.fn() }))

describe('PdfPanel source recovery', () => {
  beforeEach(() => vi.mocked(authenticatedFetch).mockReset())

  it('does not ask for reattachment when storage authentication or availability fails', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
    render(<PdfPanel pdfUrl="/v1/k1-documents/k1-1/pdf" reattachUrl="/v1/k1-documents/k1-1/source-pdf" highlight={null} />)
    expect(await screen.findByText(/storage is temporarily unavailable/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reattach original PDF/i })).not.toBeInTheDocument()
  })

  it('offers exact-source reattachment and reloads the preview after recovery', async () => {
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'REATTACHED' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }))

    render(<PdfPanel
      pdfUrl="/v1/k1-documents/k1-1/pdf"
      reattachUrl="/v1/k1-documents/k1-1/source-pdf"
      highlight={null}
    />)

    expect(await screen.findByRole('heading', { name: 'PDF unavailable' })).toBeInTheDocument()
    const file = new File(['%PDF-1.4\noriginal'], 'original.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Select original source PDF'), {
      target: { files: [file] },
    })

    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledWith(
      '/v1/k1-documents/k1-1/source-pdf',
      expect.objectContaining({ method: 'PUT', body: expect.any(FormData) }),
    ))
    expect(await screen.findByTestId('pdf-iframe')).toBeInTheDocument()
  })

  it('explains when the selected file is not the original', async () => {
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'SOURCE_PDF_CHECKSUM_MISMATCH' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }))

    render(<PdfPanel
      pdfUrl="/v1/k1-documents/k1-1/pdf"
      reattachUrl="/v1/k1-documents/k1-1/source-pdf"
      highlight={null}
    />)
    fireEvent.change(await screen.findByLabelText('Select original source PDF'), {
      target: { files: [new File(['%PDF-other'], 'other.pdf', { type: 'application/pdf' })] },
    })

    expect(await screen.findByText(/not the original PDF/i)).toBeInTheDocument()
  })
})
