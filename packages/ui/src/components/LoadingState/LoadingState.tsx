import React from 'react'

export type LoadingVariant = 'table' | 'cards' | 'detail' | 'custom'

export interface LoadingStateProps {
  variant?: LoadingVariant
  count?: number
  children?: React.ReactNode
  className?: string
}

const DETAIL_SKELETON_LINE_WIDTHS = ['70%', '64%', '82%', '58%', '76%', '68%']

const TableSkeleton: React.FC<{ count: number }> = ({ count }) => (
  <div>
    <div className="mb-2 grid grid-cols-5 gap-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={`h-${index}`}
          className="h-4 animate-pulse rounded bg-gray-200"
          style={{ width: `${78 + index * 4}%` }}
        />
      ))}
    </div>
    {Array.from({ length: count }).map((_, rowIndex) => (
      <div key={rowIndex} className="mb-3 grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, colIndex) => (
          <div
            key={`r-${rowIndex}-c-${colIndex}`}
            className="h-5 animate-pulse rounded bg-gray-100"
            style={{ width: `${78 + colIndex * 4}%` }}
          />
        ))}
      </div>
    ))}
  </div>
)

const CardsSkeleton: React.FC<{ count: number }> = ({ count }) => (
  <div className="flex flex-wrap gap-3">
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="h-[120px] w-[200px] animate-pulse rounded-lg bg-gray-100"
      />
    ))}
  </div>
)

const DetailSkeleton: React.FC = () => (
  <div>
    <div className="mb-2 h-7 w-2/5 animate-pulse rounded bg-gray-200" />
    <div className="mb-3 h-5 w-3/5 animate-pulse rounded bg-gray-100" />
    {DETAIL_SKELETON_LINE_WIDTHS.map((width, index) => (
      <div
        key={index}
        className="mb-2 h-7 animate-pulse rounded bg-gray-100"
        style={{ width }}
      />
    ))}
  </div>
)

export const LoadingState: React.FC<LoadingStateProps> = ({
  variant = 'table',
  count = 5,
  children,
  className,
}) => {
  return (
    <div className={`px-1 py-2 ${className ?? ''}`}>
      {variant === 'table' && <TableSkeleton count={count} />}
      {variant === 'cards' && <CardsSkeleton count={count} />}
      {variant === 'detail' && <DetailSkeleton />}
      {variant === 'custom' && children}
    </div>
  )
}

export default LoadingState
