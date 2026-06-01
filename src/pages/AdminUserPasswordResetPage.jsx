import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShieldAlert, KeyRound } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { logAdminActivity } from '../utils/adminActivityLogger';

const DEFAULT_PASSWORD = import.meta.env.VITE_DEFAULT_USER_PASSWORD || 'SucessKart@123';
const SUPABASE_FUNCTIONS_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const readFunctionErrorMessage = async (error, fallback) => {
  try {
    const response = error?.context;
    if (!response) return fallback;
    const text = await response.text();
    return text || fallback;
  } catch {
    return fallback;
  }
};

const AdminUserPasswordResetPage = () => {
  const { realProfile } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [passwordMode, setPasswordMode] = useState('default');
  const [customPassword, setCustomPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [debugInfo, setDebugInfo] = useState(null);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, auth_user_id, full_name, email, role, deleted_at')
          .is('deleted_at', null)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setUsers((data || []).filter((user) => user.auth_user_id));
      } catch (error) {
        setMessage({ type: 'error', text: error.message || 'Failed to load users.' });
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users.slice(0, 50);
    return users
      .filter((user) =>
        [user.full_name, user.email, user.role].some((value) =>
          String(value || '').toLowerCase().includes(term)
        )
      )
      .slice(0, 50);
  }, [search, users]);

  const selectedUser = users.find((user) => user.id === selectedUserId) || null;
  const nextPassword = passwordMode === 'default' ? DEFAULT_PASSWORD : customPassword;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage({ type: '', text: '' });

    if (!selectedUser) {
      setMessage({ type: 'error', text: 'Select a user first.' });
      return;
    }

    if (String(nextPassword || '').trim().length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }

    setSaving(true);
    try {
      const {
        data: refreshed,
        error: refreshError,
      } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;

      let accessToken = refreshed.session?.access_token || '';
      if (!accessToken) {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        accessToken = session?.access_token || '';
      }
      if (!accessToken) {
        throw new Error('Admin session expired. Please login again.');
      }

      try {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        setDebugInfo({
          userId: refreshed.session?.user?.id || null,
          email: refreshed.session?.user?.email || null,
          ref: payload?.ref || null,
          iss: payload?.iss || null,
          role: payload?.role || null,
          exp: payload?.exp || null,
        });
      } catch {
        setDebugInfo({
          userId: refreshed.session?.user?.id || null,
          email: refreshed.session?.user?.email || null,
          ref: null,
          iss: null,
          role: null,
          exp: null,
        });
      }

      const response = await fetch(`${SUPABASE_FUNCTIONS_BASE_URL}/admin-reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          user_id: selectedUser.auth_user_id || selectedUser.id,
          email: selectedUser.email,
          new_password: nextPassword.trim(),
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Password reset failed with status ${response.status}.`);
      }

      await logAdminActivity({
        adminId: realProfile?.id,
        eventType: 'security',
        action: 'Reset user password',
        target: selectedUser.id,
        details: {
          module: 'admin-user-password-reset',
          target_email: selectedUser.email || null,
          mode: passwordMode,
        },
      });

      setMessage({
        type: 'success',
        text:
          passwordMode === 'default'
            ? `Password reset to default: ${DEFAULT_PASSWORD}`
            : 'Password updated successfully.',
      });
      if (passwordMode === 'custom') {
        setCustomPassword('');
      }
    } catch (error) {
      const detailedMessage = await readFunctionErrorMessage(
        error,
        error.message || 'Failed to reset password.'
      );
      setMessage({ type: 'error', text: detailedMessage });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950 p-6 shadow-2xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">Admin Secure Reset</p>
              <h1 className="mt-2 text-3xl font-bold">Reset User Password</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                This page is hidden from navigation and requires a fresh MFA check before opening.
              </p>
            </div>
            <Link
              to="/app"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Back To Dashboard
            </Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="mb-4 flex items-center gap-3">
              <Search className="h-5 w-5 text-cyan-300" />
              <div>
                <h2 className="font-semibold text-white">Find User</h2>
                <p className="text-sm text-slate-400">Search by name, email, or role.</p>
              </div>
            </div>

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search user..."
              className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400"
            />

            <div className="mt-4 max-h-[460px] space-y-3 overflow-y-auto pr-1">
              {loading ? (
                <p className="text-sm text-slate-400">Loading users...</p>
              ) : filteredUsers.length ? (
                filteredUsers.map((user) => {
                  const isSelected = user.id === selectedUserId;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setSelectedUserId(user.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-500/10'
                          : 'border-white/10 bg-slate-900/50 hover:border-white/20 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{user.full_name || 'Unnamed User'}</p>
                          <p className="text-sm text-slate-400">{user.email || 'No email'}</p>
                        </div>
                        <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-wide text-slate-300">
                          {user.role || 'user'}
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className="text-sm text-slate-400">No users matched your search.</p>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="rounded-3xl border border-white/10 bg-white p-6 text-slate-900 shadow-2xl">
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-cyan-700" />
              <div>
                <h2 className="font-semibold text-slate-900">Reset Form</h2>
                <p className="text-sm text-slate-500">Choose default password or set a custom one.</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Selected User</p>
              <p className="mt-2 text-lg font-semibold">{selectedUser?.full_name || 'No user selected'}</p>
              <p className="text-sm text-slate-600">{selectedUser?.email || 'Choose a user from the list'}</p>
            </div>

            <div className="mt-5 space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
                <input
                  type="radio"
                  name="passwordMode"
                  value="default"
                  checked={passwordMode === 'default'}
                  onChange={() => setPasswordMode('default')}
                  className="mt-1"
                />
                <div>
                  <p className="font-semibold text-slate-900">Use default password</p>
                  <p className="text-sm text-slate-500">Default password: {DEFAULT_PASSWORD}</p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
                <input
                  type="radio"
                  name="passwordMode"
                  value="custom"
                  checked={passwordMode === 'custom'}
                  onChange={() => setPasswordMode('custom')}
                  className="mt-1"
                />
                <div className="w-full">
                  <p className="font-semibold text-slate-900">Set custom password</p>
                  <input
                    type="text"
                    value={customPassword}
                    onChange={(event) => setCustomPassword(event.target.value)}
                    placeholder="Enter new password"
                    disabled={passwordMode !== 'custom'}
                    className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 disabled:bg-slate-100"
                  />
                </div>
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5" />
                <p>Only use this for verified support requests. Every reset should be treated as sensitive admin activity.</p>
              </div>
            </div>

            {message.text ? (
              <div
                className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
                  message.type === 'error'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
            {message.text}
          </div>
        ) : null}

            {debugInfo ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                <p><span className="font-semibold">Debug user:</span> {debugInfo.email || debugInfo.userId || '-'}</p>
                <p><span className="font-semibold">JWT ref:</span> {debugInfo.ref || '-'}</p>
                <p><span className="font-semibold">JWT role:</span> {debugInfo.role || '-'}</p>
                <p><span className="font-semibold">JWT issuer:</span> {debugInfo.iss || '-'}</p>
                <p><span className="font-semibold">JWT exp:</span> {debugInfo.exp || '-'}</p>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={saving || !selectedUser}
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Resetting Password...' : 'Reset Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminUserPasswordResetPage;
