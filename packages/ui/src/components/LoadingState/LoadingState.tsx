import React from 'react';
import { Box, Skeleton, Stack, type SxProps, type Theme } from '@mui/material';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type LoadingVariant = 'table' | 'cards' | 'detail' | 'custom';

export interface LoadingStateProps {
  /** Predefined skeleton layout (default 'table') */
  variant?: LoadingVariant;
  /** Number of skeleton rows/cards to render */
  count?: number;
  /** Custom skeleton content — used when variant is 'custom' */
  children?: React.ReactNode;
  /** Override sx */
  sx?: SxProps<Theme>;
}

/* ------------------------------------------------------------------ */
/*  Skeleton builders                                                   */
/* ------------------------------------------------------------------ */

const TableSkeleton: React.FC<{ count: number }> = ({ count }) => (
  <Box>
    {/* Header row */}
    <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={`h-${i}`} variant="text" width={`${18 + i * 2}%`} height={28} />
      ))}
    </Stack>
    {/* Body rows */}
    {Array.from({ length: count }).map((_, rowIdx) => (
      <Stack key={rowIdx} direction="row" spacing={2} sx={{ mb: 0.75 }}>
        {Array.from({ length: 5 }).map((_, colIdx) => (
          <Skeleton
            key={`r${rowIdx}-c${colIdx}`}
            variant="rounded"
            width={`${18 + colIdx * 2}%`}
            height={22}
          />
        ))}
      </Stack>
    ))}
  </Box>
);

const CardsSkeleton: React.FC<{ count: number }> = ({ count }) => (
  <Stack direction="row" spacing={2} flexWrap="wrap">
    {Array.from({ length: count }).map((_, i) => (
      <Skeleton
        key={i}
        variant="rounded"
        width={200}
        height={120}
        sx={{ borderRadius: 2 }}
      />
    ))}
  </Stack>
);

const DetailSkeleton: React.FC = () => (
  <Box>
    <Skeleton variant="text" width="40%" height={36} sx={{ mb: 1 }} />
    <Skeleton variant="text" width="60%" height={20} sx={{ mb: 2 }} />
    {Array.from({ length: 6 }).map((_, i) => (
      <Skeleton key={i} variant="rounded" height={28} sx={{ mb: 1, width: `${60 + Math.random() * 30}%` }} />
    ))}
  </Box>
);

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const LoadingState: React.FC<LoadingStateProps> = ({
  variant = 'table',
  count = 5,
  children,
  sx,
}) => {
  return (
    <Box sx={{ py: 2, px: 1, ...sx }}>
      {variant === 'table' && <TableSkeleton count={count} />}
      {variant === 'cards' && <CardsSkeleton count={count} />}
      {variant === 'detail' && <DetailSkeleton />}
      {variant === 'custom' && children}
    </Box>
  );
};

export default LoadingState;
