export const formatEinInput = (value: string | null | undefined): string => {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 9)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}-${digits.slice(2)}`
}

export const isCompleteEin = (value: string): boolean => /^\d{2}-\d{7}$/.test(formatEinInput(value))
