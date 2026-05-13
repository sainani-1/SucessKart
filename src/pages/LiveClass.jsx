import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import {
  Video,
  PhoneOff,
  Monitor,
  Star,
  Copy,
  ExternalLink,
  CalendarDays,
  ShieldCheck,
  Sparkles,
  ChevronRight,
  GraduationCap,
  Clock3,
  LayoutGrid,
  Mail,
  PanelRightOpen,
  PanelRightClose,
} from 'lucide-react';
import usePopup from '../hooks/usePopup.jsx';
import LoadingSpinner from '../components/LoadingSpinner';
import useDialog from '../hooks/useDialog.jsx';
import LiveKitClassSession from '../components/LiveKitClassSession';
import { controlLiveKitClassSession, getLiveKitTokenForClassSession } from '../lib/livekitSession';

const formatSessionDateTime = (value) =>
  new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });

const buildParticipantInitials = (name = '') =>
  String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() || '')
    .join('') || 'SP';

const ParticipantDrawer = ({
  participant,
  currentRole,
  roomUrl,
  onClose,
  onCopy,
  onOpenProfile,
  onAttendance,
}) => {
  if (!participant) return null;

  const isAdmin = currentRole === 'admin';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm">
      <button type="button" className="flex-1 cursor-default" onClick={onClose} aria-label="Close participant drawer" />
      <aside className="h-full w-full max-w-md border-l border-white/10 bg-slate-950/95 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.55)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Participant</p>
            <h3 className="mt-2 text-2xl font-bold">{participant.full_name || 'Student'}</h3>
            <p className="mt-2 text-sm text-slate-400">{participant.email || 'No email available'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-400 to-blue-600 text-lg font-bold text-white shadow-lg">
              {buildParticipantInitials(participant.full_name)}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{participant.full_name || 'SkillPro Participant'}</p>
              <p className="mt-1 text-xs text-slate-400">{participant.phone || 'Phone not available'}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl border border-white/8 bg-slate-900/70 px-4 py-3">
              <p className="text-slate-400">Role</p>
              <p className="mt-1 font-semibold text-white">{participant.role === 'teacher' ? 'Teacher' : 'Student'}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-slate-900/70 px-4 py-3">
              <p className="text-slate-400">Access</p>
              <p className="mt-1 font-semibold text-emerald-300">Invited</p>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => onCopy(participant.email, participant.email ? 'Email copied' : 'Email not available')}
            className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:bg-white/[0.08]"
          >
            <span className="flex items-center gap-3">
              <Mail size={18} className="text-cyan-300" />
              <span>
                <span className="block text-sm font-semibold text-white">Copy Email</span>
                <span className="block text-xs text-slate-400">Quickly share or contact this participant</span>
              </span>
            </span>
            <Copy size={16} className="text-slate-400" />
          </button>

          <button
            type="button"
            onClick={() => onCopy(roomUrl, 'Room link copied')}
            className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:bg-white/[0.08]"
          >
            <span className="flex items-center gap-3">
              <ExternalLink size={18} className="text-violet-300" />
              <span>
                <span className="block text-sm font-semibold text-white">Copy Room Link</span>
                <span className="block text-xs text-slate-400">Share the active SkillPro room if needed</span>
              </span>
            </span>
            <Copy size={16} className="text-slate-400" />
          </button>

          <button
            type="button"
            onClick={onAttendance}
            className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:bg-white/[0.08]"
          >
            <span className="flex items-center gap-3">
              <CalendarDays size={18} className="text-amber-300" />
              <span>
                <span className="block text-sm font-semibold text-white">Open Attendance</span>
                <span className="block text-xs text-slate-400">Jump back to the attendance console</span>
              </span>
            </span>
            <ChevronRight size={16} className="text-slate-400" />
          </button>

          {isAdmin ? (
            <button
              type="button"
              onClick={() => onOpenProfile(participant.id)}
              className="flex w-full items-center justify-between rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-left transition hover:bg-cyan-400/15"
            >
              <span className="flex items-center gap-3">
                <ShieldCheck size={18} className="text-cyan-300" />
                <span>
                  <span className="block text-sm font-semibold text-white">Open Student Profile</span>
                  <span className="block text-xs text-slate-300">Review student details in admin view</span>
                </span>
              </span>
              <ChevronRight size={16} className="text-slate-200" />
            </button>
          ) : null}
        </div>

        <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-slate-900/80 px-4 py-4 text-sm text-slate-300">
          SkillPro still runs in the separate meeting tab. This drawer adds classroom shortcuts and participant context without changing the meeting behavior.
        </div>
      </aside>
    </div>
  );
};

const LiveClass = () => {
  const { sessionId } = useParams();
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const jitsiApiRef = useRef(null);
  const meetingWindowRef = useRef(null);
  const meetingWindowPollRef = useRef(null);
  const suppressNextLeaveRef = useRef(false);
  const { openPopup, popupNode } = usePopup();
  const { confirm, dialogNode } = useDialog();
  const [session, setSession] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [meetingStarted, setMeetingStarted] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [liveKitConnection, setLiveKitConnection] = useState(null);
  const [joiningMeeting, setJoiningMeeting] = useState(false);
  const [waitingForHostApproval, setWaitingForHostApproval] = useState(false);
  const [participantsPanelOpen, setParticipantsPanelOpen] = useState(true);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const isTeacherOwner = profile?.role === 'teacher' && session?.teacher_id === profile?.id;
  const canJoinStartedMeeting = profile?.role === 'student' || profile?.role === 'admin' || isTeacherOwner;
  const jitsiTeacherWarmupEndsAt = session?.meeting_type === 'jitsi' && session?.started_at
    ? new Date(new Date(session.started_at).getTime() + 60 * 1000)
    : null;
  const isJitsiWarmupActive = Boolean(
    jitsiTeacherWarmupEndsAt &&
    new Date() < jitsiTeacherWarmupEndsAt &&
    !isTeacherOwner &&
    profile?.role !== 'admin'
  );
  const sessionStartTime = session ? new Date(session.scheduled_for) : null;
  const isSessionStartReached = sessionStartTime ? new Date() >= sessionStartTime : false;
  const getJitsiRoomName = (sessionRow) => `SkillPro_Session_${sessionRow.id}_${sessionRow.title?.replace(/\s+/g, '_') || 'Class'}`;
  const getJitsiRoomUrl = (sessionRow) => `https://meet.jit.si/${encodeURIComponent(getJitsiRoomName(sessionRow))}`;
  const getMeetingProviderLabel = (sessionRow) => sessionRow?.meeting_type === 'external' ? 'External Platform' : 'SkillPro';
  const sessionRoomUrl = session ? getJitsiRoomUrl(session) : '';
  const getAssignedBreakoutRoomId = (sessionRow) => {
    const breakout = sessionRow?.livekit_controls?.breakout;
    if (!breakout?.active) return '';
    if (profile?.role === 'teacher' || profile?.role === 'admin') {
      return breakout.teacher_room_id || '';
    }
    const rooms = Array.isArray(breakout.rooms) ? breakout.rooms : [];
    const matched = rooms.find((room) => Array.isArray(room?.participant_user_ids) && room.participant_user_ids.includes(profile?.id));
    return matched?.id || '';
  };
  const getReturnRoute = () => {
    if (profile?.role === 'student') return '/app/class-schedule';
    if (profile?.role === 'teacher') return '/app/attendance';
    return '/app';
  };

  const getSessionEndTime = (sessionRow) => {
    if (sessionRow?.ends_at) return new Date(sessionRow.ends_at);
    const start = new Date(sessionRow.scheduled_for);
    return new Date(start.getTime() + 60 * 60 * 1000);
  };

  const attendeeSummary = useMemo(() => ({
    total: participants.length,
    students: participants.filter((item) => item.role !== 'teacher' && item.role !== 'admin').length,
    withEmail: participants.filter((item) => item.email).length,
  }), [participants]);

  const clearMeetingWindowWatcher = () => {
    if (meetingWindowPollRef.current) {
      clearInterval(meetingWindowPollRef.current);
      meetingWindowPollRef.current = null;
    }
  };

  const redirectBackToApp = () => {
    clearMeetingWindowWatcher();
    navigate(getReturnRoute());
  };

  const copyToClipboard = async (value, successMessage = 'Copied') => {
    if (!value) {
      openPopup('Nothing to copy', 'The requested value is not available yet.', 'warning');
      return;
    }
    try {
      await navigator.clipboard.writeText(String(value));
      openPopup('Copied', successMessage, 'success');
    } catch (error) {
      openPopup('Copy failed', 'Could not copy that value right now.', 'error');
    }
  };

  const cleanupMeetingState = () => {
    clearMeetingWindowWatcher();

    if (jitsiApiRef.current) {
      jitsiApiRef.current.dispose();
    }

    if (meetingWindowRef.current && !meetingWindowRef.current.closed) {
      meetingWindowRef.current.close();
      meetingWindowRef.current = null;
    }

    setLiveKitConnection(null);
    setMeetingStarted(false);
  };

  const openFeedbackPrompt = () => {
    if (profile?.role !== 'student' || feedbackSubmitted) {
      redirectBackToApp();
      return;
    }
    setFeedbackOpen(true);
  };

  const clearOneTimeLiveKitAdmission = async () => {
    if (profile?.role !== 'student' || session?.meeting_type !== 'livekit' || !profile?.id) return;
    try {
      await controlLiveKitClassSession({
        sessionId,
        requesterId: profile.id,
        action: 'leave_class',
        targetUserId: profile.id,
      });
    } catch {
      // Best effort. If this fails, the host can still remove/relock from controls.
    }
  };

  const handleLeaveClassroom = async () => {
    await clearOneTimeLiveKitAdmission();
    cleanupMeetingState();
    openFeedbackPrompt();
  };

  const submitFeedbackAndExit = async (skip = false) => {
    if (profile?.role !== 'student') {
      redirectBackToApp();
      return;
    }

    if (!skip && !feedbackRating) {
      openPopup('Feedback required', 'Please select a rating before submitting feedback.', 'warning');
      return;
    }

    if (skip) {
      setFeedbackOpen(false);
      redirectBackToApp();
      return;
    }

    setFeedbackSubmitting(true);
    try {
      const { error } = await supabase.from('class_session_feedback').upsert(
        {
          session_id: Number(sessionId),
          student_id: profile.id,
          rating: feedbackRating,
          feedback_text: feedbackText.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'session_id,student_id' },
      );

      if (error) throw error;

      setFeedbackSubmitted(true);
      setFeedbackOpen(false);
      redirectBackToApp();
    } catch (error) {
      openPopup('Feedback failed', error.message || 'Could not submit class feedback.', 'error');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const openJitsiMeetingWindow = (roomUrl) => {
    clearMeetingWindowWatcher();

    const openedWindow = window.open(roomUrl, '_blank', 'noopener,noreferrer');

    if (!openedWindow) {
      openPopup(
        'Popup Blocked',
        'SkillPro could not open in a new tab. Please allow popups for this site and try again.',
        'warning'
      );
      return false;
    }

    meetingWindowRef.current = openedWindow;
    setMeetingStarted(true);

    meetingWindowPollRef.current = setInterval(() => {
      if (meetingWindowRef.current?.closed) {
        meetingWindowRef.current = null;
        clearMeetingWindowWatcher();
        redirectBackToApp();
      }
    }, 1000);

    return true;
  };

  useEffect(() => {
    if (authLoading) return;
    if (profile) {
      loadSession();
    } else {
      setLoading(false);
    }
  }, [sessionId, profile, authLoading]);

  useEffect(() => {
    if (!profile || meetingStarted || !['jitsi', 'livekit'].includes(session?.meeting_type || '')) {
      return undefined;
    }

    if (isTeacherOwner || (session?.status === 'live' && !isJitsiWarmupActive) || session?.status === 'ended') {
      return undefined;
    }

    const interval = setInterval(() => {
      loadSession({ silent: true });
    }, 5000);

    return () => clearInterval(interval);
  }, [profile, meetingStarted, session?.meeting_type, session?.status, isTeacherOwner, isJitsiWarmupActive]);

  useEffect(() => {
    if (!sessionId) return undefined;

    const channel = supabase
      .channel(`class-session-live-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'class_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          if (!payload?.new) return;
          setSession(payload.new);
          if (payload.new.status === 'ended') {
            setSessionEnded(true);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!meetingStarted || session?.meeting_type !== 'livekit' || !profile?.id) return;

    let active = true;
    const refreshRoomToken = async () => {
      try {
        const breakoutRoomId = getAssignedBreakoutRoomId(session);
        const tokenData = await getLiveKitTokenForClassSession({
          sessionId,
          requesterId: profile.id,
          breakoutRoomId,
        });
        if (!active) return;
        setLiveKitConnection((current) => {
          const isRoomSwitch =
            Boolean(current?.roomName) &&
            current.roomName !== tokenData.roomName;
          if (isRoomSwitch) {
            suppressNextLeaveRef.current = true;
          }
          if (
            current?.token === tokenData.token &&
            current?.serverUrl === tokenData.url &&
            current?.roomName === tokenData.roomName
          ) {
            return current;
          }
          return {
            token: tokenData.token,
            serverUrl: tokenData.url,
            roomName: tokenData.roomName,
          };
        });
      } catch (error) {
        if (!active) return;
        openPopup('Class control', error.message || 'Could not switch LiveKit room.', 'warning');
      }
    };

    refreshRoomToken();
    return () => {
      active = false;
    };
  }, [meetingStarted, session?.meeting_type, session?.livekit_controls, sessionId, profile?.id]);

  useEffect(() => {
    if (!waitingForHostApproval || meetingStarted || session?.meeting_type !== 'livekit') return undefined;
    const interval = setInterval(() => {
      startLiveKitMeeting({ silentWaitingRoom: true });
    }, 5000);
    return () => clearInterval(interval);
  }, [waitingForHostApproval, meetingStarted, session?.meeting_type, session?.livekit_controls, profile?.id]);

  const loadSession = async ({ silent = false } = {}) => {
    console.log('loadSession called');
    
    if (!profile) {
      console.error('No profile found');
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('class_sessions')
        .select('*, class_session_participants(student_id)')
        .eq('id', sessionId)
        .single();

      console.log('Session query result:', { data, error });

      if (error) throw error;

      // Check if user is allowed to join
      const isTeacher = profile.role === 'teacher' || profile.role === 'admin';
      const isParticipant = data.class_session_participants?.some(p => p.student_id === profile.id);
      const noParticipants = !data.class_session_participants || data.class_session_participants.length === 0;

      console.log('Permission check:', { isTeacher, isParticipant, noParticipants });

      if (!isTeacher && !isParticipant && !noParticipants) {
        openPopup('Access denied', 'You are not invited to this session.', 'error');
        navigate('/app');
        return;
      }

      // Students can join only at or after scheduled time.
      const isStudent = profile.role === 'student';
      const scheduledAt = new Date(data.scheduled_for);
      const endsAt = getSessionEndTime(data);
      if (isStudent && new Date() < scheduledAt) {
        openPopup(
          'Too Early',
          `You can join only at scheduled time: ${scheduledAt.toLocaleString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata'
          })}`,
          'warning'
        );
        navigate('/app/class-schedule');
        return;
      }
      if (new Date() >= endsAt) {
        openPopup('Session Completed', 'This class session is over.', 'info');
        navigate('/app/class-schedule');
        return;
      }
      if (
        isStudent &&
        data.meeting_type === 'jitsi' &&
        data.status === 'live' &&
        data.started_at &&
        new Date() < new Date(new Date(data.started_at).getTime() + 60 * 1000)
      ) {
        openPopup('Teacher Joining', 'The teacher has started the room. Students can join automatically after 1 minute.', 'info');
        setSession(data);
        setLoading(false);
        return;
      }

      if (data.status === 'ended') {
        setSession(data);
        setSessionEnded(true);
        setLoading(false);
        return;
      }

      setSession(data);
      const participantIds = Array.from(
        new Set((data.class_session_participants || []).map((entry) => entry.student_id).filter(Boolean)),
      );

      if (participantIds.length > 0) {
        const { data: participantProfiles, error: participantError } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone, role')
          .in('id', participantIds);

        if (participantError) throw participantError;
        setParticipants(participantProfiles || []);
      } else {
        setParticipants([]);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading session:', error);
      if (!silent) {
        openPopup('Load failed', 'Failed to load class session.', 'error');
        navigate('/app');
      }
    }
  };

  const startJitsiMeeting = async () => {
    if (!session) {
      return;
    }

    if (profile?.role === 'student' && new Date() < new Date(session.scheduled_for)) {
      openPopup('Too Early', 'You can join this class only at scheduled time.', 'warning');
      return;
    }
    if (new Date() >= getSessionEndTime(session)) {
      openPopup('Session Completed', 'This class session is over.', 'info');
      return;
    }

    setJoiningMeeting(true);

    if (isTeacherOwner) {
      const { error } = await supabase
        .from('class_sessions')
        .update({ status: 'live', started_at: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) {
        openPopup('Start failed', 'Unable to start the class right now. Please try again.', 'error');
        setJoiningMeeting(false);
        return;
      }

      setSession((prev) => (prev ? { ...prev, status: 'live', started_at: prev.started_at || new Date().toISOString() } : prev));
    } else if (session.status !== 'live') {
      openPopup('Please Wait', 'Only the teacher can start this SkillPro class. You can join after the teacher starts it.', 'info');
      setJoiningMeeting(false);
      return;
    }

    const opened = openJitsiMeetingWindow(getJitsiRoomUrl(session));
    if (!opened) {
      setJoiningMeeting(false);
      return;
    }
    setJoiningMeeting(false);
  };

  const startLiveKitMeeting = async (options = {}) => {
    const { silentWaitingRoom = false } = options;
    if (!session || !profile?.id) {
      return;
    }

    if (profile?.role === 'student' && new Date() < new Date(session.scheduled_for)) {
      openPopup('Too Early', 'You can join this class only at scheduled time.', 'warning');
      return;
    }
    if (new Date() >= getSessionEndTime(session)) {
      openPopup('Session Completed', 'This class session is over.', 'info');
      return;
    }

    setJoiningMeeting(true);

    if (isTeacherOwner) {
      const { error } = await supabase
        .from('class_sessions')
        .update({
          status: 'live',
          started_at: new Date().toISOString(),
          livekit_controls: {
            ...(session.livekit_controls || {}),
            waiting_room_enabled: session.livekit_controls?.waiting_room_enabled !== false,
            private_participants_enabled: session.livekit_controls?.private_participants_enabled !== false,
            admitted_user_ids: session.livekit_controls?.admitted_user_ids || [],
            waiting_user_ids: session.livekit_controls?.waiting_user_ids || [],
            cohost_user_ids: session.livekit_controls?.cohost_user_ids || [],
          },
        })
        .eq('id', sessionId);

      if (error) {
        openPopup('Start failed', 'Unable to start the class right now. Please try again.', 'error');
        setJoiningMeeting(false);
        return;
      }

      setSession((prev) => (prev ? { ...prev, status: 'live', started_at: prev.started_at || new Date().toISOString() } : prev));
    } else if (session.status !== 'live') {
      openPopup('Please Wait', 'Only the teacher can start this SkillPro class. You can join after the teacher starts it.', 'info');
      setJoiningMeeting(false);
      return;
    }

    try {
      const tokenData = await getLiveKitTokenForClassSession({
        sessionId,
        requesterId: profile.id,
        breakoutRoomId: getAssignedBreakoutRoomId(session),
      });

      setLiveKitConnection({
        token: tokenData.token,
        serverUrl: tokenData.url,
        roomName: tokenData.roomName,
      });
      setWaitingForHostApproval(false);
      setMeetingStarted(true);
    } catch (error) {
      if (String(error.message || '').toLowerCase().includes('waiting room')) {
        setWaitingForHostApproval(true);
      } else {
        openPopup('Join failed', error.message || 'Failed to connect LiveKit room.', 'error');
      }
    } finally {
      setJoiningMeeting(false);
    }
  };

  const handleExternalLink = () => {
    if (profile?.role === 'student' && new Date() < new Date(session?.scheduled_for)) {
      openPopup('Too Early', 'You can open this link only at scheduled time.', 'warning');
      return;
    }
    if (new Date() >= getSessionEndTime(session)) {
      openPopup('Session Completed', 'This class session is over.', 'info');
      return;
    }
    if (session?.meeting_link) {
      window.open(session.meeting_link, '_blank');
    }
  };

  const endSession = async () => {
    const ok = await confirm('Are you sure you want to end this session for all participants?', 'End Session');
    if (!ok) {
      return;
    }

    try {
      // Mark session as ended by updating a status or deleting it
      const { error } = await supabase
        .from('class_sessions')
        .update({ status: 'ended' })
        .eq('id', sessionId);

      if (error) {
        console.error('Error ending session:', error);
      }

      // Dispose meeting state
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
      }

      if (meetingWindowRef.current && !meetingWindowRef.current.closed) {
        meetingWindowRef.current.close();
        meetingWindowRef.current = null;
      }

      setLiveKitConnection(null);

      setSessionEnded(true);
      
      // Redirect after 3 seconds
      setTimeout(() => {
        redirectBackToApp();
      }, 3000);
    } catch (error) {
      console.error('Error ending session:', error);
      openPopup('End failed', 'Failed to end session.', 'error');
    }
  };

  useEffect(() => {
    return () => {
      clearMeetingWindowWatcher();
      setLiveKitConnection(null);
    };
  }, []);

  useEffect(() => {
    if (!selectedParticipant) return;
    const stillPresent = participants.find((item) => item.id === selectedParticipant.id);
    if (!stillPresent) {
      setSelectedParticipant(null);
      return;
    }
    setSelectedParticipant(stillPresent);
  }, [participants, selectedParticipant]);

  useEffect(() => {
    if (!sessionEnded || profile?.role !== 'student' || feedbackOpen || feedbackSubmitted) return;
    cleanupMeetingState();
    setFeedbackOpen(true);
  }, [sessionEnded, profile?.role, feedbackOpen, feedbackSubmitted]);

  if (loading || authLoading) {
    return <LoadingSpinner message={authLoading ? "Loading profile..." : "Loading class session..."} />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white text-center">
          <LoadingSpinner message="Loading profile..." fullPage={false} />
        </div>
      </div>
    );
  }

  if (sessionEnded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        {feedbackOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 text-white shadow-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200">Class Feedback</p>
              <h3 className="mt-2 text-2xl font-bold">How was this session?</h3>
              <p className="mt-2 text-sm text-slate-300">Your feedback will appear in the teacher and admin feedback panel.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFeedbackRating(value)}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                      feedbackRating === value ? 'bg-amber-400 text-slate-950' : 'bg-white/8 text-white hover:bg-white/14'
                    }`}
                  >
                    <Star size={15} className={feedbackRating >= value ? 'fill-current' : ''} />
                    <span>{value}</span>
                  </button>
                ))}
              </div>
              <textarea
                value={feedbackText}
                onChange={(event) => setFeedbackText(event.target.value)}
                rows={4}
                placeholder="Tell us what went well and what should improve"
                className="mt-5 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
              />
              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => submitFeedbackAndExit(true)}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Skip
                </button>
                <button
                  type="button"
                  disabled={feedbackSubmitting}
                  onClick={() => submitFeedbackAndExit(false)}
                  className="rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:opacity-60"
                >
                  {feedbackSubmitting ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <div className="text-white text-center">
          <div className="bg-green-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <PhoneOff size={40} />
          </div>
          <h2 className="text-2xl font-bold mb-4">Session Ended</h2>
          <p className="text-slate-400">This session has been ended by the instructor.</p>
          <p className="text-slate-500 text-sm mt-2">Redirecting...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Session Not Found</h1>
          <button 
            onClick={() => navigate('/app')}
            className="bg-blue-600 px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(96,165,250,0.18),_transparent_26%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)] text-white">
      {popupNode}
      {dialogNode}
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -left-16 top-12 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
      </div>
      {feedbackOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 text-white shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200">Class Feedback</p>
            <h3 className="mt-2 text-2xl font-bold">How was this session?</h3>
            <p className="mt-2 text-sm text-slate-300">Your feedback will appear in the teacher and admin feedback panel.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFeedbackRating(value)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                    feedbackRating === value ? 'bg-amber-400 text-slate-950' : 'bg-white/8 text-white hover:bg-white/14'
                  }`}
                >
                  <Star size={15} className={feedbackRating >= value ? 'fill-current' : ''} />
                  <span>{value}</span>
                </button>
              ))}
            </div>
            <textarea
              value={feedbackText}
              onChange={(event) => setFeedbackText(event.target.value)}
              rows={4}
              placeholder="Tell us what went well and what should improve"
              className="mt-5 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
            />
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => submitFeedbackAndExit(true)}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
              >
                Skip
              </button>
              <button
                type="button"
                disabled={feedbackSubmitting}
                onClick={() => submitFeedbackAndExit(false)}
                className="rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:opacity-60"
              >
                {feedbackSubmitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {selectedParticipant ? (
        <ParticipantDrawer
          participant={selectedParticipant}
          currentRole={profile?.role}
          roomUrl={sessionRoomUrl}
          onClose={() => setSelectedParticipant(null)}
          onCopy={copyToClipboard}
          onOpenProfile={(studentId) => navigate(`/app/admin/student/${studentId}`)}
          onAttendance={() => navigate('/app/attendance')}
        />
      ) : null}
      <div className="relative z-10 flex h-full flex-col">
      <div className="border-b border-white/10 bg-slate-950/55 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="mt-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-cyan-950/40">
              <Video size={22} className="text-slate-950" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
                  Classroom
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-slate-200">
                  <Sparkles size={14} className="text-cyan-300" />
                  {getMeetingProviderLabel(session)}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">{session.title}</h1>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-300">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1.5">
                  <CalendarDays size={16} className="text-cyan-300" />
                  {formatSessionDateTime(session.scheduled_for)}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1.5">
                  <Clock3 size={16} className="text-amber-300" />
                  Ends {formatSessionDateTime(getSessionEndTime(session))}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid min-w-[240px] grid-cols-3 gap-2 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-2">
              <div className="rounded-2xl bg-slate-950/70 px-3 py-3 text-center">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Total</p>
                <p className="mt-1 text-lg font-bold text-white">{attendeeSummary.total}</p>
              </div>
              <div className="rounded-2xl bg-slate-950/70 px-3 py-3 text-center">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Students</p>
                <p className="mt-1 text-lg font-bold text-white">{attendeeSummary.students}</p>
              </div>
              <div className="rounded-2xl bg-slate-950/70 px-3 py-3 text-center">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Status</p>
                <p className="mt-1 text-sm font-bold text-emerald-300">{meetingStarted ? 'Live' : session.status === 'live' ? 'Open' : 'Ready'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setParticipantsPanelOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.10]"
            >
              {participantsPanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
              Participants
            </button>
            {session.meeting_type !== 'external' ? (
              <button
                type="button"
                onClick={() => copyToClipboard(sessionRoomUrl, 'Room link copied')}
                className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/15"
              >
                <Copy size={17} />
                Copy Room Link
              </button>
            ) : null}
            {session.meeting_type === 'external' && session.meeting_link ? (
              <button
                onClick={handleExternalLink}
                className="rounded-2xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-purple-700"
              >
                Open External Link
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 px-4 py-4 sm:px-6">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/55 shadow-[0_24px_90px_rgba(2,8,23,0.45)] backdrop-blur-xl">
        {/* Ready to Join Screen */}
        {!meetingStarted && ['jitsi', 'livekit'].includes(session.meeting_type) && (
          <div className="absolute inset-0 overflow-y-auto">
            <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center px-6 py-10">
              <div className="w-full rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.95),rgba(15,23,42,0.82))] p-8 shadow-2xl sm:p-10">
                <div className="grid gap-8 xl:grid-cols-[1.25fr_0.85fr] xl:items-center">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
                      <LayoutGrid size={14} />
                      Live Class Console
                    </div>
                    <div className="mt-6 text-left">
              {isTeacherOwner ? (
                <>
                  <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    {isSessionStartReached ? 'Launch your classroom' : 'Classroom opens at the scheduled time'}
                  </h2>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                    {isSessionStartReached
                      ? `Start the ${getMeetingProviderLabel(session)} meeting for ${session.title}. Students can join once you start it.`
                      : `You can start this class only at the scheduled time: ${sessionStartTime?.toLocaleString('en-IN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                          timeZone: 'Asia/Kolkata'
                        })}`}
                  </p>
                  {!isSessionStartReached && (
                    <p className="mb-8 mt-3 text-slate-500">
                      The start button will be available once the class time begins.
                    </p>
                  )}
                  <button
                    onClick={session.meeting_type === 'livekit' ? startLiveKitMeeting : startJitsiMeeting}
                    disabled={!isSessionStartReached || joiningMeeting}
                    className={`mt-4 rounded-2xl px-8 py-4 text-lg font-semibold transition ${
                      isSessionStartReached && !joiningMeeting
                        ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                        : 'cursor-not-allowed bg-slate-700 text-slate-300'
                    }`}
                  >
                    {joiningMeeting ? 'Joining...' : isSessionStartReached ? 'Start Class Now' : 'Available at Scheduled Time'}
                  </button>
                </>
              ) : waitingForHostApproval ? (
                <div className="max-w-2xl">
                  <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-amber-100">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300 animate-pulse" />
                    Waitlisted
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    You are in the waiting hall
                  </h2>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                    You are on the waitlist for <span className="font-semibold text-white">{session.title}</span>. The host or co-host will allow you in soon.
                  </p>
                  <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-5 py-4">
                    <p className="text-sm font-semibold text-amber-100">No need to refresh.</p>
                    <p className="mt-1 text-sm text-amber-50/80">
                      This page checks automatically and will move you into the meeting as soon as approval is given.
                    </p>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      onClick={() => startLiveKitMeeting({ silentWaitingRoom: false })}
                      disabled={joiningMeeting}
                      className="rounded-2xl bg-amber-300 px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
                    >
                      {joiningMeeting ? 'Checking Approval...' : 'Check Again'}
                    </button>
                    <button
                      onClick={handleLeaveClassroom}
                      className="rounded-2xl border border-white/10 px-6 py-4 text-base font-semibold text-slate-200 transition hover:bg-white/[0.08]"
                    >
                      Leave Waiting Hall
                    </button>
                  </div>
                </div>
              ) : session.status === 'live' && canJoinStartedMeeting && !isJitsiWarmupActive ? (
                <>
                  <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Everything is ready to join</h2>
                  <p className="mb-8 mt-4 max-w-2xl text-base leading-7 text-slate-300">
                    The teacher has started this live class. You can join now.
                  </p>
                  <button
                    onClick={session.meeting_type === 'livekit' ? startLiveKitMeeting : startJitsiMeeting}
                    disabled={joiningMeeting}
                    className={`rounded-2xl px-8 py-4 text-lg font-semibold transition ${
                      joiningMeeting ? 'cursor-not-allowed bg-slate-700 text-slate-300' : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                    }`}
                  >
                    {joiningMeeting ? 'Joining...' : 'Join Class Now'}
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    {isJitsiWarmupActive ? 'Teacher is entering the room' : 'Waiting for the teacher to begin'}
                  </h2>
                  <p className="mb-3 mt-4 max-w-2xl text-base leading-7 text-slate-300">
                    {isJitsiWarmupActive
                      ? 'Students can join 1 minute after the teacher starts the Jitsi room.'
                      : `Only the teacher can start this ${getMeetingProviderLabel(session)} meeting.`}
                  </p>
                  <p className="mb-8 text-slate-500">
                    This page will refresh automatically and let you join once the class starts.
                  </p>
                  <button
                    onClick={() => loadSession()}
                    className="rounded-2xl bg-white/[0.08] px-6 py-4 text-base font-semibold text-white transition hover:bg-white/[0.14]"
                  >
                    Refresh Status
                  </button>
                </>
              )}
                    </div>
                  </div>
                  <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5">
                    <div className="rounded-[1.5rem] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/60 p-5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">Classroom preview</p>
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                          Standby
                        </span>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-3">
                        {participants.slice(0, 4).map((participant) => (
                          <button
                            key={participant.id}
                            type="button"
                            onClick={() => setSelectedParticipant(participant)}
                            className="group rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-cyan-400/30 hover:bg-white/[0.08]"
                          >
                            <div className="flex h-28 items-end rounded-[1.1rem] bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.28),_transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,8,23,0.95))] p-3">
                              <div>
                                <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/80">Participant</p>
                                <p className="mt-2 text-sm font-semibold text-white">{participant.full_name || 'Student'}</p>
                              </div>
                            </div>
                          </button>
                        ))}
                        {participants.length === 0 ? (
                          <div className="col-span-2 rounded-[1.35rem] border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-400">
                            Participant cards will appear here once students are assigned.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {meetingStarted && session.meeting_type === 'jitsi' && (
          <div className="absolute inset-0 overflow-y-auto">
            <div className="mx-auto flex min-h-full max-w-6xl items-center justify-center px-6 py-10">
              <div className="grid w-full gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.95),rgba(8,47,73,0.88))] p-8 shadow-2xl">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
                      <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
                      Room Live
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-slate-200">
                      <ExternalLink size={14} className="text-cyan-300" />
                      Opened in new tab
                    </span>
                  </div>
                  <h2 className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl">SkillPro is running in the full meeting tab</h2>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                    The actual room stays in a separate browser tab to avoid the embedded-session limit. This classroom console remains here for participants, shortcuts, and session controls.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <button
                      onClick={() => openJitsiMeetingWindow(sessionRoomUrl)}
                      className="rounded-2xl bg-cyan-500 px-6 py-4 font-semibold text-slate-950 transition hover:bg-cyan-400"
                    >
                      Reopen SkillPro
                    </button>
                    <a
                      href={sessionRoomUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-2xl border border-white/10 px-6 py-4 font-semibold text-slate-200 transition hover:bg-white/[0.08]"
                    >
                      Open in Browser
                    </a>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(sessionRoomUrl, 'Room link copied')}
                      className="rounded-2xl border border-white/10 px-6 py-4 font-semibold text-slate-200 transition hover:bg-white/[0.08]"
                    >
                      Copy Room Link
                    </button>
                  </div>
                </div>
                <div className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-2xl">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.08]">
                      <GraduationCap size={22} className="text-cyan-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Quick actions</p>
                      <p className="text-sm text-slate-400">Useful tools while the room is open</p>
                    </div>
                  </div>
                  <div className="mt-6 space-y-3">
                    <button
                      type="button"
                      onClick={() => navigate('/app/attendance')}
                      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left transition hover:bg-white/[0.08]"
                    >
                      <span>
                        <span className="block text-sm font-semibold text-white">Open Attendance</span>
                        <span className="block text-xs text-slate-400">Manage attendance and teacher flow</span>
                      </span>
                      <ChevronRight size={18} className="text-slate-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setParticipantsPanelOpen(true)}
                      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left transition hover:bg-white/[0.08]"
                    >
                      <span>
                        <span className="block text-sm font-semibold text-white">Open Participants Rail</span>
                        <span className="block text-xs text-slate-400">Click any participant to open quick actions</span>
                      </span>
                      <ChevronRight size={18} className="text-slate-400" />
                    </button>
                    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm text-cyan-100">
                      Live video thumbnails and per-participant meeting controls are available in the SkillPro meeting tab itself. This page now gives you a cleaner control console around that room.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {meetingStarted && session.meeting_type === 'livekit' && liveKitConnection && (
          <LiveKitClassSession
            key={liveKitConnection.roomName || 'main-room'}
            token={liveKitConnection.token}
            serverUrl={liveKitConnection.serverUrl}
            sessionId={sessionId}
            currentRole={profile?.role}
            currentUserProfile={profile}
            classSession={session}
            onToast={(message) => openPopup('Class control', message, 'info')}
            onLeave={() => {
              if (suppressNextLeaveRef.current) {
                suppressNextLeaveRef.current = false;
                return;
              }
              handleLeaveClassroom();
            }}
          />
        )}
        
        {/* External Meeting Screen */}
        {session.meeting_type === 'external' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Monitor className="mx-auto mb-6 text-purple-400" size={80} />
              <h2 className="text-white text-2xl font-bold mb-4">External Meeting</h2>
              <p className="text-slate-400 mb-8">
                This class is hosted on an external platform
              </p>
              <button
                onClick={handleExternalLink}
                className="bg-purple-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-purple-700 transition shadow-lg"
              >
                Open Meeting Link
              </button>
            </div>
          </div>
        )}
        </div>
        {participantsPanelOpen && session.meeting_type !== 'livekit' ? (
          <aside className="hidden w-[360px] flex-shrink-0 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 shadow-[0_24px_90px_rgba(2,8,23,0.45)] backdrop-blur-xl lg:block">
            <div className="border-b border-white/10 px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Participants</p>
                  <h3 className="mt-2 text-xl font-bold text-white">Classroom Rail</h3>
                </div>
                <div className="rounded-2xl bg-white/[0.05] px-3 py-2 text-right">
                  <p className="text-xs text-slate-400">Invited</p>
                  <p className="text-base font-bold text-white">{attendeeSummary.total}</p>
                </div>
              </div>
            </div>
            <div className="h-full overflow-y-auto p-4">
              <div className="space-y-3">
                {participants.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-400">
                    No participants assigned yet.
                  </div>
                ) : participants.map((participant) => (
                  <button
                    key={participant.id}
                    type="button"
                    onClick={() => setSelectedParticipant(participant)}
                    className="group w-full rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-cyan-400/30 hover:bg-white/[0.08]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-cyan-400 to-blue-600 font-bold text-white shadow-lg">
                        {buildParticipantInitials(participant.full_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-white">{participant.full_name || 'Student'}</p>
                          <ChevronRight size={16} className="text-slate-500 transition group-hover:text-cyan-300" />
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-400">{participant.email || 'No email available'}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                            {participant.role || 'student'}
                          </span>
                          <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                            invited
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      <div className="border-t border-white/10 bg-slate-950/55 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-slate-400">
            Powered by {getMeetingProviderLabel(session)}. Use the participant rail for quick profile and sharing actions.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {(profile.role === 'teacher' || profile.role === 'admin') && meetingStarted && (
              <button
                onClick={endSession}
                className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                <PhoneOff size={18} />
                End Session for All
              </button>
            )}
            <button
              onClick={handleLeaveClassroom}
              className="inline-flex items-center gap-2 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-400/15"
            >
              <PhoneOff size={18} />
              Leave Class
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default LiveClass;
