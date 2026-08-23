import { describe, expect, it } from 'vitest'
import {
  choiceControlClassName,
  fieldClassName,
  fileDropClassName,
  focusRingClassName,
  iconActionClassName,
  interactiveLinkClassName,
  inverseFocusRingClassName,
  navigationItemClassName,
  selectedSurfaceClassName,
} from './colorRecipes'

describe('shared non-button color recipes', () => {
  it('provides standard and inverse focus without suppressing forced colors', () => {
    expect(focusRingClassName).toContain('focus-visible:ring-focus')
    expect(focusRingClassName).toContain('forced-colors:focus-visible:outline')
    expect(inverseFocusRingClassName).toContain('focus-visible:ring-inverse-background')
  })

  it.each([
    ['field', fieldClassName, 'border-border-control', 'focus:border-focus'],
    ['choice', choiceControlClassName, 'accent-primary', 'focus-visible:ring-focus'],
    ['link', interactiveLinkClassName, 'text-primary', 'hover:text-primary-hover'],
    ['icon action', iconActionClassName, 'text-content-muted', 'hover:bg-primary-subtle'],
    ['selected surface', selectedSurfaceClassName, 'bg-primary-subtle', 'border-primary'],
    ['navigation item', navigationItemClassName, 'aria-[current=page]:bg-primary-subtle', 'aria-[current=page]:text-primary'],
    ['file drop', fileDropClassName, 'hover:border-primary', 'hover:bg-primary-subtle'],
  ])('provides the %s semantic recipe', (_name, recipe, required, state) => {
    expect(recipe).toContain(required)
    expect(recipe).toContain(state)
  })
})
