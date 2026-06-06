import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Calendar, Plus, Clock, Video, ExternalLink, Trash2, X, Link } from 'lucide-react';
import AlertModal from '../components/AlertModal';
import { sendAdminNotification } from '../utils/adminNotifications';
import { logError } from '../utils/errorLogger';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';

const CLASS_MEETING_PROVIDER_KEY = 'class_meeting_provider';

const ClassSchedule = ({
  sessionKind = 'class',
  pageTitle = 'Class Schedule',
  pageDescription = 'Manage daily live sessions (9-10 AM, 5-6 PM)',
  scheduleButtonLabel = 'Schedule Session',
  formTitle = 'Schedule New Session',
}) => {
  const { profile, isPremium } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [joinLink, setJoinLink] = useState('');
  const [meetingType, setMeetingType] = useState('jitsi');
  const [configuredMeetingProvider, setConfiguredMeetingProvider] = useState('jitsi');
  const [students, setStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });
  const [deleteModal, setDeleteModal] = useState({ show: false, sessionId: null, sessionTitle: '' });
  const [endModal, setEndModal] = useState({ show: false, sessionId: null, sessionTitle: '' });
  const [linkModal, setLinkModal] = useState({ show: false, sessionId: null, sessionTitle: '', currentLink: '' });
  const [newMeetingLink, setNewMeetingLink] = useState('');
  const [joiningSessionId, setJoiningSessionId] = useState(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const [pickerState, setPickerState] = useState({
    open: false,
    field: 'start',
    monthDate: new Date(),
    selectedDate: '',
    hour: '09',
    minute: '00',
  });

  const getMinDateTimeLocal = () => {
    const now = new Date();
    now.setSeconds(0, 0);
    const offsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
  };

  const pad2 = (value) => String(value).padStart(2, '0');

  const parseLocalDateTime = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatDateTimeLabel = (value, fallback = 'Select date & time') => {
    const parsed = parseLocalDateTime(value);
    if (!parsed) return fallback;
    return format(parsed, 'dd-MM-yyyy HH:mm');
  };

  const getFieldMinimumDate = (field) => {
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMilliseconds(0);
    if (field === 'end' && scheduledAt) {
      const start = parseLocalDateTime(scheduledAt);
      if (start && start > now) return start;
    }
    return now;
  };

  const openDateTimePicker = (field) => {
    const sourceValue = field === 'start' ? scheduledAt : endsAt;
    const fallbackDate = getFieldMinimumDate(field);
    const parsed = parseLocalDateTime(sourceValue) || fallbackDate;
    setPickerState({
      open: true,
      field,
      monthDate: startOfMonth(parsed),
      selectedDate: format(parsed, 'yyyy-MM-dd'),
      hour: pad2(parsed.getHours()),
      minute: pad2(parsed.getMinutes()),
    });
  };

  const closeDateTimePicker = () => {
    setPickerState((prev) => ({ ...prev, open: false }));
  };

  const applyDateTimePicker = () => {
    const { field, selectedDate, hour, minute } = pickerState;
    if (!selectedDate) {
      setAlertModal({
        show: true,
        title: 'Missing Date',
        message: 'Please choose a date before applying.',
        type: 'warning'
      });
      return;
    }

    const composedValue = `${selectedDate}T${hour}:${minute}`;
    const pickedDate = parseLocalDateTime(composedValue);
    const minimumDate = getFieldMinimumDate(field);

    if (!pickedDate || isBefore(pickedDate, minimumDate)) {
      setAlertModal({
        show: true,
        title: 'Past Time Not Allowed',
        message: 'Please choose a current or future time only.',
        type: 'warning'
      });
      return;
    }

    if (field === 'end' && scheduledAt) {
      const startDate = parseLocalDateTime(scheduledAt);
      if (startDate && pickedDate <= startDate) {
        setAlertModal({
          show: true,
          title: 'Invalid Duration',
          message: 'Session upto time must be after start time.',
          type: 'warning'
        });
        return;
      }
    }

    if (field === 'start') {
      setScheduledAt(composedValue);
      const currentEnd = parseLocalDateTime(endsAt);
      if (currentEnd && pickedDate >= currentEnd) {
        setEndsAt('');
      }
    } else {
      setEndsAt(composedValue);
    }

    closeDateTimePicker();
  };

  // Convert datetime-local value to UTC ISO assuming input is IST clock time.
  // This keeps 18:14 entered by teacher displayed as 18:14 for all users in IST.
  const istLocalToUtcIso = (dateTimeLocal) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(dateTimeLocal || '');
    if (!match) return null;
    const [, y, m, d, hh, mm] = match;
    const utcMs = Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm)
    ) - (5.5 * 60 * 60 * 1000); // IST offset
    return new Date(utcMs).toISOString();
  };

  useEffect(() => {
    if (!profile?.id || !profile?.role) return;
    loadSessions();
    loadStudents();
    loadMeetingProvider();
    if (profile.role === 'admin') {
      loadTeachers();
    }
  }, [profile?.id, profile?.role, sessionKind]);

  // Auto refresh every 1 minute:
  // - refresh sessions so newly scheduled classes appear automatically
  // - update time-based status (upcoming/completed) without manual reload
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
      loadSessions();
    }, 60000);
    return () => clearInterval(interval);
  }, [profile?.id, profile?.role, sessionKind]);

  const loadTeachers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'teacher')
      .order('full_name');
    setTeachers(data || []);
  };

  const loadMeetingProvider = async () => {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', CLASS_MEETING_PROVIDER_KEY)
      .maybeSingle();

    const provider = data?.value === 'livekit' ? 'livekit' : 'jitsi';
    setConfiguredMeetingProvider(provider);
    setMeetingType(provider);
  };

  const loadStudents = async () => {
    let query = supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'student');

    if (profile?.role === 'teacher') {
      query = query.eq('assigned_teacher_id', profile.id);
    }

    const { data } = await query.order('full_name');
    setStudents(data || []);
  };

  const buildSessionsQuery = () => {
    if (profile?.role === 'admin') {
      return supabase
        .from('class_sessions')
        .select('*, class_session_participants(student_id, profiles(full_name))');
    }

    if (profile?.role === 'teacher') {
      return supabase
        .from('class_sessions')
        .select('*, class_session_participants(student_id, profiles(full_name))')
        .eq('teacher_id', profile.id);
    }

    return supabase
      .from('class_sessions')
      .select('*, class_session_participants!inner(student_id)')
      .eq('class_session_participants.student_id', profile.id);
  };

  const loadSessions = async () => {
    if (!profile?.id) return;

    const kindFilter = sessionKind === 'class' ? `session_kind.eq.class,session_kind.is.null` : `session_kind.eq.${sessionKind}`;
    let usedKindFilter = true;
    let result = await buildSessionsQuery()
      .or(kindFilter)
      .order('scheduled_for', { ascending: false });

    if (result.error && String(result.error.message || '').includes('session_kind')) {
      usedKindFilter = false;
      result = await buildSessionsQuery().order('scheduled_for', { ascending: false });
    }

    const data = !usedKindFilter
      ? (result.data || [])
      : sessionKind === 'class'
      ? (result.data || []).filter((row) => !row.session_kind || row.session_kind === 'class')
      : (result.data || []).filter((row) => row.session_kind === sessionKind);

    setSessions(data || []);
  };

  const getSessionEndTime = (session) => {
    if (session?.ends_at) return new Date(session.ends_at);
    const start = new Date(session.scheduled_for);
    return new Date(start.getTime() + 60 * 60 * 1000);
  };

  const hasSessionEnded = (session) => session?.status === 'ended';

  const isSessionCompleted = (session) => {
    // nowTick forces re-render and status recomputation every minute.
    void nowTick;
    return hasSessionEnded(session) || new Date() >= getSessionEndTime(session);
  };

  const endSession = async () => {
    const sessionId = endModal.sessionId;
    setEndModal({ show: false, sessionId: null, sessionTitle: '' });
    if (!sessionId) return;

    try {
      const { error } = await supabase
        .from('class_sessions')
        .update({
          status: 'ended',
          ends_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) throw error;

      setAlertModal({
        show: true,
        title: 'Session Ended',
        message: 'The session is now marked as completed for students.',
        type: 'success'
      });

      loadSessions();
    } catch (error) {
      logError({ message: 'Error ending session:', source: 'ClassSchedule', details: error });
      setAlertModal({
        show: true,
        title: 'Error',
        message: 'Failed to end session.',
        type: 'error'
      });
    }
  };

  const deleteSession = async () => {
    const sessionId = deleteModal.sessionId;
    setDeleteModal({ show: false, sessionId: null, sessionTitle: '' });

    try {
      // Delete participants first
      await supabase
        .from('class_session_participants')
        .delete()
        .eq('session_id', sessionId);

      // Delete session
      const { error } = await supabase
        .from('class_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;

      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Session deleted successfully',
        type: 'success'
      });

      loadSessions();
    } catch (error) {
      logError({ message: 'Error deleting session:', source: 'ClassSchedule', details: error });
      setAlertModal({
        show: true,
        title: 'Error',
        message: 'Failed to delete session',
        type: 'error'
      });
    }
  };

  const handleUpdateMeetingLink = async () => {
    const sessionId = linkModal.sessionId;
    const link = newMeetingLink.trim();
    if (!link) {
      setAlertModal({ show: true, title: 'Missing Link', message: 'Please enter a meeting link.', type: 'warning' });
      return;
    }
    const { error } = await supabase.from('class_sessions').update({ meeting_link: link }).eq('id', sessionId);
    if (error) {
      setAlertModal({ show: true, title: 'Error', message: 'Failed to update meeting link.', type: 'error' });
    } else {
      setAlertModal({ show: true, title: 'Success', message: 'Meeting link updated successfully.', type: 'success' });
      loadSessions();
    }
    setLinkModal({ show: false, sessionId: null, sessionTitle: '', currentLink: '' });
    setNewMeetingLink('');
  };

  const createSession = async () => {
    if (creatingSession) return;
    if (!title || !scheduledAt || !endsAt) {
      setAlertModal({
        show: true,
        title: 'Missing Information',
        message: 'Please fill session title, start time and session upto time',
        type: 'warning'
      });
      return;
    }

    if (profile.role === 'admin' && !selectedTeacher) {
      setAlertModal({
        show: true,
        title: 'Missing Teacher',
        message: 'Please select a teacher for this session',
        type: 'warning'
      });
      return;
    }
    setCreatingSession(true);

    const selectedMeetingType = configuredMeetingProvider === 'livekit' ? 'livekit' : 'jitsi';
    const link = null;
    
    const isoDateString = istLocalToUtcIso(scheduledAt);
    if (!isoDateString) {
      setAlertModal({
        show: true,
        title: 'Invalid Date',
        message: 'Please select a valid date and time',
        type: 'warning'
      });
      return;
    }
    const endsAtIso = istLocalToUtcIso(endsAt);
    if (!endsAtIso) {
      setAlertModal({
        show: true,
        title: 'Invalid End Time',
        message: 'Please select a valid session upto time',
        type: 'warning'
      });
      return;
    }
    const selectedLocalStart = parseLocalDateTime(scheduledAt);
    if (!selectedLocalStart || selectedLocalStart < new Date()) {
      setAlertModal({
        show: true,
        title: 'Past Time Not Allowed',
        message: 'Teachers cannot create or schedule sessions for previous time slots. Please choose a future start time.',
        type: 'warning'
      });
      return;
    }
    if (new Date(endsAtIso) <= new Date(isoDateString)) {
      setAlertModal({
        show: true,
        title: 'Invalid Duration',
        message: 'Session upto time must be after start time',
        type: 'warning'
      });
      return;
    }
    
    const teacherId = profile.role === 'admin' ? selectedTeacher : profile.id;

    const sessionPayload = {
      teacher_id: teacherId,
      title,
      scheduled_for: isoDateString,
      ends_at: endsAtIso,
      meeting_link: link,
      meeting_type: selectedMeetingType,
      session_kind: sessionKind,
      livekit_controls: {
        waiting_room_enabled: true,
        private_participants_enabled: true,
        cohost_user_ids: [],
        admitted_user_ids: [],
        waiting_user_ids: [],
        room_locked: false,
      },
    };

    let { data: sessionData, error: sessionError } = await supabase.from('class_sessions').insert(sessionPayload).select().single();
    if (sessionError && (String(sessionError.message || '').includes('session_kind') || String(sessionError.message || '').includes('livekit_controls'))) {
      const fallbackPayload = { ...sessionPayload };
      delete fallbackPayload.session_kind;
      delete fallbackPayload.livekit_controls;
      const fallbackResult = await supabase.from('class_sessions').insert(fallbackPayload).select().single();
      sessionData = fallbackResult.data;
      sessionError = fallbackResult.error;
    }

    if (sessionError) {
      setAlertModal({
        show: true,
        title: 'Error',
        message: 'Failed to create session',
        type: 'error'
      });
      setCreatingSession(false);
      return;
    }

    // Add participants:
    // - selected students, or
    // - all students when none selected.
    const recipientStudentIds = selectedStudents.length > 0
      ? selectedStudents
      : (students || []).map((s) => s.id);

    if (recipientStudentIds.length > 0) {
      const participants = recipientStudentIds.map(studentId => ({
        session_id: sessionData.id,
        student_id: studentId
      }));
      const { error: participantError } = await supabase
        .from('class_session_participants')
        .insert(participants);

      if (participantError) {
        setAlertModal({
          show: true,
          title: 'Error',
          message: 'Session created, but failed to assign students',
          type: 'warning'
        });
      }
    }

    // Create class notifications for scheduled students so they see it in dashboard/notifications.
    try {
      const schedulerName = profile?.full_name || 'Teacher';
      const sessionTime = new Date(sessionData.scheduled_for).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
      });
      const basePayload = {
        title: `Class Scheduled: ${title}`,
        content: `${schedulerName} scheduled "${title}" for ${sessionTime} (upto ${new Date(sessionData.ends_at || new Date(new Date(sessionData.scheduled_for).getTime() + 60 * 60 * 1000)).toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata'
        })}).`,
        type: 'info',
        target_role: 'student'
      };

      if (recipientStudentIds.length > 0) {
        const notificationRows = recipientStudentIds.map((studentId) => ({
          ...basePayload,
          target_user_id: studentId,
          class_session_id: sessionData.id,
          admin_id: profile?.id || null
        }));
        const { error: notifError } = await supabase.from('admin_notifications').insert(notificationRows);
        if (notifError && (String(notifError.message || '').includes('target_user_id') || String(notifError.message || '').includes('class_session_id'))) {
          // Backward compatibility when new columns are not present yet.
          const fallbackRows = recipientStudentIds.map((studentId) => ({
            ...basePayload,
            content: `[target_user_id:${studentId}] ${basePayload.content}`,
            admin_id: profile?.id || null
          }));
          await supabase.from('admin_notifications').insert(fallbackRows);
        }
      } else {
        const { error: notifError } = await supabase.from('admin_notifications').insert({
          ...basePayload,
          class_session_id: sessionData.id,
          admin_id: profile?.id || null
        });
        if (notifError && String(notifError.message || '').includes('class_session_id')) {
          await supabase.from('admin_notifications').insert({
            ...basePayload,
            admin_id: profile?.id || null
          });
        }
      }
    } catch (notificationError) {
      logError({ message: 'Failed to create class notifications:', source: 'ClassSchedule', details: notificationError });
    }

    if (profile?.role === 'teacher') {
      await sendAdminNotification({
        title: 'New Class Scheduled',
        content: `${profile?.full_name || 'Teacher'} scheduled "${title}" for ${new Date(sessionData.scheduled_for).toLocaleString('en-IN')}.`,
        admin_id: profile?.id || null,
      });
    }
    
    setTitle('');
    setScheduledAt('');
    setEndsAt('');
    setJoinLink('');
    setMeetingType(configuredMeetingProvider);
    setSelectedStudents([]);
    setSelectedTeacher('');
    setShowForm(false);
    setAlertModal({
      show: true,
      title: 'Success',
      message: 'Session scheduled and student notifications sent.',
      type: 'success'
    });
    loadSessions();
    setCreatingSession(false);
  };

  const isFreeStudent = profile?.role === 'student' && !isPremium(profile);
  const builtInProviderLabel = 'SucessKart';
  const isBuiltInProviderLiveKit = configuredMeetingProvider === 'livekit';

  if (isFreeStudent) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{pageTitle}</h1>
            <p className="text-slate-500">{pageDescription}</p>
          </div>
        </div>

        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-6">
          <h2 className="text-xl font-bold text-amber-900 mb-2">Upgrade to Premium</h2>
          <p className="text-amber-800 mb-4">
            Live classes are available for premium members only.
          </p>
          <a
            href="/app/payment"
            className="inline-block px-5 py-2.5 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700"
          >
            Upgrade Now
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{pageTitle}</h1>
          <p className="text-slate-500">{pageDescription}</p>
        </div>
        {(profile.role === 'teacher' || profile.role === 'admin') && (
          <button 
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus size={20} />
            {scheduleButtonLabel}
          </button>
        )}
      </div>

      {showForm && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-800 px-6 py-5 text-white">
            <h2 className="text-xl font-bold">{formTitle}</h2>
            <p className="mt-1 text-sm text-slate-200">Choose a future slot, assign students, and publish the class in one step.</p>
          </div>
          <div className="space-y-4 p-6">
            {profile.role === 'admin' && (
              <div>
                <label className="block text-sm font-semibold mb-2 text-slate-700">Assign Teacher</label>
                <select
                  value={selectedTeacher}
                  onChange={e => setSelectedTeacher(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">Choose teacher...</option>
                  {teachers.map(teacher => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.full_name} ({teacher.email})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold mb-2 text-slate-700">Session Title</label>
              <input 
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g., Python Basics - Morning Session"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2 text-slate-700">Date & Time</label>
              <button
                type="button"
                onClick={() => openDateTimePicker('start')}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-slate-900 transition hover:border-blue-300 hover:bg-white"
              >
                <span>{formatDateTimeLabel(scheduledAt, 'Select start date & time')}</span>
                <Calendar size={18} className="text-blue-600" />
              </button>
              <p className="text-xs text-slate-500 mt-1">
                Recommended slots: 9:00-10:00 AM or 5:00-6:00 PM. Past times are disabled.
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2 text-slate-700">Session Upto</label>
              <button
                type="button"
                onClick={() => openDateTimePicker('end')}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-slate-900 transition hover:border-blue-300 hover:bg-white"
              >
                <span>{formatDateTimeLabel(endsAt, 'Select session upto time')}</span>
                <Clock size={18} className="text-indigo-600" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2 text-slate-700">Meeting Platform</label>
              <div className={`rounded-2xl border-2 p-4 ${isBuiltInProviderLiveKit ? 'border-emerald-300 bg-emerald-50' : 'border-blue-300 bg-blue-50'}`}>
                <div className="font-semibold text-sm">{builtInProviderLabel}</div>
                <div className="text-xs text-slate-500">Selected by admin in Choose Meet</div>
              </div>
              <p className={`mt-2 text-xs ${isBuiltInProviderLiveKit ? 'text-emerald-700' : 'text-green-600'}`}>
                Meeting room will be opened inside SucessKart for this class session.
              </p>
              <div className="hidden grid grid-cols-2 gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => setMeetingType('jitsi')}
                  className={`p-4 border-2 rounded-2xl text-left transition ${
                    meetingType === 'jitsi' 
                      ? 'border-blue-600 bg-blue-50 shadow-sm' 
                      : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-semibold text-sm">SucessKart</div>
                  <div className="text-xs text-slate-500">Our Platform</div>
                </button>
                <button
                  type="button"
                  onClick={() => setMeetingType('external')}
                  className={`p-4 border-2 rounded-2xl text-left transition ${
                    meetingType === 'external' 
                      ? 'border-purple-600 bg-purple-50 shadow-sm' 
                      : 'border-slate-200 hover:border-purple-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-semibold text-sm">External Link</div>
                  <div className="text-xs text-slate-500">Zoom, Meet, etc.</div>
                </button>
              </div>
              {meetingType === 'external' && (
                <input 
                  type="text"
                  value={joinLink}
                  onChange={e => setJoinLink(e.target.value)}
                  placeholder="https://zoom.us/j/... or Google Meet link"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-purple-400 focus:bg-white focus:ring-4 focus:ring-purple-100"
                  required
                />
              )}
              {false && meetingType === 'jitsi' && (
                <p className="text-xs text-green-600 mt-2">
                  ✓ Meeting room will be automatically created with SucessKart
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2 text-slate-700">
                Select Students (Optional - Leave empty for all assigned students)
              </label>
              <div className="border border-slate-200 rounded-2xl bg-slate-50 p-3 max-h-48 overflow-y-auto space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedStudents.length === students.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedStudents(students.map(s => s.id));
                      } else {
                        setSelectedStudents([]);
                      }
                    }}
                    className="rounded"
                  />
                  <span className="font-semibold">Select All ({students.length})</span>
                </label>
                <div className="border-t border-slate-200 pt-2 space-y-1">
                  {students.map(student => (
                    <label key={student.id} className="flex items-center gap-2 text-sm hover:bg-white p-2 rounded-xl transition">
                      <input
                        type="checkbox"
                        checked={selectedStudents.includes(student.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStudents([...selectedStudents, student.id]);
                          } else {
                            setSelectedStudents(selectedStudents.filter(id => id !== student.id));
                          }
                        }}
                        className="rounded"
                      />
                      <span>{student.full_name}</span>
                      <span className="text-xs text-slate-400">({student.email})</span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {selectedStudents.length === 0 ? 'All assigned students can join' : `${selectedStudents.length} student(s) selected`}
              </p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={createSession}
                disabled={creatingSession}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-2xl hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-100 font-semibold disabled:cursor-not-allowed disabled:from-slate-400 disabled:to-slate-500"
              >
                {creatingSession ? 'Creating Session...' : 'Create Session'}
              </button>
              <button 
                onClick={() => setShowForm(false)}
                className="bg-white border border-slate-300 text-slate-700 px-6 py-3 rounded-2xl hover:bg-slate-50 font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {pickerState.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-800 to-blue-800 px-6 py-5 text-white">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">
                  {pickerState.field === 'start' ? 'Start Time' : 'End Time'}
                </p>
                <h3 className="mt-2 text-2xl font-bold">
                  {formatDateTimeLabel(
                    pickerState.selectedDate ? `${pickerState.selectedDate}T${pickerState.hour}:${pickerState.minute}` : '',
                    'Pick date & time'
                  )}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeDateTimePicker}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
                aria-label="Close date picker"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="border-b border-slate-200 p-6 lg:border-b-0 lg:border-r">
                <div className="mb-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setPickerState((prev) => ({ ...prev, monthDate: subMonths(prev.monthDate, 1) }))}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Prev
                  </button>
                  <p className="text-lg font-bold text-slate-900">{format(pickerState.monthDate, 'MMMM, yyyy')}</p>
                  <button
                    type="button"
                    onClick={() => setPickerState((prev) => ({ ...prev, monthDate: addMonths(prev.monthDate, 1) }))}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-2 text-center text-sm font-semibold text-slate-500">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                    <div key={day} className="py-2">{day}</div>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-7 gap-2">
                  {eachDayOfInterval({
                    start: startOfWeek(startOfMonth(pickerState.monthDate)),
                    end: endOfWeek(endOfMonth(pickerState.monthDate)),
                  }).map((day) => {
                    const minimumDate = getFieldMinimumDate(pickerState.field);
                    const dayDisabled = isBefore(day, new Date(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate())) && !isSameDay(day, minimumDate);
                    const isSelected = pickerState.selectedDate === format(day, 'yyyy-MM-dd');
                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        disabled={dayDisabled}
                        onClick={() => setPickerState((prev) => ({ ...prev, selectedDate: format(day, 'yyyy-MM-dd') }))}
                        className={`h-12 rounded-2xl text-sm font-semibold transition ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-100'
                            : isSameMonth(day, pickerState.monthDate)
                            ? 'bg-slate-50 text-slate-800 hover:bg-blue-50'
                            : 'bg-slate-50/60 text-slate-300'
                        } ${dayDisabled ? 'cursor-not-allowed opacity-40' : ''}`}
                      >
                        {format(day, 'd')}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="mb-3 text-sm font-semibold text-slate-700">Hour</p>
                    <div className="max-h-80 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2">
                      {Array.from({ length: 24 }, (_, hour) => pad2(hour)).map((hour) => (
                        <button
                          key={hour}
                          type="button"
                          onClick={() => setPickerState((prev) => ({ ...prev, hour }))}
                          className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
                            pickerState.hour === hour
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-slate-700 hover:bg-blue-50'
                          }`}
                        >
                          {hour}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-sm font-semibold text-slate-700">Minute</p>
                    <div className="max-h-80 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2">
                      {Array.from({ length: 60 }, (_, minute) => pad2(minute)).map((minute) => (
                        <button
                          key={minute}
                          type="button"
                          onClick={() => setPickerState((prev) => ({ ...prev, minute }))}
                          className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
                            pickerState.minute === minute
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white text-slate-700 hover:bg-indigo-50'
                          }`}
                        >
                          {minute}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={closeDateTimePicker}
                    className="rounded-2xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = getFieldMinimumDate(pickerState.field);
                      setPickerState((prev) => ({
                        ...prev,
                        monthDate: startOfMonth(now),
                        selectedDate: format(now, 'yyyy-MM-dd'),
                        hour: pad2(now.getHours()),
                        minute: pad2(now.getMinutes()),
                      }));
                    }}
                    className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 font-semibold text-blue-700 transition hover:bg-blue-100"
                  >
                    Now
                  </button>
                  <button
                    type="button"
                    onClick={applyDateTimePicker}
                    className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3 font-semibold text-white shadow-lg shadow-blue-100 transition hover:from-blue-700 hover:to-indigo-700"
                  >
                    Apply Date & Time
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-6 border">
        <h2 className="text-lg font-bold mb-4">Upcoming Sessions</h2>
        <div className="space-y-3">
          {sessions.filter((s) => !isSessionCompleted(s)).map(session => (
            (() => {
              const isStudent = profile.role === 'student';
              const isTeacher = profile.role === 'teacher';
              const start = new Date(session.scheduled_for);
              const end = getSessionEndTime(session);
              const now = new Date();
              const canJoinNow = !hasSessionEnded(session) && (profile.role === 'admin' || ((isStudent || isTeacher) ? (now >= start && now < end) : now < end));
              return (
            <div key={session.id} className="flex items-center justify-between p-4 border rounded-lg hover:shadow-md transition">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${(session.meeting_type === 'jitsi' || session.meeting_type === 'livekit') ? 'bg-blue-100' : 'bg-purple-100'}`}>
                  {(session.meeting_type === 'jitsi' || session.meeting_type === 'livekit') ? (
                    <Video className="text-blue-600" size={24} />
                  ) : (
                    <ExternalLink className="text-purple-600" size={24} />
                  )}
                </div>
                <div>
                  <p className="font-semibold">{session.title}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(session.scheduled_for).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                      timeZone: 'Asia/Kolkata'
                    })}
                  </p>
                  <p className="text-xs text-slate-500">
                    Upto: {getSessionEndTime(session).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                      timeZone: 'Asia/Kolkata'
                    })}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {(session.meeting_type === 'jitsi' || session.meeting_type === 'livekit') ? '🟢 SucessKart' : '🔗 External Platform'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(session.meeting_type === 'jitsi' || session.meeting_type === 'livekit') ? (
                  <button
                    onClick={() => {
                      if (!canJoinNow) return;
                      setJoiningSessionId(session.id);
                      navigate(`/live-class/${session.id}`);
                    }}
                    disabled={!canJoinNow || joiningSessionId === session.id}
                    className={`px-6 py-2 rounded-lg text-sm flex items-center gap-2 transition ${
                      canJoinNow && joiningSessionId !== session.id
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-slate-300 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <Video size={18} />
                    {joiningSessionId === session.id ? 'Joining...' : canJoinNow ? 'Join Class' : 'Available at Scheduled Time'}
                  </button>
                ) : (
                  <a 
                    href={session.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (!canJoinNow) e.preventDefault();
                    }}
                    className={`px-6 py-2 rounded-lg text-sm flex items-center gap-2 transition ${
                      canJoinNow
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-slate-300 text-slate-600 pointer-events-none'
                    }`}
                  >
                    <ExternalLink size={18} />
                    {canJoinNow ? 'Open Link' : 'Available at Scheduled Time'}
                  </a>
                )}
                {(profile.role === 'teacher' || profile.role === 'admin') && (
                  <button
                    onClick={() => setEndModal({ show: true, sessionId: session.id, sessionTitle: session.title })}
                    className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-amber-700 transition"
                    title="End Session"
                  >
                    End
                  </button>
                )}
                {profile.role === 'admin' && (
                  <button
                    onClick={() => {
                      setNewMeetingLink(session.meeting_link || '');
                      setLinkModal({ show: true, sessionId: session.id, sessionTitle: session.title, currentLink: session.meeting_link || '' });
                    }}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700 transition"
                    title={session.meeting_link ? 'Edit Meeting Link' : 'Add Meeting Link'}
                  >
                    <Link size={16} className="mr-1" />
                    {session.meeting_link ? 'Edit Link' : 'Add Link'}
                  </button>
                )}
                {(profile.role === 'teacher' || profile.role === 'admin') && (
                  <button
                    onClick={() => setDeleteModal({ show: true, sessionId: session.id, sessionTitle: session.title })}
                    className="bg-red-600 text-white p-2 rounded-lg text-sm hover:bg-red-700 transition"
                    title="Delete Session"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
              );
            })()
          ))}
          {sessions.filter((s) => !isSessionCompleted(s)).length === 0 && (
            <p className="text-center text-slate-400 py-8">No upcoming sessions</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border">
        <h2 className="text-lg font-bold mb-4">Past Sessions</h2>
        <div className="space-y-2">
          {sessions.filter((s) => isSessionCompleted(s)).map(session => (
            <div key={session.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="font-semibold text-sm">{session.title}</p>
                <p className="text-xs text-slate-500">
                  {new Date(session.scheduled_for).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'Asia/Kolkata'
                  })}
                </p>
                <p className="text-xs text-slate-500">
                  Upto: {getSessionEndTime(session).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'Asia/Kolkata'
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-slate-200 text-slate-600 px-3 py-1 rounded-full">
                  Completed
                </span>
                {(profile.role === 'teacher' || profile.role === 'admin') && (
                  <button
                    onClick={() => setDeleteModal({ show: true, sessionId: session.id, sessionTitle: session.title })}
                    className="text-red-600 hover:text-red-700 p-1"
                    title="Delete Session"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {sessions.filter((s) => isSessionCompleted(s)).length === 0 && (
            <p className="text-center text-slate-400 py-4">No past sessions</p>
          )}
        </div>
      </div>
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />

      {/* Delete Confirmation Modal */}
      {deleteModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="bg-red-100 p-3 rounded-full">
                <Trash2 className="text-red-600" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Session</h3>
                <p className="text-gray-600 mb-1">Are you sure you want to delete this session?</p>
                <p className="text-sm font-semibold text-gray-800 mb-4">"{deleteModal.sessionTitle}"</p>
                <p className="text-sm text-red-600">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setDeleteModal({ show: false, sessionId: null, sessionTitle: '' })}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={deleteSession}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {endModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="bg-amber-100 p-3 rounded-full">
                <Clock className="text-amber-600" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-2">End Session</h3>
                <p className="text-gray-600 mb-1">Are you sure you want to end this session now?</p>
                <p className="text-sm font-semibold text-gray-800 mb-4">"{endModal.sessionTitle}"</p>
                <p className="text-sm text-amber-700">Students will immediately see this session as completed.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEndModal({ show: false, sessionId: null, sessionTitle: '' })}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={endSession}
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium transition"
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}

      {linkModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">{linkModal.currentLink ? 'Edit' : 'Add'} Meeting Link</h3>
            <p className="text-sm text-gray-600 mb-4">{linkModal.sessionTitle}</p>
            <input
              type="url"
              value={newMeetingLink}
              onChange={(e) => setNewMeetingLink(e.target.value)}
              placeholder="https://zoom.us/j/... or Google Meet link"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setLinkModal({ show: false, sessionId: null, sessionTitle: '', currentLink: '' }); setNewMeetingLink(''); }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateMeetingLink}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition"
              >
                Save Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassSchedule;
