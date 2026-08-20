import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MagicPatternPartnershipRecordDialog } from '../components/magic-patterns/MagicPatternPartnershipRecordDialog'
import { summaryFixture } from './fixtures'

const mutations = vi.hoisted(() => ({
  createPartnership: vi.fn(),
  createCommitment: vi.fn(),
  updatePartnership: vi.fn(),
}))

const acBellPosition = {
  ...summaryFixture,
  partnership: {
    ...summaryFixture.partnership,
    id: 'ac-bell-owner-1',
    aggregationGroupId: 'ac-bell-fund',
    name: 'AC Bell Investors, LLC',
    partnershipType: 'Real Estate' as const,
    entity: { id: 'owner-1', name: 'Gardner Family Trust' },
  },
}

vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerList: () => ({
    data: { items: [acBellPosition], total: 1, nextCursor: null },
    isLoading: false,
    isError: false,
  }),
  usePartnershipTrackerActions: () => ({
    createPartnership: { mutateAsync: mutations.createPartnership, isPending: false },
    createCommitment: { mutateAsync: mutations.createCommitment, isPending: false },
    updatePartnership: { mutateAsync: mutations.updatePartnership, isPending: false },
  }),
}))

vi.mock('../../partnerships/hooks/useEntityQueries', () => ({
  useEntityList: () => ({
    data: {
      items: [
        { id: 'owner-1', name: 'Gardner Family Trust' },
        { id: 'owner-2', name: 'Gardner 2016 Descendant Trust' },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}))

describe('MagicPatternPartnershipRecordDialog', () => {
  beforeEach(() => {
    mutations.createPartnership.mockReset().mockResolvedValue({
      partnership: {
        ...acBellPosition,
        partnership: {
          ...acBellPosition.partnership,
          id: 'ac-bell-owner-2',
          entity: { id: 'owner-2', name: 'Gardner 2016 Descendant Trust' },
        },
      },
      nextAction: 'ADD_K1_YEAR',
    })
    mutations.createCommitment.mockReset().mockResolvedValue({})
    mutations.updatePartnership.mockReset()
  })

  it('adds a new owner and opening commitment to an existing fund aggregate', async () => {
    const onCreated = vi.fn()
    render(
      <MagicPatternPartnershipRecordDialog
        open
        mode="create"
        onClose={vi.fn()}
        onCreated={onCreated}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: /Existing fund, new owner/ }))
    fireEvent.change(screen.getByRole('combobox', { name: /Existing fund/ }), {
      target: { value: 'ac-bell-owner-1' },
    })

    const ownerSelect = screen.getByRole('combobox', { name: /Owning legal entity/ })
    expect(ownerSelect).not.toContainElement(screen.queryByRole('option', { name: 'Gardner Family Trust' }))
    fireEvent.change(ownerSelect, { target: { value: 'owner-2' } })
    fireEvent.change(screen.getByLabelText(/Committed capital/), { target: { value: '1,250,000' } })
    fireEvent.change(screen.getByLabelText(/Effective date/), { target: { value: '2026-08-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add owner record' }))

    await waitFor(() => expect(mutations.createPartnership).toHaveBeenCalledOnce())
    expect(mutations.createPartnership).toHaveBeenCalledWith({
      entityId: 'owner-2',
      existingPartnershipId: 'ac-bell-owner-1',
      name: 'AC Bell Investors, LLC',
      partnershipType: 'Real Estate',
    })
    expect(mutations.createCommitment).toHaveBeenCalledWith({
      id: 'ac-bell-owner-2',
      body: {
        amount: '1250000.00',
        effectiveDate: '2026-08-01',
        note: 'Subscription agreement',
      },
    })
    expect(onCreated).toHaveBeenCalledWith('ac-bell-owner-2')
  })
})
