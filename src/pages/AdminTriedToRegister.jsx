import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import AlertModal from '../components/AlertModal';
import { Mail, RefreshCw, Search } from 'lucide-react';

const AdminTriedToRegister = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });
  const [resendingEmail, setResendingEmail] = useState(null);

  const fetchUnconfirmedUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase.functions.invoke('list-unconfirmed-users', {
        method: 'POST',
      });

      if (error) throw new Error(error.message || 'Failed to fetch unconfirmed users');

      setUsers(data?.users || []);
    } catch (err) {
      setError(err.message || 'Failed to load unconfirmed users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnconfirmedUsers();
  }, [fetchUnconfirmedUsers]);

  const resendVerification = async (email) => {
    setResendingEmail(email);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/login?confirmed=true`,
        },
      });
      if (error) throw error;
      setAlertModal({
        show: true,
        title: 'Verification Email Sent',
        message: `Verification email has been resent to ${email}.`,
        type: 'success',
      });
    } catch (err) {
      setAlertModal({
        show: true,
        title: 'Failed',
        message: err.message || 'Failed to resend verification email.',
        type: 'error',
      });
    } finally {
      setResendingEmail(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (u.email || '').toLowerCase().includes(term) ||
      (u.id || '').toLowerCase().includes(term) ||
      (u.user_metadata?.full_name || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Mail className="text-orange-500" size={28} />
            Tried to Register
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Users who registered but have not confirmed their email address.
          </p>
        </div>
        <button
          onClick={fetchUnconfirmedUsers}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-nani-dark text-white rounded-xl hover:bg-nani-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
          <button
            onClick={fetchUnconfirmedUsers}
            className="ml-2 underline font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          placeholder="Search by email, name, or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-nani-light focus:border-transparent outline-none"
        />
      </div>

      {loading ? (
        <LoadingSpinner message="Loading unconfirmed users..." />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">
              Total Unconfirmed: {users.length}
            </span>
            <span className="text-xs text-slate-500">
              {filteredUsers.length !== users.length ? `Showing ${filteredUsers.length}` : ''}
            </span>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              {searchTerm ? 'No users match your search.' : 'No unconfirmed users found.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Phone</th>
                    <th className="px-4 py-3 text-left">Registered At</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {u.user_metadata?.full_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <span className="inline-flex items-center gap-1.5">
                          <Mail size={14} className="text-slate-400" />
                          {u.email || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {u.phone || u.user_metadata?.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {u.created_at
                          ? new Date(u.created_at).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => resendVerification(u.email)}
                          disabled={resendingEmail === u.email}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-xs font-semibold disabled:opacity-50"
                        >
                          <Mail size={14} />
                          {resendingEmail === u.email ? 'Sending...' : 'Resend Verification'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
    </div>
  );
};

export default AdminTriedToRegister;
