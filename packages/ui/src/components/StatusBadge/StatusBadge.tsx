import React from 'react';
import { Chip, type ChipProps } from '@mui/material';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Standard Atlas status values.
 * Extend this union as new statuses are introduced.
 */
export type AtlasStatus =
  | 'uploaded'
  | 'processing'
  | 'needs_review'
  | 'ready_for_approval'
  | 'finalized'
  | 'active'
  | 'inactive';

export interface StatusBadgeProps {
  /** The status value */
  status: AtlasStatus | (string & {});
  /** Override the display label (defaults to humanized status) */
  label?: string;
  /** MUI Chip size (default 'small') */
  size?: ChipProps['size'];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Map status → MUI color */
const colorMap: Record<string, ChipProps['color']> = {
  uploaded: 'info',
  processing: 'warning',
  needs_review: 'warning',
  ready_for_approval: 'info',
  finalized: 'success',
  active: 'success',
  inactive: 'default',
};

/** snake_case / kebab → Title Case */
function humanize(status: string): string {
  return status
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'small',
}) => {
  const color = colorMap[status] ?? 'default';
  const displayLabel = label ?? humanize(status);

  return (
    <Chip
      label={displayLabel}
      color={color}
      size={size}
      variant="outlined"
      sx={{ fontWeight: 600, textTransform: 'capitalize' }}
    />
  );
};

export default StatusBadge;
