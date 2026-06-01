import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mail, ArrowLeft, CheckCircle2, Eye, EyeOff, ShieldCheck, KeyRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import AuthShell from '../components/AuthShell';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const recoveryContextRef = useRef(false);

  const appBaseUrl = useMemo(() => {
    const configured = (import.meta.env.VITE_PUBLIC_APP_URL || '').trim();
    const fallback = window.location.origin;
    return (configured || fallback).replace(/\/+$/, '');
  }, []);

  const passwordStrength = useMemo(() => {
    const value = newPassword || '';
    let score = 0;
    if (value.length >= 8) score += 1;
    if (/[A-Z]/.test(value)) score += 1;
    if (/[a-z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    if (score <= 2) return { label: 'Weak', color: 'bg-red-500', width: 'w-1/3' };
    if (score <= 4) return { label: 'Medium', color: 'bg-amber-500', width: 'w-2/3' };
    return { label: 'Strong', color: 'bg-emerald-500', width: 'w-full' };
  }, [newPassword]);

  useEffect(() => {
    let mounted = true;

    const checkRecoverySession = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const type = url.searchParams.get('type');
      const hash = window.location.hash || '';
      const hasRecoveryType = type === 'recovery' || hash.includes('type=recovery');
      const hasRecoveryIndicators =
        hasRecoveryType || !!code || hash.includes('access_token=') || hash.includes('token=');
      recoveryContextRef.current = hasRecoveryIndicators;

      try {
        if (code && hasRecoveryType) {
          await supabase.auth.exchangeCodeForSession(code);
        }

        const { data } = await supabase.auth.getSession();
        const hasUserSession = !!data?.session?.user;

        if (!mounted) return;
        if (hasRecoveryIndicators && hasUserSession) {
          setIsRecoveryMode(true);
          setStatus({
            type: 'info',
            message: 'Email verified for password reset. Enter your new password below.'
          });
          // Clean URL params/hash so reopening /reset-password does not keep recovery context.
          window.history.replaceState({}, document.title, '/reset-password');
          recoveryContextRef.current = false;
        } else {
          setIsRecoveryMode(false);
          recoveryContextRef.current = false;
          setStatus((prev) =>
            prev.type === 'info'
              ? { type: '', message: '' }
              : prev
          );
        }
      } catch {
        // keep request mode
        if (!mounted) return;
        setIsRecoveryMode(false);
      }
    };

    checkRecoverySession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if ((event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && recoveryContextRef.current)) && session?.user) {
        setIsRecoveryMode(true);
        setStatus({
          type: 'info',
          message: 'Recovery session verified. Set your new password now.'
        });
        window.history.replaceState({}, document.title, '/reset-password');
        recoveryContextRef.current = false;
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSendResetLink = async (e) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setStatus({ type: 'error', message: 'Please enter your email address.' });
      return;
    }

    setSending(true);
    setStatus({ type: '', message: '' });
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${appBaseUrl}/reset-password-confirm`
      });
      if (error) throw error;

      setStatus({
        type: 'success',
        message: `If this email is registered, a reset link has been sent. Continue from ${appBaseUrl}/reset-password-confirm`
      });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Failed to send reset link.' });
    } finally {
      setSending(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      setStatus({ type: 'error', message: 'Please enter and confirm your new password.' });
      return;
    }
    if (newPassword.length < 6) {
      setStatus({ type: 'error', message: 'Password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus({ type: 'error', message: 'Passwords do not match.' });
      return;
    }

    setUpdating(true);
    setStatus({ type: '', message: '' });
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setStatus({ type: 'success', message: 'Password updated successfully. Redirecting to login...' });
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate('/login');
      }, 1200);
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Failed to update password.' });
    } finally {
      setUpdating(false);
    }
  };

  const statusClass =
    status.type === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : status.type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-blue-200 bg-blue-50 text-blue-700';

  return (
    <AuthShell
      title="Reset your password securely"
      subtitle={
        isRecoveryMode
          ? 'Recovery session verified. Set a strong new password and continue securely.'
          : 'Enter your email and SucessKart will send a secure reset link to start recovery.'
      }
      highlights={[
        { icon: ShieldCheck, text: 'Secure token-based reset flow with verified recovery sessions.' },
        { icon: Mail, text: 'Reset links are delivered to your registered email address.' },
        { icon: KeyRound, text: 'Changing the password signs out old sessions and protects the account.' },
      ]}
      footerLabel="Remembered your password?"
      footerLinkTo="/login"
      footerLinkText="Back to login"
      rightTitle={isRecoveryMode ? 'Set New Password' : 'Reset Password'}
      rightSubtitle={isRecoveryMode ? 'Step 2 of 2' : 'Step 1 of 2'}
      progress={[!isRecoveryMode, isRecoveryMode]}
    >
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60 sm:p-6">
        <div className="mb-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-amber-700 px-4 py-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Password Recovery</p>
          <p className="mt-2 text-sm text-slate-100">
            {isRecoveryMode
              ? 'Choose a strong password and confirm it before returning to login.'
              : 'Enter your registered email to receive a secure reset link.'}
          </p>
        </div>

        {status.message ? (
          <div className={`mb-5 rounded-xl border p-3 text-sm ${statusClass}`}>
            {status.message}
          </div>
        ) : null}

        {!isRecoveryMode ? (
          <form onSubmit={handleSendResetLink} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">Email Address</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-slate-900 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
                required
              />
            </div>
            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 font-bold text-white shadow-lg shadow-amber-200/70 transition hover:from-amber-600 hover:to-amber-700 disabled:opacity-60"
            >
              {sending ? 'Sending Reset Link...' : 'Send Reset Link'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">New Password</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 pr-11 text-slate-900 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                aria-label="Toggle new password visibility"
              >
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <div className="space-y-1">
              <div className="overflow-hidden rounded bg-slate-200">
                <div className={`h-2 ${passwordStrength.color} ${passwordStrength.width} transition-all`} />
              </div>
              <p className="text-xs text-slate-500">Password strength: {passwordStrength.label}</p>
            </div>

            <label className="block text-sm font-medium text-slate-700">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 pr-11 text-slate-900 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                aria-label="Toggle confirm password visibility"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <KeyRound size={14} />
              Minimum 8+ characters recommended with mixed-case, number and symbol.
            </p>

            <button
              type="submit"
              disabled={updating}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 font-bold text-white shadow-lg shadow-amber-200/70 transition hover:from-amber-600 hover:to-amber-700 disabled:opacity-60"
            >
              <CheckCircle2 size={18} />
              {updating ? 'Updating Password...' : 'Set New Password'}
            </button>
          </form>
        )}
      </div>

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft size={18} />
          Back to Login
        </button>
        <Link
          to="/register"
          className="inline-flex flex-1 items-center justify-center rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800"
        >
          Create Account
        </Link>
      </div>
    </AuthShell>
  );
};

export default ResetPassword;
