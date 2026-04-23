import React from 'react'
import { AlertCircleIcon } from 'lucide-react'

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export function ErrorState({
  title = "Something went wrong",
  message = "We can't load this data. Please try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mb-4">
        <AlertCircleIcon className="w-5 h-5 text-red-600" />
      </div>
      <h3 className="text-sm font-medium text-text-primary mb-1">{title}</h3>
      <p className="text-sm text-text-tertiary text-center max-w-sm mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center px-3.5 py-2 text-sm font-medium text-accent bg-accent-light rounded-card hover:bg-blue-100 transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  )
}
