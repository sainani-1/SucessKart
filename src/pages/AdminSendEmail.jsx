import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Mail, Send, X } from 'lucide-react';
import AlertModal from '../components/AlertModal';

const AdminSendEmail = () => {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [sending, setSending] = useState(false);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

  const clearForm = () => {
    setTo('');
    setSubject('');
    setHtml('');
  };

  const handleSend = async () => {
    if (!to.trim()) {
      setAlertModal({ show: true, title: 'Required', message: 'Please enter at least one recipient email.', type: 'warning' });
      return;
    }
    if (!subject.trim()) {
      setAlertModal({ show: true, title: 'Required', message: 'Please enter a subject.', type: 'warning' });
      return;
    }
    if (!html.trim()) {
      setAlertModal({ show: true, title: 'Required', message: 'Please enter the email content (HTML).', type: 'warning' });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-send-email', {
        body: {
          to: to.trim(),
          subject: subject.trim(),
          html: html.trim(),
        },
      });

      if (error) {
        let detail = error.message;
        try {
          const ctx = await error.context?.clone()?.json();
          if (ctx?.error) detail = ctx.error;
        } catch {}
        throw new Error(detail);
      }

      setAlertModal({
        show: true,
        title: 'Email Sent',
        message: `Email sent successfully${data?.id ? ` (ID: ${data.id})` : ''}.`,
        type: 'success',
      });
      clearForm();
    } catch (error) {
      setAlertModal({
        show: true,
        title: 'Send Failed',
        message: error.message || 'Failed to send email. Check that RESEND_API_KEY is configured.',
        type: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 to-slate-700 p-6 rounded-xl text-white">
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <Mail size={24} /> Send Email
        </h1>
        <p className="text-slate-200">Send emails to users via Resend. Supports HTML content.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">To <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="user@example.com (comma-separated for multiple)"
            className="w-full p-3 border border-slate-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Subject <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            className="w-full p-3 border border-slate-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">HTML Content <span className="text-red-500">*</span></label>
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder="<h1>Hello!</h1><p>Your email content here...</p>"
            rows="12"
            className="w-full p-3 border border-slate-300 rounded-lg font-mono text-sm resize-y"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={clearForm}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50"
          >
            <X size="16" /> Clear
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            <Send size="16" /> {sending ? 'Sending...' : 'Send Email'}
          </button>
        </div>
      </div>

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

export default AdminSendEmail;
