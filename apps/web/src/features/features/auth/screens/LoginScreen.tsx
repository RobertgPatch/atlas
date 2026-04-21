import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Link,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useNavigate } from 'react-router-dom';
import { signIn, AuthError } from '../../../../auth/mockAuthService';

// ─── Component ────────────────────────────────────────────────────────────────

export const LoginScreen: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn(email, password);
      navigate('/mfa');
    } catch (err) {
      if (err instanceof AuthError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
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
        {/* Wordmark */}
        <Typography
          variant="h5"
          fontWeight={800}
          letterSpacing={-0.5}
          sx={{ mb: 0.5, color: '#0f172a' }}
        >
          Atlas
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Sign in to your account
        </Typography>

        {/* Error banner */}
        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Form */}
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Email address"
            type="email"
            fullWidth
            size="small"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            sx={{ mb: 2 }}
          />

          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            fullWidth
            size="small"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    edge="end"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <VisibilityOffIcon fontSize="small" />
                    ) : (
                      <VisibilityIcon fontSize="small" />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{ mb: 3 }}
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading || !email || !password}
            sx={{ height: 40, fontWeight: 600 }}
          >
            {loading ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              'Sign in'
            )}
          </Button>
        </Box>

        {/* Hint (dev only) */}
        {import.meta.env.DEV && (
          <Box
            sx={{
              mt: 3,
              p: 1.5,
              bgcolor: 'rgba(59, 130, 246, 0.05)',
              border: '1px dashed rgba(59, 130, 246, 0.3)',
              borderRadius: 1,
            }}
          >
            <Typography variant="caption" color="text.secondary" component="p">
              <strong>Dev credentials</strong>
            </Typography>
            <Typography variant="caption" color="text.secondary" component="p">
              Email: <code>test@atlas.com</code>
            </Typography>
            <Typography variant="caption" color="text.secondary" component="p">
              Password: <code>Password123!</code>
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default LoginScreen;
