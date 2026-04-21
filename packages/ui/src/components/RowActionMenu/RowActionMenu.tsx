import React, { useState } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Tooltip,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RowAction {
  /** Unique key */
  key: string;
  /** Display label */
  label: string;
  /** Optional leading icon */
  icon?: React.ReactNode;
  /** Click handler */
  onClick: () => void;
  /** Disable this action */
  disabled?: boolean;
  /** Hide this action (role-gating) */
  visible?: boolean;
  /** Render a divider above this item */
  dividerAbove?: boolean;
  /** Use error / destructive color */
  destructive?: boolean;
}

export interface RowActionMenuProps {
  /** Actions to render in the overflow menu */
  actions: RowAction[];
  /** Tooltip for the trigger button */
  tooltip?: string;
  /** Icon override */
  icon?: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const RowActionMenu: React.FC<RowActionMenuProps> = ({
  actions,
  tooltip = 'Actions',
  icon,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const visibleActions = actions.filter((a) => a.visible !== false);
  if (visibleActions.length === 0) return null;

  return (
    <>
      <Tooltip title={tooltip}>
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setAnchorEl(e.currentTarget);
          }}
        >
          {icon ?? <MoreVertIcon fontSize="small" />}
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        onClick={() => setAnchorEl(null)}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{ paper: { sx: { minWidth: 160 } } }}
      >
        {visibleActions.map((action) => [
          action.dividerAbove && <Divider key={`div-${action.key}`} />,
          <MenuItem
            key={action.key}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.icon && (
              <ListItemIcon sx={action.destructive ? { color: 'error.main' } : undefined}>
                {action.icon}
              </ListItemIcon>
            )}
            <ListItemText
              primary={action.label}
              primaryTypographyProps={
                action.destructive ? { color: 'error.main' } : undefined
              }
            />
          </MenuItem>,
        ])}
      </Menu>
    </>
  );
};

export default RowActionMenu;
