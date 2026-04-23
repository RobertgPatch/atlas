import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useNavigate } from 'react-router-dom';

const DEV_MFA_STUB_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_MFA_STUB === 'true';
const DEV_MFA_STUB_CODE = import.meta.env.VITE_DEV_MFA_STUB_CODE ?? '123456';

// ─── Component ────────────────────────────────────────────────────────────────

export const MfaScreen: React.FC = () => {
  const navigate = useNavigate();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!DEV_MFA_STUB_ENABLED) {
      setError('MFA verification is unavailable in this build.');
      setLoading(false);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 800));

    if (code === DEV_MFA_STUB_CODE) {
      navigate('/dashboard');
    } else {
      setError('Incorrect verification code.');
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #f8fafc 0%, #eef2f7 100%)',
        px: 2,
      }}
    >
      <Paper
        elevation={0}
        variant="outlined"
        sx={{
          width: '100%',
          maxWidth: 420,
          p: { xs: 3, sm: 4 },
          borderRadius: 2,
          borderColor: 'rgba(17, 24, 39, 0.1)',
          boxShadow: '0 8px 32px rgba(15, 23, 42, 0.06)',
        }}
      >
        {/* Icon + title */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <LockOutlinedIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
          <Typography variant="h5" fontWeight={800} letterSpacing={-0.5} sx={{ color: '#0f172a' }}>
            Two-factor verification
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Enter the 6-digit code sent to your device.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Verification code"
            fullWidth
            size="small"
            required
            autoFocus
            autoComplete="one-time-code"
            inputProps={{ maxLength: 6, inputMode: 'numeric', pattern: '[0-9]*' }}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            disabled={loading}
            sx={{ mb: 3 }}
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading || code.length !== 6}
            sx={{ height: 40, fontWeight: 600, mb: 1.5 }}
          >
            {loading ? <CircularProgress size={20} color="inherit" /> : 'Verify'}
          </Button>

          <Button
            variant="text"
            fullWidth
            size="small"
            onClick={() => navigate('/')}
            disabled={loading}
          >
            Back to sign in
          </Button>
        </Box>

        {/* Dev hint */}
        {DEV_MFA_STUB_ENABLED && (
          <Box
            sx={{
              mt: 3,
              p: 1.5,
              bgcolor: 'rgba(59, 130, 246, 0.05)',
              border: '1px dashed rgba(59, 130, 246, 0.3)',
              borderRadius: 1,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              <strong>Dev:</strong> use code <code>{DEV_MFA_STUB_CODE}</code>
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default MfaScreen;
