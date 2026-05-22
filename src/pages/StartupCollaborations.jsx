import React, { useEffect, useState } from 'react';
import { Lightbulb, Send, Check, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import usePopup from '../hooks/usePopup.jsx';
import { logError } from '../utils/errorLogger';

const StartupCollaborations = () => {
  const { profile } = useAuth();
  const { popupNode, openPopup } = usePopup();
  const [loading, setLoading] = useState(true);
  const [approvedIdeas, setApprovedIdeas] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [messageByIdea, setMessageByIdea] = useState({});

  const loadData = async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const [ideasResp, sentResp, incomingResp] = await Promise.all([
        supabase
          .from('startup_ideas')
          .select('id, title, idea, user_id, owner:profiles!startup_ideas_user_id_fkey(full_name, email)')
          .eq('status', 'approved')
          .neq('user_id', profile.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('startup_collaborations')
          .select('id, idea_id, status, message, created_at, idea:startup_ideas(title), owner:profiles!startup_collaborations_owner_id_fkey(full_name)')
          .eq('requester_id', profile.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('startup_collaborations')
          .select('id, idea_id, status, message, created_at, requester:profiles!startup_collaborations_requester_id_fkey(full_name, email), idea:startup_ideas(title)')
          .eq('owner_id', profile.id)
          .order('created_at', { ascending: false }),
      ]);

      if (ideasResp.error) throw ideasResp.error;
      if (sentResp.error) throw sentResp.error;
      if (incomingResp.error) throw incomingResp.error;

      setApprovedIdeas(ideasResp.data || []);
      setSentRequests(sentResp.data || []);
      setIncomingRequests(incomingResp.data || []);
    } catch (error) {
      logError({ message: 'Error loading startup collaborations:', source: 'StartupCollaborations', details: error })
      openPopup('Load failed', error.message || 'Could not load collaborations.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile?.id]);

  const sendCollabRequest = async (idea) => {
    if (!profile?.id) return;
    const msg = (messageByIdea[idea.id] || '').trim();
    if (!msg) {
      openPopup('Message required', 'Please add a short collaboration message.', 'warning');
      return;
    }
    try {
      const { error } = await supabase.from('startup_collaborations').insert({
        idea_id: idea.id,
        owner_id: idea.user_id,
        requester_id: profile.id,
        message: msg,
        status: 'pending'
      });
      if (error) throw error;
      setMessageByIdea((prev) => ({ ...prev, [idea.id]: '' }));
      openPopup('Request sent', 'Collaboration request sent successfully.', 'success');
      await loadData();
    } catch (error) {
      logError({ message: 'Error sending collaboration request:', source: 'StartupCollaborations', details: error })
      openPopup('Send failed', error.message || 'Could not send request.', 'error');
    }
  };

  const updateIncoming = async (id, status) => {
    try {
      const { error } = await supabase
        .from('startup_collaborations')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      openPopup('Updated', `Request ${status}.`, 'success');
      await loadData();
    } catch (error) {
      logError({ message: 'Error updating collaboration request:', source: 'StartupCollaborations', details: error })
      openPopup('Update failed', error.message || 'Could not update request.', 'error');
    }
  };

  const badgeClass = (status) => {
    if (status === 'accepted') return 'bg-green-100 text-green-700';
    if (status === 'rejected') return 'bg-red-100 text-red-700';
    return 'bg-yellow-100 text-yellow-700';
  };

  if (loading) return <LoadingSpinner message="Loading collaborations..." />;

  return (
    <div className="space-y-6">
      {popupNode}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Startup Collaborations</h1>
        <p className="text-slate-500 text-sm">Connect with approved startup ideas and collaborate.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900 mb-3">Explore Approved Ideas</h2>
        {approvedIdeas.length === 0 ? (
          <p className="text-sm text-slate-500">No approved ideas available right now.</p>
        ) : (
          <div className="space-y-4">
            {approvedIdeas.map((idea) => (
              <div key={idea.id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                    <Lightbulb size={18} className="text-blue-600 mt-1" />
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{idea.title}</p>
                    <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{idea.idea}</p>
                    <p className="text-xs text-slate-500 mt-2">
                      Owner: {idea.owner?.full_name || 'Student'} ({idea.owner?.email || 'N/A'})
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <input
                    value={messageByIdea[idea.id] || ''}
                    onChange={(e) => setMessageByIdea((prev) => ({ ...prev, [idea.id]: e.target.value }))}
                    placeholder="Write your collaboration message"
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => sendCollabRequest(idea)}
                    className="inline-flex items-center justify-center gap-1 bg-nani-dark text-white px-4 py-2 rounded-lg hover:bg-nani-accent"
                  >
                    <Send size={14} />
                    Request
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900 mb-3">Incoming Requests On Your Ideas</h2>
        {incomingRequests.length === 0 ? (
          <p className="text-sm text-slate-500">No incoming collaboration requests.</p>
        ) : (
          <div className="space-y-3">
            {incomingRequests.map((req) => (
              <div key={req.id} className="border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-900">{req.idea?.title || 'Idea'}</p>
                <p className="text-sm text-slate-700 mt-1">{req.message}</p>
                <p className="text-xs text-slate-500 mt-1">
                  From: {req.requester?.full_name || 'User'} ({req.requester?.email || 'N/A'})
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${badgeClass(req.status)}`}>{req.status}</span>
                  {req.status === 'pending' ? (
                    <>
                      <button
                        onClick={() => updateIncoming(req.id, 'accepted')}
                        className="inline-flex items-center gap-1 text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                      >
                        <Check size={12} />
                        Accept
                      </button>
                      <button
                        onClick={() => updateIncoming(req.id, 'rejected')}
                        className="inline-flex items-center gap-1 text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                      >
                        <X size={12} />
                        Reject
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900 mb-3">Requests You Sent</h2>
        {sentRequests.length === 0 ? (
          <p className="text-sm text-slate-500">No collaboration requests sent yet.</p>
        ) : (
          <div className="space-y-3">
            {sentRequests.map((req) => (
              <div key={req.id} className="border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-900">{req.idea?.title || 'Idea'}</p>
                <p className="text-sm text-slate-700 mt-1">{req.message}</p>
                <p className="text-xs text-slate-500 mt-1">Owner: {req.owner?.full_name || 'Student'}</p>
                <span className={`mt-2 inline-block text-xs px-2 py-1 rounded-full ${badgeClass(req.status)}`}>{req.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StartupCollaborations;
