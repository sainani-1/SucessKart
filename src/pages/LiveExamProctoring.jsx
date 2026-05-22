import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import LiveExamStreamMonitor from '../components/LiveExamStreamMonitor';
import AvatarImage from '../components/AvatarImage';
import { logWarn } from '../utils/errorLogger';

const LIVE_EXAM_CONTEXT_KEY = 'live_exam_context';
const BOOKING_WINDOW_DAYS = 60;
const DEFAULT_LOCK_DAYS = 60;
const LIVE_EXAM_PROFILE_FIELDS = 'id, full_name, email, role, assigned_teacher_id, premium_until, avatar_url, is_exam_banned, exam_ban_reason, exam_banned_at';
const LIVE_EXAM_PROFILE_FIELDS_FALLBACK = 'id, full_name, email, role, assigned_teacher_id, premium_until, avatar_url';

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

const nowIso = () => new Date().toISOString();

const slotIsJoinable = (slot) => {
  if (!slot?.starts_at || !slot?.ends_at) return false;
  const now = Date.now();
  const start = new Date(slot.starts_at).getTime();
  const end = new Date(slot.ends_at).getTime();
  return now >= start && now <= end && slot.status !== 'cancelled';
};

const slotHasEnded = (slot) => {
  if (!slot?.ends_at) return false;
  return new Date(slot.ends_at).getTime() < Date.now();
};

const getEffectiveBookingStatus = (booking, slot, session = null) => {
  const bookingStatus = String(booking?.status || '').toLowerCase();
  const sessionStatus = String(session?.status || '').toLowerCase();
  if (slotHasEnded(slot) && !['cancelled', 'terminated', 'absent'].includes(bookingStatus) && !['cancelled', 'terminated', 'disconnected'].includes(sessionStatus)) {
    return 'completed';
  }
  return bookingStatus || sessionStatus || 'pending';
};

const slotIsBookable = (slot) => {
  if (!slot?.starts_at || slot?.status === 'cancelled') return false;
  const startsAt = new Date(slot.starts_at).getTime();
  const cutoff = Date.now() + BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return startsAt >= Date.now() && startsAt <= cutoff;
};

const slotIsStillLiveVisible = (slot) => {
  if (!slot) return false;
  return slot.status !== 'cancelled';
};

const slotIsOngoingWindow = (slot) => {
  if (!slot?.starts_at || !slot?.ends_at) return false;
  const now = Date.now();
  return new Date(slot.starts_at).getTime() <= now && new Date(slot.ends_at).getTime() >= now;
};

const sessionIsCurrentlyLiveForSlot = (session, slot) => {
  if (!session || !slot) return false;
  return String(session.status || '').toLowerCase() === 'active' && slotIsOngoingWindow(slot);
};

const sessionIsWriting = (session) => ['active', 'paused'].includes(String(session?.status || '').toLowerCase());

const getSessionMediaScore = (session) => (
  Number(Boolean(session?.camera_connected)) +
  Number(Boolean(session?.mic_connected)) +
  Number(Boolean(session?.screen_share_connected))
);

const getSessionStatusPriority = (session) => {
  const status = String(session?.status || '').toLowerCase();
  if (status === 'active') return 4;
  if (status === 'paused') return 3;
  if (status === 'scheduled') return 2;
  if (status === 'disconnected') return 1;
  return 0;
};

const getSessionRecency = (session) => new Date(session?.updated_at || session?.started_at || session?.created_at || 0).getTime();

const choosePreferredLiveSession = (currentSession, nextSession) => {
  if (!currentSession) return nextSession || null;
  if (!nextSession) return currentSession;

  const currentMediaScore = getSessionMediaScore(currentSession);
  const nextMediaScore = getSessionMediaScore(nextSession);
  if (nextMediaScore !== currentMediaScore) {
    return nextMediaScore > currentMediaScore ? nextSession : currentSession;
  }

  const currentPriority = getSessionStatusPriority(currentSession);
  const nextPriority = getSessionStatusPriority(nextSession);
  if (nextPriority !== currentPriority) {
    return nextPriority > currentPriority ? nextSession : currentSession;
  }

  const currentRecency = getSessionRecency(currentSession);
  const nextRecency = getSessionRecency(nextSession);
  return nextRecency >= currentRecency ? nextSession : currentSession;
};

const getMonitoringSessionForBooking = (booking, sessionByBookingId, latestUsableSessionByStudentId) => {
  const rawSession = sessionByBookingId[booking.id];
  const latestStudentSession = latestUsableSessionByStudentId[String(booking.student_id || '')] || null;
  const sessionStatus = String(rawSession?.status || '').toLowerCase();
  if (!rawSession || ['terminated', 'disconnected'].includes(sessionStatus)) {
    return latestStudentSession || rawSession;
  }
  if (!latestStudentSession) {
    return rawSession;
  }
  return choosePreferredLiveSession(rawSession, latestStudentSession);
};

const roomNameForSlot = (slot, exam) =>
  slot?.monitor_room_name || `SkillPro_Exam_${exam?.id || slot?.exam_id || 'slot'}_${slot?.id || Date.now()}`;

const getExamDisplayName = (exam, course) => {
  const examName = String(exam?.test_name || '').trim();
  const courseName = String(course?.title || '').trim();
  if (examName && courseName) return `${examName} - ${courseName}`;
  if (examName) return examName;
  if (courseName) return `Final Exam - ${courseName}`;
  return exam?.id ? `Exam ${exam.id}` : 'Exam';
};

const getSlotHeadline = (slot, exam, course) => {
  const examLabel = getExamDisplayName(exam, course);
  const slotTitle = String(slot?.title || '').trim();
  if (!slotTitle) return examLabel;
  if (slotTitle.toLowerCase() === examLabel.toLowerCase()) return examLabel;
  return `${examLabel} | ${slotTitle}`;
};

const buildSlotTitle = (slotTitle, examLabel, startsAt) =>
  slotTitle || `${examLabel} - ${new Date(startsAt).toLocaleDateString('en-IN')}`;

const toLocalDateInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (value, days) => {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
};

const setDateKeepingTime = (sourceDate, targetDate) => {
  const next = new Date(targetDate);
  next.setHours(sourceDate.getHours(), sourceDate.getMinutes(), 0, 0);
  return next;
};

const getMonthStart = (value) => {
  const base = value ? new Date(`${value}T00:00:00`) : new Date();
  return new Date(base.getFullYear(), base.getMonth(), 1);
};

const formatMonthLabel = (date) =>
  date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

const buildCalendarDays = (monthDate) => {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startWeekday = (start.getDay() + 6) % 7;
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - startWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      dateValue: toLocalDateInputValue(date),
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === monthDate.getMonth(),
    };
  });
};

async function insertNotifications(rows) {
  if (!rows.length) return;
  let { error } = await supabase.from('admin_notifications').insert(rows);
  if (
    error &&
    String([error.message, error.details, error.hint].filter(Boolean).join(' ').toLowerCase()).includes('target_user_id')
  ) {
    const fallbackRows = rows.map(({ target_user_id, content, ...rest }) => ({
      ...rest,
      content: target_user_id && !String(content || '').includes('[target_user_id:')
        ? `[target_user_id:${target_user_id}] ${content || ''}`
        : content,
    }));
    const fallback = await supabase.from('admin_notifications').insert(fallbackRows);
    error = fallback.error;
  }
  if (error) {
    const message = String([error.message, error.details, error.hint].filter(Boolean).join(' ').toLowerCase());
    if (message.includes('row-level security') || message.includes('permission denied')) {
      logWarn({ message: 'Live exam notifications skipped because admin_notifications is blocked by RLS.', source: 'LiveExamProctoring', details: null })
      return false;
    }
    throw error;
  }
  return true;
}

async function insertLiveSystemMessages(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from('exam_live_messages').insert(rows);
  if (error) {
    logWarn({ message: 'Live exam fallback messages failed.', source: 'LiveExamProctoring', details: error.message || error })
  }
}

const uniqueIds = (ids) => Array.from(new Set((ids || []).filter(Boolean).map((id) => String(id))));
const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '')
  );

const countActiveBookingsBySlot = (bookingRows) => {
  const counts = {};
  (bookingRows || []).forEach((booking) => {
    if (String(booking.status || '').toLowerCase() === 'cancelled') return;
    const slotId = String(booking.slot_id || '');
    if (!slotId) return;
    counts[slotId] = (counts[slotId] || 0) + 1;
  });
  return counts;
};

async function loadNotificationRecipientRoles(recipientIds, fallbackRole) {
  const ids = uniqueIds(recipientIds).filter(isUuid);
  const fallbackMap = ids.map((id) => ({ id, role: fallbackRole }));
  if (!ids.length) return fallbackMap;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role')
      .in('id', ids);
    if (error) throw error;

    const roleById = new Map((data || []).map((row) => [String(row.id), row.role || fallbackRole]));
    return ids.map((id) => ({ id, role: roleById.get(id) || fallbackRole }));
  } catch (error) {
    logWarn({ message: 'Live exam recipient role lookup failed.', source: 'LiveExamProctoring', details: error.message || error })
    return fallbackMap;
  }
}

async function loadAssignedTeacherIdsForStudent(studentId) {
  if (!studentId) return [];

  try {
    const { data, error } = await supabase
      .from('teacher_assignments')
      .select('teacher_id')
      .eq('student_id', studentId)
      .eq('active', true);
    if (error) throw error;
    return uniqueIds((data || []).map((row) => row.teacher_id));
  } catch (error) {
    logWarn({ message: 'Live exam teacher assignment lookup failed.', source: 'LiveExamProctoring', details: error.message || error })
    return [];
  }
}

async function withClientTimeout(promise, timeoutMs = 12000) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = window.setTimeout(() => {
      reject(new Error('Live exam request timed out. Apply the latest live-exam RLS fix migration and refresh.'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      window.clearTimeout(timeoutHandle);
    }
  }
}

const getErrorMessage = (error, fallbackMessage) => String(error?.message || fallbackMessage || 'Request failed.');

const isTimeoutMessage = (message) => String(message || '').toLowerCase().includes('timeout');

const isPremiumStudentProfile = (candidateProfile) => {
  if (!candidateProfile) return false;
  if (candidateProfile.role === 'admin' || candidateProfile.role === 'teacher') return true;
  if (!candidateProfile.premium_until) return false;
  return new Date(candidateProfile.premium_until) > new Date();
};

const getExamBanMessage = (candidateProfile) => {
  if (!candidateProfile?.is_exam_banned) return '';
  return candidateProfile?.exam_ban_reason
    ? `You are banned from writing exams. Reason: ${candidateProfile.exam_ban_reason}`
    : 'You are banned from writing exams. Please contact admin.';
};

async function loadOptionalQuery(promise, fallbackData = [], timeoutMs = 10000) {
  try {
    const result = await withClientTimeout(promise, timeoutMs);
    return {
      data: result?.data ?? fallbackData,
      error: result?.error || null,
    };
  } catch (error) {
    return {
      data: fallbackData,
      error,
    };
  }
}

const isMissingProfileColumnError = (error) => {
  const message = String([error?.message, error?.details, error?.hint].filter(Boolean).join(' ').toLowerCase());
  return (
    message.includes('column') &&
    (message.includes('is_exam_banned') || message.includes('exam_ban_reason') || message.includes('exam_banned_at'))
  );
};

async function loadLiveExamProfiles(queryBuilderFactory, fallbackData = [], timeoutMs = 10000) {
  const primary = await loadOptionalQuery(queryBuilderFactory(LIVE_EXAM_PROFILE_FIELDS), fallbackData, timeoutMs);
  if (!primary.error || !isMissingProfileColumnError(primary.error)) {
    return primary;
  }
  return loadOptionalQuery(queryBuilderFactory(LIVE_EXAM_PROFILE_FIELDS_FALLBACK), fallbackData, timeoutMs);
}

async function loadStaffLiveExamFeed() {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    throw new Error('Live exam staff feed needs a logged-in staff session. Please sign in again.');
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/live-exam-feed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Live exam staff feed failed with status ${response.status}.`);
  }
  return payload || null;
}

async function loadAssignedLiveExamSlotsFeed() {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    throw new Error('Assigned live exam slots need a logged-in staff session. Please sign in again.');
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/live-exam-feed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action: 'assigned-slots' }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Assigned live exam slots failed with status ${response.status}.`);
  }
  return payload || null;
}

async function loadLiveExamBookingCounts(slotIds) {
  const requestedSlotIds = uniqueIds(slotIds);
  if (!requestedSlotIds.length) return {};

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) return {};

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/live-exam-feed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: 'booking-counts',
      slotIds: requestedSlotIds,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Live exam booking count failed with status ${response.status}.`);
  }
  return payload?.counts || {};
}

export default function LiveExamProctoring({ forcedPanel = '' }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [violations, setViolations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [slotInstructors, setSlotInstructors] = useState([]);
  const [slotOverrides, setSlotOverrides] = useState([]);
  const [facultyAttendance, setFacultyAttendance] = useState([]);
  const [slotBookingCounts, setSlotBookingCounts] = useState({});
  const [examsById, setExamsById] = useState({});
  const [coursesById, setCoursesById] = useState({});
  const [profilesById, setProfilesById] = useState({});
  const [teacherOptions, setTeacherOptions] = useState([]);
  const [instructorOptions, setInstructorOptions] = useState([]);
  const [studentOptions, setStudentOptions] = useState([]);
  const [registrationsPaused, setRegistrationsPaused] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [privateRecipientId, setPrivateRecipientId] = useState('');
  const [lockDays, setLockDays] = useState(DEFAULT_LOCK_DAYS);
  const [liveExamRebookingWaitDays, setLiveExamRebookingWaitDays] = useState(7);
  const [retakeOverrides, setRetakeOverrides] = useState([]);
  const [passedSubmissions, setPassedSubmissions] = useState([]);
  const [latestSubmissions, setLatestSubmissions] = useState([]);
  const [createForm, setCreateForm] = useState({
    examId: '',
    teacherId: '',
    instructorId: '',
    title: '',
    startsAt: '',
    durationMinutes: 60,
    repeatDaily: false,
    repeatUntil: '',
    useTodayToWindow: true,
    maxCapacity: 25,
    notes: '',
    applyToAllExams: false,
  });
  const [overrideStudentId, setOverrideStudentId] = useState('');
  const [assignInstructorId, setAssignInstructorId] = useState('');
  const [examSearch, setExamSearch] = useState('');
  const [slotSearch, setSlotSearch] = useState('');
  const [slotStudentSearch, setSlotStudentSearch] = useState('');
  const [studentSelectedDate, setStudentSelectedDate] = useState('');
  const [studentCalendarMonth, setStudentCalendarMonth] = useState(() => getMonthStart());
  const [selectedMonitoringSessionId, setSelectedMonitoringSessionId] = useState(null);
  const [monitorFeedTab, setMonitorFeedTab] = useState('screen');
  const [showBigLiveModal, setShowBigLiveModal] = useState(false);
  const [popupState, setPopupState] = useState(null);
  const activeLoadIdRef = useRef(0);
  const reloadTimerRef = useRef(null);
  const bigLiveMonitorRef = useRef(null);
  const popupResolverRef = useRef(null);
  const allInOneAutoOpenedRef = useRef(false);

  const role = String(profile?.role || 'student').toLowerCase();
  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher';
  const isInstructor = role === 'instructor';
  const isStudent = role === 'student';
  const rawRequestedPanel = forcedPanel || searchParams.get('panel') || 'overview';
  const requestedPanel =
    rawRequestedPanel === 'overview'
      ? isTeacher
        ? 'all-in-one'
        : isInstructor
          ? 'slots'
          : rawRequestedPanel
      : rawRequestedPanel;
  const requestedCourseId = searchParams.get('courseId') || '';
  const requestedSlotId = searchParams.get('slotId') || '';
  const panelLabelMap = {
    overview: 'Overview',
    slots: 'Slot Management',
    monitoring: 'Live Monitoring',
    'all-in-one': 'All In One',
    attendance: 'Attendance',
    alerts: 'Violation Alerts',
    messages: 'Messages',
    cancellations: 'Exam Cancellations',
  };
  const isSlotsPanel = requestedPanel === 'slots';
  const isMonitoringPanel = requestedPanel === 'monitoring';
  const isAllInOnePanel = requestedPanel === 'all-in-one';
  const isAttendancePanel = requestedPanel === 'attendance';
  const isAlertsPanel = requestedPanel === 'alerts';
  const isMessagesPanel = requestedPanel === 'messages';
  const isCancellationsPanel = requestedPanel === 'cancellations';
  const showFullOverview = requestedPanel === 'overview';
  const operatorEyebrow = isStudent ? 'Exam Slot Booking' : isAllInOnePanel ? 'All In One' : 'Live Exam Proctoring';
  const operatorTitle = isStudent
    ? 'Book Your Exam Slot and Start Only On Schedule'
    : isAllInOnePanel
      ? 'All Slots In One View For Live Monitoring and Actions'
      : isSlotsPanel
        ? 'Assigned Slots, Attendance, Student Count, and One-by-One Monitoring'
      : 'Monitor Slots, Violations, Attendance, and Live Actions';
  const operatorDescription = isStudent
    ? 'Ultra-strict exam mode with slot booking, camera/mic/screen-share enforcement, realtime alerts, and live monitoring for admin, teacher, and instructor.'
    : isAllInOnePanel
      ? 'See every active slot from one place, watch live screen share, camera, and microphone feeds, then warn, pause, resume, terminate, and chat with students instantly.'
      : isSlotsPanel
        ? 'See every slot assigned to you, mark attendance, review registrations, search students, open one live student at a time, and allow a neutral reschedule when needed.'
      : 'Ultra-strict exam mode with slot booking, camera/mic/screen-share enforcement, realtime alerts, and live monitoring for admin, teacher, and instructor.';

  const bookingBySlotId = useMemo(() => {
    const map = {};
    bookings.forEach((booking) => {
      if (String(booking.student_id) === String(profile?.id)) {
        map[booking.slot_id] = booking;
      }
    });
    return map;
  }, [bookings, profile?.id]);

  const bookingByExamId = useMemo(() => {
    const map = {};
    bookings.forEach((booking) => {
      if (String(booking.student_id) !== String(profile?.id)) return;
      if (String(booking.status || '').toLowerCase() === 'cancelled') return;
      const slot = slots.find((row) => String(row.id) === String(booking.slot_id));
      if (!slot?.exam_id) return;
      if (slotHasEnded(slot)) return;
      const existing = map[slot.exam_id];
      if (!existing) {
        map[slot.exam_id] = booking;
        return;
      }
      const existingStamp = new Date(existing.updated_at || existing.booked_at || existing.created_at || 0).getTime();
      const nextStamp = new Date(booking.updated_at || booking.booked_at || booking.created_at || 0).getTime();
      if (nextStamp >= existingStamp) {
        map[slot.exam_id] = booking;
      }
    });
    return map;
  }, [bookings, profile?.id, slots]);

  const latestRetakeOverrideByCourseId = useMemo(() => {
    const map = {};
    retakeOverrides.forEach((row) => {
      const courseKey = String(row.course_id || '');
      if (!courseKey) return;
      const existing = map[courseKey];
      const existingStamp = existing ? new Date(existing).getTime() : 0;
      const nextStamp = new Date(row.allow_retake_at || 0).getTime();
      if (!existing || nextStamp >= existingStamp) {
        map[courseKey] = row.allow_retake_at;
      }
    });
    return map;
  }, [retakeOverrides]);
  const latestRetakeOverrideRowByCourseId = useMemo(() => {
    const map = {};
    retakeOverrides.forEach((row) => {
      const courseKey = String(row.course_id || '');
      if (!courseKey) return;
      const existing = map[courseKey];
      const existingStamp = existing ? new Date(existing.allow_retake_at || 0).getTime() : 0;
      const nextStamp = new Date(row.allow_retake_at || 0).getTime();
      if (!existing || nextStamp >= existingStamp) {
        map[courseKey] = row;
      }
    });
    return map;
  }, [retakeOverrides]);
  const allowsRetakeNow = (examId, latestSubmission) => {
    const exam = examsById[String(examId)];
    const courseKey = String(exam?.course_id || '');
    if (!courseKey) return false;
    const overrideRow = latestRetakeOverrideRowByCourseId[courseKey];
    if (!overrideRow?.allow_retake_at) return false;
    const overrideDate = new Date(overrideRow.allow_retake_at);
    if (Number.isNaN(overrideDate.getTime()) || overrideDate.getTime() > Date.now()) return false;
    const latestSubmissionDate = latestSubmission?.submitted_at ? new Date(latestSubmission.submitted_at) : null;
    return !latestSubmissionDate || overrideDate >= latestSubmissionDate;
  };

  const liveExamRebookingBlocksByExamId = useMemo(() => {
    if (!isStudent || Number(liveExamRebookingWaitDays || 0) <= 0) return {};

    const latestEndedByExamId = {};
    bookings.forEach((booking) => {
      if (String(booking.student_id) !== String(profile?.id)) return;
      if (String(booking.status || '').toLowerCase() === 'cancelled') return;
      const slot = slots.find((row) => String(row.id) === String(booking.slot_id));
      if (!slot?.exam_id || !slotHasEnded(slot)) return;
      const endedAt = new Date(slot.ends_at).getTime();
      const existing = latestEndedByExamId[slot.exam_id];
      if (!existing || endedAt > existing.endedAt) {
        latestEndedByExamId[slot.exam_id] = {
          endedAt,
          lastSlotId: slot.id,
        };
      }
    });

    const now = Date.now();
    const blocks = {};
    Object.entries(latestEndedByExamId).forEach(([examId, value]) => {
      const exam = examsById[examId];
      const courseId = String(exam?.course_id || '');
      if (!courseId) return;

      let blockedUntil = value.endedAt + Number(liveExamRebookingWaitDays || 0) * 24 * 60 * 60 * 1000;
      const overrideAtRaw = latestRetakeOverrideByCourseId[courseId];
      if (overrideAtRaw) {
        const overrideAt = new Date(overrideAtRaw).getTime();
        if (!Number.isNaN(overrideAt)) {
          if (overrideAt <= now) {
            return;
          }
          blockedUntil = Math.min(blockedUntil, overrideAt);
        }
      }

      if (blockedUntil > now) {
        blocks[examId] = {
          blockedUntil: new Date(blockedUntil).toISOString(),
          lastSlotId: value.lastSlotId,
        };
      }
    });
    return blocks;
  }, [bookings, examsById, isStudent, latestRetakeOverrideByCourseId, liveExamRebookingWaitDays, profile?.id, slots]);

  const passedExamIds = useMemo(() => {
    const passedExamIdSet = new Set();
    const passedCourseIdSet = new Set();
    passedSubmissions.forEach((row) => {
      if (row.exam_id) passedExamIdSet.add(String(row.exam_id));
      const exam = examsById[row.exam_id];
      if (exam?.course_id) passedCourseIdSet.add(String(exam.course_id));
    });
    return { passedExamIdSet, passedCourseIdSet };
  }, [passedSubmissions, examsById]);

  const latestSubmissionByExamId = useMemo(() => {
    const map = {};
    latestSubmissions.forEach((row) => {
      if (!row?.exam_id) return;
      const examKey = String(row.exam_id);
      const nextStamp = new Date(row.submitted_at || 0).getTime();
      const existing = map[examKey];
      const existingStamp = existing ? new Date(existing.submitted_at || 0).getTime() : 0;
      if (!existing || nextStamp >= existingStamp) {
        map[examKey] = row;
      }
    });
    return map;
  }, [latestSubmissions]);

  const latestSubmissionByCourseId = useMemo(() => {
    const map = {};
    latestSubmissions.forEach((row) => {
      const exam = examsById[row?.exam_id];
      const courseId = exam?.course_id;
      if (!courseId) return;
      const courseKey = String(courseId);
      const nextStamp = new Date(row.submitted_at || 0).getTime();
      const existing = map[courseKey];
      const existingStamp = existing ? new Date(existing.submitted_at || 0).getTime() : 0;
      if (!existing || nextStamp >= existingStamp) {
        map[courseKey] = row;
      }
    });
    return map;
  }, [latestSubmissions, examsById]);

  const sessionByBookingId = useMemo(() => {
    const map = {};
    sessions.forEach((session) => {
      const existing = map[session.booking_id];
      if (!existing) {
        map[session.booking_id] = session;
        return;
      }
      map[session.booking_id] = choosePreferredLiveSession(existing, session);
    });
    return map;
  }, [sessions]);

  const visibleSlots = useMemo(() => {
    if (!isStudent) {
      return slots
        .filter((slot) => slotIsStillLiveVisible(slot))
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    }
    return slots
      .filter((slot) => {
        if (!requestedCourseId) return true;
        const exam = examsById[slot.exam_id];
        return String(exam?.course_id || '') === String(requestedCourseId);
      })
      .filter((slot) => slot.status !== 'cancelled')
      .filter((slot) => slotIsBookable(slot) || slotIsJoinable(slot) || (bookingBySlotId[slot.id] && !slotHasEnded(slot)))
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  }, [slots, isStudent, bookingBySlotId, requestedCourseId, examsById]);

  const selectedSlot = useMemo(
    () => visibleSlots.find((slot) => String(slot.id) === String(selectedSlotId)) || null,
    [visibleSlots, selectedSlotId]
  );

  const slotBookings = useMemo(
    () => bookings.filter((booking) => String(booking.slot_id) === String(selectedSlot?.id || '')),
    [bookings, selectedSlot?.id]
  );
  const filteredSlotBookings = useMemo(() => {
    const term = String(slotStudentSearch || '').trim().toLowerCase();
    if (!term) return slotBookings;
    return slotBookings.filter((booking) => {
      const student = profilesById[booking.student_id];
      const haystack = [
        student?.full_name,
        student?.email,
        booking?.status,
        sessionByBookingId[booking.id]?.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [slotBookings, slotStudentSearch, profilesById, sessionByBookingId]);

  const slotSessions = useMemo(
    () => sessions.filter((session) => String(session.slot_id) === String(selectedSlot?.id || '')),
    [sessions, selectedSlot?.id]
  );
  const currentSlotSessions = useMemo(() => {
    const seenSessionIds = new Set();
    return slotBookings
      .map((booking) => sessionByBookingId[booking.id])
      .filter((session) => {
        if (!session?.id) return false;
        const key = String(session.id);
        if (seenSessionIds.has(key)) return false;
        seenSessionIds.add(key);
        return true;
      });
  }, [slotBookings, sessionByBookingId]);

  const slotViolations = useMemo(
    () =>
      violations
        .filter((violation) => String(violation.slot_id) === String(selectedSlot?.id || ''))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [violations, selectedSlot?.id]
  );

  const slotMessages = useMemo(
    () =>
      messages
        .filter((message) => String(message.slot_id) === String(selectedSlot?.id || ''))
        .filter((message) => {
          if (!isStudent) return true;
          return !message.recipient_id || String(message.recipient_id) === String(profile?.id) || String(message.sender_id) === String(profile?.id);
        })
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [messages, selectedSlot?.id, isStudent, profile?.id]
  );

  const slotInstructorRows = useMemo(
    () => slotInstructors.filter((row) => String(row.slot_id) === String(selectedSlot?.id || '')),
    [slotInstructors, selectedSlot?.id]
  );

  const slotFacultyAttendanceRows = useMemo(
    () => facultyAttendance.filter((row) => String(row.slot_id) === String(selectedSlot?.id || '')),
    [facultyAttendance, selectedSlot?.id]
  );

  const currentFacultyAttendance = useMemo(() => {
    if (!selectedSlot?.id || !profile?.id) return null;
    return slotFacultyAttendanceRows.find((row) => String(row.faculty_id) === String(profile.id)) || null;
  }, [slotFacultyAttendanceRows, selectedSlot?.id, profile?.id]);

  const slotOverrideRows = useMemo(
    () => slotOverrides.filter((row) => String(row.slot_id) === String(selectedSlot?.id || '')),
    [slotOverrides, selectedSlot?.id]
  );

  const counts = useMemo(() => {
    const relevantBookings = selectedSlot ? slotBookings : bookings;
    const relevantSessions = selectedSlot ? currentSlotSessions : sessions;
    const effectiveActiveSessions = selectedSlot
      ? relevantSessions.filter((session) => sessionIsCurrentlyLiveForSlot(session, selectedSlot))
      : relevantSessions.filter((session) => {
          const slot = slots.find((row) => String(row.id) === String(session.slot_id));
          return sessionIsCurrentlyLiveForSlot(session, slot);
        });
    return {
      totalStudents: relevantBookings.filter((row) => row.status !== 'cancelled').length,
      activeStudents: effectiveActiveSessions.length,
      disconnectedStudents: relevantSessions.filter((row) => row.status === 'disconnected' || row.status === 'terminated').length,
    };
  }, [selectedSlot, slotBookings, bookings, currentSlotSessions, sessions, slots]);

  const studentAvailableDates = useMemo(() => (
    Array.from(new Set(
      visibleSlots
        .map((slot) => toLocalDateInputValue(slot.starts_at))
        .filter(Boolean)
    )).sort()
  ), [visibleSlots]);

  const studentVisibleSlots = useMemo(() => {
    if (!isStudent) return visibleSlots;
    const filteredSlots = studentSelectedDate
      ? visibleSlots.filter((slot) => toLocalDateInputValue(slot.starts_at) === studentSelectedDate)
      : visibleSlots;
    return [...filteredSlots].sort((a, b) => {
      const aHasBooking = bookingBySlotId[a.id] ? 1 : 0;
      const bHasBooking = bookingBySlotId[b.id] ? 1 : 0;
      if (aHasBooking !== bHasBooking) return bHasBooking - aHasBooking;
      const aJoinable = slotIsJoinable(a) ? 1 : 0;
      const bJoinable = slotIsJoinable(b) ? 1 : 0;
      if (aJoinable !== bJoinable) return bJoinable - aJoinable;
      return new Date(a.starts_at) - new Date(b.starts_at);
    });
  }, [visibleSlots, isStudent, studentSelectedDate, bookingBySlotId]);

  const preferredStudentDate = useMemo(() => {
    if (!isStudent) return '';
    const bookedUpcomingSlots = visibleSlots
      .filter((slot) => bookingBySlotId[slot.id])
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    if (bookedUpcomingSlots.length > 0) {
      return toLocalDateInputValue(bookedUpcomingSlots[0].starts_at);
    }
    return studentAvailableDates[0] || '';
  }, [isStudent, visibleSlots, bookingBySlotId, studentAvailableDates]);

  const selectedExam = selectedSlot ? examsById[selectedSlot.exam_id] || null : null;
  const allActiveSessions = useMemo(
    () => sessions.filter((session) => {
      const slot = slots.find((row) => String(row.id) === String(session.slot_id));
      return sessionIsCurrentlyLiveForSlot(session, slot);
    }),
    [sessions, slots]
  );
  const staffVisibleSlots = useMemo(() => {
    const term = String(slotSearch || '').trim().toLowerCase();
    if (!term) return visibleSlots;
    return visibleSlots.filter((slot) => {
      const exam = examsById[slot.exam_id];
      const course = coursesById[exam?.course_id];
      const label = getSlotHeadline(slot, exam, course).toLowerCase();
      const dateLabel = formatDateTime(slot.starts_at).toLowerCase();
      return label.includes(term) || dateLabel.includes(term);
    });
  }, [visibleSlots, slotSearch, examsById, coursesById]);
  const instructorActiveCards = useMemo(() => {
    const term = String(slotSearch || '').trim().toLowerCase();
    return allActiveSessions.filter((session) => {
      const slot = slots.find((row) => String(row.id) === String(session.slot_id));
      const exam = slot ? examsById[slot.exam_id] : null;
      const course = exam ? coursesById[exam.course_id] : null;
      const student = profilesById[session.student_id];
      const haystack = [
        student?.full_name,
        student?.email,
        getSlotHeadline(slot, exam, course),
        formatDateTime(slot?.starts_at),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return !term || haystack.includes(term);
    });
  }, [allActiveSessions, slotSearch, slots, examsById, coursesById, profilesById]);
  const instructorPanelCards = useMemo(() => {
    const term = String(slotSearch || '').trim().toLowerCase();
    return visibleSlots
      .map((slot) => {
        const exam = examsById[slot.exam_id];
        const course = coursesById[exam?.course_id];
        const teacher = profilesById[slot.teacher_id];
        const assignedInstructorCount = slotInstructors.filter((row) => String(row.slot_id) === String(slot.id)).length;
        const slotBookingRows = bookings.filter((row) => String(row.slot_id) === String(slot.id) && row.status !== 'cancelled');
        const slotSessionRows = sessions.filter((row) => String(row.slot_id) === String(slot.id));
        const activeSlotSessions = slotSessionRows.filter((row) => sessionIsCurrentlyLiveForSlot(row, slot));
        const studentNames = slotBookingRows
          .map((row) => profilesById[row.student_id]?.full_name || profilesById[row.student_id]?.email || '')
          .filter(Boolean);
        const haystack = [
          getSlotHeadline(slot, exam, course),
          formatDateTime(slot.starts_at),
          teacher?.full_name,
          teacher?.email,
          studentNames.join(' '),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return {
          slot,
          exam,
          course,
          teacher,
          assignedInstructorCount,
          slotBookingRows,
          activeSlotSessions,
          totalSessions: slotSessionRows.length,
          studentNames,
          haystack,
        };
      })
      .filter((card) => !term || card.haystack.includes(term));
  }, [visibleSlots, slotSearch, examsById, coursesById, profilesById, slotInstructors, bookings, sessions]);
  const latestUsableSessionByStudentId = useMemo(() => {
    const map = {};
    currentSlotSessions.forEach((session) => {
      const studentKey = String(session.student_id || '');
      if (!studentKey) return;
      const status = String(session.status || '').toLowerCase();
      if (['active', 'paused', 'scheduled'].includes(status)) {
        map[studentKey] = choosePreferredLiveSession(map[studentKey], session);
      }
    });
    return map;
  }, [currentSlotSessions]);
  const slotMonitorBookings = useMemo(() => {
    if (!isInstructor) return slotBookings;
    return slotBookings.filter((booking) =>
      sessionIsWriting(getMonitoringSessionForBooking(booking, sessionByBookingId, latestUsableSessionByStudentId))
    );
  }, [isInstructor, slotBookings, sessionByBookingId, latestUsableSessionByStudentId]);
  const selectedMonitoringSession = useMemo(() => {
    const directSession =
      sessions.find((session) => String(session.id) === String(selectedMonitoringSessionId)) ||
      currentSlotSessions.find((session) => String(session.id) === String(selectedMonitoringSessionId)) ||
      slotSessions.find((session) => String(session.id) === String(selectedMonitoringSessionId)) ||
      null;
    if (!directSession) return null;
    const directStatus = String(directSession.status || '').toLowerCase();
    if (!['terminated', 'disconnected'].includes(directStatus)) {
      return choosePreferredLiveSession(
        directSession,
        latestUsableSessionByStudentId[String(directSession.student_id || '')] || null
      );
    }
    return latestUsableSessionByStudentId[String(directSession.student_id || '')] || directSession;
  }, [currentSlotSessions, slotSessions, selectedMonitoringSessionId, latestUsableSessionByStudentId]);
  const selectedMonitoringBooking = useMemo(
    () => slotBookings.find((booking) => String(booking.id) === String(selectedMonitoringSession?.booking_id || '')) || null,
    [slotBookings, selectedMonitoringSession?.booking_id]
  );
  const selectedMonitoringStudent = useMemo(
    () => profilesById[selectedMonitoringSession?.student_id] || null,
    [profilesById, selectedMonitoringSession?.student_id]
  );
  const monitorableSessions = useMemo(() => (
    currentSlotSessions
      .filter((session) => {
        const status = String(session.status || '').toLowerCase();
        if (status === 'active') return sessionIsCurrentlyLiveForSlot(session, selectedSlot);
        if (isInstructor) return status === 'paused' && !slotHasEnded(selectedSlot);
        return ['paused', 'scheduled'].includes(status) && !slotHasEnded(selectedSlot);
      })
      .sort((a, b) => new Date(a.started_at || a.created_at || 0) - new Date(b.started_at || b.created_at || 0))
  ), [currentSlotSessions, selectedSlot, isInstructor]);
  const globalMonitorableSessions = useMemo(() => {
    const sortedSessions = [...sessions].sort(
      (a, b) =>
        new Date(b.updated_at || b.started_at || b.created_at || 0) -
        new Date(a.updated_at || a.started_at || a.created_at || 0)
    );
    const bookingById = new Map(bookings.map((booking) => [String(booking.id), booking]));
    const bookingByStudentSlot = new Map(
      bookings.map((booking) => [`${String(booking.student_id || '')}:${String(booking.slot_id || '')}`, booking])
    );
    const seenMonitorKeys = new Set();
    return sortedSessions.filter((session) => {
      const status = String(session.status || '').toLowerCase();
      if (!['active', 'paused'].includes(status)) return false;
      const slot = slots.find((row) => String(row.id) === String(session.slot_id));
      if (!slot) return false;
      if (status === 'active' && !sessionIsCurrentlyLiveForSlot(session, slot)) return false;
      if (status === 'paused' && slotHasEnded(slot)) return false;
      const booking =
        bookingById.get(String(session.booking_id || '')) ||
        bookingByStudentSlot.get(`${String(session.student_id || '')}:${String(session.slot_id || '')}`);
      if (!booking || String(booking.status || '').toLowerCase() === 'cancelled') return false;
      if (String(booking.student_id || '') !== String(session.student_id || '')) return false;
      if (String(booking.slot_id || '') !== String(session.slot_id || '')) return false;
      const monitorKey = String(session.student_id || session.booking_id || session.id || '');
      if (seenMonitorKeys.has(monitorKey)) return false;
      seenMonitorKeys.add(monitorKey);
      return true;
    });
  }, [sessions, slots, bookings]);
  const allInOneSessions = useMemo(
    () => globalMonitorableSessions,
    [globalMonitorableSessions]
  );
  const activeMonitoringPool = isAllInOnePanel ? allInOneSessions : monitorableSessions;
  const selectedMonitoringIndex = useMemo(
    () => activeMonitoringPool.findIndex((session) => String(session.id) === String(selectedMonitoringSessionId)),
    [activeMonitoringPool, selectedMonitoringSessionId]
  );
  const monitoredViolations = useMemo(
    () => slotViolations.filter((violation) => String(violation.student_id) === String(selectedMonitoringSession?.student_id || '')),
    [slotViolations, selectedMonitoringSession?.student_id]
  );
  const monitoredMessages = useMemo(
    () => slotMessages.filter((message) => String(message.recipient_id || '') === String(selectedMonitoringSession?.student_id || '') || String(message.sender_id || '') === String(selectedMonitoringSession?.student_id || '')),
    [slotMessages, selectedMonitoringSession?.student_id]
  );
  const activeMonitoringSessions = useMemo(() => {
    const sortedSessions = [...currentSlotSessions].sort(
      (a, b) =>
        new Date(b.updated_at || b.started_at || b.created_at || 0) -
        new Date(a.updated_at || a.started_at || a.created_at || 0)
    );
    const seenStudentIds = new Set();
    return sortedSessions.filter((session) => {
      const status = String(session.status || '').toLowerCase();
      if (!['active', 'scheduled', 'paused'].includes(status)) return false;
      if (status === 'active' && !sessionIsCurrentlyLiveForSlot(session, selectedSlot)) return false;
      if ((status === 'scheduled' || status === 'paused') && slotHasEnded(selectedSlot)) return false;
      if (seenStudentIds.has(String(session.student_id))) return false;
      seenStudentIds.add(String(session.student_id));
      return true;
    });
  }, [currentSlotSessions, selectedSlot]);
  const examSearchResults = useMemo(() => {
    const term = String(examSearch || '').trim().toLowerCase();
    return Object.values(examsById)
      .map((exam) => ({
        ...exam,
        displayName: getExamDisplayName(exam, coursesById[exam.course_id]),
      }))
      .filter((exam) => !term || exam.displayName.toLowerCase().includes(term))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, 8);
  }, [examsById, coursesById, examSearch]);

  useEffect(() => {
    if (requestedSlotId && !isStudent) {
      setSelectedSlotId(requestedSlotId);
    }
  }, [requestedSlotId, isStudent]);

  useEffect(() => {
    if (!selectedSlotId && visibleSlots.length > 0 && !isStudent) {
      setSelectedSlotId(visibleSlots[0].id);
    }
    if (selectedSlotId && !visibleSlots.find((slot) => String(slot.id) === String(selectedSlotId))) {
      setSelectedSlotId(visibleSlots[0]?.id || null);
    }
  }, [visibleSlots, selectedSlotId, isStudent]);

  useEffect(() => {
    if (!selectedSlot?.id || isStudent) return undefined;
    if (slotBookings.length > 0) return undefined;

    let cancelled = false;

    const loadSelectedSlotBookings = async () => {
      const bookingResp = await loadOptionalQuery(
        supabase.from('exam_slot_bookings').select('*').eq('slot_id', selectedSlot.id),
        [],
        15000
      );
      if (cancelled || bookingResp.error || !bookingResp.data?.length) return;

      const nextBookings = bookingResp.data || [];
      setBookings((prev) => {
        const filtered = prev.filter((row) => String(row.slot_id) !== String(selectedSlot.id));
        return [...filtered, ...nextBookings];
      });
      setSlotBookingCounts((prev) => ({
        ...prev,
        [selectedSlot.id]: countActiveBookingsBySlot(nextBookings)[String(selectedSlot.id)] || 0,
      }));

        const missingStudentIds = Array.from(new Set(nextBookings.map((row) => row.student_id).filter(Boolean)))
          .filter((id) => !profilesById[id])
          .filter(isUuid);
        if (missingStudentIds.length > 0) {
        const profileResp = await loadLiveExamProfiles(
          (fields) => supabase.from('profiles').select(fields).in('id', missingStudentIds),
          [],
          10000
        );
          if (!cancelled && profileResp.data?.length) {
            setProfilesById((prev) => {
              const next = { ...prev };
            profileResp.data.forEach((row) => {
              next[row.id] = row;
            });
            return next;
          });
        }
      }
    };

    loadSelectedSlotBookings();
    return () => {
      cancelled = true;
    };
  }, [selectedSlot?.id, isStudent, slotBookings.length, profilesById]);

  useEffect(() => {
    const pool = isAllInOnePanel ? allInOneSessions : activeMonitoringSessions;
    if (!isAllInOnePanel && !selectedSlot) {
      if (selectedMonitoringSessionId) setSelectedMonitoringSessionId(null);
      return;
    }
    if (!pool.length) {
      if (selectedMonitoringSessionId) setSelectedMonitoringSessionId(null);
      return;
    }
    if (!selectedMonitoringSessionId || !pool.find((session) => String(session.id) === String(selectedMonitoringSessionId))) {
      setSelectedMonitoringSessionId(pool[0].id);
      setSelectedSlotId(pool[0].slot_id || null);
    }
  }, [selectedSlot, activeMonitoringSessions, allInOneSessions, isAllInOnePanel, selectedMonitoringSessionId]);

  useEffect(() => {
    if (!selectedMonitoringSession) return;
    const selectedStatus = String(selectedMonitoringSession.status || '').toLowerCase();
    if (selectedStatus !== 'terminated' && selectedStatus !== 'disconnected') return;
    const pool = isAllInOnePanel ? allInOneSessions : activeMonitoringSessions;
    const replacementSession = pool.find(
      (session) => String(session.student_id) === String(selectedMonitoringSession.student_id)
    );
    if (replacementSession && String(replacementSession.id) !== String(selectedMonitoringSession.id)) {
      setSelectedMonitoringSessionId(replacementSession.id);
      setSelectedSlotId(replacementSession.slot_id || null);
    }
  }, [selectedMonitoringSession, activeMonitoringSessions, allInOneSessions, isAllInOnePanel]);

  useEffect(() => {
    if (!isAllInOnePanel) {
      allInOneAutoOpenedRef.current = false;
      return;
    }
    if (showBigLiveModal || allInOneAutoOpenedRef.current) return;
    if (!allInOneSessions.length) return;
    allInOneAutoOpenedRef.current = true;
    handleOpenAllInOnePrimary('screen');
  }, [allInOneSessions, isAllInOnePanel, showBigLiveModal]);

  useEffect(() => {
    if (!isStudent) return;
    if (!studentAvailableDates.length) {
      if (studentSelectedDate) setStudentSelectedDate('');
      return;
    }
    if (!studentSelectedDate) {
      if (preferredStudentDate) {
        setStudentSelectedDate(preferredStudentDate);
      }
      return;
    }
    if (!studentAvailableDates.includes(studentSelectedDate)) {
      setStudentSelectedDate(preferredStudentDate || '');
    }
  }, [isStudent, studentAvailableDates, studentSelectedDate, preferredStudentDate]);

  useEffect(() => {
    if (!isStudent) return;
    const anchorDate = studentSelectedDate || studentAvailableDates[0];
    if (anchorDate) {
      setStudentCalendarMonth(getMonthStart(anchorDate));
    }
  }, [isStudent, studentSelectedDate, studentAvailableDates]);

  const studentCalendarDays = useMemo(
    () => buildCalendarDays(studentCalendarMonth),
    [studentCalendarMonth]
  );

  const loadData = async ({ silent = false } = {}) => {
    if (!profile?.id || !profile?.role) return;
    const loadId = Date.now();
    activeLoadIdRef.current = loadId;
    if (!silent) setLoading(true);
    setError('');

    try {
      const settingsResp = await loadOptionalQuery(
        supabase
          .from('settings')
          .select('key, value')
          .in('key', ['exam_registrations_paused', 'live_exam_rebooking_wait_days']),
        [],
        6000
      );
      const settingsMap = {};
      (settingsResp.data || []).forEach((row) => {
        settingsMap[row.key] = row.value;
      });
      setRegistrationsPaused(String(settingsMap.exam_registrations_paused || '').toLowerCase() === 'true');
      setLiveExamRebookingWaitDays(Math.max(0, Number(settingsMap.live_exam_rebooking_wait_days || 7) || 0));

      let visibleSlotIds = [];
      let teacherVisibleStudentIds = [];
      let teacherOwnedSlotIds = [];
      let slotRows = [];
      const shouldIncludeCancelledSlots = isAdmin && isCancellationsPanel;
      const shouldLoadAdminDirectory = isAdmin && (showFullOverview || isSlotsPanel);

      if (isInstructor) {
        let assignedFeed = null;
        try {
          assignedFeed = await loadAssignedLiveExamSlotsFeed();
        } catch (feedError) {
          setError(feedError.message || 'Assigned instructor slot feed failed. Deploy the live-exam-feed edge function and refresh.');
        }
        if (activeLoadIdRef.current !== loadId) return;

        const feedSlots = assignedFeed?.slots || [];
        const feedBookings = assignedFeed?.bookings || [];
        const feedSessions = assignedFeed?.sessions || [];
        const feedViolations = assignedFeed?.violations || [];
        const feedMessages = assignedFeed?.messages || [];
        const feedInstructors = assignedFeed?.instructors || [];
        const feedOverrides = assignedFeed?.overrides || [];
        const feedFacultyAttendance = assignedFeed?.facultyAttendance || [];
        const feedExams = assignedFeed?.exams || [];
        const feedCourses = assignedFeed?.courses || [];
        const feedProfiles = assignedFeed?.profiles || [];

        const examMap = {};
        feedExams.forEach((exam) => {
          examMap[exam.id] = exam;
        });
        const courseMap = {};
        feedCourses.forEach((course) => {
          courseMap[course.id] = course;
        });
        const profileMap = {};
        feedProfiles.forEach((row) => {
          profileMap[row.id] = row;
        });

        setSlots(feedSlots);
        setBookings(feedBookings);
        setSlotBookingCounts(countActiveBookingsBySlot(feedBookings));
        setSessions(feedSessions);
        setViolations(feedViolations);
        setMessages(feedMessages);
        setSlotInstructors(feedInstructors);
        setSlotOverrides(feedOverrides);
        setFacultyAttendance(feedFacultyAttendance);
        setExamsById(examMap);
        setCoursesById(courseMap);
        setProfilesById(profileMap);
        setRetakeOverrides([]);
        setPassedSubmissions([]);
        setLatestSubmissions([]);
        return;
      }

      if (isTeacher) {
        const { data: assignedStudents, error: assignedStudentsError } = await withClientTimeout(
          supabase
            .from('profiles')
            .select('id')
            .eq('assigned_teacher_id', profile.id)
            .eq('role', 'student')
        );
        if (assignedStudentsError) throw assignedStudentsError;
        teacherVisibleStudentIds = (assignedStudents || []).map((row) => row.id).filter(Boolean);
        const { data: ownedSlots, error: ownedSlotsError } = await withClientTimeout(
          supabase
            .from('exam_live_slots')
            .select('id')
            .eq('teacher_id', profile.id)
        );
        if (ownedSlotsError) throw ownedSlotsError;
        teacherOwnedSlotIds = (ownedSlots || []).map((row) => row.id).filter(Boolean);
        if (teacherVisibleStudentIds.length) {
          const [teacherBookingSlotsResp, teacherSessionSlotsResp] = await Promise.all([
            loadOptionalQuery(
              supabase
                .from('exam_slot_bookings')
                .select('slot_id')
                .in('student_id', teacherVisibleStudentIds),
              []
            ),
            loadOptionalQuery(
              supabase
                .from('exam_live_sessions')
                .select('slot_id')
                .in('student_id', teacherVisibleStudentIds),
              []
            ),
          ]);
          visibleSlotIds = Array.from(new Set([
            ...teacherOwnedSlotIds,
            ...(teacherBookingSlotsResp.data || []).map((row) => row.slot_id),
            ...(teacherSessionSlotsResp.data || []).map((row) => row.slot_id),
          ].filter(Boolean)));
        } else {
          visibleSlotIds = teacherOwnedSlotIds;
        }
      } else if (isInstructor) {
        const { data: assignedRows, error: assignedError } = await withClientTimeout(
          supabase
            .from('exam_slot_instructors')
            .select('slot_id')
            .eq('instructor_id', profile.id)
        );
        if (assignedError) throw assignedError;
        visibleSlotIds = (assignedRows || []).map((row) => row.slot_id);
      }

      let slotQuery = supabase
        .from('exam_live_slots')
        .select('*')
        .order('starts_at', { ascending: true });

      if (isStudent) {
        const cutoff = new Date(Date.now() + BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const historyDays = Math.max(1, Number(settingsMap.live_exam_rebooking_wait_days || 7) || 0) + 1;
        const recentPast = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000).toISOString();
        slotQuery = slotQuery.neq('status', 'cancelled').gte('ends_at', recentPast).lte('starts_at', cutoff);
      }

      const { data, error: slotError } = await withClientTimeout(slotQuery);
      if (slotError) throw slotError;
      slotRows = data || [];
      if (!shouldIncludeCancelledSlots) {
        slotRows = slotRows.filter((slot) => String(slot.status || '').toLowerCase() !== 'cancelled');
      }

      const slotIds = slotRows.map((slot) => slot.id);
      const examIds = Array.from(new Set(slotRows.map((slot) => slot.exam_id).filter(Boolean)));

      const [
        bookingResp,
        sessionResp,
        violationResp,
        messageResp,
        instructorResp,
        overrideResp,
        facultyAttendanceResp,
        examResp,
        courseResp,
        staffResp,
        retakeOverrideResp,
        passedSubmissionResp,
        latestSubmissionResp,
      ] = await Promise.all([
        slotIds.length
          ? loadOptionalQuery(isStudent
              ? supabase.from('exam_slot_bookings').select('*').eq('student_id', profile.id).in('slot_id', slotIds)
              : supabase.from('exam_slot_bookings').select('*').in('slot_id', slotIds))
          : Promise.resolve({ data: [], error: null }),
        slotIds.length
          ? loadOptionalQuery(isStudent
              ? supabase.from('exam_live_sessions').select('*').eq('student_id', profile.id).in('slot_id', slotIds)
              : supabase.from('exam_live_sessions').select('*').in('slot_id', slotIds))
          : Promise.resolve({ data: [], error: null }),
        slotIds.length
          ? loadOptionalQuery(isStudent
              ? supabase.from('exam_live_violations').select('*').eq('student_id', profile.id).in('slot_id', slotIds)
              : supabase.from('exam_live_violations').select('*').in('slot_id', slotIds))
          : Promise.resolve({ data: [], error: null }),
        slotIds.length
          ? loadOptionalQuery(supabase.from('exam_live_messages').select('*').in('slot_id', slotIds))
          : Promise.resolve({ data: [], error: null }),
        slotIds.length
          ? loadOptionalQuery(supabase.from('exam_slot_instructors').select('*').in('slot_id', slotIds))
          : Promise.resolve({ data: [], error: null }),
        slotIds.length
          ? loadOptionalQuery(supabase.from('exam_slot_booking_overrides').select('*').in('slot_id', slotIds))
          : Promise.resolve({ data: [], error: null }),
        slotIds.length
          ? loadOptionalQuery(supabase.from('exam_slot_faculty_attendance').select('*').in('slot_id', slotIds))
          : Promise.resolve({ data: [], error: null }),
        loadOptionalQuery(supabase.from('exams').select('id, course_id, test_name').order('id'), []),
        loadOptionalQuery(supabase.from('courses').select('id, title'), []),
        shouldLoadAdminDirectory
          ? loadLiveExamProfiles(
              (fields) => supabase.from('profiles').select(fields).in('role', ['teacher', 'instructor', 'student']).order('full_name'),
              []
            )
          : Promise.resolve({ data: [], error: null }),
        isStudent
          ? loadOptionalQuery(supabase.from('exam_retake_overrides').select('id, user_id, course_id, allow_retake_at').eq('user_id', profile.id), [])
          : Promise.resolve({ data: [], error: null }),
        isStudent
          ? loadOptionalQuery(supabase.from('exam_submissions').select('exam_id, submitted_at, score_percent, passed').eq('user_id', profile.id).eq('passed', true), [])
          : Promise.resolve({ data: [], error: null }),
        isStudent
          ? loadOptionalQuery(supabase.from('exam_submissions').select('exam_id, submitted_at, score_percent, passed, next_attempt_allowed_at').eq('user_id', profile.id), [])
          : Promise.resolve({ data: [], error: null }),
      ]);

      let bookingRows = bookingResp.data || [];
      let sessionRows = sessionResp.data || [];
      let violationRows = violationResp.data || [];
      let messageRows = messageResp.data || [];
      let instructorRows = instructorResp.data || [];
      let overrideRows = overrideResp.data || [];
      let facultyAttendanceRows = facultyAttendanceResp.data || [];
      let examRows = examResp.data || [];
      let courseRows = courseResp.data || [];
      const staffRows = staffResp.data || [];
      const retakeOverrideRows = retakeOverrideResp.data || [];
      const passedSubmissionRows = passedSubmissionResp.data || [];
      const latestSubmissionRows = latestSubmissionResp.data || [];
      let feedProfileRows = [];

      if (isTeacher || isInstructor) {
        const mergeById = (currentRows, feedRows) => {
          const map = new Map();
          [...currentRows, ...(feedRows || [])].forEach((row) => {
            if (row?.id) map.set(String(row.id), row);
          });
          return Array.from(map.values());
        };
        const mergeFeedPayload = (feed) => {
          if (!feed) return;
          slotRows = mergeById(slotRows, feed.slots || []);
          bookingRows = mergeById(bookingRows, feed.bookings || []);
          sessionRows = mergeById(sessionRows, feed.sessions || []);
          violationRows = mergeById(violationRows, feed.violations || []);
          messageRows = mergeById(messageRows, feed.messages || []);
          instructorRows = mergeById(instructorRows, feed.instructors || []);
          overrideRows = mergeById(overrideRows, feed.overrides || []);
          facultyAttendanceRows = mergeById(facultyAttendanceRows, feed.facultyAttendance || []);
          examRows = mergeById(examRows, feed.exams || []);
          courseRows = mergeById(courseRows, feed.courses || []);
          feedProfileRows = mergeById(feedProfileRows, feed.profiles || []);
        };

        const assignedFeed = await loadAssignedLiveExamSlotsFeed();
        mergeFeedPayload(assignedFeed);

        const staffFeed = await loadStaffLiveExamFeed();
        if (staffFeed?.sessions?.length) {
          mergeFeedPayload(staffFeed);
        }
      }

      const profileIds = new Set();
      slotRows.forEach((slot) => {
        if (slot.teacher_id) profileIds.add(slot.teacher_id);
        if (slot.created_by) profileIds.add(slot.created_by);
      });
      bookingRows.forEach((booking) => {
        if (booking.student_id) profileIds.add(booking.student_id);
      });
      sessionRows.forEach((session) => {
        if (session.student_id) profileIds.add(session.student_id);
        if (session.attendance_marked_by) profileIds.add(session.attendance_marked_by);
      });
      violationRows.forEach((row) => {
        if (row.student_id) profileIds.add(row.student_id);
      });
      messageRows.forEach((row) => {
        if (row.sender_id) profileIds.add(row.sender_id);
        if (row.recipient_id) profileIds.add(row.recipient_id);
      });
      instructorRows.forEach((row) => {
        if (row.instructor_id) profileIds.add(row.instructor_id);
        if (row.assigned_by) profileIds.add(row.assigned_by);
      });
      overrideRows.forEach((row) => {
        if (row.student_id) profileIds.add(row.student_id);
      });
      facultyAttendanceRows.forEach((row) => {
        if (row.faculty_id) profileIds.add(row.faculty_id);
        if (row.marked_by) profileIds.add(row.marked_by);
      });
      staffRows.forEach((row) => profileIds.add(row.id));

      const profileIdList = Array.from(profileIds).filter(Boolean);
      const validProfileIdList = profileIdList.filter(isUuid);
      const profileResp = validProfileIdList.length
        ? await loadLiveExamProfiles((fields) => supabase.from('profiles').select(fields).in('id', validProfileIdList), [])
        : { data: [], error: null };

      if (activeLoadIdRef.current !== loadId) return;

      const examMap = {};
      examRows.forEach((exam) => {
        examMap[exam.id] = exam;
      });

      const courseMap = {};
      courseRows.forEach((course) => {
        courseMap[course.id] = course;
      });

      const profileMap = {};
      (profileResp.data || []).forEach((row) => {
        profileMap[row.id] = row;
      });
      feedProfileRows.forEach((row) => {
        profileMap[row.id] = row;
      });

      let finalSlotRows = slotRows;
      const teacherStudentIds = isTeacher
        ? new Set(teacherVisibleStudentIds.map((studentId) => String(studentId)))
        : null;
      const teacherOwnedSlotIdSet = isTeacher
        ? new Set(teacherOwnedSlotIds.map((slotId) => String(slotId)))
        : null;
      const instructorSlotIdSet = isInstructor
        ? new Set(visibleSlotIds.map((slotId) => String(slotId)))
        : null;
      if (isTeacher) {
        const teacherSlotIds = new Set(teacherOwnedSlotIds);
        bookingRows.forEach((booking) => {
          if (teacherStudentIds.has(String(booking.student_id || ''))) {
            teacherSlotIds.add(booking.slot_id);
          }
        });
        sessionRows.forEach((session) => {
          if (teacherStudentIds.has(String(session.student_id || ''))) {
            teacherSlotIds.add(session.slot_id);
          }
        });
        finalSlotRows = slotRows.filter((slot) => teacherSlotIds.has(slot.id));
      }
      if (isInstructor) {
        finalSlotRows = slotRows.filter((slot) => instructorSlotIdSet.has(String(slot.id)));
      }
      if (!shouldIncludeCancelledSlots) {
        finalSlotRows = finalSlotRows.filter((slot) => String(slot.status || '').toLowerCase() !== 'cancelled');
      }

      let finalSlotIds = new Set(finalSlotRows.map((slot) => slot.id));
      const roleAllowsStudent = (studentId, slotId = '') => (
        !teacherStudentIds ||
        teacherStudentIds.has(String(studentId || '')) ||
        teacherOwnedSlotIdSet.has(String(slotId || ''))
      );
      let finalBookings = bookingRows.filter((row) => finalSlotIds.has(row.slot_id) && roleAllowsStudent(row.student_id, row.slot_id));
      let finalSessions = sessionRows.filter((row) => finalSlotIds.has(row.slot_id) && roleAllowsStudent(row.student_id, row.slot_id));
      let finalViolations = violationRows.filter((row) => finalSlotIds.has(row.slot_id) && roleAllowsStudent(row.student_id, row.slot_id));
      let finalMessages = messageRows.filter((row) => {
        if (!finalSlotIds.has(row.slot_id)) return false;
        if (!teacherStudentIds) return true;
        return roleAllowsStudent(row.sender_id, row.slot_id) || roleAllowsStudent(row.recipient_id, row.slot_id);
      });
      let finalInstructorRows = instructorRows.filter((row) => finalSlotIds.has(row.slot_id));
      let finalOverrideRows = overrideRows.filter((row) => finalSlotIds.has(row.slot_id));
      let finalFacultyAttendanceRows = facultyAttendanceRows.filter((row) => finalSlotIds.has(row.slot_id));

      const hasScopedLiveSession = finalSessions.some((session) => {
        const slot = finalSlotRows.find((row) => String(row.id) === String(session.slot_id));
        const status = String(session.status || '').toLowerCase();
        return ['active', 'paused', 'scheduled'].includes(status) && slot && (status === 'active' || !slotHasEnded(slot));
      });
      const hasAnyLiveSession = sessionRows.some((session) => {
        const slot = slotRows.find((row) => String(row.id) === String(session.slot_id));
        const status = String(session.status || '').toLowerCase();
        return ['active', 'paused', 'scheduled'].includes(status) && slot && (status === 'active' || !slotHasEnded(slot));
      });
      if (isTeacher && !hasScopedLiveSession && hasAnyLiveSession) {
        finalSlotRows = slotRows;
        if (!shouldIncludeCancelledSlots) {
          finalSlotRows = finalSlotRows.filter((slot) => String(slot.status || '').toLowerCase() !== 'cancelled');
        }
        finalSlotIds = new Set(finalSlotRows.map((slot) => slot.id));
        finalBookings = bookingRows.filter((row) => finalSlotIds.has(row.slot_id));
        finalSessions = sessionRows.filter((row) => finalSlotIds.has(row.slot_id));
        finalViolations = violationRows.filter((row) => finalSlotIds.has(row.slot_id));
        finalMessages = messageRows.filter((row) => finalSlotIds.has(row.slot_id));
        finalInstructorRows = instructorRows.filter((row) => finalSlotIds.has(row.slot_id));
        finalOverrideRows = overrideRows.filter((row) => finalSlotIds.has(row.slot_id));
        finalFacultyAttendanceRows = facultyAttendanceRows.filter((row) => finalSlotIds.has(row.slot_id));
      }

      let nextSlotBookingCounts = countActiveBookingsBySlot(finalBookings);
      if (isStudent && finalSlotRows.length > 0) {
        try {
          nextSlotBookingCounts = await loadLiveExamBookingCounts(finalSlotRows.map((slot) => slot.id));
        } catch (countError) {
          logWarn({ message: 'Live exam booking counts unavailable.', source: 'LiveExamProctoring', details: countError.message || countError })
        }
      }

      setSlots(finalSlotRows);
      setBookings(finalBookings);
      setSlotBookingCounts(nextSlotBookingCounts);
      setSessions(finalSessions);
      setViolations(finalViolations);
      setMessages(finalMessages);
      setSlotInstructors(finalInstructorRows);
      setSlotOverrides(finalOverrideRows);
      setFacultyAttendance(finalFacultyAttendanceRows);
      setExamsById(examMap);
      setCoursesById(courseMap);
      setProfilesById(profileMap);
      setRetakeOverrides(retakeOverrideRows);
      setPassedSubmissions(passedSubmissionRows);
      setLatestSubmissions(latestSubmissionRows);
      if (shouldLoadAdminDirectory) {
        setTeacherOptions(staffRows.filter((row) => row.role === 'teacher'));
        setInstructorOptions(staffRows.filter((row) => row.role === 'instructor'));
        setStudentOptions(staffRows.filter((row) => row.role === 'student'));
      }
      if (!createForm.examId && examRows[0]?.id) {
        setCreateForm((prev) => ({ ...prev, examId: String(examRows[0].id) }));
      }

      const partialErrors = [
        settingsResp.error,
        bookingResp.error,
        sessionResp.error,
        violationResp.error,
        messageResp.error,
        instructorResp.error,
        overrideResp.error,
        facultyAttendanceResp.error,
        examResp.error,
        courseResp.error,
        staffResp.error,
        profileResp.error,
      ].filter(Boolean);

      if (partialErrors.length > 0) {
        const timeoutHit = partialErrors.some((entry) => isTimeoutMessage(getErrorMessage(entry)));
        if (!slotRows.length) {
          setError(
            timeoutHit
              ? 'Some live-monitoring data is still timing out. Apply "20260324_live_exam_proctoring_rls_hotfix.sql", then refresh.'
              : 'Some live-monitoring panels could not be loaded yet. The available slot data is shown below.'
          );
        }
      }
    } catch (loadError) {
      if (activeLoadIdRef.current !== loadId) return;
      const message = getErrorMessage(loadError, 'Failed to load live exam data.');
      if (isTimeoutMessage(message)) {
        setError(`${message} Run the Supabase migration "20260324_live_exam_proctoring_rls_hotfix.sql" and refresh this page.`);
      } else {
        setError(message);
      }
    } finally {
      if (!silent && activeLoadIdRef.current === loadId) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    if (!profile?.id) return undefined;
    const scheduleReload = () => {
      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current);
      }
      reloadTimerRef.current = window.setTimeout(() => {
        loadData({ silent: true });
      }, 400);
    };
    const channel = supabase
      .channel(`live-exam-center-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_live_slots' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_slot_bookings' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_live_sessions' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_live_violations' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_live_actions' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_live_messages' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_slot_instructors' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_slot_booking_overrides' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_slot_faculty_attendance' }, scheduleReload)
      .subscribe();

    return () => {
      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const upsertRegistrationPause = async (nextValue) => {
    setSaving(true);
    setError('');
    try {
      const payload = { key: 'exam_registrations_paused', value: nextValue ? 'true' : 'false', updated_at: nowIso() };
      const { error: updateError } = await supabase.from('settings').upsert(payload, { onConflict: 'key' });
      if (updateError) throw updateError;
      setRegistrationsPaused(nextValue);
      setInfo(nextValue ? 'Exam registrations are paused globally. Students cannot book unless you allow an override.' : 'Exam registrations are active again.');
    } catch (actionError) {
      setError(actionError.message || 'Failed to update registration control.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSlot = async () => {
    if ((!createForm.examId && !createForm.applyToAllExams) || !createForm.startsAt) {
      setError('Choose an exam and slot start time first.');
      return;
    }
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const baseStartDate = new Date(createForm.startsAt);
      const now = new Date();
      const todaySlotStart = setDateKeepingTime(baseStartDate, now);
      const firstBookableSlotStart =
        todaySlotStart <= now ? addDays(todaySlotStart, 1) : todaySlotStart;
      const normalizedBaseStartDate =
        createForm.repeatDaily && createForm.useTodayToWindow
          ? (firstBookableSlotStart > baseStartDate ? firstBookableSlotStart : baseStartDate)
          : baseStartDate;
      const maxRepeatUntilDate = addDays(now, BOOKING_WINDOW_DAYS);
      const repeatUntilDate =
        createForm.repeatDaily && createForm.useTodayToWindow
          ? maxRepeatUntilDate
          : (createForm.repeatDaily && createForm.repeatUntil
              ? new Date(`${createForm.repeatUntil}T23:59:59`)
              : null);
      if (repeatUntilDate && repeatUntilDate < normalizedBaseStartDate) {
        throw new Error('Repeat-until date must be on or after the first slot date.');
      }
      if (repeatUntilDate && repeatUntilDate > maxRepeatUntilDate) {
        throw new Error('Daily repeated slots can be created only from today up to the next 2 months.');
      }
      const targetExams = createForm.applyToAllExams
        ? Object.values(examsById)
        : [examsById[createForm.examId]].filter(Boolean);

      if (targetExams.length === 0) {
        throw new Error('No exams are available to create slots.');
      }

      const occurrenceStarts = [];
      const currentDate = new Date(normalizedBaseStartDate);
      while (true) {
        occurrenceStarts.push(new Date(currentDate));
        if (!repeatUntilDate || !createForm.repeatDaily) break;
        currentDate.setDate(currentDate.getDate() + 1);
        if (currentDate > repeatUntilDate) break;
      }

      const payload = targetExams.flatMap((exam) => {
        const examLabel = getExamDisplayName(exam, coursesById[exam?.course_id]);
        return occurrenceStarts.map((occurrenceStart) => {
          const occurrenceStartIso = occurrenceStart.toISOString();
          const occurrenceEndIso = new Date(
            occurrenceStart.getTime() + Number(createForm.durationMinutes || 60) * 60 * 1000
          ).toISOString();
          return {
            exam_id: Number(exam.id),
            teacher_id: createForm.teacherId || null,
            created_by: profile.id,
            title: buildSlotTitle(createForm.title, examLabel, occurrenceStart),
            starts_at: occurrenceStartIso,
            ends_at: occurrenceEndIso,
            max_capacity: Number(createForm.maxCapacity || 1),
            notes: createForm.notes || null,
            monitor_room_name: roomNameForSlot(null, exam),
          };
        });
      });

      const { data, error: insertError } = await supabase
        .from('exam_live_slots')
        .insert(payload)
        .select('id');
      if (insertError) throw insertError;

      if (createForm.instructorId && (data || []).length > 0) {
        const instructorPayload = data.map((row) => ({
          slot_id: row.id,
          instructor_id: createForm.instructorId,
          assigned_by: profile.id,
        }));
        const { error: instructorInsertError } = await supabase
          .from('exam_slot_instructors')
          .upsert(instructorPayload, { onConflict: 'slot_id,instructor_id' });
        if (instructorInsertError) throw instructorInsertError;
      }

      setInfo(
        createForm.applyToAllExams
          ? `Created ${payload.length} matching slots for all exams.`
          : 'Exam slot created successfully.'
      );
      setSelectedSlotId(data?.[0]?.id || null);
      setCreateForm((prev) => ({
        ...prev,
        title: '',
        startsAt: '',
        repeatDaily: false,
        repeatUntil: '',
        useTodayToWindow: true,
        notes: '',
        applyToAllExams: false,
        instructorId: '',
      }));
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || 'Failed to create exam slot.');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadSlotIntoEditor = (slot) => {
    if (!slot) return;
    const startsAt = slot.starts_at ? new Date(new Date(slot.starts_at).getTime() - new Date(slot.starts_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
    const durationMinutes = slot.starts_at && slot.ends_at
      ? Math.max(15, Math.round((new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime()) / 60000))
      : 60;
    setCreateForm({
      examId: String(slot.exam_id || ''),
      teacherId: slot.teacher_id || '',
      instructorId: '',
      title: slot.title || '',
      startsAt,
      durationMinutes,
      repeatDaily: false,
      repeatUntil: '',
      useTodayToWindow: true,
      maxCapacity: Number(slot.max_capacity || 1),
      notes: slot.notes || '',
      applyToAllExams: false,
    });
    setExamSearch(getExamDisplayName(examsById[slot.exam_id], coursesById[examsById[slot.exam_id]?.course_id]));
    setInfo('Slot loaded into the editor. Update the fields and save changes.');
    setError('');
  };

  const handleUpdateSlot = async () => {
    if (!selectedSlot?.id) {
      setError('Select a slot first.');
      return;
    }
    if (!createForm.examId || !createForm.startsAt) {
      setError('Choose an exam and slot start time first.');
      return;
    }
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const exam = examsById[createForm.examId];
      const examLabel = getExamDisplayName(exam, coursesById[exam?.course_id]);
      const startsAtIso = new Date(createForm.startsAt).toISOString();
      const endsAtIso = new Date(new Date(createForm.startsAt).getTime() + Number(createForm.durationMinutes || 60) * 60 * 1000).toISOString();
      const { error: updateError } = await supabase
        .from('exam_live_slots')
        .update({
          exam_id: Number(createForm.examId),
          teacher_id: createForm.teacherId || null,
          title: buildSlotTitle(createForm.title, examLabel, createForm.startsAt),
          starts_at: startsAtIso,
          ends_at: endsAtIso,
          max_capacity: Number(createForm.maxCapacity || 1),
          notes: createForm.notes || null,
          updated_at: nowIso(),
        })
        .eq('id', selectedSlot.id);
      if (updateError) throw updateError;
      setInfo('Exam slot updated successfully.');
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || 'Failed to update exam slot.');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignInstructor = async () => {
    if (!selectedSlot?.id || !assignInstructorId) return;
    setSaving(true);
    setError('');
    try {
      const { error: assignError } = await supabase
        .from('exam_slot_instructors')
        .upsert({
          slot_id: selectedSlot.id,
          instructor_id: assignInstructorId,
          assigned_by: profile.id,
        }, { onConflict: 'slot_id,instructor_id' });
      if (assignError) throw assignError;
      setAssignInstructorId('');
      setInfo('Instructor assigned to this exam slot.');
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || 'Failed to assign instructor.');
    } finally {
      setSaving(false);
    }
  };

  const handleGrantOverride = async () => {
    if (!selectedSlot?.id || !overrideStudentId) return;
    setSaving(true);
    setError('');
    try {
      const { error: overrideError } = await supabase
        .from('exam_slot_booking_overrides')
        .upsert({
          slot_id: selectedSlot.id,
          student_id: overrideStudentId,
          granted_by: profile.id,
          reason: 'Allowed while registrations are paused.',
        }, { onConflict: 'slot_id,student_id' });
      if (overrideError) throw overrideError;
      const targetBooking = bookings.find(
        (row) => String(row.slot_id) === String(selectedSlot.id) && String(row.student_id) === String(overrideStudentId)
      );
      if (targetBooking) {
        const { error: bookingResetError } = await supabase
          .from('exam_slot_bookings')
          .update({
            status: 'booked',
            cancelled_at: null,
            cancellation_reason: null,
            updated_at: nowIso(),
          })
          .eq('id', targetBooking.id);
        if (bookingResetError) throw bookingResetError;

        const targetSessions = sessions.filter((row) => String(row.booking_id) === String(targetBooking.id));
        if (targetSessions.length > 0) {
          const { error: sessionResetError } = await supabase
            .from('exam_live_sessions')
            .update({
              status: 'scheduled',
              attendance_status: 'pending',
              ended_at: null,
              termination_reason: null,
              camera_connected: false,
              mic_connected: false,
              screen_share_connected: false,
              updated_at: nowIso(),
            })
            .eq('booking_id', targetBooking.id);
          if (sessionResetError) throw sessionResetError;
          const refreshedSession = targetSessions
            .slice()
            .sort(
              (a, b) =>
                new Date(b.updated_at || b.started_at || b.created_at || 0) -
                new Date(a.updated_at || a.started_at || a.created_at || 0)
            )[0];
          if (refreshedSession) {
            setSelectedMonitoringSessionId(refreshedSession.id);
          }
        }
      }
      setOverrideStudentId('');
      setInfo('Student override granted for this slot and live status reset.');
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || 'Failed to grant override.');
    } finally {
      setSaving(false);
    }
  };

  const handleBookSlot = async (slot) => {
    const exam = examsById[slot.exam_id];
    const examLabel = getExamDisplayName(exam, coursesById[exam?.course_id]);
    const confirmed = await askConfirm(
      'Confirm Booking',
      `Exam: ${examLabel}\nDate & Time: ${formatDateTime(slot.starts_at)}`,
      'Book Slot',
      'Cancel'
    );
    if (!confirmed) return;

    setSaving(true);
    setError('');
    setInfo('');
    try {
      if (profile?.is_exam_banned) {
        throw new Error(getExamBanMessage(profile));
      }
      const existingBookingForExam = bookingByExamId[slot.exam_id];
      if (existingBookingForExam && String(existingBookingForExam.slot_id) !== String(slot.id)) {
        throw new Error('You have already booked a slot for this exam. Use Start on the booked slot.');
      }
      const exam = examsById[slot.exam_id];
      const latestSubmission =
        latestSubmissionByExamId[String(slot.exam_id)] ||
        (exam?.course_id ? latestSubmissionByCourseId[String(exam.course_id)] : null);
      const retakeAllowedNow = allowsRetakeNow(slot.exam_id, latestSubmission);
      if (
        passedExamIds.passedExamIdSet.has(String(slot.exam_id)) ||
        (exam?.course_id && passedExamIds.passedCourseIdSet.has(String(exam.course_id)))
      ) {
        throw new Error('You have already passed this exam. Booking another session is not allowed.');
      }
      if (
        latestSubmission &&
        latestSubmission.passed === false &&
        latestSubmission.next_attempt_allowed_at &&
        new Date(latestSubmission.next_attempt_allowed_at).getTime() > Date.now() &&
        !retakeAllowedNow
      ) {
        throw new Error(`You failed this exam. Wait until ${formatDateTime(latestSubmission.next_attempt_allowed_at)} before booking again.`);
      }
      const rebookingBlock = liveExamRebookingBlocksByExamId[slot.exam_id];
      if (rebookingBlock && String(rebookingBlock.lastSlotId) !== String(slot.id)) {
        throw new Error(`Wait for ${liveExamRebookingWaitDays} day(s) before booking a new slot for this exam. Next booking opens on ${formatDateTime(rebookingBlock.blockedUntil)}.`);
      }
      let bookingCount = Number(slotBookingCounts[String(slot.id)] || 0);
      try {
        const freshCounts = await loadLiveExamBookingCounts([slot.id]);
        bookingCount = Number(freshCounts[String(slot.id)] ?? bookingCount);
        setSlotBookingCounts((prev) => ({
          ...prev,
          [slot.id]: bookingCount,
        }));
      } catch (countError) {
        bookingCount = bookings.filter(
          (row) => String(row.slot_id) === String(slot.id) && row.status !== 'cancelled'
        ).length;
      }
      const hasOverride = slotOverrides.some(
        (row) => String(row.slot_id) === String(slot.id) && String(row.student_id) === String(profile.id)
      );
      if (registrationsPaused && !hasOverride) {
        throw new Error('Registrations are currently paused. Contact admin for an override.');
      }
      if (bookingCount >= Number(slot.max_capacity || 0)) {
        throw new Error('Slot Full – Try Another Slot');
      }

      const { error: bookingError } = await supabase
        .from('exam_slot_bookings')
        .upsert({
          slot_id: slot.id,
          student_id: profile.id,
          status: 'booked',
          booked_at: nowIso(),
          updated_at: nowIso(),
          override_applied: hasOverride,
        }, { onConflict: 'slot_id,student_id' });
      if (bookingError) throw bookingError;
      setSlotBookingCounts((prev) => ({
        ...prev,
        [slot.id]: Math.max(Number(prev[String(slot.id)] || 0), bookingCount + 1),
      }));

      const assignedTeacherIds = await loadAssignedTeacherIdsForStudent(profile.id);
      const teacherRecipientIds = uniqueIds([
        profile.assigned_teacher_id,
        slot.teacher_id,
        ...assignedTeacherIds,
      ]);
      let instructorRecipientIds = slotInstructors
        .filter((row) => String(row.slot_id || '') === String(slot.id))
        .map((row) => row.instructor_id)
        .filter(Boolean);
      if (!instructorRecipientIds.length) {
        const { data: assignedInstructors, error: assignedInstructorError } = await supabase
          .from('exam_slot_instructors')
          .select('instructor_id')
          .eq('slot_id', slot.id);
        if (assignedInstructorError) throw assignedInstructorError;
        instructorRecipientIds = (assignedInstructors || []).map((row) => row.instructor_id).filter(Boolean);
      }
      instructorRecipientIds = uniqueIds(instructorRecipientIds);
      const teacherRecipients = await loadNotificationRecipientRoles(teacherRecipientIds, 'teacher');
      const instructorRecipients = await loadNotificationRecipientRoles(instructorRecipientIds, 'instructor');
      const teacherNotificationText = `${profile.full_name || profile.email || 'A student'} scheduled ${getExamDisplayName(exam, coursesById[exam?.course_id])} for ${formatDateTime(slot.starts_at)}.`;
      const notificationRows = [
        {
          title: 'Exam Slot Booked',
          content: `Your exam slot for ${getExamDisplayName(exam, coursesById[exam?.course_id])} is confirmed for ${formatDateTime(slot.starts_at)}.`,
          type: 'success',
          target_role: 'student',
          target_user_id: profile.id,
        },
        {
          title: 'Exam Slot Booked',
          content: teacherNotificationText,
          type: 'info',
          target_role: 'admin',
          target_user_id: null,
        },
      ];
      teacherRecipients.forEach((recipient) => {
        notificationRows.push({
          title: 'Assigned Student Exam Booking',
          content: teacherNotificationText,
          type: 'info',
          target_role: recipient.role || 'teacher',
          target_user_id: recipient.id,
        });
      });
      instructorRecipients.forEach((recipient) => {
        notificationRows.push({
          title: 'Assigned Slot Exam Booking',
          content: teacherNotificationText,
          type: 'info',
          target_role: recipient.role || 'instructor',
          target_user_id: recipient.id,
        });
      });
      const notificationsSent = await insertNotifications(notificationRows);
      if (!notificationsSent) {
        const fallbackMessages = [
          {
            slot_id: slot.id,
            session_id: null,
            sender_id: profile.id,
            sender_role: 'student',
            recipient_id: null,
            is_broadcast: true,
            content: teacherNotificationText,
          },
        ];
        teacherRecipientIds.forEach((teacherRecipientId) => {
          fallbackMessages.push({
            slot_id: slot.id,
            session_id: null,
            sender_id: profile.id,
            sender_role: 'student',
            recipient_id: teacherRecipientId,
            is_broadcast: false,
            content: teacherNotificationText,
          });
        });
        instructorRecipientIds.forEach((instructorId) => {
          fallbackMessages.push({
            slot_id: slot.id,
            session_id: null,
            sender_id: profile.id,
            sender_role: 'student',
            recipient_id: instructorId,
            is_broadcast: false,
            content: teacherNotificationText,
          });
        });
        await insertLiveSystemMessages(fallbackMessages);
      }
      setStudentSelectedDate(toLocalDateInputValue(slot.starts_at));
      setStudentCalendarMonth(getMonthStart(slot.starts_at));
      setInfo(notificationsSent ? 'Exam slot booked successfully.' : 'Exam slot booked successfully. Notifications will need admin-side RLS access to send.');
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || 'Failed to book slot.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelStudentExam = async (booking) => {
    if (!isAdmin || !booking?.id) return;
    const student = profilesById[booking.student_id];
    const slot = slots.find((row) => String(row.id) === String(booking.slot_id));
    const reason = await askPrompt(
      'Cancel Student Exam',
      'Reason for cancelling this student exam?',
      'Exam cancelled by admin for this student.',
      'Cancel Exam',
      'Back'
    );
    if (reason === null) return;

    setSaving(true);
    setError('');
    setInfo('');
    try {
      const { error: bookingError } = await supabase
        .from('exam_slot_bookings')
        .update({
          status: 'cancelled',
          cancelled_at: nowIso(),
          cancellation_reason: reason || 'Exam cancelled by admin for this student.',
          updated_at: nowIso(),
        })
        .eq('id', booking.id);
      if (bookingError) throw bookingError;

      const { error: sessionError } = await supabase
        .from('exam_live_sessions')
        .update({
          status: 'cancelled',
          ended_at: nowIso(),
          termination_reason: reason || 'Exam cancelled by admin.',
          updated_at: nowIso(),
        })
        .eq('booking_id', booking.id);
      if (sessionError) throw sessionError;

      await insertNotifications([{
        title: 'Exam Booking Cancelled',
        content: `${slot?.title || examsById[slot?.exam_id]?.test_name || 'Your booked exam'} was cancelled. ${reason || ''}`.trim(),
        type: 'warning',
        target_role: 'student',
        target_user_id: booking.student_id,
      }]).catch(() => null);

      setInfo(`${student?.full_name || student?.email || 'Student'} exam booking cancelled.`);
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || 'Failed to cancel student exam.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelAllStudentExams = async () => {
    if (!isAdmin || !selectedSlot?.id) return;
    const activeBookings = slotBookings.filter((booking) => booking.status !== 'cancelled');
    if (activeBookings.length === 0) {
      setInfo('There are no active student bookings to cancel for this slot.');
      return;
    }

    const reason = await askPrompt(
      'Cancel All Student Exams',
      'Reason for cancelling all student exams in this slot?',
      'All student exams for this slot were cancelled by admin.',
      'Cancel All Exams',
      'Back'
    );
    if (reason === null) return;

    setSaving(true);
    setError('');
    setInfo('');
    try {
      const bookingIds = activeBookings.map((booking) => booking.id);
      const studentIds = activeBookings.map((booking) => booking.student_id).filter(Boolean);

      const { error: bookingError } = await supabase
        .from('exam_slot_bookings')
        .update({
          status: 'cancelled',
          cancelled_at: nowIso(),
          cancellation_reason: reason || 'All student exams for this slot were cancelled by admin.',
          updated_at: nowIso(),
        })
        .in('id', bookingIds);
      if (bookingError) throw bookingError;

      const { error: sessionError } = await supabase
        .from('exam_live_sessions')
        .update({
          status: 'cancelled',
          ended_at: nowIso(),
          termination_reason: reason || 'Exam cancelled by admin.',
          updated_at: nowIso(),
        })
        .eq('slot_id', selectedSlot.id)
        .in('booking_id', bookingIds);
      if (sessionError) throw sessionError;

      if (studentIds.length > 0) {
        await insertNotifications(
          studentIds.map((studentId) => ({
            title: 'Exam Booking Cancelled',
            content: `${selectedSlot?.title || selectedExam?.test_name || 'Your booked exam'} was cancelled. ${reason || ''}`.trim(),
            type: 'warning',
            target_role: 'student',
            target_user_id: studentId,
          }))
        ).catch(() => null);
      }

      setInfo(`Cancelled ${activeBookings.length} student exam${activeBookings.length === 1 ? '' : 's'} for this slot.`);
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || 'Failed to cancel all student exams.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelSlot = async (slot) => {
    const reason = await askPrompt('Cancel Slot', 'Reason for cancellation?', 'Slot cancelled by admin', 'Cancel Slot', 'Back');
    if (reason === null) return;
    setSaving(true);
    setError('');
    try {
      const { data: cancelledRows, error: cancelError } = await supabase
        .from('exam_live_slots')
        .update({
          status: 'cancelled',
          cancelled_reason: reason || 'Slot cancelled by admin',
          cancelled_at: nowIso(),
          updated_at: nowIso(),
        })
        .eq('id', slot.id)
        .select('id');
      if (cancelError) throw cancelError;
      if (!cancelledRows?.length) {
        throw new Error('Slot cancel was not saved in the database. Check live-exam RLS policies.');
      }

      const affectedBookings = bookings.filter((row) => String(row.slot_id) === String(slot.id) && row.status !== 'cancelled');
      if (affectedBookings.length > 0) {
        const bookingIds = affectedBookings.map((row) => row.id);
        await supabase
          .from('exam_slot_bookings')
          .update({
            status: 'cancelled',
            cancelled_at: nowIso(),
            cancellation_reason: reason || 'Slot cancelled by admin',
            updated_at: nowIso(),
          })
          .in('id', bookingIds);
        await supabase
          .from('exam_live_sessions')
          .update({
            status: 'cancelled',
            ended_at: nowIso(),
            termination_reason: reason || 'Slot cancelled by admin',
            updated_at: nowIso(),
          })
          .eq('slot_id', slot.id);
      }
      if (affectedBookings.length > 0) {
        await insertNotifications(
          affectedBookings.map((row) => ({
            title: 'Exam Slot Cancelled',
            content: `${slot.title || examsById[slot.exam_id]?.test_name || 'Exam slot'} on ${formatDateTime(slot.starts_at)} was cancelled. ${reason || ''}`.trim(),
            type: 'warning',
            target_role: 'student',
            target_user_id: row.student_id,
          }))
        );
      }
      setInfo('Slot cancelled and affected students notified.');
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || 'Failed to cancel slot.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSlot = async (slot) => {
    if (!slot?.id) return;
    const hasLinkedBookings = bookings.some((row) => String(row.slot_id) === String(slot.id) && row.status !== 'cancelled');
    const hasLinkedSessions = sessions.some((row) => String(row.slot_id) === String(slot.id));
    if (hasLinkedBookings || hasLinkedSessions) {
      if (!(await askConfirm('Hide Linked Slot', 'This slot has linked exam activity. Hide it from all panels and cancel it?', 'Hide Slot', 'Back'))) return;
      setSaving(true);
      setError('');
      setInfo('');
      try {
        const { data: cancelledRows, error: cancelError } = await supabase
          .from('exam_live_slots')
          .update({
            status: 'cancelled',
            cancelled_reason: 'Hidden by admin delete action',
            cancelled_at: nowIso(),
            updated_at: nowIso(),
          })
          .eq('id', slot.id)
          .select('id');
        if (cancelError) throw cancelError;
        if (!cancelledRows?.length) {
          throw new Error('Slot hide was not saved in the database. Check live-exam RLS policies.');
        }

        await supabase
          .from('exam_slot_bookings')
          .update({
            status: 'cancelled',
            cancelled_at: nowIso(),
            cancellation_reason: 'Hidden by admin delete action',
            updated_at: nowIso(),
          })
          .eq('slot_id', slot.id);
        await supabase
          .from('exam_live_sessions')
          .update({
            status: 'cancelled',
            ended_at: nowIso(),
            termination_reason: 'Hidden by admin delete action',
            updated_at: nowIso(),
          })
          .eq('slot_id', slot.id);

        setSlots((prev) => prev.filter((row) => String(row.id) !== String(slot.id)));
        setBookings((prev) => prev.filter((row) => String(row.slot_id) !== String(slot.id)));
        setSessions((prev) => prev.filter((row) => String(row.slot_id) !== String(slot.id)));
        setViolations((prev) => prev.filter((row) => String(row.slot_id) !== String(slot.id)));
        setMessages((prev) => prev.filter((row) => String(row.slot_id) !== String(slot.id)));
        setSlotInstructors((prev) => prev.filter((row) => String(row.slot_id) !== String(slot.id)));
        setSlotOverrides((prev) => prev.filter((row) => String(row.slot_id) !== String(slot.id)));

        if (String(selectedSlotId) === String(slot.id)) {
          setSelectedSlotId(null);
        }
        setInfo('Slot removed from all live-exam panels.');
        await loadData({ silent: true });
      } catch (actionError) {
        setError(actionError.message || 'Failed to hide slot.');
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!(await askConfirm('Delete Slot Permanently', 'Delete this slot permanently? This cannot be undone.', 'Delete Slot', 'Back'))) return;

    setSaving(true);
    setError('');
    setInfo('');
    try {
      const { error: deleteError } = await supabase.from('exam_live_slots').delete().eq('id', slot.id);
      if (deleteError) throw deleteError;

      setSlots((prev) => prev.filter((row) => String(row.id) !== String(slot.id)));
      setBookings((prev) => prev.filter((row) => String(row.slot_id) !== String(slot.id)));
      setSessions((prev) => prev.filter((row) => String(row.slot_id) !== String(slot.id)));
      setViolations((prev) => prev.filter((row) => String(row.slot_id) !== String(slot.id)));
      setMessages((prev) => prev.filter((row) => String(row.slot_id) !== String(slot.id)));
      setSlotInstructors((prev) => prev.filter((row) => String(row.slot_id) !== String(slot.id)));
      setSlotOverrides((prev) => prev.filter((row) => String(row.slot_id) !== String(slot.id)));

      setInfo('Slot deleted permanently.');
      if (String(selectedSlotId) === String(slot.id)) {
        setSelectedSlotId(null);
      }
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || 'Failed to delete slot.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAllSlots = async () => {
    if (!isAdmin || visibleSlots.length === 0) return;
    const confirmed = await askConfirm(
      'Delete All Visible Slots',
      'Slots with bookings or sessions will be hidden/cancelled. Empty slots will be deleted permanently.',
      'Delete All',
      'Back'
    );
    if (!confirmed) return;

    const visibleSlotIds = visibleSlots.map((slot) => slot.id);
    const linkedSlotIds = new Set([
      ...bookings
        .filter((row) => visibleSlotIds.includes(row.slot_id) && row.status !== 'cancelled')
        .map((row) => row.slot_id),
      ...sessions
        .filter((row) => visibleSlotIds.includes(row.slot_id))
        .map((row) => row.slot_id),
    ]);
    const cancellableSlotIds = visibleSlotIds.filter((id) => linkedSlotIds.has(id));
    const deletableSlotIds = visibleSlotIds.filter((id) => !linkedSlotIds.has(id));

    setSaving(true);
    setError('');
    setInfo('');
    try {
      if (cancellableSlotIds.length > 0) {
        const { data: cancelledRows, error: cancelError } = await supabase
          .from('exam_live_slots')
          .update({
            status: 'cancelled',
            cancelled_reason: 'Bulk hidden by admin delete all action',
            cancelled_at: nowIso(),
            updated_at: nowIso(),
          })
          .in('id', cancellableSlotIds)
          .select('id');
        if (cancelError) throw cancelError;
        if ((cancelledRows || []).length !== cancellableSlotIds.length) {
          throw new Error('Some slots were not hidden in the database. Check live-exam RLS policies.');
        }
        await supabase
          .from('exam_slot_bookings')
          .update({
            status: 'cancelled',
            cancelled_at: nowIso(),
            cancellation_reason: 'Bulk hidden by admin delete all action',
            updated_at: nowIso(),
          })
          .in('slot_id', cancellableSlotIds);
        await supabase
          .from('exam_live_sessions')
          .update({
            status: 'cancelled',
            ended_at: nowIso(),
            termination_reason: 'Bulk hidden by admin delete all action',
            updated_at: nowIso(),
          })
          .in('slot_id', cancellableSlotIds);
      }

      if (deletableSlotIds.length > 0) {
        const { data: deletedRows, error: deleteError } = await supabase
          .from('exam_live_slots')
          .delete()
          .in('id', deletableSlotIds)
          .select('id');
        if (deleteError) throw deleteError;
        if ((deletedRows || []).length !== deletableSlotIds.length) {
          throw new Error('Some empty slots were not deleted in the database. Check live-exam RLS policies.');
        }
      }

      const removedSlotIdSet = new Set(visibleSlotIds.map(String));
      setSlots((prev) => prev.filter((row) => !removedSlotIdSet.has(String(row.id))));
      setBookings((prev) => prev.filter((row) => !removedSlotIdSet.has(String(row.slot_id))));
      setSessions((prev) => prev.filter((row) => !removedSlotIdSet.has(String(row.slot_id))));
      setViolations((prev) => prev.filter((row) => !removedSlotIdSet.has(String(row.slot_id))));
      setMessages((prev) => prev.filter((row) => !removedSlotIdSet.has(String(row.slot_id))));
      setSlotInstructors((prev) => prev.filter((row) => !removedSlotIdSet.has(String(row.slot_id))));
      setSlotOverrides((prev) => prev.filter((row) => !removedSlotIdSet.has(String(row.slot_id))));
      setFacultyAttendance((prev) => prev.filter((row) => !removedSlotIdSet.has(String(row.slot_id))));
      setSelectedSlotId(null);
      setInfo(`Processed ${visibleSlotIds.length} slots. Linked slots were hidden, empty slots were deleted.`);
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || 'Failed to delete all slots.');
    } finally {
      setSaving(false);
    }
  };

  const handleStartExam = async (slot) => {
    const booking = bookingBySlotId[slot.id];
    if (!booking) {
      setError('Book this slot first.');
      return;
    }
    if (!slotIsJoinable(slot)) {
      setError('Start Exam is available only around the scheduled slot time.');
      return;
    }
    setSaving(true);
    setError('');
    setInfo('');
    try {
      if (profile?.is_exam_banned) {
        throw new Error(getExamBanMessage(profile));
      }
      const exam = examsById[slot.exam_id];
      let session = sessionByBookingId[booking.id];
      const existingStatus = String(session?.status || '').toLowerCase();
      const needsFreshSession = !session || ['terminated', 'disconnected', 'completed', 'cancelled'].includes(existingStatus);
      const startedAt = session?.started_at || nowIso();
      const activeSessionSnapshot = {
        ...session,
        slot_id: slot.id,
        booking_id: booking.id,
        exam_id: slot.exam_id,
        student_id: profile.id,
        status: 'active',
        attendance_status: 'present',
        started_at: startedAt,
        ended_at: null,
        termination_reason: null,
        last_heartbeat_at: nowIso(),
        updated_at: nowIso(),
        monitor_room_name: roomNameForSlot(slot, exam),
      };
      if (needsFreshSession) {
        const { data, error: sessionError } = await supabase
          .from('exam_live_sessions')
          .insert({
            slot_id: slot.id,
            booking_id: booking.id,
            exam_id: slot.exam_id,
            student_id: profile.id,
            status: 'active',
            attendance_status: 'present',
            started_at: nowIso(),
            last_heartbeat_at: nowIso(),
            monitor_room_name: roomNameForSlot(slot, exam),
          })
          .select('*')
          .single();
        if (sessionError) throw sessionError;
        session = data;
      } else {
        const { error: sessionError } = await supabase
          .from('exam_live_sessions')
          .update({
            status: 'active',
            attendance_status: 'present',
            started_at: startedAt,
            ended_at: null,
            termination_reason: null,
            last_heartbeat_at: activeSessionSnapshot.last_heartbeat_at,
            updated_at: activeSessionSnapshot.updated_at,
          })
          .eq('id', session.id);
        if (sessionError) throw sessionError;
        session = {
          ...activeSessionSnapshot,
          id: session.id,
        };
      }

      const { error: bookingError } = await supabase
        .from('exam_slot_bookings')
        .update({ status: 'active', updated_at: nowIso() })
        .eq('id', booking.id);
      if (bookingError) throw bookingError;

      setBookings((prev) =>
        prev.map((row) => (
          String(row.id) === String(booking.id)
            ? {
                ...row,
                status: 'active',
                updated_at: nowIso(),
                cancelled_at: null,
                cancellation_reason: null,
              }
            : row
        ))
      );
      setSessions((prev) => {
        const nextRows = prev.filter((row) => String(row.id) !== String(session.id));
        return [...nextRows, session];
      });
      setSelectedMonitoringSessionId(session.id);

      try {
        const nextLiveExamContext = JSON.stringify({
          slotId: slot.id,
          bookingId: booking.id,
          sessionId: session.id,
          examId: slot.exam_id,
          examName: exam?.test_name || slot.title || 'Live Exam',
          slotTitle: slot.title || exam?.test_name || 'Live Exam Slot',
          monitorRoomName: roomNameForSlot(slot, exam),
          slotStartsAt: slot.starts_at,
          slotEndsAt: slot.ends_at,
        });
        sessionStorage.setItem(LIVE_EXAM_CONTEXT_KEY, nextLiveExamContext);
        localStorage.removeItem(LIVE_EXAM_CONTEXT_KEY);
      } catch {
        // ignore storage errors
      }
      navigate(`/live-test/${slot.exam_id}?slotId=${slot.id}&bookingId=${booking.id}&sessionId=${session.id}`);
    } catch (actionError) {
      setError(actionError.message || 'Failed to start exam session.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedSlot?.id || !messageDraft.trim()) return;
    setSaving(true);
    setError('');
    try {
      const targetBooking = slotBookings.find((row) => String(row.student_id) === String(privateRecipientId));
      const targetSession = targetBooking ? sessionByBookingId[targetBooking.id] : null;
      const { error: messageError } = await supabase
        .from('exam_live_messages')
        .insert({
          slot_id: selectedSlot.id,
          session_id: targetSession?.id || null,
          sender_id: profile.id,
          sender_role: role,
          recipient_id: privateRecipientId || null,
          is_broadcast: !privateRecipientId,
          content: messageDraft.trim(),
        });
      if (messageError) throw messageError;
      setMessageDraft('');
      setPrivateRecipientId('');
      setInfo('Message sent.');
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || 'Failed to send message.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenMonitoring = (slot) => {
    if (!slot?.id) return;
    setSelectedSlotId(slot.id);
    const basePath = isInstructor ? '/app/instructor/live-monitoring' : '/app/live-monitoring';
    navigate(`${basePath}?slotId=${slot.id}`);
  };
  const selectMonitoringSession = (session, { openModal = false, tab = 'screen' } = {}) => {
    if (!session?.id) return;
    setSelectedSlotId(session.slot_id || null);
    setSelectedMonitoringSessionId(session.id);
    setMonitorFeedTab(tab);
    if (openModal) {
      setShowBigLiveModal(true);
    }
  };

  const handleAttendance = async (session, status) => {
    setSaving(true);
    setError('');
    try {
      const { error: sessionError } = await supabase
        .from('exam_live_sessions')
        .update({
          attendance_status: status,
          attendance_marked_by: profile.id,
          attendance_marked_role: role,
          updated_at: nowIso(),
        })
        .eq('id', session.id);
      if (sessionError) throw sessionError;

      const { error: bookingError } = await supabase
        .from('exam_slot_bookings')
        .update({
          status: status === 'present' ? 'active' : 'absent',
          updated_at: nowIso(),
        })
        .eq('id', session.booking_id);
      if (bookingError) throw bookingError;

      setInfo(`Attendance marked as ${status}.`);
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || 'Failed to update attendance.');
    } finally {
      setSaving(false);
    }
  };

  const handleFacultyPresence = async (slot, status) => {
    if (!slot?.id || (!isTeacher && !isInstructor && !isAdmin)) return;
    const facultyId = isAdmin ? (isTeacher ? profile.id : isInstructor ? profile.id : '') : profile.id;
    if (!facultyId) {
      setError('Faculty attendance must be marked by the attending teacher or instructor.');
      return;
    }
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const facultyRole = isTeacher ? 'teacher' : isInstructor ? 'instructor' : profile.role;
      const { error: upsertError } = await supabase
        .from('exam_slot_faculty_attendance')
        .upsert({
          slot_id: slot.id,
          faculty_id: facultyId,
          faculty_role: facultyRole,
          status,
          marked_by: profile.id,
          marked_by_role: role,
          marked_at: nowIso(),
          updated_at: nowIso(),
        }, { onConflict: 'slot_id,faculty_id' });
      if (upsertError) throw upsertError;
      setInfo(`Your faculty attendance is marked ${status}.`);
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || 'Failed to mark faculty attendance.');
    } finally {
      setSaving(false);
    }
  };

  const handleBanStudentFromExam = async (booking, session = null) => {
    if (!isAdmin || !booking?.student_id) return;
    const student = profilesById[booking.student_id];
    const slot = slots.find((row) => String(row.id) === String(booking.slot_id));
    const reason = await askPrompt(
      'Ban In Exam',
      'Reason for banning this user from all future exams?',
      'Banned from exams by admin.',
      'Ban User',
      'Back'
    );
    if (reason === null) return;

    setSaving(true);
    setError('');
    setInfo('');
    try {
      const timestamp = nowIso();
      const resolvedSession = session || sessionByBookingId[booking.id] || null;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          is_exam_banned: true,
          exam_ban_reason: reason || 'Banned from exams by admin.',
          exam_banned_at: timestamp,
          exam_banned_by: profile.id,
        })
        .eq('id', booking.student_id);
      if (profileError) throw profileError;

      if (resolvedSession?.id) {
        const { error: sessionError } = await supabase
          .from('exam_live_sessions')
          .update({
            status: 'terminated',
            ended_at: timestamp,
            termination_reason: reason || 'Banned from exams by admin.',
            updated_at: timestamp,
          })
          .eq('id', resolvedSession.id);
        if (sessionError) throw sessionError;

        const { error: bookingError } = await supabase
          .from('exam_slot_bookings')
          .update({
            status: 'terminated',
            updated_at: timestamp,
          })
          .eq('id', booking.id);
        if (bookingError) throw bookingError;

        const { error: failResultError } = await supabase
          .from('exam_submissions')
          .upsert({
            exam_id: resolvedSession.exam_id,
            user_id: booking.student_id,
            score_percent: 0,
            passed: false,
            submitted_at: timestamp,
            next_attempt_allowed_at: null,
          }, { onConflict: 'exam_id,user_id' });
        if (failResultError) throw failResultError;
      } else {
        const { error: bookingError } = await supabase
          .from('exam_slot_bookings')
          .update({
            status: 'cancelled',
            cancelled_at: timestamp,
            cancellation_reason: reason || 'Student was banned from exams by admin.',
            updated_at: timestamp,
          })
          .eq('id', booking.id);
        if (bookingError) throw bookingError;
      }

      await insertNotifications([
        {
          title: 'Exam Access Blocked',
          content: `You are banned from writing exams. ${reason || ''}`.trim(),
          type: 'warning',
          target_role: 'student',
          target_user_id: booking.student_id,
        },
      ]).catch(() => null);

      setInfo(`${student?.full_name || student?.email || 'Student'} is now banned from exams.`);
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || 'Failed to ban this student from exams.');
    } finally {
      setSaving(false);
    }
  };

  const handleSessionAction = async (session, actionType) => {
    if (!session?.id) return;
    if (actionType === 'lock' && !isAdmin) {
      setError('Only admin can lock a student account.');
      return;
    }
    const message =
      actionType === 'warning'
        ? await askPrompt('Send Warning', 'Warning message for student?', 'Strict exam rule violation detected. Return to a compliant state immediately.', 'Send Warning', 'Back')
        : actionType === 'pause'
          ? await askPrompt('Pause Exam', 'Pause reason?', 'Exam paused by invigilator.', 'Pause Exam', 'Back')
          : actionType === 'resume'
            ? await askPrompt('Resume Exam', 'Resume message?', 'Exam resumed by invigilator.', 'Resume Exam', 'Back')
          : actionType === 'terminate'
            ? await askPrompt('Terminate Exam', 'Termination reason?', 'Unusual activity detected. Your exam has been cancelled by SkillPro team.', 'Terminate Exam', 'Back')
            : await askPrompt('Lock Account', 'Lock reason?', `Account locked by ${role}.`, 'Lock Account', 'Back');
    if (message === null) return;

    setSaving(true);
    setError('');
    try {
      let targetSession = session;
      if (session.booking_id) {
        const { data: latestSessions, error: latestSessionError } = await supabase
          .from('exam_live_sessions')
          .select('*')
          .eq('booking_id', session.booking_id)
          .order('updated_at', { ascending: false })
          .limit(10);
        if (latestSessionError) throw latestSessionError;
        const preferredSession =
          (latestSessions || []).find((row) => ['active', 'paused', 'scheduled'].includes(String(row.status || '').toLowerCase())) ||
          (latestSessions || [])[0];
        if (preferredSession) {
          targetSession = preferredSession;
        }
      }

      const sessionPatch = { updated_at: nowIso() };
      const bookingPatch = { updated_at: nowIso() };
      if (actionType === 'pause') {
        sessionPatch.status = 'paused';
        sessionPatch.ended_at = null;
        sessionPatch.last_heartbeat_at = nowIso();
        sessionPatch.termination_reason = message || 'Exam paused by invigilator.';
      }
      if (actionType === 'resume') {
        sessionPatch.status = 'active';
        sessionPatch.ended_at = null;
        sessionPatch.termination_reason = null;
        sessionPatch.last_heartbeat_at = nowIso();
        bookingPatch.status = 'active';
      }
      if (actionType === 'terminate') {
        sessionPatch.status = 'terminated';
        sessionPatch.ended_at = nowIso();
        sessionPatch.termination_reason = message || 'Unusual activity detected. Your exam has been cancelled by SkillPro team.';
        bookingPatch.status = 'terminated';
        const { error: failResultError } = await supabase
          .from('exam_submissions')
          .upsert({
            exam_id: targetSession.exam_id,
            user_id: targetSession.student_id,
            score_percent: 0,
            passed: false,
            submitted_at: nowIso(),
            next_attempt_allowed_at: null,
          }, { onConflict: 'exam_id,user_id' });
        if (failResultError) throw failResultError;
      }
      if (actionType === 'lock') {
        sessionPatch.status = 'terminated';
        sessionPatch.ended_at = nowIso();
        sessionPatch.termination_reason = message || 'Account locked by invigilator';
        bookingPatch.status = 'terminated';
        const lockDurationDays = Math.min(60, Math.max(1, Number(lockDays) || DEFAULT_LOCK_DAYS));
        const lockUntil = new Date(Date.now() + lockDurationDays * 24 * 60 * 60 * 1000).toISOString();
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            is_locked: true,
            locked_until: lockUntil,
            lock_reason: message || 'Account locked due to exam violation.',
          })
          .eq('id', targetSession.student_id);
        if (profileError) throw profileError;
        const { error: failResultError } = await supabase
          .from('exam_submissions')
          .upsert({
            exam_id: targetSession.exam_id,
            user_id: targetSession.student_id,
            score_percent: 0,
            passed: false,
            submitted_at: nowIso(),
            next_attempt_allowed_at: lockUntil,
          }, { onConflict: 'exam_id,user_id' });
        if (failResultError) throw failResultError;
      }

      if (actionType !== 'warning') {
        const { error: sessionError } = await supabase.from('exam_live_sessions').update(sessionPatch).eq('id', targetSession.id);
        if (sessionError) throw sessionError;
      }
      if (actionType === 'terminate' || actionType === 'lock' || actionType === 'resume') {
        const { error: bookingError } = await supabase.from('exam_slot_bookings').update(bookingPatch).eq('id', targetSession.booking_id);
        if (bookingError) throw bookingError;
      }

      const { error: messageError } = await supabase
        .from('exam_live_messages')
        .insert({
          slot_id: targetSession.slot_id,
          session_id: targetSession.id,
          sender_id: profile.id,
          sender_role: role,
          recipient_id: targetSession.student_id,
          is_broadcast: false,
          content: message || `${actionType} issued by ${role}.`,
        });
      const { error: actionError } = await supabase
        .from('exam_live_actions')
        .insert({
          slot_id: targetSession.slot_id,
          session_id: targetSession.id,
          actor_id: profile.id,
          actor_role: role,
          target_student_id: targetSession.student_id,
          action_type: actionType,
          message: message || null,
          lock_days: actionType === 'lock' ? Math.min(60, Math.max(1, Number(lockDays) || DEFAULT_LOCK_DAYS)) : null,
        });
      if (actionType === 'warning') {
        if (messageError && actionError) {
          throw messageError;
        }
      } else if (messageError) {
        logWarn({ message: 'Live exam message delivery failed.', source: 'LiveExamProctoring', details: messageError.message || messageError })
      }
      if (actionError) {
        logWarn({ message: 'Live exam action log failed.', source: 'LiveExamProctoring', details: actionError.message || actionError })
      }

      const slot = slots.find((row) => String(row.id) === String(targetSession.slot_id));
      const targetStudentProfile = profilesById[targetSession.student_id] || null;
      const assignedTeacherId = targetStudentProfile?.assigned_teacher_id || slot?.teacher_id || null;
      const slotInstructorIds = slotInstructors
        .filter((row) => String(row.slot_id) === String(targetSession.slot_id))
        .map((row) => row.instructor_id)
        .filter(Boolean);
      const actionNotificationRows = [
        {
          title: `Live Exam ${actionType}`,
          content: `${profilesById[targetSession.student_id]?.full_name || 'Student'}: ${message || actionType}`,
          type: actionType === 'warning' ? 'warning' : 'info',
          target_role: 'admin',
          target_user_id: null,
        },
      ];
      if (assignedTeacherId) {
        actionNotificationRows.push({
          title: `Live Exam ${actionType}`,
          content: `${profilesById[targetSession.student_id]?.full_name || 'Student'}: ${message || actionType}`,
          type: actionType === 'warning' ? 'warning' : 'info',
          target_role: 'teacher',
          target_user_id: assignedTeacherId,
        });
      }
      slotInstructorIds.forEach((instructorId) => {
        actionNotificationRows.push({
          title: `Live Exam ${actionType}`,
          content: `${profilesById[targetSession.student_id]?.full_name || 'Student'}: ${message || actionType}`,
          type: actionType === 'warning' ? 'warning' : 'info',
          target_role: 'instructor',
          target_user_id: instructorId,
        });
      });
      await insertNotifications(actionNotificationRows).catch(() => null);

      setSessions((prev) => prev.map((row) => (
        String(row.id) === String(targetSession.id)
          ? {
              ...row,
              ...sessionPatch,
            }
          : row
      )));
      if (actionType === 'terminate' || actionType === 'lock' || actionType === 'resume') {
        setBookings((prev) => prev.map((row) => (
          String(row.id) === String(targetSession.booking_id)
            ? {
                ...row,
                ...bookingPatch,
              }
            : row
        )));
      }
      setSelectedMonitoringSessionId(targetSession.id);
      setInfo(
        actionType === 'terminate'
          ? 'Student exam terminated and marked as failed.'
          : actionType === 'resume'
            ? 'Student exam resumed.'
            : actionType === 'pause'
              ? 'Student exam paused.'
              : actionType === 'warning'
                ? 'Warning sent to student.'
                : 'Student account locked and exam marked as failed.'
      );
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || `Failed to ${actionType} session.`);
    } finally {
      setSaving(false);
    }
  };

  const handleSelectAdjacentMonitoringSession = (direction) => {
    if (!activeMonitoringPool.length) return;
    const safeIndex = selectedMonitoringIndex >= 0 ? selectedMonitoringIndex : 0;
    const nextIndex = safeIndex + direction;
    if (nextIndex < 0 || nextIndex >= activeMonitoringPool.length) return;
    selectMonitoringSession(activeMonitoringPool[nextIndex], { tab: monitorFeedTab });
  };

  const openPopup = ({ mode = 'info', title, message, defaultValue = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel' }) => (
    new Promise((resolve) => {
      popupResolverRef.current = resolve;
      setPopupState({
        mode,
        title,
        message,
        value: defaultValue,
        confirmLabel,
        cancelLabel,
      });
    })
  );

  const resolvePopup = (result) => {
    const resolver = popupResolverRef.current;
    popupResolverRef.current = null;
    setPopupState(null);
    resolver?.(result);
  };

  const askConfirm = (title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel') =>
    openPopup({ mode: 'confirm', title, message, confirmLabel, cancelLabel });

  const askPrompt = (title, message, defaultValue = '', confirmLabel = 'Save', cancelLabel = 'Cancel') =>
    openPopup({ mode: 'prompt', title, message, defaultValue, confirmLabel, cancelLabel });

  const showPopupMessage = (title, message) =>
    openPopup({ mode: 'info', title, message, confirmLabel: 'OK', cancelLabel: '' });

  const handleOpenBigLiveView = (session, tab = 'screen') => {
    if (!session?.id) return;
    const status = String(session.status || '').toLowerCase();
    if (!['active', 'paused', 'scheduled'].includes(status)) {
      void showPopupMessage('Student Not Live', 'Student is not live right now.');
      return;
    }
    selectMonitoringSession(session, { openModal: true, tab });
    window.setTimeout(() => {
      bigLiveMonitorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };
  const handleOpenAllInOnePrimary = (tab = 'screen') => {
    const firstSession = allInOneSessions[0];
    if (!firstSession?.id) {
      setSelectedMonitoringSessionId(null);
      setSelectedSlotId(null);
      setMonitorFeedTab(tab);
      setShowBigLiveModal(true);
      return;
    }
    setSelectedSlotId(firstSession.slot_id || null);
    setSelectedMonitoringSessionId(firstSession.id);
    setMonitorFeedTab(tab);
    window.setTimeout(() => {
      setShowBigLiveModal(true);
      window.setTimeout(() => {
        bigLiveMonitorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }, 0);
  };
  const handleSpeakToStudent = async (session) => {
    if (!session?.id || !session?.student_id || !session?.slot_id) return;
    const message = await askPrompt(
      'Speak To Student',
      'Send a direct instruction to this student.',
      'Please stay focused on the exam and follow invigilator instructions.',
      'Send Message',
      'Back'
    );
    if (message === null || !String(message).trim()) return;

    setSaving(true);
    setError('');
    try {
      const { error: messageError } = await supabase
        .from('exam_live_messages')
        .insert({
          slot_id: session.slot_id,
          session_id: session.id,
          sender_id: profile.id,
          sender_role: role,
          recipient_id: session.student_id,
          is_broadcast: false,
          content: String(message).trim(),
        });
      if (messageError) throw messageError;
      setInfo('Instruction sent to student.');
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || 'Failed to send instruction to student.');
    } finally {
      setSaving(false);
    }
  };

  const handleAllowReschedule = async (booking, session = null) => {
    if (!(isAdmin || isTeacher || isInstructor) || !booking?.id) return;
    const student = profilesById[booking.student_id];
    const slot = slots.find((row) => String(row.id) === String(booking.slot_id));
    const reason = await askPrompt(
      'Allow Reschedule',
      'Reason for allowing this student to reschedule?',
      'Reschedule allowed by staff. This booking is cancelled without pass/fail.',
      'Allow Reschedule',
      'Back'
    );
    if (reason === null) return;

    setSaving(true);
    setError('');
    setInfo('');
    try {
      const timestamp = nowIso();
      const resolvedSession = session || sessionByBookingId[booking.id] || null;

      const { error: bookingError } = await supabase
        .from('exam_slot_bookings')
        .update({
          status: 'cancelled',
          cancelled_at: timestamp,
          cancellation_reason: reason || 'Reschedule allowed by staff.',
          updated_at: timestamp,
        })
        .eq('id', booking.id);
      if (bookingError) throw bookingError;

      const { error: sessionError } = await supabase
        .from('exam_live_sessions')
        .update({
          status: 'cancelled',
          ended_at: timestamp,
          termination_reason: reason || 'Reschedule allowed by staff.',
          updated_at: timestamp,
        })
        .eq('booking_id', booking.id);
      if (sessionError) throw sessionError;

      await insertNotifications([
        {
          title: 'Exam Reschedule Allowed',
          content: `${slot?.title || examsById[slot?.exam_id]?.test_name || 'Your exam slot'} was cancelled so you can reschedule again. ${reason || ''}`.trim(),
          type: 'info',
          target_role: 'student',
          target_user_id: booking.student_id,
        },
      ]).catch(() => null);

      if (resolvedSession && String(selectedMonitoringSessionId) === String(resolvedSession.id)) {
        setSelectedMonitoringSessionId(null);
      }
      setInfo(`${student?.full_name || student?.email || 'Student'} can now reschedule this exam again.`);
      await loadData({ silent: true });
    } catch (actionError) {
      setError(actionError.message || 'Failed to allow reschedule.');
    } finally {
      setSaving(false);
    }
  };
  const handleOpenMonitoringInfo = (session) => {
    if (!session?.id) return;
    selectMonitoringSession(session, { tab: monitorFeedTab });
    setShowBigLiveModal(false);
    window.setTimeout(() => {
      bigLiveMonitorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  if (loading) {
    return <LoadingSpinner message="Loading live exam center..." />;
  }

  return (
    <div className="space-y-6">
      {popupState ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[1.75rem] bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-semibold text-slate-900">{popupState.title}</h3>
            <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{popupState.message}</p>
            {popupState.mode === 'prompt' ? (
              <textarea
                value={popupState.value}
                onChange={(event) => setPopupState((prev) => ({ ...prev, value: event.target.value }))}
                className="mt-4 min-h-[120px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900"
              />
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              {popupState.mode !== 'info' ? (
                <button
                  type="button"
                  onClick={() => resolvePopup(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {popupState.cancelLabel || 'Cancel'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => resolvePopup(popupState.mode === 'prompt' ? popupState.value : true)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {popupState.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">{operatorEyebrow}</p>
            <h1 className="mt-2 text-3xl font-bold">{operatorTitle}</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">{operatorDescription}</p>
          </div>
          {!isStudent ? (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><p className="text-xs text-slate-300">Total Students</p><p className="mt-1 text-2xl font-bold">{counts.totalStudents}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><p className="text-xs text-slate-300">Active</p><p className="mt-1 text-2xl font-bold">{counts.activeStudents}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><p className="text-xs text-slate-300">Disconnected / Terminated</p><p className="mt-1 text-2xl font-bold">{counts.disconnectedStudents}</p></div>
            </div>
          ) : null}
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {info ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{info}</div> : null}
      {isAdmin && (showFullOverview || isSlotsPanel) ? (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Admin Controls</h2>
                <p className="text-sm text-slate-500">Create exam timing slots, assign instructors if needed, pause registrations, and cancel booked slots.</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${registrationsPaused ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {registrationsPaused ? 'Registrations Paused' : 'Registrations Active'}
                </span>
                <button type="button" onClick={() => upsertRegistrationPause(!registrationsPaused)} disabled={saving} className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${registrationsPaused ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'} disabled:opacity-60`}>
                  {registrationsPaused ? 'Resume Registrations' : 'Pause Registrations'}
                </button>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">Search Exam</span>
                <input
                  value={examSearch}
                  onChange={(event) => setExamSearch(event.target.value)}
                  placeholder="Type exam name or course name"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
                <div className="max-h-40 overflow-auto rounded-xl border border-slate-200 bg-slate-50">
                  {examSearchResults.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-500">No exams found.</p>
                  ) : (
                    examSearchResults.map((exam) => (
                      <button
                        key={exam.id}
                        type="button"
                        onClick={() => {
                          setCreateForm((prev) => ({ ...prev, examId: String(exam.id) }));
                          setExamSearch(exam.displayName);
                        }}
                        className={`block w-full px-3 py-2 text-left text-sm transition ${
                          String(createForm.examId) === String(exam.id)
                            ? 'bg-teal-100 text-teal-900'
                            : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        {exam.displayName}
                      </button>
                    ))
                  )}
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={createForm.applyToAllExams}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, applyToAllExams: event.target.checked }))}
                  />
                  Create this same slot for all exams
                </label>
              </div>
              <label className="space-y-1 text-sm"><span className="font-medium text-slate-700">Assign Instructor (Optional)</span><select value={createForm.instructorId} onChange={(event) => setCreateForm((prev) => ({ ...prev, instructorId: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2"><option value="">No instructor assigned now</option>{instructorOptions.map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.full_name || instructor.email}</option>)}</select><p className="text-xs text-slate-500">This is optional. You can also assign or change the instructor later from the slot details.</p></label>
              <label className="space-y-1 text-sm"><span className="font-medium text-slate-700">Slot Title</span><input value={createForm.title} onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Example: Morning Slot 10:00 AM" /></label>
              <label className="space-y-1 text-sm"><span className="font-medium text-slate-700">Slot Start Time</span><input type="datetime-local" value={createForm.startsAt} onChange={(event) => setCreateForm((prev) => ({ ...prev, startsAt: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
              <label className="space-y-1 text-sm"><span className="font-medium text-slate-700">Duration (minutes)</span><input type="number" min="15" value={createForm.durationMinutes} onChange={(event) => setCreateForm((prev) => ({ ...prev, durationMinutes: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    checked={createForm.repeatDaily}
                    onChange={(event) => setCreateForm((prev) => ({
                      ...prev,
                      repeatDaily: event.target.checked,
                      repeatUntil: event.target.checked
                        ? (prev.useTodayToWindow ? '' : (prev.repeatUntil || toLocalDateInputValue(prev.startsAt || new Date())))
                        : '',
                    }))}
                  />
                  Repeat same slot daily
                </label>
                {createForm.repeatDaily ? (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-slate-700">
                      <input
                        type="checkbox"
                        checked={createForm.useTodayToWindow}
                        onChange={(event) => setCreateForm((prev) => ({
                          ...prev,
                          useTodayToWindow: event.target.checked,
                          repeatUntil: event.target.checked ? '' : prev.repeatUntil,
                        }))}
                      />
                      Create this same timing from today to 2 months
                    </label>
                    {!createForm.useTodayToWindow ? (
                      <label className="block space-y-1">
                        <span className="font-medium text-slate-700">Repeat Until Date</span>
                        <input
                          type="date"
                          value={createForm.repeatUntil}
                          min={toLocalDateInputValue(createForm.startsAt || new Date())}
                          max={toLocalDateInputValue(addDays(new Date(), BOOKING_WINDOW_DAYS))}
                          onChange={(event) => setCreateForm((prev) => ({ ...prev, repeatUntil: event.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2"
                        />
                      </label>
                    ) : null}
                    <p className="text-xs text-slate-500">This creates the same admin-set timing for every day students can book, from today up to 2 months ahead.</p>
                  </div>
                ) : null}
              </div>
              <label className="space-y-1 text-sm"><span className="font-medium text-slate-700">Max Capacity</span><input type="number" min="1" value={createForm.maxCapacity} onChange={(event) => setCreateForm((prev) => ({ ...prev, maxCapacity: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
            </div>
            <label className="mt-3 block space-y-1 text-sm"><span className="font-medium text-slate-700">Notes</span><textarea value={createForm.notes} onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))} className="min-h-[90px] w-full rounded-2xl border border-slate-300 px-3 py-2" placeholder="Optional slot notes" /></label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={handleCreateSlot} disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                {createForm.applyToAllExams ? 'Create Same Slot For All Exams' : 'Create Slot'}
              </button>
              {selectedSlot ? (
                <button type="button" onClick={handleUpdateSlot} disabled={saving || createForm.applyToAllExams} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
                  Update Selected Slot
                </button>
              ) : null}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Strict Rules</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">A slot means only the exam timing window the student books.</div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Maximum violations per student: <span className="font-semibold text-slate-900">2</span></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Second violation: <span className="font-semibold text-rose-700">Immediate termination + account lock</span></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Start gate: camera, microphone, fullscreen, and entire-screen sharing are mandatory.</div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Students can start only at the exact scheduled slot time, not before.</div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Realtime alerts show student, exam, violation type, attempt count, and timestamp across all panels.</div>
            </div>
          </div>
        </div>
      ) : null}

      {isStudent ? (
        <div className="space-y-4">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Choose Exam Date</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {requestedCourseId
                    ? 'All upcoming slots for this course are shown below. Use the calendar only if you want to filter to one date.'
                    : 'All upcoming slots are shown below. Use the calendar if you want to filter to one specific date.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={() => setStudentSelectedDate('')} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">Show All Upcoming</button>
                <div className="rounded-2xl bg-slate-100 px-4 py-3 text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Selected Date</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {studentSelectedDate
                    ? new Date(`${studentSelectedDate}T00:00:00`).toLocaleDateString('en-IN', { dateStyle: 'full' })
                    : 'All upcoming dates'}
                </p>
                </div>
              </div>
            </div>
            {studentAvailableDates.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">{requestedCourseId ? 'No exam dates are available yet for this course.' : 'No exam dates available yet.'}</p>
            ) : (
              <div className="mt-5 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-teal-50">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
                  <button
                    type="button"
                    onClick={() => setStudentCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Exam Calendar</p>
                    <h3 className="mt-1 text-xl font-semibold text-slate-900">{formatMonthLabel(studentCalendarMonth)}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStudentCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-2 px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayLabel) => (
                    <div key={dayLabel} className="py-2">{dayLabel}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2 px-4 pb-4">
                  {studentCalendarDays.map((day) => {
                    const isAvailable = studentAvailableDates.includes(day.dateValue);
                    const isSelected = studentSelectedDate === day.dateValue;
                    return (
                      <button
                        key={day.key}
                        type="button"
                        onClick={() => isAvailable && setStudentSelectedDate(day.dateValue)}
                        disabled={!isAvailable}
                        className={`min-h-[78px] rounded-2xl border px-2 py-3 text-left transition ${
                          isSelected
                            ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                            : isAvailable
                              ? 'border-teal-200 bg-teal-50 text-slate-900 hover:-translate-y-0.5 hover:border-teal-300 hover:bg-white'
                              : 'border-slate-200 bg-slate-50 text-slate-300'
                        } ${day.isCurrentMonth ? '' : 'opacity-55'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold">{day.dayNumber}</span>
                          {isAvailable ? (
                            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${isSelected ? 'bg-white/15 text-white' : 'bg-teal-100 text-teal-700'}`}>
                              Open
                            </span>
                          ) : null}
                        </div>
                        <p className={`mt-4 text-[11px] ${isSelected ? 'text-slate-200' : isAvailable ? 'text-slate-500' : 'text-slate-300'}`}>
                          {isAvailable ? 'Timings available' : 'Unavailable'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {studentVisibleSlots.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No exam timings available for the selected date.</div> : studentVisibleSlots.map((slot) => {
              const exam = examsById[slot.exam_id];
              const teacher = profilesById[slot.teacher_id];
              const myBooking = bookingBySlotId[slot.id];
              const examLevelBooking = bookingByExamId[slot.exam_id];
              const latestSubmission =
                latestSubmissionByExamId[String(slot.exam_id)] ||
                (exam?.course_id ? latestSubmissionByCourseId[String(exam.course_id)] : null);
              const retakeAllowedNow = allowsRetakeNow(slot.exam_id, latestSubmission);
              const hasAnotherBookingForSameExam = examLevelBooking && String(examLevelBooking.slot_id) !== String(slot.id);
              const hasPassedExamAlready =
                passedExamIds.passedExamIdSet.has(String(slot.exam_id)) ||
                (exam?.course_id && passedExamIds.passedCourseIdSet.has(String(exam.course_id)));
              const hasFailedExamWait =
                latestSubmission &&
                latestSubmission.passed === false &&
                latestSubmission.next_attempt_allowed_at &&
                new Date(latestSubmission.next_attempt_allowed_at).getTime() > Date.now() &&
                !retakeAllowedNow;
              const rebookingBlock = liveExamRebookingBlocksByExamId[slot.exam_id];
              const isRebookingBlocked = !myBooking && Boolean(rebookingBlock) && String(rebookingBlock.lastSlotId) !== String(slot.id);
              const effectiveBookingStatus = myBooking ? getEffectiveBookingStatus(myBooking, slot) : '';
              const bookingCount = Number(
                slotBookingCounts[String(slot.id)] ??
                bookings.filter((row) => String(row.slot_id) === String(slot.id) && row.status !== 'cancelled').length
              );
              const slotFull = bookingCount >= Number(slot.max_capacity || 0) && !myBooking;
              const hasOverride = slotOverrides.some((row) => String(row.slot_id) === String(slot.id) && String(row.student_id) === String(profile?.id));
              const resultLabel = hasPassedExamAlready
                ? 'Completed - Passed'
                : hasFailedExamWait
                  ? 'Completed - Failed'
                  : null;
              return (
                <div key={slot.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Exam Slot</p>
                      <h2 className="mt-2 text-xl font-semibold text-slate-900">{slot.title || exam?.test_name || 'Exam Slot'}</h2>
                      <p className="mt-1 text-sm text-slate-500">Slot Time: {formatDateTime(slot.starts_at)} to {formatDateTime(slot.ends_at)}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      hasPassedExamAlready
                        ? 'bg-emerald-100 text-emerald-700'
                        : hasFailedExamWait
                          ? 'bg-amber-100 text-amber-800'
                          : effectiveBookingStatus === 'completed'
                            ? 'bg-sky-100 text-sky-700'
                            : slot.status === 'cancelled'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-emerald-100 text-emerald-700'
                    }`}>{resultLabel || effectiveBookingStatus || slot.status}</span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <p>Exam: <span className="font-medium text-slate-900">{getExamDisplayName(exam, coursesById[exam?.course_id])}</span></p>
                    <p>Capacity: <span className="font-medium text-slate-900">{bookingCount}/{slot.max_capacity}</span></p>
                    <p>Booking Window: up to 2 months in advance</p>
                    <p>Start Rule: <span className="font-medium text-slate-900">Only at the exact booked slot date and time</span></p>
                    <p>Override while paused: <span className="font-medium text-slate-900">{hasOverride ? 'Allowed' : 'No'}</span></p>
                    {hasPassedExamAlready && latestSubmission ? <p>Result: <span className="font-medium text-emerald-700">Passed with {Math.round(Number(latestSubmission.score_percent) || 0)}%</span></p> : null}
                    {hasFailedExamWait ? <p>Result: <span className="font-medium text-amber-800">Failed. Wait until {formatDateTime(latestSubmission.next_attempt_allowed_at)}</span></p> : null}
                    {!hasFailedExamWait && retakeAllowedNow ? <p>Result: <span className="font-medium text-emerald-700">Allowed again by admin. You can book now.</span></p> : null}
                  </div>
                  {slot.notes ? <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{slot.notes}</div> : null}
                  <div className="mt-5 flex flex-wrap gap-2">
                    {!myBooking ? (
                      <button type="button" onClick={() => handleBookSlot(slot)} disabled={saving || slotFull || hasPassedExamAlready || hasAnotherBookingForSameExam || isRebookingBlocked || !slotIsBookable(slot) || (registrationsPaused && !hasOverride)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${hasPassedExamAlready ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-900 text-white hover:bg-slate-800'} disabled:opacity-50`}>
                        {hasPassedExamAlready ? 'Passed' : hasAnotherBookingForSameExam ? 'Already Booked Another Slot' : isRebookingBlocked ? `Wait ${liveExamRebookingWaitDays} Day(s) To Book New Slot` : slotFull ? 'Unavailable' : 'Book Slot'}
                      </button>
                    ) : effectiveBookingStatus === 'completed' ? (
                      <button type="button" disabled className="rounded-xl bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-700 disabled:opacity-90">Completed</button>
                    ) : (
                      <button type="button" onClick={() => handleStartExam(slot)} disabled={saving || !slotIsJoinable(slot)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Start Exam</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Exam Start Checklist</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm text-slate-600">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Allow camera access</div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Allow microphone access</div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Share the entire screen only</div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Stay in fullscreen until submission</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.45fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{isAllInOnePanel || isMonitoringPanel ? 'All In One Launcher' : isInstructor ? 'Allotted Exam Slots' : isCancellationsPanel ? 'Exam Cancellations' : 'Visible Exam Slots'}</h2>
                <p className="mt-1 text-xs text-slate-500">{isAllInOnePanel || isMonitoringPanel ? 'Open one fullscreen live monitor and move across all active students with left and right navigation.' : isInstructor ? 'Select a slot to see registered students and open live monitoring when students start.' : 'Search exam names or slot times to find the correct slot quickly.'}</p>
              </div>
              {isAdmin && !isAllInOnePanel ? (
                <button
                  type="button"
                  onClick={handleDeleteAllSlots}
                  disabled={saving || visibleSlots.length === 0}
                  className="rounded-xl border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  Delete All Slots
                </button>
              ) : null}
            </div>
            {!isAllInOnePanel ? (
            <div className="mt-4">
              <input
                value={slotSearch}
                onChange={(event) => setSlotSearch(event.target.value)}
                placeholder={isInstructor ? 'Search slot, student, or exam name' : 'Search exam name or slot time'}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            ) : null}
            <div className="mt-4 space-y-3">
              {isAllInOnePanel ? (
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Live Students</p>
                      <p className="mt-2 text-3xl font-bold text-slate-900">{allInOneSessions.length}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Current View</p>
                      <p className="mt-2 text-3xl font-bold text-slate-900">{selectedMonitoringIndex >= 0 ? selectedMonitoringIndex + 1 : 0}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Active Slots</p>
                      <p className="mt-2 text-3xl font-bold text-slate-900">{new Set(allInOneSessions.map((session) => String(session.slot_id || ''))).size}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenAllInOnePrimary('screen')}
                    disabled={allInOneSessions.length === 0}
                    className="mt-5 w-full rounded-3xl bg-slate-900 px-6 py-5 text-lg font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {allInOneSessions.length === 0 ? 'No Students Live Right Now' : 'Open Big Screen'}
                  </button>
                </div>
              ) : isInstructor ? (
                instructorPanelCards.length === 0 ? <p className="text-sm text-slate-500">No allotted exam slots found for this instructor.</p> : instructorPanelCards.map((card) => {
                  const {
                    slot,
                    exam,
                    course,
                    teacher,
                    assignedInstructorCount,
                    slotBookingRows,
                    activeSlotSessions,
                    studentNames,
                  } = card;
                  const primarySession = activeSlotSessions[0] || null;
                  const previewStudents = studentNames.slice(0, 2);
                  return (
                    <div
                      key={slot.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedSlotId(slot.id);
                        setSelectedMonitoringSessionId(primarySession?.id || null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedSlotId(slot.id);
                          setSelectedMonitoringSessionId(primarySession?.id || null);
                        }
                      }}
                      className={`w-full rounded-2xl border p-4 text-left transition ${String(selectedSlotId) === String(slot.id) ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{getSlotHeadline(slot, exam, course)}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatDateTime(slot.starts_at)} to {formatDateTime(slot.ends_at)}</p>
                          <p className="mt-1 text-xs text-slate-500">Assigned teacher: {teacher?.full_name || teacher?.email || 'None'}</p>
                          <p className="mt-1 text-xs text-slate-500">Assigned instructor: {assignedInstructorCount}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${activeSlotSessions.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {activeSlotSessions.length > 0 ? 'live' : slot.status}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
                        <span>Booked {slotBookingRows.length}</span>
                        <span>Active {activeSlotSessions.length}</span>
                        <span>Capacity {slot.max_capacity}</span>
                      </div>
                      <div className="mt-3 text-xs text-slate-500">
                        {previewStudents.length > 0 ? `Students: ${previewStudents.join(', ')}${studentNames.length > 2 ? ` +${studentNames.length - 2} more` : ''}` : 'No students booked yet.'}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenMonitoring(slot);
                          }}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          Open Live
                        </button>
                        {primarySession ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenMonitoringInfo(primarySession);
                            }}
                            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            i
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : staffVisibleSlots.length === 0 ? <p className="text-sm text-slate-500">No slots available for this role yet.</p> : staffVisibleSlots.map((slot) => {
                const exam = examsById[slot.exam_id];
                const course = coursesById[exam?.course_id];
                const teacher = profilesById[slot.teacher_id];
                const assignedInstructorCount = slotInstructors.filter((row) => String(row.slot_id) === String(slot.id)).length;
                const activeCount = sessions.filter((row) => String(row.slot_id) === String(slot.id) && row.status === 'active').length;
                const terminatedCount = sessions.filter((row) => String(row.slot_id) === String(slot.id) && (row.status === 'terminated' || row.status === 'disconnected')).length;
                return (
                  <div
                    key={slot.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedSlotId(slot.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedSlotId(slot.id);
                      }
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition ${String(selectedSlotId) === String(slot.id) ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{getSlotHeadline(slot, exam, course)}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(slot.starts_at)}</p>
                        <p className="mt-1 text-xs text-slate-500">Assigned teacher: {teacher?.full_name || 'None'}</p>
                        <p className="mt-1 text-xs text-slate-500">Assigned instructor: {assignedInstructorCount}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${slot.status === 'cancelled' ? 'bg-rose-100 text-rose-700' : slot.status === 'live' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{slot.status}</span>
                    </div>
                    <div className="mt-3 flex gap-3 text-xs text-slate-600"><span>Total {bookings.filter((row) => String(row.slot_id) === String(slot.id) && row.status !== 'cancelled').length}</span><span>Active {activeCount}</span><span>Disconnected/Terminated {terminatedCount}</span></div>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenMonitoring(slot);
                        }}
                        className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Open Live
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            {isAllInOnePanel ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Fullscreen Monitor</p>
                  <h3 className="mt-3 text-2xl font-semibold text-slate-900">Open the big live view and monitor every active student from one place.</h3>
                  <p className="mt-3 text-sm text-slate-500">Use the left and right arrows inside the fullscreen view to move across students. Warn, pause, resume, terminate, and inspect student details there.</p>
                </div>
                {showBigLiveModal ? (
                  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
                    <div className="relative max-h-[94vh] w-full max-w-7xl overflow-auto rounded-[2rem] bg-white p-5 shadow-2xl">
                      {selectedMonitoringSession ? (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <AvatarImage userId={selectedMonitoringStudent?.id} avatarUrl={selectedMonitoringStudent?.avatar_url} fallbackName={selectedMonitoringStudent?.full_name || selectedMonitoringStudent?.email || 'Student'} alt={selectedMonitoringStudent?.full_name || 'Student'} className="h-16 w-16 rounded-full object-cover" />
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Big Live View</p>
                                <h3 className="mt-2 text-2xl font-semibold text-slate-900">{selectedMonitoringStudent?.full_name || selectedMonitoringStudent?.email || 'Student'}</h3>
                                <p className="mt-1 text-sm text-slate-500">{getExamDisplayName(selectedExam, coursesById[selectedExam?.course_id])}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenMonitoringInfo(selectedMonitoringSession)}
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                i
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectAdjacentMonitoringSession(-1)}
                                disabled={selectedMonitoringIndex <= 0}
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                              >
                                &lt;
                              </button>
                              <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                                {selectedMonitoringIndex >= 0 ? `${selectedMonitoringIndex + 1} / ${activeMonitoringPool.length}` : `1 / ${Math.max(1, activeMonitoringPool.length)}`}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleSelectAdjacentMonitoringSession(1)}
                                disabled={selectedMonitoringIndex < 0 || selectedMonitoringIndex >= activeMonitoringPool.length - 1}
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                              >
                                &gt;
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowBigLiveModal(false)}
                                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                              >
                                X
                              </button>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" onClick={() => setMonitorFeedTab('screen')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${monitorFeedTab === 'screen' ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>Screen Share</button>
                            <button type="button" onClick={() => setMonitorFeedTab('camera')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${monitorFeedTab === 'camera' ? 'bg-teal-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>Live Camera</button>
                            <button type="button" onClick={() => setMonitorFeedTab('voice')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${monitorFeedTab === 'voice' ? 'bg-amber-500 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>Voice Audio</button>
                          </div>
                          <div className="mt-4">
                            <LiveExamStreamMonitor
                              slotId={selectedSlot?.id}
                              session={selectedMonitoringSession}
                              viewerId={profile?.id}
                              viewerInstanceId={`all-in-one-${selectedMonitoringSession?.id || 'none'}`}
                              viewerRole={role}
                              large
                            />
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" onClick={() => handleSessionAction(selectedMonitoringSession, 'warning')} className="rounded-xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800">Warn</button>
                            <button type="button" onClick={() => handleSpeakToStudent(selectedMonitoringSession)} className="rounded-xl bg-teal-100 px-4 py-2 text-sm font-semibold text-teal-800">Speak</button>
                            <button type="button" onClick={() => handleSessionAction(selectedMonitoringSession, selectedMonitoringSession.status === 'paused' ? 'resume' : 'pause')} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800">{selectedMonitoringSession.status === 'paused' ? 'Resume' : 'Pause'}</button>
                            <button type="button" onClick={() => handleSessionAction(selectedMonitoringSession, 'terminate')} className="rounded-xl bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-800">Terminate</button>
                            {isAdmin ? <button type="button" onClick={() => handleSessionAction(selectedMonitoringSession, 'lock')} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">Lock</button> : null}
                          </div>
                        </>
                      ) : (
                        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Big Live View</p>
                          <h3 className="mt-3 text-3xl font-semibold text-slate-900">No Live Student Right Now</h3>
                          <p className="mt-3 max-w-xl text-sm text-slate-500">When a student is active or paused inside the live exam, their screen share, camera, and actions will stay visible here for monitoring.</p>
                          <button
                            type="button"
                            onClick={() => setShowBigLiveModal(false)}
                            className="mt-6 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                          >
                            Close
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
            {!isAllInOnePanel ? (
            !selectedSlot ? <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Select an exam slot to view bookings, alerts, attendance, and live controls.</div> : (
              <>
                {(showFullOverview || isSlotsPanel) ? <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-semibold text-slate-900">{selectedSlot.title || getExamDisplayName(selectedExam, coursesById[selectedExam?.course_id])}</h2>
                      <p className="mt-1 text-sm text-slate-500">{formatDateTime(selectedSlot.starts_at)} to {formatDateTime(selectedSlot.ends_at)}</p>
                      <p className="mt-1 text-sm text-slate-500">Direct live proctor stream for this slot.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => handleOpenMonitoring(selectedSlot)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Open Live</button>
                      {isAdmin ? <button type="button" onClick={() => handleLoadSlotIntoEditor(selectedSlot)} className="rounded-xl border border-teal-300 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50">Edit Slot</button> : null}
                      {isAdmin ? <button type="button" onClick={() => handleCancelSlot(selectedSlot)} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Cancel Slot</button> : null}
                      {isAdmin ? <button type="button" onClick={() => handleDeleteSlot(selectedSlot)} className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Delete Slot</button> : null}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm text-slate-600">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Total students in exam: <span className="font-semibold text-slate-900">{counts.totalStudents}</span></div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Active students currently writing: <span className="font-semibold text-slate-900">{counts.activeStudents}</span></div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Disconnected / terminated: <span className="font-semibold text-slate-900">{counts.disconnectedStudents}</span></div>
                  </div>
                  {isAdmin ? (
                    <div className="mt-5 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h3 className="font-semibold text-slate-900">Assign Instructor</h3>
                        <div className="mt-3 flex gap-2">
                          <select value={assignInstructorId} onChange={(event) => setAssignInstructorId(event.target.value)} className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"><option value="">Choose instructor</option>{instructorOptions.map((row) => <option key={row.id} value={row.id}>{row.full_name || row.email}</option>)}</select>
                          <button type="button" onClick={handleAssignInstructor} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Assign</button>
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-slate-600">{slotInstructorRows.length === 0 ? <p>No instructors assigned.</p> : slotInstructorRows.map((row) => <div key={row.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">{profilesById[row.instructor_id]?.full_name || profilesById[row.instructor_id]?.email || 'Instructor'}</div>)}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h3 className="font-semibold text-slate-900">Allow Specific Student While Paused</h3>
                        <div className="mt-3 flex gap-2">
                          <select value={overrideStudentId} onChange={(event) => setOverrideStudentId(event.target.value)} className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"><option value="">Choose student</option>{studentOptions.map((row) => <option key={row.id} value={row.id}>{row.full_name || row.email}</option>)}</select>
                          <button type="button" onClick={handleGrantOverride} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Allow</button>
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-slate-600">{slotOverrideRows.length === 0 ? <p>No overrides granted for this slot.</p> : slotOverrideRows.map((row) => <div key={row.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">{profilesById[row.student_id]?.full_name || profilesById[row.student_id]?.email || 'Student'}</div>)}</div>
                      </div>
                    </div>
                  ) : null}
                  {(isTeacher || isInstructor) && selectedSlot ? (
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">Faculty Presence</h3>
                          <p className="mt-1 text-sm text-slate-500">Assigned teacher and instructor should mark themselves present for this exam slot.</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          currentFacultyAttendance?.status === 'present'
                            ? 'bg-emerald-100 text-emerald-700'
                            : currentFacultyAttendance?.status === 'absent'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-700'
                        }`}>
                          {currentFacultyAttendance?.status || 'pending'}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" onClick={() => handleFacultyPresence(selectedSlot, 'present')} className="rounded-xl bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-200">Mark Me Present</button>
                        <button type="button" onClick={() => handleFacultyPresence(selectedSlot, 'absent')} className="rounded-xl bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-200">Mark Me Absent</button>
                      </div>
                    </div>
                  ) : null}
                </div> : null}

                {isMonitoringPanel ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">{isInstructor ? 'Live Preview Boxes' : 'Students Writing Exam'}</h3>
                          <p className="mt-1 text-sm text-slate-500">Each active student appears with direct live screen-share and camera preview boxes. Click a student to open the larger strict-monitoring view.</p>
                        </div>
                        <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{slotMonitorBookings.length} students</div>
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {slotMonitorBookings.length === 0 ? <p className="text-sm text-slate-500">{isInstructor ? 'No assigned-slot students are writing right now.' : 'No students booked for this slot yet.'}</p> : slotMonitorBookings.map((booking) => {
                          const session = getMonitoringSessionForBooking(booking, sessionByBookingId, latestUsableSessionByStudentId);
                          const student = profilesById[booking.student_id];
                          return (
                            <div
                              key={booking.id}
                              className={`rounded-3xl border p-4 text-left transition ${
                                session && String(selectedMonitoringSessionId) === String(session.id)
                                  ? 'border-slate-900 bg-slate-900 text-white'
                                  : 'border-slate-200 bg-slate-50'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => session && setSelectedMonitoringSessionId(session.id)}
                                className="w-full text-left"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-3">
                                    <AvatarImage userId={student?.id} avatarUrl={student?.avatar_url} fallbackName={student?.full_name || student?.email || 'Student'} alt={student?.full_name || 'Student'} className="h-11 w-11 rounded-full object-cover ring-2 ring-white/20" />
                                    <div>
                                      <p className={`text-base font-semibold ${session && String(selectedMonitoringSessionId) === String(session.id) ? 'text-white' : 'text-slate-900'}`}>{student?.full_name || student?.email || 'Student'}</p>
                                      <p className={`mt-1 text-xs ${session && String(selectedMonitoringSessionId) === String(session.id) ? 'text-slate-300' : 'text-slate-500'}`}>{session ? `Status: ${session.status}` : `Booking: ${booking.status}`}</p>
                                    </div>
                                  </div>
                                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                    !session
                                      ? 'bg-slate-200 text-slate-700'
                                      : session.status === 'active'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : session.status === 'disconnected'
                                        ? 'bg-amber-100 text-amber-700'
                                        : session.status === 'terminated'
                                          ? 'bg-rose-100 text-rose-700'
                                          : 'bg-slate-200 text-slate-700'
                                  }`}>
                                    {session?.status || booking.status}
                                  </span>
                                </div>
                              </button>
                              <div className={`mt-4 rounded-2xl border px-3 py-3 text-xs ${
                                session && String(selectedMonitoringSessionId) === String(session.id)
                                  ? 'border-white/10 bg-white/5 text-slate-200'
                                  : 'border-slate-200 bg-slate-50 text-slate-500'
                              }`}>
                                {session
                                  ? (session.camera_connected || session.screen_share_connected || session.mic_connected
                                      ? 'Live stream connected. Use Open Big Screen to watch this student.'
                                      : String(session.status || '').toLowerCase() === 'active'
                                        ? 'Student is still on the permission/fullscreen steps. Live camera and screen will appear after they allow access.'
                                        : 'Waiting for student camera/screen share...')
                                  : 'Student has not started the exam yet.'}
                              </div>
                              {session ? (
                                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                                  <span className={`rounded-xl px-2 py-1 font-semibold ${session.camera_connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>Cam {session.camera_connected ? 'connected' : 'waiting'}</span>
                                  <span className={`rounded-xl px-2 py-1 font-semibold ${session.mic_connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>Mic {session.mic_connected ? 'connected' : 'waiting'}</span>
                                  <span className={`rounded-xl px-2 py-1 font-semibold ${session.screen_share_connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>Screen {session.screen_share_connected ? 'connected' : 'waiting'}</span>
                                </div>
                              ) : null}
                              {session ? (
                                <div className="mt-4 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenBigLiveView(session, 'screen')}
                                    className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                                  >
                                    Open All In One
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenBigLiveView(session, 'screen')}
                                    className="rounded-xl border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-100"
                                  >
                                    Open Big Screen
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenMonitoringInfo(session)}
                                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                  >
                                    i
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">Students Writing Now</h3>
                          <p className="mt-1 text-sm text-slate-500">Live monitoring list for this slot. Click a student to inspect feeds, alerts, and quick actions.</p>
                        </div>
                        <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
                          {slotSessions.filter((session) => sessionIsCurrentlyLiveForSlot(session, selectedSlot)).length} active
                        </div>
                      </div>
                      <div className="mt-4 space-y-3">
                        {slotMonitorBookings.length === 0 ? <p className="text-sm text-slate-500">{isInstructor ? 'No assigned-slot students are writing right now.' : 'No students booked yet.'}</p> : slotMonitorBookings.map((booking) => {
                          const session = getMonitoringSessionForBooking(booking, sessionByBookingId, latestUsableSessionByStudentId);
                          const student = profilesById[booking.student_id];
                          const violationCount = violations.filter((row) => String(row.slot_id) === String(selectedSlot.id) && String(row.student_id) === String(booking.student_id)).length;
                          return (
                            <button
                              key={booking.id}
                              type="button"
                              onClick={() => session && setSelectedMonitoringSessionId(session.id)}
                              className={`w-full rounded-2xl border p-4 text-left transition ${
                                session && String(selectedMonitoringSessionId) === String(session.id)
                                  ? 'border-slate-900 bg-slate-900 text-white'
                                  : 'border-slate-200 bg-white hover:bg-slate-50'
                              } ${!session ? 'opacity-80' : ''}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                  <AvatarImage userId={student?.id} avatarUrl={student?.avatar_url} fallbackName={student?.full_name || student?.email || 'Student'} alt={student?.full_name || 'Student'} className="h-11 w-11 rounded-full object-cover" />
                                  <div>
                                    <p className="text-sm font-semibold">{student?.full_name || student?.email || 'Student'}</p>
                                    <p className={`mt-1 text-xs ${session && String(selectedMonitoringSessionId) === String(session.id) ? 'text-slate-300' : 'text-slate-500'}`}>
                                      {session ? `Status: ${session.status}` : `Booking: ${booking.status}`}
                                    </p>
                                    <p className={`mt-1 text-xs ${session && String(selectedMonitoringSessionId) === String(session.id) ? 'text-slate-300' : 'text-slate-500'}`}>
                                      Violations: {violationCount}/2
                                    </p>
                                  </div>
                                </div>
                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                  !session
                                    ? 'bg-slate-100 text-slate-600'
                                    : session.status === 'active'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : session.status === 'paused'
                                        ? 'bg-amber-100 text-amber-800'
                                      : session.status === 'terminated'
                                        ? 'bg-rose-100 text-rose-700'
                                        : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {session?.status || booking.status}
                                </span>
                              </div>
                              {session ? (
                                <div className={`mt-3 flex flex-wrap gap-2 ${session && String(selectedMonitoringSessionId) === String(session.id) ? 'text-white' : ''}`}>
                                  <span className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                                    session && String(selectedMonitoringSessionId) === String(session.id)
                                      ? 'bg-white/10 text-white'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}>
                                    Click to open live camera, screen, and mic view
                                  </span>
                                </div>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {!selectedMonitoringSession ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Select a student from the monitoring list to open the detailed invigilation view.</div>
                      ) : (
                        <>
                          <div ref={bigLiveMonitorRef} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div className="flex items-start gap-3">
                                <AvatarImage userId={selectedMonitoringStudent?.id} avatarUrl={selectedMonitoringStudent?.avatar_url} fallbackName={selectedMonitoringStudent?.full_name || selectedMonitoringStudent?.email || 'Student'} alt={selectedMonitoringStudent?.full_name || 'Student'} className="h-14 w-14 rounded-full object-cover" />
                                <div>
                                  <h3 className="text-xl font-semibold text-slate-900">{selectedMonitoringStudent?.full_name || selectedMonitoringStudent?.email || 'Student'}</h3>
                                  <p className="mt-1 text-sm text-slate-500">{getExamDisplayName(selectedExam, coursesById[selectedExam?.course_id])}</p>
                                  <p className="mt-1 text-sm text-slate-500">Joined: {formatDateTime(selectedMonitoringSession.started_at)}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSelectAdjacentMonitoringSession(-1)}
                                  disabled={selectedMonitoringIndex <= 0}
                                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  &lt;
                                </button>
                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                  selectedMonitoringSession.status === 'active'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : selectedMonitoringSession.status === 'paused'
                                      ? 'bg-amber-100 text-amber-800'
                                    : selectedMonitoringSession.status === 'terminated'
                                      ? 'bg-rose-100 text-rose-700'
                                      : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {selectedMonitoringSession.status}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleSelectAdjacentMonitoringSession(1)}
                                  disabled={selectedMonitoringIndex < 0 || selectedMonitoringIndex >= monitorableSessions.length - 1}
                                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  &gt;
                                </button>
                              </div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button type="button" onClick={() => setMonitorFeedTab('screen')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${monitorFeedTab === 'screen' ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>Screen Share</button>
                              <button type="button" onClick={() => setMonitorFeedTab('camera')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${monitorFeedTab === 'camera' ? 'bg-teal-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>Live Camera</button>
                              <button type="button" onClick={() => setMonitorFeedTab('voice')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${monitorFeedTab === 'voice' ? 'bg-amber-500 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>Voice Audio</button>
                              <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                                {selectedMonitoringIndex >= 0 ? `${selectedMonitoringIndex + 1} / ${monitorableSessions.length}` : `1 / ${Math.max(monitorableSessions.length, 1)}`}
                              </span>
                            </div>
                            <div className="mt-4">
                              <LiveExamStreamMonitor
                                slotId={selectedSlot.id}
                                session={selectedMonitoringSession}
                                viewerId={profile?.id}
                                viewerInstanceId={`detail-${selectedMonitoringSession?.id || 'none'}`}
                                viewerRole={role}
                                large
                              />
                            </div>
                            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                              {monitorFeedTab === 'screen' ? 'Live screen share is shown above. Use the camera panel below it to inspect the student at the same time.' : monitorFeedTab === 'camera' ? 'Live camera is shown with the direct browser feed. Use Listen Mic to monitor audio if the browser blocks autoplay.' : 'Audio comes from the direct camera/mic stream. Click Listen Mic if you need to hear the student microphone.'}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <h3 className="text-lg font-semibold text-slate-900">Detailed Monitoring</h3>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-sm text-slate-600">Attempt Count</p>
                                <p className="mt-1 text-2xl font-semibold text-slate-900">{selectedMonitoringSession.violation_count || monitoredViolations.length}/2</p>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-sm text-slate-600">Last Violation</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedMonitoringSession.last_violation_type || 'No violation yet'}</p>
                                <p className="mt-1 text-xs text-slate-500">{formatDateTime(selectedMonitoringSession.last_violation_at)}</p>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-sm text-slate-600">Overlay / Windows + G Detection</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">{monitoredViolations.some((row) => String(row.violation_type).toLowerCase().includes('overlay') || String(row.violation_type).toLowerCase().includes('windows + g')) ? 'Detected in logs' : 'No overlay detection logged'}</p>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-sm text-slate-600">Attendance</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedMonitoringSession.attendance_status || selectedMonitoringBooking?.status || 'pending'}</p>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-sm text-slate-600">Media Permissions</p>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                                  <span className={`rounded-full px-3 py-1 ${selectedMonitoringSession.camera_connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>Camera {selectedMonitoringSession.camera_connected ? 'connected' : 'waiting'}</span>
                                  <span className={`rounded-full px-3 py-1 ${selectedMonitoringSession.mic_connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>Mic {selectedMonitoringSession.mic_connected ? 'connected' : 'waiting'}</span>
                                  <span className={`rounded-full px-3 py-1 ${selectedMonitoringSession.screen_share_connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>Screen {selectedMonitoringSession.screen_share_connected ? 'connected' : 'waiting'}</span>
                                </div>
                              </div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" onClick={() => handleSessionAction(selectedMonitoringSession, 'warning')} className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800">Send Warning</button>
                            <button type="button" onClick={() => handleSessionAction(selectedMonitoringSession, selectedMonitoringSession.status === 'paused' ? 'resume' : 'pause')} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">{selectedMonitoringSession.status === 'paused' ? 'Resume Exam' : 'Pause Exam'}</button>
                            <button type="button" onClick={() => handleSessionAction(selectedMonitoringSession, 'terminate')} className="rounded-xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-800">Terminate</button>
                            {selectedMonitoringBooking ? <button type="button" onClick={() => handleAllowReschedule(selectedMonitoringBooking, selectedMonitoringSession)} className="rounded-xl bg-blue-100 px-3 py-2 text-sm font-semibold text-blue-700">Allow Reschedule</button> : null}
                            {isAdmin ? <button type="button" onClick={() => handleSessionAction(selectedMonitoringSession, 'lock')} className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white">Lock Account</button> : null}
                            {isAdmin && selectedMonitoringBooking ? <button type="button" onClick={() => handleBanStudentFromExam(selectedMonitoringBooking, selectedMonitoringSession)} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Ban In Exam</button> : null}
                            </div>
                          </div>

                          <div className="grid gap-4 xl:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                              <h3 className="text-lg font-semibold text-slate-900">Student Violations</h3>
                              <div className="mt-4 space-y-3">
                                {monitoredViolations.length === 0 ? <p className="text-sm text-slate-500">No violations logged for this student yet.</p> : monitoredViolations.map((violation) => (
                                  <div key={violation.id} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                    <p className="font-semibold">{violation.violation_type}</p>
                                    <p>Attempt Count: {violation.attempt_count}/2</p>
                                    <p>Timestamp: {formatDateTime(violation.created_at)}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                              <h3 className="text-lg font-semibold text-slate-900">Student Communication</h3>
                              <div className="mt-4 max-h-[260px] space-y-3 overflow-auto">
                                {monitoredMessages.length === 0 ? <p className="text-sm text-slate-500">No direct messages for this student yet.</p> : monitoredMessages.map((message) => {
                                  const sender = profilesById[message.sender_id];
                                  return (
                                    <div key={message.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                      <p className="font-semibold text-slate-900">{sender?.full_name || sender?.email || message.sender_role || 'System'}</p>
                                      <p className="mt-1">{message.content}</p>
                                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(message.created_at)}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    </div>
                  </div>
                ) : null}

                {(showFullOverview || isAttendancePanel || isCancellationsPanel) ? <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-slate-900">{isCancellationsPanel ? 'Exam Cancellations and Student Actions' : 'Bookings, Attendance, and Actions'}</h3>
                    {isAdmin && isCancellationsPanel ? (
                      <button
                        type="button"
                        onClick={handleCancelAllStudentExams}
                        disabled={saving || slotBookings.filter((booking) => booking.status !== 'cancelled').length === 0}
                        className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        Cancel All Student Exams
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <input
                      type="search"
                      value={slotStudentSearch}
                      onChange={(event) => setSlotStudentSearch(event.target.value)}
                      placeholder="Search student, email, or status"
                      className="w-full max-w-md rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    <span className="text-sm text-slate-500">
                      {filteredSlotBookings.length} of {slotBookings.length} student{slotBookings.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2 text-left">Student</th><th className="px-3 py-2 text-left">Exam</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Attendance</th><th className="px-3 py-2 text-left">Marked By</th><th className="px-3 py-2 text-left">Actions</th></tr></thead>
                      <tbody>
                        {slotBookings.length === 0 ? <tr><td colSpan="6" className="px-3 py-6 text-center text-slate-500">No students booked yet.</td></tr> : filteredSlotBookings.length === 0 ? <tr><td colSpan="6" className="px-3 py-6 text-center text-slate-500">No students match this search.</td></tr> : filteredSlotBookings.map((booking) => {
                          const student = profilesById[booking.student_id];
                          const session = sessionByBookingId[booking.id];
                          const marker = session?.attendance_marked_by ? profilesById[session.attendance_marked_by] : null;
                          return (
                            <tr key={booking.id} className="border-t border-slate-200">
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-3">
                                  <AvatarImage userId={student?.id} avatarUrl={student?.avatar_url} fallbackName={student?.full_name || student?.email || 'Student'} alt={student?.full_name || 'Student'} className="h-10 w-10 rounded-full object-cover" />
                                  <div><p className="font-medium text-slate-900">{student?.full_name || student?.email || 'Student'}</p><p className="text-xs text-slate-500">{student?.role || 'student'}</p></div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-slate-600">{getExamDisplayName(selectedExam, coursesById[selectedExam?.course_id])}</td>
                              <td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{session?.status || booking.status}</span></td>
                              <td className="px-3 py-3"><div className="space-y-2"><p className="text-slate-700">{session?.attendance_status || 'pending'}</p>{session ? <div className="flex gap-2"><button type="button" onClick={() => handleAttendance(session, 'present')} className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Present</button><button type="button" onClick={() => handleAttendance(session, 'absent')} className="rounded-lg bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">Absent</button></div> : null}</div></td>
                              <td className="px-3 py-3 text-slate-600">{marker ? `${marker.full_name || marker.email} (${session?.attendance_marked_role || '-'})` : '-'}</td>
                              <td className="px-3 py-3">
                                <div className="flex flex-wrap gap-2">
                                  {session ? <button type="button" onClick={() => selectMonitoringSession(session, { openModal: true, tab: 'screen' })} className="rounded-lg bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700">Open Live</button> : null}
                                  {session ? <button type="button" onClick={() => handleSessionAction(session, 'warning')} className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">Warn</button> : null}
                                  {session ? <button type="button" onClick={() => handleSessionAction(session, session.status === 'paused' ? 'resume' : 'pause')} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{session.status === 'paused' ? 'Resume' : 'Pause'}</button> : null}
                                  {session ? <button type="button" onClick={() => handleSessionAction(session, 'terminate')} className="rounded-lg bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">Terminate</button> : null}
                                  {(isAdmin || isTeacher || isInstructor) ? <button type="button" onClick={() => handleAllowReschedule(booking, session)} className="rounded-lg bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">Allow Reschedule</button> : null}
                                  {isAdmin ? <button type="button" onClick={() => handleCancelStudentExam(booking)} className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-semibold text-white">Cancel Exam</button> : null}
                                  {isAdmin && session ? <button type="button" onClick={() => handleSessionAction(session, 'lock')} className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white">Lock</button> : null}
                                  {isAdmin ? <button type="button" onClick={() => handleBanStudentFromExam(booking, session)} className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white">Ban In Exam</button> : null}
                                  {!session && !(isAdmin || isTeacher || isInstructor) ? <span className="text-xs text-slate-500">Not joined yet</span> : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 flex items-center gap-3 text-sm text-slate-600"><label className="font-medium text-slate-700">Lock account days</label><input type="number" min="1" max="60" value={lockDays} onChange={(event) => setLockDays(event.target.value)} className="w-24 rounded-xl border border-slate-300 px-3 py-2" /><span>Maximum 60 days</span></div>
                </div> : null}

                <div className="grid gap-4 xl:grid-cols-2">
                  {(showFullOverview || isAlertsPanel) ? <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-900">Live Alerts</h3>
                    <div className="mt-4 space-y-3">{slotViolations.length === 0 ? <p className="text-sm text-slate-500">No live violations recorded for this slot.</p> : slotViolations.map((violation) => <div key={violation.id} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><p className="font-semibold">{profilesById[violation.student_id]?.full_name || profilesById[violation.student_id]?.email || 'Student'}</p><p>{getExamDisplayName(selectedExam, coursesById[selectedExam?.course_id])}</p><p>Violation: {violation.violation_type}</p><p>Attempt Count: {violation.attempt_count}/2</p><p>Timestamp: {formatDateTime(violation.created_at)}</p></div>)}</div>
                  </div> : null}
                  {(showFullOverview || isMessagesPanel) ? <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-900">Messages and Chat Log</h3>
                    <div className="mt-4 max-h-[320px] space-y-3 overflow-auto">{slotMessages.length === 0 ? <p className="text-sm text-slate-500">No messages yet.</p> : slotMessages.map((message) => { const sender = profilesById[message.sender_id]; const recipient = profilesById[message.recipient_id]; return <div key={message.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"><p className="font-semibold text-slate-900">{sender?.full_name || sender?.email || message.sender_role || 'System'}{message.is_broadcast ? ' to everyone' : recipient ? ` to ${recipient.full_name || recipient.email}` : ''}</p><p className="mt-1">{message.content}</p><p className="mt-1 text-xs text-slate-500">{formatDateTime(message.created_at)}</p></div>; })}</div>
                    <div className="mt-4 space-y-3">
                      <select value={privateRecipientId} onChange={(event) => setPrivateRecipientId(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"><option value="">Broadcast to all students / invigilators</option>{slotBookings.map((booking) => <option key={booking.id} value={booking.student_id}>{profilesById[booking.student_id]?.full_name || profilesById[booking.student_id]?.email || 'Student'}</option>)}</select>
                      <textarea value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} className="min-h-[90px] w-full rounded-2xl border border-slate-300 px-3 py-2" placeholder={privateRecipientId ? 'Send private chat or instruction' : 'Broadcast warning, instruction, or communication update'} />
                      <button type="button" onClick={handleSendMessage} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Send Message</button>
                    </div>
                  </div> : null}
                </div>
                {showBigLiveModal ? (
                  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
                    <div className="relative max-h-[94vh] w-full max-w-7xl overflow-auto rounded-[2rem] bg-white p-5 shadow-2xl">
                      {selectedMonitoringSession ? (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <AvatarImage userId={selectedMonitoringStudent?.id} avatarUrl={selectedMonitoringStudent?.avatar_url} fallbackName={selectedMonitoringStudent?.full_name || selectedMonitoringStudent?.email || 'Student'} alt={selectedMonitoringStudent?.full_name || 'Student'} className="h-16 w-16 rounded-full object-cover" />
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Big Live View</p>
                                <h3 className="mt-2 text-2xl font-semibold text-slate-900">{selectedMonitoringStudent?.full_name || selectedMonitoringStudent?.email || 'Student'}</h3>
                                <p className="mt-1 text-sm text-slate-500">{getExamDisplayName(selectedExam, coursesById[selectedExam?.course_id])}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenMonitoringInfo(selectedMonitoringSession)}
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                i
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectAdjacentMonitoringSession(-1)}
                                disabled={selectedMonitoringIndex <= 0}
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                              >
                                &lt;
                              </button>
                              <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                                {selectedMonitoringIndex >= 0 ? `${selectedMonitoringIndex + 1} / ${activeMonitoringPool.length}` : `1 / ${Math.max(1, activeMonitoringPool.length)}`}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleSelectAdjacentMonitoringSession(1)}
                                disabled={selectedMonitoringIndex < 0 || selectedMonitoringIndex >= activeMonitoringPool.length - 1}
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                              >
                                &gt;
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowBigLiveModal(false)}
                                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                              >
                                X
                              </button>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" onClick={() => setMonitorFeedTab('screen')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${monitorFeedTab === 'screen' ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>Screen Share</button>
                            <button type="button" onClick={() => setMonitorFeedTab('camera')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${monitorFeedTab === 'camera' ? 'bg-teal-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>Live Camera</button>
                            <button type="button" onClick={() => setMonitorFeedTab('voice')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${monitorFeedTab === 'voice' ? 'bg-amber-500 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>Voice Audio</button>
                          </div>
                          <div className="mt-4">
                            <LiveExamStreamMonitor
                              slotId={selectedSlot?.id}
                              session={selectedMonitoringSession}
                              viewerId={profile?.id}
                              viewerInstanceId={`modal-${selectedMonitoringSession?.id || 'none'}`}
                              viewerRole={role}
                              large
                            />
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" onClick={() => handleSessionAction(selectedMonitoringSession, 'warning')} className="rounded-xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800">Warn</button>
                            <button type="button" onClick={() => handleSpeakToStudent(selectedMonitoringSession)} className="rounded-xl bg-teal-100 px-4 py-2 text-sm font-semibold text-teal-800">Speak</button>
                            <button type="button" onClick={() => handleSessionAction(selectedMonitoringSession, selectedMonitoringSession.status === 'paused' ? 'resume' : 'pause')} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800">{selectedMonitoringSession.status === 'paused' ? 'Resume' : 'Pause'}</button>
                            <button type="button" onClick={() => handleSessionAction(selectedMonitoringSession, 'terminate')} className="rounded-xl bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-800">Terminate</button>
                            {selectedMonitoringBooking ? <button type="button" onClick={() => handleAllowReschedule(selectedMonitoringBooking, selectedMonitoringSession)} className="rounded-xl bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700">Allow Reschedule</button> : null}
                            {isAdmin ? <button type="button" onClick={() => handleSessionAction(selectedMonitoringSession, 'lock')} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">Lock</button> : null}
                            {isAdmin && selectedMonitoringBooking ? <button type="button" onClick={() => handleBanStudentFromExam(selectedMonitoringBooking, selectedMonitoringSession)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Ban In Exam</button> : null}
                          </div>
                        </>
                      ) : (
                        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Big Live View</p>
                          <h3 className="mt-3 text-3xl font-semibold text-slate-900">No User Writing Now</h3>
                          <p className="mt-3 max-w-xl text-sm text-slate-500">When a student starts writing the live exam, their screen share, camera, and actions will appear here.</p>
                          <button
                            type="button"
                            onClick={() => setShowBigLiveModal(false)}
                            className="mt-6 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                          >
                            Close
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            )
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
