import React from 'react';
import { Box, Typography, Button, type SxProps, type Theme } from '@mui/material';
import InboxIcon from '@mui/icons-material/InboxOutlined';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EmptyStateProps {
  /** Primary message */
  title?: string;
  /** Secondary description */
  description?: string;
  /** Custom icon (defaults to InboxOutlined) */
  icon?: React.ReactNode;
  /** Optional CTA */
  actionLabel?: string;
  onAction?: () => void;
  /** Override sx */
  sx?: SxProps<Theme>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No data yet',
  description,
  icon,
  actionLabel,
  onAction,
  sx,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 8,
        px: 2,
        textAlign: 'center',
        ...sx,
      }}
    >
      <Box sx={{ mb: 2, color: 'text.disabled', fontSize: 48 }}>
        {icon ?? <InboxIcon sx={{ fontSize: 'inherit' }} />}
      </Box>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360, mb: 2 }}>
          {description}
        </Typography>
      )}
      {actionLabel && onAction && (
        <Button variant="contained" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
};

export default EmptyState;
