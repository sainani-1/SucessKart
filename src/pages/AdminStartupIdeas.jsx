import React, { useEffect, useState } from 'react';
import { Check, X, MessageSquare } from 'lucide-react';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import usePopup from '../hooks/usePopup.jsx';
import { useAuth } from '../context/AuthContext';
import { logError } from '../utils/errorLogger';

const AdminStartupIdeas = () => {
  const { profile } = useAuth();
  const { popupNode, openPopup } = usePopup();
  const [loading, setLoading] = useState(true);
  const [ideas, setIdeas] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [messageById, setMessageById] = useState({});

  const pushNotification = async (payload) => {
    try {
      const { error } = await supabase.from('admin_notifications').insert(payload);
      if (
        error &&
        String(error.message || '').includes('target_user_id')
      ) {
        const { target_user_id, ...fallback } = payload;
        const marker = target_user_id ? `[target_user_id:${target_user_id}] ` : '';
        await supabase.from('admin_notifications').insert({
          ...fallback,
          content:
            marker && !String(fallback.content || '').includes('[target_user_id:')
              ? `${marker}${fallback.content || ''}`
              : fallback.content,
        });
      }
    } catch {
      // Keep review flow resilient even if notification insert fails.
    }
  };

  const loadIdeas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('startup_ideas')
        .select('id, title, idea, status, admin_message, created_at, reviewed_at, user_id, user:profiles!startup_ideas_user_id_fkey(full_name, email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setIdeas(data || []);
    } catch (error) {
      logError({ message: 'Error loading startup ideas:', source: 'AdminStartupIdeas', details: error });
      openPopup('Load failed', error.message || 'Could not load startup ideas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIdeas();
  }, []);

  const updateIdeaStatus = async (ideaId, status) => {
    try {
      const adminMessage = (messageById[ideaId] || '').trim();
      const idea = ideas.find((item) => item.id === ideaId);
      const { error } = await supabase
        .from('startup_ideas')
        .update({
          status,
          admin_message: adminMessage || null,
          reviewed_by: profile?.id || null,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', ideaId);
      if (error) throw error;

      if (idea?.user_id) {
        await pushNotification({
          title: 'Startup Idea Reviewed',
          content: `Your startup idea "${idea?.title || 'Idea'}" was ${status}.${adminMessage ? ` ${adminMessage}` : ''}`,
          type: status === 'approved' ? 'success' : 'warning',
          target_role: 'student',
          target_user_id: idea.user_id,
          admin_id: profile?.id || null,
        });
      }
      openPopup('Updated', `Idea ${status} successfully.`, 'success');
      await loadIdeas();
    } catch (error) {
      logError({ message: 'Error updating startup idea:', source: 'AdminStartupIdeas', details: error });
      openPopup('Update failed', error.message || 'Could not update idea.', 'error');
    }
  };

  const visibleIdeas = ideas.filter((item) => (filter === 'all' ? true : item.status === filter));

  const badgeClass = (status) => {
    if (status === 'approved') return 'bg-green-100 text-green-800';
    if (status === 'rejected') return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
  };

  return (
    <div className="space-y-5">
      {popupNode}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Startup Ideas - Admin</h1>
          <p className="text-slate-500 text-sm">Review student startup ideas and send admin message.</p>
        </div>
        <div className="flex gap-2">
          {['all', 'pending', 'approved', 'rejected'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                filter === s ? 'bg-nani-dark text-white' : 'bg-white border border-slate-300 text-slate-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Loading startup ideas..." />
      ) : visibleIdeas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-slate-500">No startup ideas found.</div>
      ) : (
        <div className="space-y-4">
          {visibleIdeas.map((item) => (
            <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{item.title}</p>
                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{item.idea}</p>
                  <p className="text-xs text-slate-500 mt-2">
                    By {item.user?.full_name || 'Student'} ({item.user?.email || '-'}) on {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${badgeClass(item.status)}`}>{item.status}</span>
              </div>

              <div className="mt-3">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <MessageSquare size={14} />
                  Admin Message
                </label>
                <textarea
                  value={messageById[item.id] ?? item.admin_message ?? ''}
                  onChange={(e) => setMessageById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  rows={3}
                  placeholder="Write message for student (optional)"
                  className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => updateIdeaStatus(item.id, 'approved')}
                  className="inline-flex items-center gap-1 bg-green-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-green-700"
                >
                  <Check size={15} />
                  Approve
                </button>
                <button
                  onClick={() => updateIdeaStatus(item.id, 'rejected')}
                  className="inline-flex items-center gap-1 bg-red-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-red-700"
                >
                  <X size={15} />
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminStartupIdeas;
