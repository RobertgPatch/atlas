import React from 'react';
import { Box, Typography, Button, type SxProps, type Theme } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ErrorStateProps {
  /** Error title */
  title?: string;
  /** Error description / message */
  description?: string;
  /** Custom icon */
  icon?: React.ReactNode;
  /** Retry action label */
  retryLabel?: string;
  /** Retry handler */
  onRetry?: () => void;
  /** Override sx */
  sx?: SxProps<Theme>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  description = 'An unexpected error occurred. Please try again.',
  icon,
  retryLabel = 'Retry',
  onRetry,
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
      <Box sx={{ mb: 2, color: 'error.main', fontSize: 48 }}>
        {icon ?? <ErrorOutlineIcon sx={{ fontSize: 'inherit' }} />}
      </Box>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, mb: 2 }}>
          {description}
        </Typography>
      )}
      {onRetry && (
        <Button variant="outlined" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </Box>
  );
};

export default ErrorState;
