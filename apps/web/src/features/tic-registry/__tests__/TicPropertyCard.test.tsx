import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ticRegistryFixture } from './ticRegistryFixtures'
import { TicPropertyCard } from '../components/TicPropertyCard'

describe('TicPropertyCard', () => {
  const property = ticRegistryFixture.properties[0]

  it('renders property, interest, owner, and effective property percentage', () => {
    render(
      <TicPropertyCard
        property={property}
        canEdit={true}
        onEditProperty={vi.fn()}
        onDeleteProperty={vi.fn()}
        onAddInterest={vi.fn()}
        onEditInterest={vi.fn()}
        onDeleteInterest={vi.fn()}
        onAddOwner={vi.fn()}
        onEditOwner={vi.fn()}
        onDeleteOwner={vi.fn()}
      />,
    )

    expect(screen.getByText('Harbor View TIC')).toBeInTheDocument()
    expect(screen.getByText('HV-101')).toBeInTheDocument()
    expect(screen.getByText('Oakland, CA')).toBeInTheDocument()
    expect(screen.getByText('24 units')).toBeInTheDocument()
    expect(screen.getByText('acquisition $1,250,000')).toBeInTheDocument()
    expect(screen.getAllByText('Harbor View TIC A')).toHaveLength(2)
    expect(screen.getByText('Atlas Family Trust')).toBeInTheDocument()
    expect(screen.getByText('20%')).toBeInTheDocument()
    expect(screen.getByTitle('Edit property')).toBeInTheDocument()
  })

  it('hides mutation actions for read-only users', () => {
    render(
      <TicPropertyCard
        property={property}
        canEdit={false}
        onEditProperty={vi.fn()}
        onDeleteProperty={vi.fn()}
        onAddInterest={vi.fn()}
        onEditInterest={vi.fn()}
        onDeleteInterest={vi.fn()}
        onAddOwner={vi.fn()}
        onEditOwner={vi.fn()}
        onDeleteOwner={vi.fn()}
      />,
    )

    expect(screen.queryByTitle('Edit property')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Add TIC interest')).not.toBeInTheDocument()
  })
})
