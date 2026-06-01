import React, { useEffect, useMemo, useState } from 'react';
import { Download, Mail, MessageSquare, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import { logError } from '../utils/errorLogger';

const interestLabels = {
  sample_test: 'Free sample test',
  resume_template: 'Free resume template',
  certificate_verify: 'Certificate verification',
  campus_ambassador: 'Campus ambassador',
  premium_interest: 'Premium callback',
};

const AdminLeadInbox = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [leads, setLeads] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const [supportsResponseFields, setSupportsResponseFields] = useState(true);

  const loadLeads = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const detailedResponse = await supabase
        .from('marketing_leads')
        .select(`
          id,
          name,
          email,
          phone,
          interest_type,
          source,
          notes,
          status,
          admin_response,
          responded_at,
          updated_at,
          created_at,
          responder:profiles!marketing_leads_responded_by_fkey(full_name, email)
        `)
        .order('created_at', { ascending: false });

      let rows = detailedResponse.data || [];
      let canRespond = !detailedResponse.error;

      if (detailedResponse.error) {
        const fallbackResponse = await supabase
          .from('marketing_leads')
          .select('id, name, email, phone, interest_type, source, notes, created_at')
          .order('created_at', { ascending: false });

        if (fallbackResponse.error) {
          throw fallbackResponse.error;
        }

        rows = (fallbackResponse.data || []).map((row) => ({
          ...row,
          status: 'pending',
          admin_response: '',
          responded_at: null,
          responder: null,
        }));
      }

      setSupportsResponseFields(canRespond);
      setLeads(rows);
      setDrafts(
        Object.fromEntries(
          rows.map((row) => [
            row.id,
            {
              status: row.status || 'pending',
              admin_response: row.admin_response || '',
            },
          ])
        )
      );
    } catch (error) {
      logError({ message: 'Error loading leads:', source: 'AdminLeadInbox', details: error });
      setErrorMessage(error.message || 'Failed to load leads.');
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, []);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
      const matchesSearch =
        !q ||
        [lead.name, lead.email, lead.phone, lead.notes, lead.admin_response, lead.interest_type, lead.source]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [leads, search, statusFilter]);

  const updateDraft = (id, key, value) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || { status: 'pending', admin_response: '' }),
        [key]: value,
      },
    }));
  };

  const saveLeadResponse = async (leadId) => {
    const draft = drafts[leadId];
    if (!draft) return;
    if (!supportsResponseFields) return;
    setSavingId(leadId);
    try {
      const nextStatus =
        draft.admin_response.trim() && draft.status === 'pending'
          ? 'responded'
          : draft.status;
      await supabase
        .from('marketing_leads')
        .update({
          status: nextStatus,
          admin_response: draft.admin_response.trim() || null,
          responded_at: draft.admin_response.trim() ? new Date().toISOString() : null,
          responded_by: draft.admin_response.trim() ? profile?.id || null : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId);
      setErrorMessage('');
      await loadLeads();
    } catch (error) {
      logError({ message: 'Error saving lead response:', source: 'AdminLeadInbox', details: error });
      setErrorMessage(error.message || 'Failed to save response.');
    } finally {
      setSavingId(null);
    }
  };

  const exportToExcelFriendlyCsv = () => {
    const rows = filteredLeads.map((lead) => ({
      Name: lead.name || '',
      Email: lead.email || '',
      Phone: lead.phone || '',
      Interest: interestLabels[lead.interest_type] || lead.interest_type || '',
      Source: lead.source || '',
      Notes: lead.notes || '',
      Status: lead.status || '',
      AdminResponse: lead.admin_response || '',
      RespondedAt: lead.responded_at ? new Date(lead.responded_at).toLocaleString('en-IN') : '',
      CreatedAt: lead.created_at ? new Date(lead.created_at).toLocaleString('en-IN') : '',
    }));

    const headers = Object.keys(rows[0] || {
      Name: '',
      Email: '',
      Phone: '',
      Interest: '',
      Source: '',
      Notes: '',
      Status: '',
      AdminResponse: '',
      RespondedAt: '',
      CreatedAt: '',
    });
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((header) => `"${String(row[header] || '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SucessKart-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <LoadingSpinner message="Loading lead inbox..." />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-slate-950 via-nani-dark to-blue-900 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Lead Inbox</h1>
            <p className="text-slate-200">Only admins can see and respond to submitted marketing leads.</p>
          </div>
          <button
            type="button"
            onClick={exportToExcelFriendlyCsv}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 font-semibold text-white hover:bg-white/15"
          >
            <Download size={18} />
            Export Excel CSV
          </button>
        </div>
      </div>

      {!supportsResponseFields ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Lead list is visible, but response/status fields are not available until the migration
          `20260310_marketing_lead_responses.sql` is applied.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads..."
              className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            {['pending', 'responded', 'closed', 'all'].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  statusFilter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredLeads.length === 0 ? (
          <div className="rounded-xl border bg-white p-8 text-center text-slate-500">No leads found.</div>
        ) : (
          filteredLeads.map((lead) => {
            const draft = drafts[lead.id] || { status: lead.status || 'pending', admin_response: lead.admin_response || '' };
            return (
              <div key={lead.id} className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">{lead.name || 'Unnamed lead'}</h2>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        lead.status === 'responded'
                          ? 'bg-emerald-100 text-emerald-700'
                          : lead.status === 'closed'
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {lead.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{interestLabels[lead.interest_type] || lead.interest_type}</p>
                    <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-2"><Mail size={14} /> {lead.email}</span>
                      <span>{lead.phone || 'No phone'}</span>
                      <span>{lead.source || 'home_page'}</span>
                      <span>{new Date(lead.created_at).toLocaleString('en-IN')}</span>
                    </div>
                    {lead.notes ? (
                      <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                        <p className="font-semibold text-slate-900">Lead message</p>
                        <p className="mt-1 whitespace-pre-wrap">{lead.notes}</p>
                      </div>
                    ) : null}
                    {lead.admin_response ? (
                      <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
                        <p className="font-semibold">Last admin response</p>
                        <p className="mt-1 whitespace-pre-wrap">{lead.admin_response}</p>
                        <p className="mt-2 text-xs text-blue-700">
                          {lead.responder?.full_name || lead.responder?.email || 'Admin'} • {lead.responded_at ? new Date(lead.responded_at).toLocaleString('en-IN') : '—'}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="w-full lg:w-[420px] space-y-3">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">Status</label>
                      <select
                        value={draft.status}
                        onChange={(e) => updateDraft(lead.id, 'status', e.target.value)}
                        disabled={!supportsResponseFields}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="pending">Pending</option>
                        <option value="responded">Responded</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">Admin response</label>
                      <textarea
                        rows={5}
                        value={draft.admin_response}
                        onChange={(e) => updateDraft(lead.id, 'admin_response', e.target.value)}
                        placeholder="Write your response or follow-up notes here..."
                        disabled={!supportsResponseFields}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => saveLeadResponse(lead.id)}
                      disabled={savingId === lead.id || !supportsResponseFields}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      <MessageSquare size={16} />
                      {savingId === lead.id ? 'Saving...' : 'Save Response'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AdminLeadInbox;
