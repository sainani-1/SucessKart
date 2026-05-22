import React, { useEffect, useState } from 'react';
import { Link2, Plus, Check, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import usePopup from '../hooks/usePopup.jsx';
import { logError } from '../utils/errorLogger';

const AdminStartupCollaborations = () => {
  const { popupNode, openPopup } = usePopup();
  const [loading, setLoading] = useState(true);
  const [ideas, setIdeas] = useState([]);
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState({
    idea_id: '',
    requester_id: '',
    message: '',
    status: 'accepted'
  });
  const [studentQuery, setStudentQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ideasResp, studentsResp, recordsResp] = await Promise.all([
        supabase
          .from('startup_ideas')
          .select('id, title, user_id, owner:profiles!startup_ideas_user_id_fkey(full_name, email)')
          .eq('status', 'approved')
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('role', 'student')
          .order('full_name', { ascending: true }),
        supabase
          .from('startup_collaborations')
          .select('id, status, message, created_at, idea:startup_ideas(title), owner:profiles!startup_collaborations_owner_id_fkey(full_name), requester:profiles!startup_collaborations_requester_id_fkey(full_name)')
          .order('created_at', { ascending: false })
      ]);

      if (ideasResp.error) throw ideasResp.error;
      if (studentsResp.error) throw studentsResp.error;
      if (recordsResp.error) throw recordsResp.error;

      setIdeas(ideasResp.data || []);
      setStudents(studentsResp.data || []);
      setRecords(recordsResp.data || []);
    } catch (error) {
      logError({ message: 'Error loading admin collaborations:', source: 'AdminStartupCollaborations', details: error });
      openPopup('Load failed', error.message || 'Could not load data.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedIdea = ideas.find((i) => String(i.id) === String(form.idea_id));
  const eligibleStudents = students.filter((s) => String(s.id) !== String(selectedIdea?.user_id || ''));
  const matchedStudents = !studentQuery.trim()
    ? []
    : eligibleStudents
        .filter(
          (s) =>
            (s.full_name || '').toLowerCase().includes(studentQuery.trim().toLowerCase()) ||
            (s.email || '').toLowerCase().includes(studentQuery.trim().toLowerCase())
        )
        .slice(0, 10);

  const createCollab = async (e) => {
    e.preventDefault();
    if (!selectedIdea || !form.requester_id || !form.message.trim()) {
      openPopup('Missing fields', 'Select idea, requester, and message.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('startup_collaborations').insert({
        idea_id: selectedIdea.id,
        owner_id: selectedIdea.user_id,
        requester_id: form.requester_id,
        message: form.message.trim(),
        status: form.status
      });
      if (error) throw error;

      setForm({ idea_id: '', requester_id: '', message: '', status: 'accepted' });
      setStudentQuery('');
      openPopup('Created', 'Startup collaboration added successfully.', 'success');
      await loadData();
    } catch (error) {
      logError({ message: 'Error creating collaboration:', source: 'AdminStartupCollaborations', details: error });
      openPopup('Create failed', error.message || 'Could not create collaboration.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      const { error } = await supabase
        .from('startup_collaborations')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (error) {
      openPopup('Update failed', error.message || 'Could not update status.', 'error');
    }
  };

  const badgeClass = (status) => {
    if (status === 'accepted') return 'bg-green-100 text-green-700';
    if (status === 'rejected') return 'bg-red-100 text-red-700';
    return 'bg-yellow-100 text-yellow-700';
  };

  if (loading) return <LoadingSpinner message="Loading startup collaborations..." />;

  return (
    <div className="space-y-5">
      {popupNode}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Startup Collaborations</h1>
        <p className="text-slate-500 text-sm">Create and manage startup collaboration links.</p>
      </div>

      <form onSubmit={createCollab} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <Plus size={16} />
          Add Startup Collaboration
        </h2>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Approved Idea</label>
          <select
            value={form.idea_id}
            onChange={(e) => {
              setForm((p) => ({ ...p, idea_id: e.target.value, requester_id: '' }));
              setStudentQuery('');
            }}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select approved idea</option>
            {ideas.map((idea) => (
              <option key={idea.id} value={idea.id}>
                {idea.title} - {idea.owner?.full_name || 'Owner'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Collaborator (Requester)</label>
          <input
            type="text"
            value={studentQuery}
            onChange={(e) => {
              setStudentQuery(e.target.value);
              setForm((p) => ({ ...p, requester_id: '' }));
            }}
            placeholder="Search by name or email..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          {matchedStudents.length > 0 && !form.requester_id && (
            <div className="mt-2 border rounded-lg max-h-44 overflow-auto">
              {matchedStudents.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setForm((p) => ({ ...p, requester_id: s.id }));
                    setStudentQuery(`${s.full_name} (${s.email})`);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-b-0"
                >
                  <p className="text-sm font-medium text-slate-800">{s.full_name}</p>
                  <p className="text-xs text-slate-500">{s.email}</p>
                </button>
              ))}
            </div>
          )}
          {form.requester_id && (
            <p className="mt-2 text-xs text-emerald-700">
              Selected:{' '}
              {eligibleStudents.find((s) => String(s.id) === String(form.requester_id))?.full_name || 'Student'}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Message</label>
          <textarea
            value={form.message}
            onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Admin collaboration note..."
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Initial Status</label>
          <select
            value={form.status}
            onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="accepted">Accepted</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 bg-nani-dark text-white px-4 py-2 rounded-lg hover:bg-nani-accent disabled:opacity-60"
        >
          <Link2 size={16} />
          {saving ? 'Adding...' : 'Add Collaboration'}
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900 mb-3">All Collaboration Records</h2>
        {records.length === 0 ? (
          <p className="text-sm text-slate-500">No collaboration records.</p>
        ) : (
          <div className="space-y-3">
            {records.map((row) => (
              <div key={row.id} className="border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-900">{row.idea?.title || 'Idea'}</p>
                <p className="text-xs text-slate-600 mt-1">
                  Owner: {row.owner?.full_name || '-'} | Collaborator: {row.requester?.full_name || '-'}
                </p>
                <p className="text-sm text-slate-700 mt-2">{row.message}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${badgeClass(row.status)}`}>{row.status}</span>
                  <button
                    onClick={() => updateStatus(row.id, 'accepted')}
                    className="inline-flex items-center gap-1 text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                  >
                    <Check size={12} />
                    Accept
                  </button>
                  <button
                    onClick={() => updateStatus(row.id, 'rejected')}
                    className="inline-flex items-center gap-1 text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                  >
                    <X size={12} />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminStartupCollaborations;
