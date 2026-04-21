import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  Box,
  Typography,
  type SxProps,
  type Theme,
} from '@mui/material';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SortDirection = 'asc' | 'desc';

export interface DataTableColumn<T = any> {
  /** Unique column key – used for sorting and cell rendering */
  key: string;
  /** Column header label */
  header: string;
  /** Render a custom cell; defaults to `String(row[key])` */
  renderCell?: (row: T, rowIndex: number) => React.ReactNode;
  /** Column alignment (default 'left') */
  align?: 'left' | 'center' | 'right';
  /** Whether the column is sortable */
  sortable?: boolean;
  /** Fixed width */
  width?: number | string;
  /** If true, render in the totals row via `renderTotalsCell` */
  hasTotals?: boolean;
  /** Custom totals cell renderer */
  renderTotalsCell?: () => React.ReactNode;
}

export interface DataTableProps<T = any> {
  /** Column definitions */
  columns: DataTableColumn<T>[];
  /** Row data array */
  rows: T[];
  /** Unique key extractor per row */
  getRowKey: (row: T, index: number) => string | number;

  /* -- Sorting -- */
  sortKey?: string;
  sortDirection?: SortDirection;
  onSortChange?: (key: string, direction: SortDirection) => void;

  /* -- States -- */
  /** Loading state — delegates to LoadingState externally or shows placeholder */
  loading?: boolean;
  /** Custom loading node */
  loadingNode?: React.ReactNode;
  /** Empty state — shown when rows is empty and not loading */
  emptyNode?: React.ReactNode;
  /** Error state */
  error?: boolean;
  errorNode?: React.ReactNode;

  /* -- Features -- */
  /** Enable sticky header (default true) */
  stickyHeader?: boolean;
  /** Show totals row at the bottom */
  showTotals?: boolean;
  /** Dense row spacing for financial tables */
  dense?: boolean;
  /** Max height for scrollable table area */
  maxHeight?: number | string;
  /** Click handler for row */
  onRowClick?: (row: T, index: number) => void;

  /** Override container sx */
  sx?: SxProps<Theme>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DataTable<T = any>({
  columns,
  rows,
  getRowKey,
  sortKey,
  sortDirection = 'asc',
  onSortChange,
  loading = false,
  loadingNode,
  emptyNode,
  error = false,
  errorNode,
  stickyHeader = true,
  showTotals = false,
  dense = true,
  maxHeight,
  onRowClick,
  sx,
}: DataTableProps<T>) {
  /* ---- Sorting handler ---- */
  const handleSort = (key: string) => {
    if (!onSortChange) return;
    const isAsc = sortKey === key && sortDirection === 'asc';
    onSortChange(key, isAsc ? 'desc' : 'asc');
  };

  /* ---- State overrides ---- */
  if (error && errorNode) {
    return <Box sx={{ py: 6, textAlign: 'center', ...sx }}>{errorNode}</Box>;
  }

  if (loading && loadingNode) {
    return <Box sx={{ py: 6, textAlign: 'center', ...sx }}>{loadingNode}</Box>;
  }

  if (!loading && rows.length === 0 && emptyNode) {
    return <Box sx={{ py: 6, textAlign: 'center', ...sx }}>{emptyNode}</Box>;
  }

  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{ maxHeight, ...sx }}
    >
      <Table
        stickyHeader={stickyHeader}
        size={dense ? 'small' : 'medium'}
        aria-label="data table"
      >
        {/* Head */}
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <TableCell
                key={col.key}
                align={col.align ?? 'left'}
                sx={{
                  fontWeight: 600,
                  width: col.width,
                  whiteSpace: 'nowrap',
                  bgcolor: 'background.paper',
                }}
              >
                {col.sortable && onSortChange ? (
                  <TableSortLabel
                    active={sortKey === col.key}
                    direction={sortKey === col.key ? sortDirection : 'asc'}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.header}
                  </TableSortLabel>
                ) : (
                  col.header
                )}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>

        {/* Body */}
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow
              key={getRowKey(row, idx)}
              hover
              onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
              sx={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((col) => (
                <TableCell key={col.key} align={col.align ?? 'left'}>
                  {col.renderCell ? col.renderCell(row, idx) : String((row as any)[col.key] ?? '')}
                </TableCell>
              ))}
            </TableRow>
          ))}

          {/* Totals row */}
          {showTotals && rows.length > 0 && (
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              {columns.map((col) => (
                <TableCell
                  key={`total-${col.key}`}
                  align={col.align ?? 'left'}
                  sx={{ fontWeight: 700, borderTop: 2, borderColor: 'divider' }}
                >
                  {col.hasTotals && col.renderTotalsCell ? col.renderTotalsCell() : ''}
                </TableCell>
              ))}
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default DataTable;
