import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Skeleton,
  type SxProps,
  type Theme,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface KpiCardProps {
  /** Metric label */
  label: string;
  /** Formatted display value (e.g. "$1,234,567") */
  value: string;
  /** Optional delta text (e.g. "+12.3%") */
  delta?: string;
  /** Direction of the delta for color treatment */
  deltaDirection?: 'up' | 'down' | 'neutral';
  /** Optional secondary line (e.g. "vs. prior year") */
  subtext?: string;
  /** Whether the card is in a loading state */
  loading?: boolean;
  /** Override card sx */
  sx?: SxProps<Theme>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const deltaColorMap: Record<string, string> = {
  up: 'success.main',
  down: 'error.main',
  neutral: 'text.secondary',
};

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  delta,
  deltaDirection = 'neutral',
  subtext,
  loading = false,
  sx,
}) => {
  if (loading) {
    return (
      <Card variant="outlined" sx={{ minWidth: 180, ...sx }}>
        <CardContent>
          <Skeleton width="60%" height={20} />
          <Skeleton width="80%" height={36} sx={{ mt: 1 }} />
          <Skeleton width="40%" height={16} sx={{ mt: 0.5 }} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="outlined" sx={{ minWidth: 180, ...sx }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary" fontWeight={500}>
          {label}
        </Typography>

        <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5 }}>
          {value}
        </Typography>

        {(delta || subtext) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
            {delta && (
              <>
                {deltaDirection === 'up' && (
                  <TrendingUpIcon sx={{ fontSize: 16, color: deltaColorMap.up }} />
                )}
                {deltaDirection === 'down' && (
                  <TrendingDownIcon sx={{ fontSize: 16, color: deltaColorMap.down }} />
                )}
                <Typography
                  variant="body2"
                  fontWeight={600}
                  color={deltaColorMap[deltaDirection]}
                >
                  {delta}
                </Typography>
              </>
            )}
            {subtext && (
              <Typography variant="body2" color="text.secondary">
                {subtext}
              </Typography>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default KpiCard;
