import React from 'react'
import { motion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react'

export interface KPICardProps {
  label: string
  value: string | number
  change?: {
    value: string | number
    trend: 'up' | 'down' | 'neutral'
    timeframe?: string
  }
  icon?: LucideIcon
}

export function KPICard({ label, value, change, icon: Icon }: KPICardProps) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 flex flex-col"
    >
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-medium text-gray-500">{label}</h3>
        {Icon && <Icon className="w-5 h-5 text-gray-400" />}
      </div>

      <div className="mt-auto">
        <div className="text-2xl font-semibold text-gray-900">{value}</div>

        {change && (
          <div className="flex items-center mt-2 text-sm">
            <span
              className={`flex items-center font-medium ${
                change.trend === 'up'
                  ? 'text-success'
                  : change.trend === 'down'
                  ? 'text-error'
                  : 'text-gray-500'
              }`}
            >
              {change.trend === 'up' && <ArrowUpRight className="w-4 h-4 mr-1" />}
              {change.trend === 'down' && <ArrowDownRight className="w-4 h-4 mr-1" />}
              {change.value}
            </span>
            {change.timeframe && (
              <span className="text-gray-500 ml-2">{change.timeframe}</span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
