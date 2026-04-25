import React, { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XIcon } from 'lucide-react'
import { ErrorState } from '../../../components/ErrorState'
import { useAssetDetail, useAssetFmvHistory } from '../hooks/useAssetQueries'
import { AssetValuationHistory } from './AssetValuationHistory'

interface AssetDetailDrawerProps {
  open: boolean
  onClose: () => void
  partnershipId: string
  assetId: string | null
  isAdmin: boolean
  onRecordFmv: () => void
}

export function AssetDetailDrawer({ open, onClose, partnershipId, assetId, isAdmin, onRecordFmv }: AssetDetailDrawerProps) {
  const detailQuery = useAssetDetail(partnershipId, assetId)
  const historyQuery = useAssetFmvHistory(partnershipId, assetId, open)
  const detail = detailQuery.data

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/30" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child as={Fragment} enter="transform transition ease-in-out duration-300" enterFrom="translate-x-full" enterTo="translate-x-0" leave="transform transition ease-in-out duration-300" leaveFrom="translate-x-0" leaveTo="translate-x-full">
                <Dialog.Panel className="pointer-events-auto w-screen max-w-2xl bg-white shadow-xl">
                  <div className="flex h-full flex-col">
                    <div className="flex items-start justify-between border-b border-border px-6 py-5">
                      <div>
                        <Dialog.Title className="text-lg font-semibold text-text-primary">
                          {detail?.asset.name ?? 'Asset Detail'}
                        </Dialog.Title>
                        <p className="mt-1 text-sm text-text-secondary">
                          Review asset metadata, latest FMV, and append-only valuation history without leaving Partnership Detail.
                        </p>
                      </div>
                      <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
                        <XIcon className="h-5 w-5 text-text-secondary" />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-5">
                      {detailQuery.isLoading ? (
                        <div className="rounded-xl border border-border bg-gray-50 px-4 py-6 text-sm text-text-secondary">Loading asset details…</div>
                      ) : detailQuery.isError || !detail ? (
                        <ErrorState
                          title="Could not load asset detail"
                          message="The rest of the partnership page is still available. Retry just this asset detail request."
                          onRetry={() => void detailQuery.refetch()}
                        />
                      ) : (
                        <>
                          <div className="grid gap-4 rounded-xl border border-border bg-gray-50/60 p-4 sm:grid-cols-2">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-text-tertiary">Asset Type</p>
                              <p className="mt-1 text-sm font-medium text-text-primary">{detail.asset.assetType}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-text-tertiary">Source</p>
                              <p className="mt-1 text-sm font-medium capitalize text-text-primary">{detail.asset.sourceType}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-text-tertiary">Latest FMV</p>
                              <p className="mt-1 text-sm font-medium text-text-primary tabular-nums">
                                {detail.latestFmv ? `$${detail.latestFmv.amountUsd.toLocaleString()}` : '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-text-tertiary">Latest Valuation Date</p>
                              <p className="mt-1 text-sm font-medium text-text-primary">
                                {detail.latestFmv ? new Date(detail.latestFmv.valuationDate).toLocaleDateString() : 'No FMV yet'}
                              </p>
                            </div>
                            <div className="sm:col-span-2">
                              <p className="text-xs uppercase tracking-wide text-text-tertiary">Notes</p>
                              <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{detail.asset.notes ?? detail.asset.description ?? '—'}</p>
                            </div>
                          </div>

                          {isAdmin && (
                            <div className="mt-4 flex justify-end">
                              <button onClick={onRecordFmv} className="rounded-lg bg-atlas-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-atlas-hover">
                                Record FMV
                              </button>
                            </div>
                          )}

                          <div className="mt-6">
                            <AssetValuationHistory
                              rows={historyQuery.data ?? []}
                              isLoading={historyQuery.isLoading}
                              isError={historyQuery.isError}
                              onRetry={() => void historyQuery.refetch()}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}