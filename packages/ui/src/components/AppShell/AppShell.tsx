import React, { useState } from 'react';
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
  Divider,
  Avatar,
  Tooltip,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface NavItem {
  /** Unique key for active-state matching */
  key: string;
  label: string;
  icon?: React.ReactNode;
  /** Called when the item is clicked */
  onClick?: () => void;
  /** Whether the item is visible (default true) */
  visible?: boolean;
}

export interface AppShellProps {
  /** Application title shown in the header */
  title?: string;
  /** Logo element rendered in the sidebar header */
  logo?: React.ReactNode;
  /** Primary navigation items */
  navItems?: NavItem[];
  /** Key of the currently active nav item */
  activeNavKey?: string;
  /** Width of the sidebar drawer in px (default 260) */
  drawerWidth?: number;
  /** Header-right slot (e.g. user avatar, notifications) */
  headerRight?: React.ReactNode;
  /** Main content */
  children: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_DRAWER_WIDTH = 260;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const AppShell: React.FC<AppShellProps> = ({
  title = 'Atlas',
  logo,
  navItems = [],
  activeNavKey,
  drawerWidth = DEFAULT_DRAWER_WIDTH,
  headerRight,
  children,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = navItems.filter((n) => n.visible !== false);

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sidebar header */}
      <Toolbar
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: logo ? 'center' : 'space-between',
          px: 2,
        }}
      >
        {logo ?? (
          <Typography variant="h6" noWrap fontWeight={700}>
            {title}
          </Typography>
        )}
        {isMobile && (
          <IconButton onClick={() => setMobileOpen(false)} size="small">
            <ChevronLeftIcon />
          </IconButton>
        )}
      </Toolbar>

      <Divider />

      {/* Navigation */}
      <List component="nav" sx={{ flex: 1, py: 1 }}>
        {visibleItems.map((item) => (
          <ListItemButton
            key={item.key}
            selected={activeNavKey === item.key}
            onClick={() => {
              item.onClick?.();
              if (isMobile) setMobileOpen(false);
            }}
            sx={{ mx: 1, borderRadius: 1 }}
          >
            {item.icon && <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>}
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* App bar */}
      <AppBar
        position="fixed"
        elevation={1}
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          bgcolor: 'background.paper',
          color: 'text.primary',
        }}
      >
        <Toolbar>
          {isMobile && (
            <IconButton edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }} />
          {headerRight}
        </Toolbar>
      </AppBar>

      {/* Sidebar – responsive */}
      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{ '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' } }}
          >
            {drawerContent}
          </Drawer>
        ) : (
          <Drawer
            variant="permanent"
            open
            sx={{
              '& .MuiDrawer-paper': {
                width: drawerWidth,
                boxSizing: 'border-box',
                borderRight: `1px solid ${theme.palette.divider}`,
              },
            }}
          >
            {drawerContent}
          </Drawer>
        )}
      </Box>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          mt: '64px', // toolbar height
          p: 3,
          bgcolor: 'background.default',
          minHeight: 'calc(100vh - 64px)',
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default AppShell;
