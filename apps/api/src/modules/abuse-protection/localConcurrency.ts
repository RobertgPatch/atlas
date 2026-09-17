export const LOCAL_CONCURRENCY_CLASSES = ['heavy_read', 'download'] as const
export type LocalConcurrencyClass = (typeof LOCAL_CONCURRENCY_CLASSES)[number]

export interface LocalConcurrencyLease {
  readonly classKey: LocalConcurrencyClass
  readonly admitted: true
  release(): void
}

export interface LocalConcurrencyRejection {
  readonly classKey: LocalConcurrencyClass
  readonly admitted: false
  readonly retryAfterSeconds: number
}

export type LocalConcurrencyDecision = LocalConcurrencyLease | LocalConcurrencyRejection

export class LocalConcurrencyLimiter {
  readonly #active = new Map<LocalConcurrencyClass, number>()

  acquire(classKey: LocalConcurrencyClass, limit: number): LocalConcurrencyDecision {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error('LOCAL_CONCURRENCY_LIMIT_MUST_BE_POSITIVE')
    }
    const active = this.#active.get(classKey) ?? 0
    if (active >= limit) {
      return { classKey, admitted: false, retryAfterSeconds: 1 }
    }
    this.#active.set(classKey, active + 1)
    let released = false
    return {
      classKey,
      admitted: true,
      release: () => {
        if (released) return
        released = true
        const current = this.#active.get(classKey) ?? 0
        if (current <= 1) this.#active.delete(classKey)
        else this.#active.set(classKey, current - 1)
      },
    }
  }

  active(classKey: LocalConcurrencyClass): number {
    return this.#active.get(classKey) ?? 0
  }

  snapshot(): Readonly<Record<LocalConcurrencyClass, number>> {
    return {
      heavy_read: this.active('heavy_read'),
      download: this.active('download'),
    }
  }
}

export const localConcurrencyClassFor = (
  routeClass: string,
): LocalConcurrencyClass | null => {
  if (routeClass === 'DATABASE_HEAVY_READ') return 'heavy_read'
  if (routeClass === 'DOCUMENT_DOWNLOAD' || routeClass === 'EXPORT_DOWNLOAD') return 'download'
  return null
}
