import React from 'react'

export function RolePill({ role }: { role: 'Admin' | 'User' }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${
        role === 'Admin'
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-gray-100 text-gray-700 border-gray-200'
      }`}
    >
      {role}
    </span>
  )
}
