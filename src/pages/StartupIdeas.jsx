import React, { useEffect, useState } from 'react';
import { Lightbulb, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import usePopup from '../hooks/usePopup.jsx';
import { logError } from '../utils/errorLogger';

const StartupIdeas = () => {
  const { profile } = useAuth();
  const { popupNode, openPopup } = usePopup();
  const [title, setTitle] = useState('');
  const [idea, setIdea] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ideas, setIdeas] = useState([]);

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
      // Ignore notification insert errors for idea submission.
    }
  };

  const loadMyIdeas = async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('startup_ideas')
        .select('id, title, idea, status, admin_message, created_at, reviewed_at')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setIdeas(data || []);
    } catch (error) {
      logError({ message: 'Error loading startup ideas:', source: 'StartupIdeas', details: error })
      openPopup('Load failed', error.message || 'Could not load ideas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMyIdeas();
  }, [profile?.id]);

  const submitIdea = async (e) => {
    e.preventDefault();
    if (!title.trim() || !idea.trim()) {
      openPopup('Missing fields', 'Please enter both title and idea details.', 'warning');
      return;
    }
    if (!profile?.id) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('startup_ideas').insert({
        user_id: profile.id,
        title: title.trim(),
        idea: idea.trim(),
        status: 'pending'
      });
      if (error) throw error;
      await pushNotification({
        title: 'New Startup Idea',
        content: `${profile?.full_name || 'Student'} submitted startup idea "${title.trim()}".`,
        type: 'info',
        target_role: 'admin',
        admin_id: profile?.id || null,
      });
      setTitle('');
      setIdea('');
      openPopup('Submitted', 'Your startup idea was submitted to admin.', 'success');
      await loadMyIdeas();
    } catch (error) {
      logError({ message: 'Error submitting startup idea:', source: 'StartupIdeas', details: error })
      openPopup('Submit failed', error.message || 'Could not submit idea.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const badgeClass = (status) => {
    if (status === 'approved') return 'bg-green-100 text-green-800';
    if (status === 'rejected') return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
  };

  return (
    <div className="space-y-6">
      {popupNode}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Startup Ideas</h1>
        <p className="text-slate-500 text-sm">Submit your startup ideas for admin review.</p>
      </div>

      <form onSubmit={submitIdea} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Idea Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter startup idea title"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-600"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Idea Description</label>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Explain your startup idea"
            rows={5}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-600"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 bg-nani-dark text-white px-4 py-2 rounded-lg hover:bg-nani-accent disabled:opacity-60"
        >
          <Send size={16} />
          {submitting ? 'Submitting...' : 'Submit Idea'}
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">My Submitted Ideas</h2>
        {loading ? (
          <LoadingSpinner message="Loading ideas..." />
        ) : ideas.length === 0 ? (
          <p className="text-slate-500 text-sm">No ideas submitted yet.</p>
        ) : (
          <div className="space-y-3">
            {ideas.map((item) => (
              <div key={item.id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Lightbulb size={18} className="text-amber-500 mt-1" />
                    <div>
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{item.idea}</p>
                      <p className="text-xs text-slate-500 mt-2">
                        Submitted on {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-semibold ${badgeClass(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                {item.admin_message ? (
                  <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-700">Admin Message</p>
                    <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{item.admin_message}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StartupIdeas;
