import React from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  MenuItem,
  Select,
  type SelectChangeEvent,
  IconButton,
  Tooltip,
  Stack,
  type SxProps,
  type Theme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterField {
  /** Unique key for controlled state */
  key: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}

export interface FilterToolbarProps {
  /** Search input value */
  searchValue?: string;
  /** Search input change handler */
  onSearchChange?: (value: string) => void;
  /** Placeholder for search input */
  searchPlaceholder?: string;
  /** Dropdown filter fields */
  filters?: FilterField[];
  /** Extra action nodes rendered on the right */
  actions?: React.ReactNode;
  /** Override wrapper sx */
  sx?: SxProps<Theme>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const FilterToolbar: React.FC<FilterToolbarProps> = ({
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters = [],
  actions,
  sx,
}) => {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1.5}
      alignItems={{ sm: 'center' }}
      sx={{ mb: 2, ...sx }}
    >
      {/* Search */}
      {onSearchChange && (
        <TextField
          size="small"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: searchValue ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => onSearchChange('')}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
          sx={{ minWidth: 220 }}
        />
      )}

      {/* Dropdown filters */}
      {filters.map((filter) => (
        <Select
          key={filter.key}
          size="small"
          displayEmpty
          value={filter.value}
          onChange={(e: SelectChangeEvent) => filter.onChange(e.target.value)}
          renderValue={(selected) => {
            if (!selected) return <em>{filter.label}</em>;
            const opt = filter.options.find((o) => o.value === selected);
            return opt?.label ?? selected;
          }}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">
            <em>All</em>
          </MenuItem>
          {filter.options.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      ))}

      {/* Right-aligned actions */}
      {actions && <Box sx={{ ml: 'auto' }}>{actions}</Box>}
    </Stack>
  );
};

export default FilterToolbar;
