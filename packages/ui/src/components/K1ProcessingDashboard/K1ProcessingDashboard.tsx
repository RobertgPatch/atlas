import React from 'react';
import {
  Box,
  Button,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import {
  DataTable,
  type DataTableColumn,
  type SortDirection,
} from '../DataTable';
import { EmptyState } from '../EmptyState';
import { ErrorState } from '../ErrorState';
import { FilterToolbar, type FilterField } from '../FilterToolbar';
import { KpiCard } from '../KpiCard';
import { LoadingState } from '../LoadingState';
import { PageHeader } from '../PageHeader';
import { RowActionMenu } from '../RowActionMenu';
import { SectionCard } from '../SectionCard';
import { StatusBadge, type AtlasStatus } from '../StatusBadge';

export interface K1ProcessingDashboardRow {
  id: string;
  documentName: string;
  partnership: string;
  entity: string;
  taxYear: string;
  status: AtlasStatus | (string & {});
  issuesCount: number;
  uploadedDate: string;
}

export interface K1ProcessingKpi {
  key: string;
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: 'up' | 'down' | 'neutral';
  subtext?: string;
}

export interface K1ProcessingDashboardProps {
  title?: string;
  subtitle?: string;
  kpis: K1ProcessingKpi[];
  rows: K1ProcessingDashboardRow[];
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filters?: FilterField[];
  sortKey?: string;
  sortDirection?: SortDirection;
  onSortChange?: (key: string, direction: SortDirection) => void;
  loading?: boolean;
  error?: boolean;
  canViewQueue?: boolean;
  canExport?: boolean;
  canShare?: boolean;
  onRetry?: () => void;
  onExport?: () => void;
  onShare?: () => void;
  onOpenReview?: (row: K1ProcessingDashboardRow) => void;
  onOpenDocument?: (row: K1ProcessingDashboardRow) => void;
  onAssignReviewer?: (row: K1ProcessingDashboardRow) => void;
}

export const K1ProcessingDashboard: React.FC<K1ProcessingDashboardProps> = ({
  title = 'K-1 Processing',
  subtitle = 'Monitor ingestion, review, and finalization workflow',
  kpis,
  rows,
  searchValue = '',
  onSearchChange,
  filters = [],
  sortKey,
  sortDirection = 'desc',
  onSortChange,
  loading = false,
  error = false,
  canViewQueue = true,
  canExport = true,
  canShare = true,
  onRetry,
  onExport,
  onShare,
  onOpenReview,
  onOpenDocument,
  onAssignReviewer,
}) => {
  const theme = useTheme();

  const columns: DataTableColumn<K1ProcessingDashboardRow>[] = [
    {
      key: 'documentName',
      header: 'Document Name',
      sortable: true,
      renderCell: (row) => (
        <Typography variant="body2" fontWeight={600}>
          {row.documentName}
        </Typography>
      ),
      width: 260,
    },
    {
      key: 'partnership',
      header: 'Partnership',
      sortable: true,
      width: 180,
    },
    {
      key: 'entity',
      header: 'Entity',
      sortable: true,
      width: 180,
    },
    {
      key: 'taxYear',
      header: 'Tax Year',
      sortable: true,
      width: 110,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      renderCell: (row) => <StatusBadge status={row.status} />,
      width: 180,
    },
    {
      key: 'issuesCount',
      header: 'Issues',
      align: 'right',
      sortable: true,
      width: 90,
      renderCell: (row) => (
        <Typography variant="body2" fontWeight={row.issuesCount > 0 ? 700 : 500}>
          {row.issuesCount}
        </Typography>
      ),
    },
    {
      key: 'uploadedDate',
      header: 'Uploaded Date',
      sortable: true,
      width: 140,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: 80,
      renderCell: (row) => (
        <RowActionMenu
          actions={[
            {
              key: 'open-review',
              label: 'Open Review Workspace',
              onClick: () => onOpenReview?.(row),
              visible: Boolean(onOpenReview),
            },
            {
              key: 'open-document',
              label: 'Open Source Document',
              onClick: () => onOpenDocument?.(row),
              visible: Boolean(onOpenDocument),
            },
            {
              key: 'assign-reviewer',
              label: 'Assign Reviewer',
              onClick: () => onAssignReviewer?.(row),
              visible: Boolean(onAssignReviewer),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <Box
      sx={{
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        color: 'text.primary',
        background:
          'radial-gradient(1200px 420px at 0% -10%, rgba(15, 62, 120, 0.06), transparent 60%), linear-gradient(180deg, #f8fafc 0%, #f5f7fa 100%)',
        p: { xs: 2, md: 3 },
        borderRadius: 2,
      }}
    >
      <PageHeader
        title={title}
        subtitle={subtitle}
        secondaryActions={[
          {
            label: 'Export',
            onClick: () => onExport?.(),
            startIcon: <FileDownloadOutlinedIcon />,
            visible: canExport,
          },
          {
            label: 'Share',
            onClick: () => onShare?.(),
            startIcon: <ShareOutlinedIcon />,
            visible: canShare,
          },
        ]}
      />

      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          overflowX: 'auto',
          pb: 1,
          mb: 2,
          '& > *': { minWidth: 210, flex: '0 0 auto' },
        }}
      >
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.key}
            label={kpi.label}
            value={kpi.value}
            delta={kpi.delta}
            deltaDirection={kpi.deltaDirection ?? 'neutral'}
            subtext={kpi.subtext}
            loading={loading}
            sx={{
              borderColor: 'rgba(17, 24, 39, 0.08)',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
              bgcolor: '#ffffff',
            }}
          />
        ))}
      </Stack>

      <SectionCard
        title="Processing Queue"
        subtitle="Operational queue for ingestion and review teams"
        noPadding
        sx={{
          mb: 0,
          borderColor: 'rgba(17, 24, 39, 0.08)',
          boxShadow: '0 6px 20px rgba(15, 23, 42, 0.05)',
          bgcolor: '#ffffff',
          '& .MuiCardHeader-root': { py: 1.5 },
          '& .MuiCardContent-root': { p: 2 },
        }}
      >
        <Box sx={{ p: 2, pb: 1 }}>
          <FilterToolbar
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            searchPlaceholder="Search document, partnership, or entity"
            filters={filters}
            actions={
              <Button
                size="small"
                variant="outlined"
                onClick={() => onRetry?.()}
                sx={{ borderColor: theme.palette.divider }}
              >
                Refresh
              </Button>
            }
            sx={{ mb: 0 }}
          />
        </Box>

        {!canViewQueue ? (
          <EmptyState
            title="Queue access restricted"
            description="Your role does not include permission to view K-1 processing queue data."
            icon={<LockOutlinedIcon sx={{ fontSize: 'inherit' }} />}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSortChange={onSortChange}
            loading={loading}
            error={error}
            dense
            stickyHeader
            maxHeight={540}
            onRowClick={onOpenReview ? (row) => onOpenReview(row) : undefined}
            loadingNode={<LoadingState variant="table" count={8} />}
            errorNode={
              <ErrorState
                title="Unable to load processing queue"
                description="The queue data could not be retrieved. Check your connection and try again."
                onRetry={onRetry}
              />
            }
            emptyNode={
              <EmptyState
                title="No K-1 documents in queue"
                description="Uploaded files will appear here once ingestion starts."
              />
            }
            sx={{
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 1.5,
              '& .MuiTableCell-head': {
                color: 'text.secondary',
                fontSize: 12,
                letterSpacing: 0.2,
                textTransform: 'uppercase',
              },
            }}
          />
        )}
      </SectionCard>
    </Box>
  );
};

export default K1ProcessingDashboard;