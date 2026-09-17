import type { ReactNode } from 'react'
import { AlertCircleIcon } from 'lucide-react'
import { Button } from './shared/Button'

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  children?: ReactNode
}

export function ErrorState({
  title = "Something went wrong",
  message = "We can't load this data. Please try again.",
  onRetry,
  children,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mb-4">
        <AlertCircleIcon className="w-5 h-5 text-red-600" />
      </div>
      <h3 className="text-sm font-medium text-text-primary mb-1">{title}</h3>
      <p className="text-sm text-text-tertiary text-center max-w-sm mb-4">{message}</p>
      {(children || onRetry) && <div className="flex flex-wrap items-center justify-center gap-2">
        {children}
        {onRetry && (
          <Button onClick={onRetry} size="sm" variant={children ? 'secondary' : 'primary'}>
            Try again
          </Button>
        )}
      </div>}
    </div>
  )
}
