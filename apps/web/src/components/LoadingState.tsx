import React from 'react'

interface LoadingStateProps {
  rows?: number
  columns?: number
}

export function LoadingState({ rows = 5, columns = 6 }: LoadingStateProps) {
  return (
    <div className="animate-pulse">
      <div className="border-b border-border">
        <div className="flex gap-4 px-4 py-3">
          {Array.from({ length: columns }).map((_, i) => (
            <div
              key={i}
              className="h-3 bg-gray-100 rounded flex-1"
              style={{ maxWidth: i === 0 ? '180px' : '120px' }}
            />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex gap-4 px-4 py-3.5 border-b border-border-subtle">
          {Array.from({ length: columns }).map((_, colIdx) => (
            <div
              key={colIdx}
              className="h-3 bg-gray-50 rounded flex-1"
              style={{ maxWidth: colIdx === 0 ? '180px' : '120px', opacity: 1 - rowIdx * 0.1 }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
