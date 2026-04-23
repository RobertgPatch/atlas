// Re-exports to keep task-plan mapping intact. The finalize logic lives in approve.handler.ts
// because both handlers share the same guard utilities.
export { finalizeHandler, finalizeFaultInjection } from './approve.handler.js'
