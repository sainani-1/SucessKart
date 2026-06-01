import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const DEFAULT_SUPPORT_EMAIL = 'support@SucessKart.com';

const AdminResetPassword = () => {
  const [supportEmail, setSupportEmail] = useState(DEFAULT_SUPPORT_EMAIL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    const loadSupportEmail = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'password_reset_support_email')
          .maybeSingle();
        if (error) throw error;
        if (data?.value) setSupportEmail(data.value);
      } catch (err) {
        setMessage({ type: 'error', text: err.message || 'Failed to load support email setting.' });
      } finally {
        setLoading(false);
      }
    };
    loadSupportEmail();
  }, []);

  const saveSupportEmail = async (event) => {
    event.preventDefault();
    setMessage({ type: '', text: '' });

    const trimmed = supportEmail.trim().toLowerCase();
    if (!trimmed) {
      setMessage({ type: 'error', text: 'Please enter a support email.' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('settings')
        .upsert(
          { key: 'password_reset_support_email', value: trimmed },
          { onConflict: 'key' }
        );
      if (error) throw error;
      setSupportEmail(trimmed);
      setMessage({ type: 'success', text: 'Password reset support email updated.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to save support email.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-slate-600">Loading reset password settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 rounded-xl text-white">
        <h1 className="text-2xl font-bold mb-1">Reset Password Mail</h1>
        <p className="text-blue-100">Set the email ID shown to users on the Reset Password page.</p>
      </div>

      <form onSubmit={saveSupportEmail} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <label className="block text-sm font-semibold text-slate-700">Support Mail ID</label>
        <input
          type="email"
          className="w-full border rounded-lg px-3 py-2"
          value={supportEmail}
          onChange={(e) => setSupportEmail(e.target.value)}
          placeholder="support@SucessKart.com"
          required
        />
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 rounded-lg bg-slate-900 text-white font-semibold disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Mail ID'}
        </button>

        {message.text ? (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              message.type === 'error'
                ? 'bg-red-50 border border-red-200 text-red-700'
                : 'bg-green-50 border border-green-200 text-green-700'
            }`}
          >
            {message.text}
          </div>
        ) : null}
      </form>
    </div>
  );
};

export default AdminResetPassword;

