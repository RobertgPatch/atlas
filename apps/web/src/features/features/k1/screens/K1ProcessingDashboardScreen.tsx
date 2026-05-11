import React from 'react'

export interface K1ProcessingDashboardScreenProps {
  className?: string
}

export const K1ProcessingDashboardScreen: React.FC<K1ProcessingDashboardScreenProps> = ({
  className,
}) => {
  return (
    <section
      className={`rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 ${className ?? ''}`}
    >
      K-1 processing dashboard UI is available through the shared workspace package.
    </section>
  )
}

export default K1ProcessingDashboardScreen
