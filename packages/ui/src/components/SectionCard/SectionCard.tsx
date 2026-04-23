import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardActions,
  Divider,
  Typography,
  type SxProps,
  type Theme,
} from '@mui/material';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SectionCardProps {
  /** Section title */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Actions rendered in the card header area */
  headerActions?: React.ReactNode;
  /** Actions rendered at the card bottom */
  footerActions?: React.ReactNode;
  /** Card body content */
  children: React.ReactNode;
  /** Override card sx */
  sx?: SxProps<Theme>;
  /** Remove internal padding (useful when embedding tables) */
  noPadding?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  subtitle,
  headerActions,
  footerActions,
  children,
  sx,
  noPadding = false,
}) => {
  return (
    <Card variant="outlined" sx={{ mb: 2, ...sx }}>
      <CardHeader
        title={
          <Typography variant="h6" fontWeight={600}>
            {title}
          </Typography>
        }
        subheader={subtitle}
        action={headerActions}
        sx={{ pb: 0 }}
      />
      <Divider sx={{ mt: 1 }} />
      <CardContent sx={noPadding ? { p: 0, '&:last-child': { pb: 0 } } : undefined}>
        {children}
      </CardContent>
      {footerActions && (
        <>
          <Divider />
          <CardActions sx={{ justifyContent: 'flex-end', px: 2, py: 1 }}>
            {footerActions}
          </CardActions>
        </>
      )}
    </Card>
  );
};

export default SectionCard;
