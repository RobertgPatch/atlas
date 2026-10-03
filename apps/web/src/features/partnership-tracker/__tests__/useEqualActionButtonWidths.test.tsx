import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from '../../../components/shared/Button'
import { useEqualActionButtonWidths } from '../hooks/useEqualActionButtonWidths'

function Page({ widest = 160, extra = false }: { widest?: number; extra?: boolean }) {
  const ref = useEqualActionButtonWidths()
  return <div ref={ref}>
    <Button data-natural-width="72">Edit</Button>
    <Button data-natural-width={widest}>Record activity</Button>
    {extra ? <Button data-natural-width="190">Add relationship</Button> : null}
    <button data-natural-width="32" aria-label="Remove"><svg /></button>
    <button data-natural-width="90">Capital Activity</button>
    <div role="dialog"><Button data-natural-width="240">Save changes</Button></div>
  </div>
}

describe('Individual partnership action widths', () => {
  beforeEach(() => {
    // jsdom has no layout; simulate the natural width and the applied width.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return new DOMRect(0, 0, Number.parseFloat(this.style.width || this.dataset.naturalWidth || '0'), 36)
    })
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
      return [this.getBoundingClientRect()] as unknown as DOMRectList
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('matches the largest existing action without enlarging it or altering compact controls and dialogs', () => {
    render(<Page />)
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveStyle({ width: '160px', minWidth: '160px' })
    expect(screen.getByRole('button', { name: 'Record activity' }).getBoundingClientRect().width).toBe(160)
    expect(screen.getByRole('button', { name: 'Remove' }).style.width).toBe('')
    expect(screen.getByRole('button', { name: 'Capital Activity' }).style.width).toBe('')
    expect(screen.getByRole('button', { name: 'Save changes' }).style.width).toBe('')
  })

  it('recalculates from original widths when actions appear, disappear, or the viewport changes', async () => {
    const { rerender } = render(<Page />)
    rerender(<Page extra />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toHaveStyle({ width: '190px' }))
    rerender(<Page widest={150} />)
    window.dispatchEvent(new Event('resize'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Record activity' })).toHaveStyle({ width: '150px' }))
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveStyle({ width: '150px' })
  })
})
