import { StatementAdapterRegistry } from '../../../src/modules/liquidity-statements/adapters/registry.js'
import type { StatementAdapter } from '../../../src/modules/liquidity-statements/adapters/adapter.types.js'

/** Test-only extension point. The fictional adapter is never in production registration. */
export const createConformanceRegistry = (...adapters: StatementAdapter[]) => new StatementAdapterRegistry(adapters)
