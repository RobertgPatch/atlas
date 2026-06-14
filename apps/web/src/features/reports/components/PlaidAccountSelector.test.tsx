import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlaidAccountSelector } from './PlaidAccountSelector'
import { consolidatedHoldingsFixture } from '../fixtures/consolidatedHoldingsFixture'

describe('PlaidAccountSelector', () => {
  it('toggles account selection and confirms selected ids', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <PlaidAccountSelector
        isOpen
        accounts={consolidatedHoldingsFixture.selectedAccounts}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        onConnect={vi.fn()}
      />,
    )

    expect(screen.getByText('2 of 2 accounts selected')).toBeInTheDocument()

    await user.click(screen.getByText('Taxable'))
    await user.click(screen.getByRole('button', { name: /apply selection/i }))

    expect(onConfirm).toHaveBeenCalledWith([
      '22222222-2222-4222-8222-222222222222',
    ])
  })
})
