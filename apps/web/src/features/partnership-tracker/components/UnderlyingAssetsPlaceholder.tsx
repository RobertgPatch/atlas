import { Layers3 } from 'lucide-react'

export function UnderlyingAssetsPlaceholder() {
  return <section className="border-y border-gray-200 bg-white px-6 py-12" aria-labelledby="underlying-assets-title">
    <div className="mx-auto max-w-2xl text-center"><Layers3 className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" /><h2 id="underlying-assets-title" className="mt-4 text-lg font-semibold text-gray-950">Underlying Assets</h2><p className="mt-2 text-sm font-medium text-gray-600">Coming soon</p></div>
  </section>
}
