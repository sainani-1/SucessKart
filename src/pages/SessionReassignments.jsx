import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { Calendar, User, ArrowRight, AlertCircle, Video, ExternalLink } from 'lucide-react';
import { logError } from '../utils/errorLogger';

export default function SessionReassignments() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [reassignments, setReassignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('current');
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    if (profile?.id) {
      loadReassignments();
    }
  }, [profile?.id, filter]);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const loadReassignments = async () => {
    try {
      setLoading(true);
      setError('');

      let query = supabase
        .from('session_reassignments')
        .select(`
          id,
          session_id,
          original_teacher_id,
          reassigned_to_teacher_id,
          leave_id,
          reason,
          reassigned_at,
          reverted_at,
          class_session:session_id(id, title, scheduled_for, ends_at, meeting_type, meeting_link, join_link),
          original_teacher:original_teacher_id(id, full_name),
          reassigned_teacher:reassigned_to_teacher_id(id, full_name),
          leave:leave_id(id, start_date, end_date, status)
        `);

      if (filter === 'current') {
        query = query.is('reverted_at', null);
      } else {
        query = query.not('reverted_at', 'is', null);
      }

      const { data, error: fetchError } = await query.order('reassigned_at', { ascending: false });
      if (fetchError) throw fetchError;

      const filteredRows = (data || []).filter(
        (row) => row.original_teacher_id === profile.id || row.reassigned_to_teacher_id === profile.id
      );
      setReassignments(filteredRows);
    } catch (err) {
      logError({ message: 'Error loading reassignments:', source: 'SessionReassignments', details: err })
      setError('Failed to load session reassignments');
    } finally {
      setLoading(false);
    }
  };

  const getSessionEndTime = (session) => {
    if (!session?.scheduled_for) return null;
    if (session.ends_at) return new Date(session.ends_at);
    return new Date(new Date(session.scheduled_for).getTime() + 60 * 60 * 1000);
  };

  const canJoinSession = (session) => {
    void nowTick;
    if (!session?.scheduled_for) return false;
    const start = new Date(session.scheduled_for);
    const end = getSessionEndTime(session);
    const now = new Date();
    if (!end) return now >= start;
    return now >= start && now < end;
  };

  if (!profile) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  const isTeacher = profile.role === 'teacher';

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Session Reassignments</h1>
        <p className="text-slate-500 mt-1">
          {isTeacher
            ? 'View your classes during leave and classes reassigned to you'
            : 'Track all session reassignments'}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setFilter('current')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'current'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Active Reassignments
        </button>
        <button
          onClick={() => setFilter('history')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'history'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Reverted / History
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading reassignments...</div>
      ) : reassignments.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm p-8 text-center">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">
            {filter === 'current' ? 'No active session reassignments' : 'No historical reassignments'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reassignments.map((reassignment) => {
            const isMyOriginalClass = reassignment.original_teacher_id === profile.id;
            const isReassignedToMe = reassignment.reassigned_to_teacher_id === profile.id;
            const session = reassignment.class_session;
            const canJoinNow = canJoinSession(session);
            const externalLink = session?.meeting_link || session?.join_link;

            return (
              <div
                key={reassignment.id}
                className="bg-white rounded-xl border shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                      {session?.title || 'Class Session'}
                    </h3>
                    <p className="text-sm text-slate-600 flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4" />
                      {new Date(session?.scheduled_for).toLocaleDateString('en-IN')} at{' '}
                      {new Date(session?.scheduled_for).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                      reassignment.reverted_at ? 'bg-slate-100 text-slate-700' : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {reassignment.reverted_at ? 'Reverted' : 'Active'}
                  </span>
                </div>

                <div className="bg-slate-50 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-600 mb-1">Original Teacher</p>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-600" />
                        <p className="font-medium text-slate-900">{reassignment.original_teacher?.full_name}</p>
                        {isMyOriginalClass && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">You</span>
                        )}
                      </div>
                    </div>

                    <ArrowRight className="w-5 h-5 text-slate-400" />

                    <div className="text-right">
                      <p className="text-xs text-slate-600 mb-1">Reassigned To</p>
                      <div className="flex items-center gap-2 justify-end">
                        <p className="font-medium text-slate-900">{reassignment.reassigned_teacher?.full_name}</p>
                        {isReassignedToMe && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">You</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {reassignment.leave && (
                  <div className="mb-4 border-l-4 border-amber-400 pl-4">
                    <p className="text-sm text-slate-700 mb-1">
                      <strong>Leave Period:</strong> {new Date(reassignment.leave.start_date).toLocaleDateString('en-IN')} to{' '}
                      {new Date(reassignment.leave.end_date).toLocaleDateString('en-IN')}
                    </p>
                    {reassignment.reason && (
                      <p className="text-sm text-slate-600">
                        <strong>Reason:</strong> {reassignment.reason}
                      </p>
                    )}
                  </div>
                )}

                {!reassignment.reverted_at && (isReassignedToMe || isMyOriginalClass) && session?.id ? (
                  <div className="mb-4">
                    {session.meeting_type === 'jitsi' || !externalLink ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!canJoinNow) return;
                          navigate(`/live-class/${session.id}`);
                        }}
                        disabled={!canJoinNow}
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                          canJoinNow
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        <Video size={16} />
                        {canJoinNow ? 'Join Session' : 'Available at Session Time'}
                      </button>
                    ) : (
                      <a
                        href={externalLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => {
                          if (!canJoinNow) event.preventDefault();
                        }}
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                          canJoinNow
                            ? 'bg-purple-600 text-white hover:bg-purple-700'
                            : 'bg-slate-200 text-slate-500 pointer-events-none'
                        }`}
                      >
                        <ExternalLink size={16} />
                        {canJoinNow ? 'Join Session' : 'Available at Session Time'}
                      </a>
                    )}
                  </div>
                ) : null}

                <div className="pt-4 border-t border-slate-200 text-xs text-slate-500">
                  <p>Reassigned: {new Date(reassignment.reassigned_at).toLocaleString('en-IN')}</p>
                  {reassignment.reverted_at && (
                    <p>Reverted: {new Date(reassignment.reverted_at).toLocaleString('en-IN')}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
