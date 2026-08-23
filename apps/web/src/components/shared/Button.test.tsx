import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button, buttonClassName } from './Button'

describe('Button color contract', () => {
  it.each([
    ['primary', 'bg-primary', 'hover:bg-primary-hover', 'active:bg-primary-active'],
    ['secondary', 'bg-surface', 'hover:bg-primary-subtle', 'active:bg-primary-subtle-hover'],
    ['ghost', 'bg-transparent', 'hover:bg-primary-subtle', 'active:bg-primary-subtle-hover'],
    ['danger', 'bg-error', 'hover:bg-error-hover', 'active:bg-error-active'],
    ['inverse', 'bg-inverse-background', 'hover:bg-primary-subtle', 'active:bg-primary-subtle-hover'],
  ] as const)('provides complete %s states', (variant, base, hover, active) => {
    const recipe = buttonClassName({ variant })

    expect(recipe).toContain(base)
    expect(recipe).toContain(hover)
    expect(recipe).toContain(active)
    expect(recipe).toContain('focus-visible:ring-focus')
    expect(recipe).toContain('disabled:bg-disabled-background')
    expect(recipe).toContain('disabled:text-disabled-foreground')
  })

  it.each([
    ['sm', 'min-h-9'],
    ['md', 'min-h-11'],
    ['lg', 'min-h-12'],
    ['icon', 'min-h-11'],
  ] as const)('provides the %s size recipe', (size, className) => {
    expect(buttonClassName({ size })).toContain(className)
  })

  it('merges layout classes for button-like links without replacing semantic states', () => {
    const recipe = buttonClassName({ variant: 'inverse', className: 'w-full sm:w-auto' })

    expect(recipe).toContain('bg-inverse-background')
    expect(recipe).toContain('w-full sm:w-auto')
  })

  it('makes pending controls unavailable while preserving their accessible name', () => {
    render(<Button pending>Save changes</Button>)

    const button = screen.getByRole('button', { name: 'Save changes' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('data-pending', 'true')
  })
})
