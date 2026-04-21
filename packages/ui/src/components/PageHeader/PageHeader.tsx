import React from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PageHeaderAction {
  label: string;
  onClick: () => void;
  variant?: 'text' | 'outlined' | 'contained';
  startIcon?: React.ReactNode;
  disabled?: boolean;
  /** Visibility gate — defaults to true */
  visible?: boolean;
}

export interface PageHeaderProps {
  /** Page title */
  title: string;
  /** Optional subtitle / description */
  subtitle?: string;
  /** Primary action button rendered on the right */
  primaryAction?: PageHeaderAction;
  /** Additional secondary actions */
  secondaryActions?: PageHeaderAction[];
  /** Extra content rendered below the title row */
  children?: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  primaryAction,
  secondaryActions = [],
  children,
}) => {
  const visibleSecondary = secondaryActions.filter((a) => a.visible !== false);

  return (
    <Box sx={{ mb: 3 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        spacing={1}
      >
        {/* Title block */}
        <Box>
          <Typography variant="h4" fontWeight={700}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {subtitle}
            </Typography>
          )}
        </Box>

        {/* Actions */}
        {(primaryAction || visibleSecondary.length > 0) && (
          <Stack direction="row" spacing={1} alignItems="center">
            {visibleSecondary.map((action) => (
              <Button
                key={action.label}
                variant={action.variant ?? 'outlined'}
                size="small"
                startIcon={action.startIcon}
                onClick={action.onClick}
                disabled={action.disabled}
              >
                {action.label}
              </Button>
            ))}
            {primaryAction && primaryAction.visible !== false && (
              <Button
                variant={primaryAction.variant ?? 'contained'}
                startIcon={primaryAction.startIcon}
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
              >
                {primaryAction.label}
              </Button>
            )}
          </Stack>
        )}
      </Stack>

      {children}
    </Box>
  );
};

export default PageHeader;
