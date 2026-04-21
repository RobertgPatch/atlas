import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  TextField,
  Typography,
  IconButton,
  Tooltip,
  ClickAwayListener,
  CircularProgress,
  type SxProps,
  type Theme,
} from '@mui/material';
import EditIcon from '@mui/icons-material/EditOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EditableCellProps {
  /** Current display value */
  value: string;
  /** Called when user confirms the edit */
  onSave: (newValue: string) => void | Promise<void>;
  /** Called when user clicks undo (restores previous value) */
  onUndo?: () => void;
  /** Whether editing is currently allowed */
  editable?: boolean;
  /** Whether a save is in-flight */
  saving?: boolean;
  /** Whether we just saved (show confirmation) */
  saved?: boolean;
  /** Render the value in read-only mode (default: plain text) */
  renderValue?: (value: string) => React.ReactNode;
  /** Input placeholder */
  placeholder?: string;
  /** Text alignment for financial columns */
  align?: 'left' | 'center' | 'right';
  /** Override sx */
  sx?: SxProps<Theme>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const EditableCell: React.FC<EditableCellProps> = ({
  value,
  onSave,
  onUndo,
  editable = true,
  saving = false,
  saved = false,
  renderValue,
  placeholder,
  align = 'left',
  sx,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Auto-focus when entering edit mode
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleConfirm = useCallback(async () => {
    if (draft !== value) {
      await onSave(draft);
    }
    setEditing(false);
  }, [draft, value, onSave]);

  const handleCancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleConfirm();
      if (e.key === 'Escape') handleCancel();
    },
    [handleConfirm, handleCancel],
  );

  /* ---- Edit mode ---- */
  if (editing) {
    return (
      <ClickAwayListener onClickAway={handleCancel}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ...sx }}>
          <TextField
            inputRef={inputRef}
            size="small"
            variant="standard"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            inputProps={{ style: { textAlign: align } }}
            sx={{ flex: 1 }}
          />
          <IconButton size="small" onClick={handleConfirm} color="primary" disabled={saving}>
            {saving ? <CircularProgress size={16} /> : <CheckIcon fontSize="small" />}
          </IconButton>
          <IconButton size="small" onClick={handleCancel} disabled={saving}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </ClickAwayListener>
    );
  }

  /* ---- Read mode ---- */
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        textAlign: align,
        cursor: editable ? 'pointer' : 'default',
        '&:hover .edit-trigger': { opacity: 1 },
        ...sx,
      }}
      onClick={() => editable && setEditing(true)}
    >
      <Box sx={{ flex: 1 }}>
        {renderValue ? renderValue(value) : (
          <Typography variant="body2" noWrap>
            {value}
          </Typography>
        )}
      </Box>

      {editable && (
        <Tooltip title="Edit">
          <IconButton
            className="edit-trigger"
            size="small"
            sx={{ opacity: 0, transition: 'opacity 0.15s' }}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      {saved && onUndo && (
        <Tooltip title="Undo">
          <IconButton size="small" color="secondary" onClick={onUndo}>
            <UndoIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

export default EditableCell;
