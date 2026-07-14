import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CurrencyInput } from './CurrencyField'
import { formatCurrency, normalizeCurrencyInput } from './currencyInput'

describe('currencyInput', () => {
  it.each([
    ['1000', true, '1000.00'],
    ['1,000', true, '1000.00'],
    ['$1,000.5', true, '1000.50'],
    ['(1,000)', true, '-1000.00'],
    ['-1000', true, '-1000.00'],
    ['', true, null],
  ])('normalizes %s', (value, allowNegative, expected) => {
    expect(normalizeCurrencyInput(value, allowNegative).value).toBe(expected)
  })

  it('rejects malformed grouping, excessive precision, and negative nonnegative values', () => {
    expect(normalizeCurrencyInput('1,00', true).error).toBeTruthy()
    expect(normalizeCurrencyInput('10.001', true).error).toBeTruthy()
    expect(normalizeCurrencyInput('(10)', false).error).toBe('This amount cannot be negative.')
  })

  it('formats valid values on blur and exposes inline errors', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<CurrencyInput aria-label="Amount" value="1000" onChange={onChange} />)
    await user.click(screen.getByLabelText('Amount'))
    await user.tab()
    expect(onChange).toHaveBeenCalledWith('$1,000.00')
    rerender(<CurrencyInput aria-label="Amount" value="1,00" onChange={onChange} />)
    await user.click(screen.getByLabelText('Amount'))
    await user.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('valid comma grouping')
    expect(formatCurrency('-1000.50')).toBe('-$1,000.50')
  })
})
