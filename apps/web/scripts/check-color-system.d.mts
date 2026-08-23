export interface ColorFinding {
  path: string
  line: number
  column: number
  rule: string
  message: string
  match: string
}

export interface ColorException {
  id: string
  path: string
  match: string
  category: 'semantic' | 'visualization' | 'decorative'
  rationale: string
  review: string
}

export function scanSource(source: string, relativePath: string): ColorFinding[]
export function validateExceptionRegistry(registry: unknown, findings: ColorFinding[]): string[]
export function auditColorSystem(options: {
  root: string
  exceptionsPath: string
  cwd?: string
}): Promise<{ findings: ColorFinding[]; exceptionDiagnostics: string[] }>
