import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CurrencyInput, currencyInputValue, formatCurrencyValue } from './CurrencyInput'

describe('review currency display', () => {
  it.each([
    ['255786.00', '255,786.00'], ['-255786.00', '-255,786.00'],
    ['(255,786)', '-255,786.00'], ['0.00', '0.00'], [null, ''],
    ['9007199254740993.27', '9,007,199,254,740,993.27'],
  ])('formats %s without changing its sign or precision', (value, display) => {
    expect(formatCurrencyValue(value)).toBe(display)
  })

  it('strips pasted currency separators and accounting parentheses for saving', () => {
    expect(currencyInputValue('$ (255,786.00)')).toBe('-255786.00')
    expect(currencyInputValue('255,786.00')).toBe('255786.00')
    expect(currencyInputValue('')).toBeNull()
    expect(formatCurrencyValue('STMT')).toBe('STMT')
  })

  it('preserves editing text and emits unformatted values, then groups on blur', async () => {
    const changed = vi.fn()
    const Harness = () => {
      const [value, setValue] = useState<string | null>('255786.00')
      return <CurrencyInput aria-label="Withdrawals" value={value} onValueChange={next => {
        changed(next); setValue(next)
      }} />
    }
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('textbox', { name: 'Withdrawals' })
    expect(input).toHaveValue('255,786.00')
    await user.click(input)
    await user.tab()
    expect(changed).not.toHaveBeenCalled()
    await user.clear(input)
    await user.type(input, '-255786.00')
    expect(input).toHaveValue('-255786.00')
    expect(changed).toHaveBeenLastCalledWith('-255786.00')
    await user.tab()
    expect(input).toHaveValue('-255,786.00')
    expect(changed.mock.calls.every(([value]) => value == null || !value.includes(','))).toBe(true)
  })
})
