import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Bell, Menu, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import AvatarImage from './AvatarImage';
import Toast from './Toast';
import { logAdminNavigation } from '../utils/adminActivityLogger';
import { useNotifications } from '../context/NotificationContext';
import { readBrowserState, writeBrowserState } from '../utils/browserState';
import ChatOverlay from './ChatOverlay';
import { logError } from '../utils/errorLogger';

const SIDEBAR_COLLAPSED_KEY = 'layout_sidebar_collapsed';
const LAST_OPENED_PAGE_KEY = 'layout_last_opened_page';
const EXAM_REMINDER_SENT_KEY = 'exam_reminders_sent';

const getSentExamReminderKeys = (userId) => {
  if (!userId) return new Set();
  try {
    const parsed = JSON.parse(localStorage.getItem(`${EXAM_REMINDER_SENT_KEY}_${userId}`) || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
};

const saveSentExamReminderKeys = (userId, keys) => {
  if (!userId) return;
  localStorage.setItem(`${EXAM_REMINDER_SENT_KEY}_${userId}`, JSON.stringify(Array.from(keys)));
};

const formatExamReminderTime = (value) =>
  value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'your scheduled time';

const Layout = () => {
  const { profile, signOut } = useAuth();
  const { unreadNotifications, incrementUnreadNotifications } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const [panelSearch, setPanelSearch] = useState('');
  const [showPanelSearch, setShowPanelSearch] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Sidebar width: 16rem (w-64) when open, 5rem (w-20) when collapsed
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readBrowserState(SIDEBAR_COLLAPSED_KEY, false));
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
  const [examReminderPopup, setExamReminderPopup] = useState({ open: false, title: '', message: '' });
  const seenRealtimeNotificationIdsRef = useRef(new Set());
  const seenActivityEventKeysRef = useRef(new Set());
  const isMissingTargetUserColumn = (err) => {
    const msg = String(err?.message || '').toLowerCase();
    const details = String(err?.details || '').toLowerCase();
    const hint = String(err?.hint || '').toLowerCase();
    return (
      msg.includes('target_user_id') ||
      details.includes('target_user_id') ||
      hint.includes('target_user_id')
    );
  };
  const extractLegacyTargetUserId = (text) => {
    const match = String(text || '').match(/\[target_user_id:([^\]]+)\]/i);
    return match?.[1] || null;
  };
  // Listen to sidebar width changes
  useEffect(() => {
    const updateViewport = () => setIsMobileViewport(window.innerWidth < 768);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) {
      setMobileSidebarOpen(false);
    }
  }, [isMobileViewport]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const sidebar = document.querySelector('aside');
      if (sidebar) {
        const collapsed = sidebar.classList.contains('w-20');
        setSidebarCollapsed(collapsed);
        writeBrowserState(SIDEBAR_COLLAPSED_KEY, collapsed);
      }
    });

    const sidebar = document.querySelector('aside');
    if (sidebar) {
      observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const saved = readBrowserState(LAST_OPENED_PAGE_KEY);
    if (saved?.pathname && location.pathname === '/app' && saved.pathname !== '/app') {
      navigate(saved.pathname, { replace: true });
    }
  }, []);

  useEffect(() => {
    if (!location.pathname || location.pathname === '/app') return;
    writeBrowserState(LAST_OPENED_PAGE_KEY, {
      pathname: location.pathname,
      searchedAt: new Date().toISOString(),
    });
  }, [location.pathname]);

  const getPanelTargets = (role) => {
    const common = [
      { label: 'Dashboard', path: '/app' },
      { label: 'Logic Building', path: '/app/logic-building-contest' },
      { label: 'Logic Building Leaderboard', path: '/app/logic-building-leaderboard' },
      { label: 'Leaderboard', path: '/app/logic-building-leaderboard' },
      { label: 'Courses', path: '/app/courses' },
      { label: 'Verify Certificate', path: '/app/verify' },
      { label: 'Profile', path: '/app/profile' },
      { label: 'Mentorship Sessions', path: '/app/guidance-sessions' },
      { label: 'Notifications', path: '/app/notifications' },
      { label: 'Report Issue', path: '/app/report-issue' },
      { label: 'Settings', path: '/app/settings' },
      { label: 'Sign Out', path: '__signout__' },
    ];

    const studentTargets = [
      ...common,
      { label: 'Live Exams', path: '/app/live-exams' },
      { label: 'My Exams', path: '/app/my-exams' },
      { label: 'Write Test', path: '/app/write-test' },
      { label: 'My Certificates', path: '/app/my-certificates' },
      { label: 'Verify My ID', path: '/app/verify-my-id' },
      { label: 'Live Classes', path: '/app/class-schedule' },
      { label: 'Demo Sessions', path: '/app/demo-sessions' },
      { label: 'Premium Membership', path: '/app/premium-status' },
      { label: 'Discounts & Offers', path: '/app/offers' },
      { label: 'Universal AI', path: '/app/assistant' },
      { label: 'Career Mentor', path: '/app/career-chatbot' },
      { label: 'Learning Path', path: '/app/learning-path' },
      { label: 'Coding Playground', path: '/app/coding-playground' },
      { label: 'Discussion Forum', path: '/app/discussion-forum' },
      { label: 'Skill Badges', path: '/app/skill-badges' },
      { label: 'Resume Builder', path: '/app/resume-builder' },
      { label: 'Portfolio Generator', path: '/app/portfolio' },
      { label: 'Career Support', path: '/app/career-support' },
      { label: 'Career Report PDF', path: '/app/career-support#career-report' },
      { label: 'Career Tasks', path: '/app/career-support#career-tasks' },
      { label: 'Interview Practice', path: '/app/career-support#interview-practice' },
      { label: 'Career History', path: '/app/career-support#career-history' },
      { label: 'Resume Reviews', path: '/app/resume-reviews' },
      { label: 'Mock Interviews', path: '/app/mock-interviews' },
      { label: 'Personal Roadmap', path: '/app/personal-roadmap' },
      { label: 'Attendance', path: '/app/attendance' },
      { label: 'Ask a Doubt', path: '/app/chat' },
      { label: 'Request Teacher', path: '/app/request-teacher' },
    ];

    const teacherTargets = [
      ...common,
      { label: 'All In One', path: '/app/all-in-one' },
      { label: 'Live Exams', path: '/app/live-exams' },
      { label: 'Live Monitoring', path: '/app/live-monitoring' },
      { label: 'Exam Attendance', path: '/app/live-attendance' },
      { label: 'Violation Alerts', path: '/app/live-alerts' },
      { label: 'Exam Messages', path: '/app/live-messages' },
      { label: 'Conduct Tests', path: '/app/teacher/tests' },
      { label: 'Career Queue', path: '/app/teacher/career-queue' },
      { label: 'Teacher Workload', path: '/app/teacher/career-queue' },
      { label: 'Resume Reviews', path: '/app/resume-reviews' },
      { label: 'Mock Interviews', path: '/app/mock-interviews' },
      { label: 'Personal Roadmap', path: '/app/personal-roadmap' },
      { label: 'Clear Doubts', path: '/app/clear-doubts' },
      { label: 'Attendance', path: '/app/attendance' },
      { label: 'My Students', path: '/app/my-students' },
      { label: 'Assigned Classes', path: '/app/assigned-classes' },
      { label: 'Schedule Sessions', path: '/app/class-schedule' },
      { label: 'Demo Sessions', path: '/app/demo-sessions' },
      { label: 'Apply Leave', path: '/app/leaves' },
      { label: 'Session Reassignments', path: '/app/session-reassignments' },
      { label: 'Student Requests', path: '/app/teacher-requests' },
    ];

    const adminTargets = [
      ...common,
      { label: 'All In One', path: '/app/all-in-one' },
      { label: 'Live Exams', path: '/app/live-exams' },
      { label: 'Live Exam Slots', path: '/app/live-exam-slots' },
      { label: 'Exam Bans', path: '/app/admin/exam-bans' },
      { label: 'Live Monitoring', path: '/app/live-monitoring' },
      { label: 'Exam Attendance', path: '/app/live-attendance' },
      { label: 'Faculty Attendance', path: '/app/faculty-attendance' },
      { label: 'Violation Alerts', path: '/app/live-alerts' },
      { label: 'Exam Messages', path: '/app/live-messages' },
      { label: 'Admin Scoreboard', path: '/app/admin/logic-building-admin-scoreboard' },
      { label: 'Logic Building Setup', path: '/app/admin/logic-building-setup' },
      { label: 'Change Course', path: '/app/admin/change-course' },
      { label: 'Send Gift', path: '/app/admin/send-gift' },
      { label: 'Active Coupons', path: '/app/admin/active-coupons' },
      { label: 'User Management', path: '/app/admin/user-management' },
      { label: 'Certificate Blocks', path: '/app/admin/certificate-blocks' },
      { label: 'Prizes & Certificates', path: '/app/admin/prize-certificates' },
      { label: 'User IDs', path: '/app/admin/user-ids' },
      { label: 'Teacher Progress', path: '/app/admin/teacher-progress' },
      { label: 'Student Progress', path: '/app/admin/student-progress' },
      { label: 'Career Analytics', path: '/app/admin/career-analytics' },
      { label: 'Career Queue', path: '/app/admin/career-queue' },
      { label: 'Teacher Workload', path: '/app/admin/career-queue' },
      { label: 'Resume Reviews', path: '/app/resume-reviews' },
      { label: 'Mock Interviews', path: '/app/mock-interviews' },
      { label: 'Personal Roadmap', path: '/app/personal-roadmap' },
      { label: 'Schedule Live Classes', path: '/app/class-schedule' },
      { label: 'Demo Sessions', path: '/app/admin/demo-sessions' },
      { label: 'Attendance', path: '/app/attendance' },
      { label: 'Manage Premium', path: '/app/admin/manage-premium' },
      { label: 'Assign Teachers', path: '/app/admin/teacher-assignment' },
      { label: 'Student Reassignments', path: '/app/admin/student-reassignments' },
      { label: 'Auto Assigned Students', path: '/app/admin/auto-assigned-students' },
      { label: 'Teacher Requests', path: '/app/admin/teacher-requests' },
      { label: 'Teacher Leaves', path: '/app/leaves' },
      { label: 'User Access', path: '/app/admin/user-access' },
      { label: 'Account Management', path: '/app/admin/accounts' },
      { label: 'ID Verifications', path: '/app/admin/id-verifications' },
      { label: 'Certificate Name Requests', path: '/app/admin/certificate-name-requests' },
      { label: 'Post Notifications', path: '/app/admin/notifications' },
      { label: 'Multi Session Alerts', path: '/app/admin/multi-session-alerts' },
      { label: 'Admin Courses', path: '/app/admin/courses' },
      { label: 'Exam Retake Overrides', path: '/app/admin/exam-overrides' },
      { label: 'Choose Meet', path: '/app/admin/choose-meet' },
      { label: 'Allow Failed To Book Slot', path: '/app/admin/allow-failed-to-book-slot' },
      { label: 'Live Slot Cancellations', path: '/app/live-cancellations' },
      { label: 'Release Terminated Exams', path: '/app/admin/exam-retakes' },
      { label: 'Exam Settings', path: '/app/admin/exam-settings' },
      { label: 'Admin Settings', path: '/app/admin/settings' },
      { label: 'Website Protection', path: '/app/admin/website-protection' },
      { label: 'Reset Password', path: '/app/admin/reset-password' },
      { label: 'Activity Logs', path: '/app/admin/activity-logs' },
      { label: 'Error Logs', path: '/app/admin/error-logs' },
      { label: 'Lead Inbox', path: '/app/admin/lead-inbox' },
      { label: 'Visiting Website', path: '/app/admin/visitors' },
      { label: 'Growth Analytics', path: '/app/admin/growth-analytics' },
      { label: 'Payment QR', path: '/app/admin/payment-qr' },
      { label: 'Payment Responses', path: '/app/admin/payment-responses' },
      { label: 'Send Email', path: '/app/admin/send-email' },
      { label: 'Issue Reports', path: '/app/admin/issue-reports' },
      { label: 'MFA Management', path: '/app/admin/mfa-management' },
      { label: 'Login OTP', path: '/app/admin/login-otp' },
      { label: 'MFA Rules', path: '/app/admin/mfa-rules' },
      { label: 'Deleted Accounts', path: '/app/admin/deleted-accounts' },
      { label: 'Startup Ideas', path: '/app/admin/startup-ideas' },
      { label: 'Startup Collaborations', path: '/app/admin/startup-collaborations' },
    ];

    const instructorTargets = [
      { label: 'Dashboard', path: '/app' },
      { label: 'All In One', path: '/app/instructor/all-in-one' },
      { label: 'Live Exams', path: '/app/instructor/live-exams' },
    ];

    const verifierTargets = [
      { label: 'Dashboard', path: '/app/verifier' },
      { label: 'ID Verifications', path: '/app/verifier/id-verifications' },
      { label: 'Notifications', path: '/app/notifications' },
      { label: 'Settings', path: '/app/settings' },
      { label: 'Sign Out', path: '__signout__' },
    ];

    const targets =
      role === 'admin'
        ? adminTargets
        : role === 'teacher'
          ? teacherTargets
          : role === 'verifier'
            ? verifierTargets
          : role === 'instructor'
            ? instructorTargets
            : studentTargets;
    return targets.filter((item, index, arr) => arr.findIndex((x) => x.path === item.path) === index);
  };

  const panelTargets = getPanelTargets(profile?.role);
  const filteredTargets = !panelSearch.trim()
    ? []
    : panelTargets
        .filter((item) => item.label.toLowerCase().includes(panelSearch.trim().toLowerCase()))
        .slice(0, 8);

  const requestPageSwitch = useCallback((path) => {
    if (!path || path === location.pathname) return;
    navigate(path);
  }, [location.pathname, navigate]);

  const handlePanelTargetSelect = async (item) => {
    if (!item) return;
    if (item.path === '__signout__') {
      await signOut();
      return;
    }
    requestPageSwitch(item.path);
  };

  useEffect(() => {
    if (profile?.role !== 'admin' || !profile?.id) return;
    logAdminNavigation({
      adminId: profile.id,
      pathname: location.pathname,
      details: {
        source: 'layout',
      },
    });
  }, [profile?.id, profile?.role, location.pathname]);

  useEffect(() => {
    if (!profile?.id || !profile?.role) return;

    const pushActivityToast = (message) => {
      if (!message) return;
      setToast({ show: true, message, type: 'info' });
    };
    const markSeen = (key) => {
      if (!key) return false;
      if (seenActivityEventKeysRef.current.has(key)) return true;
      seenActivityEventKeysRef.current.add(key);
      return false;
    };

    const channel = supabase
      .channel(`layout-admin-notifications-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_notifications' },
        (payload) => {
          const notif = payload?.new || {};
          const notifId = notif.id;
          if (!notifId || seenRealtimeNotificationIdsRef.current.has(notifId)) return;

          const targetRole = notif.target_role;
          const targetUserId = notif.target_user_id;
          const legacyTargetUserId = extractLegacyTargetUserId(notif.content);
          const roleMatch = targetRole === 'all' || targetRole === profile.role;
          const userMatch =
            (!targetUserId || targetUserId === profile.id) &&
            (!legacyTargetUserId || String(legacyTargetUserId) === String(profile.id));
          if (!roleMatch || !userMatch) return;

          seenRealtimeNotificationIdsRef.current.add(notifId);
          incrementUnreadNotifications();
          setToast({
            show: true,
            message: notif.title ? `New: ${notif.title}` : 'You have a new notification',
            type: 'info',
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'class_session_participants',
          filter: `student_id=eq.${profile.id}`,
        },
        (payload) => {
          const row = payload?.new || {};
          const eventKey = `class_session_participants:insert:${row.id || row.session_id}:${row.created_at || ''}`;
          if (markSeen(eventKey)) return;
          pushActivityToast('New class session added for you.');
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'class_sessions',
          filter: `teacher_id=eq.${profile.id}`,
        },
        (payload) => {
          if (profile.role !== 'teacher') return;
          const row = payload?.new || {};
          const eventKey = `class_sessions:insert:${row.id}:${row.created_at || ''}`;
          if (markSeen(eventKey)) return;
          pushActivityToast(`New class scheduled: ${row.title || 'Session'}`);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'teacher_assignment_requests' },
        (payload) => {
          const row = payload?.new || {};
          const eventKey = `teacher_assignment_requests:insert:${row.id}:${row.created_at || ''}`;
          if (markSeen(eventKey)) return;
          if (profile.role === 'admin') pushActivityToast('New teacher assignment request received.');
          if (profile.role === 'teacher' && row.teacher_id === profile.id) {
            pushActivityToast('New student request assigned to you.');
          }
          if (profile.role === 'student' && row.student_id === profile.id) {
            pushActivityToast('Your teacher request was submitted.');
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teacher_assignment_requests' },
        (payload) => {
          const row = payload?.new || {};
          const eventKey = `teacher_assignment_requests:update:${row.id}:${row.updated_at || ''}`;
          if (markSeen(eventKey)) return;
          if (profile.role === 'student' && row.student_id === profile.id && row.status) {
            pushActivityToast(`Teacher request updated: ${String(row.status)}`);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'teacher_leaves' },
        (payload) => {
          if (profile.role !== 'admin') return;
          const row = payload?.new || {};
          const eventKey = `teacher_leaves:insert:${row.id}:${row.created_at || ''}`;
          if (markSeen(eventKey)) return;
          pushActivityToast('New leave request submitted.');
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teacher_leaves' },
        (payload) => {
          if (profile.role !== 'teacher') return;
          const row = payload?.new || {};
          if (row.teacher_id !== profile.id) return;
          const eventKey = `teacher_leaves:update:${row.id}:${row.updated_at || ''}`;
          if (markSeen(eventKey)) return;
          if (row.status) pushActivityToast(`Leave status: ${String(row.status)}`);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'guidance_requests' },
        (payload) => {
          const row = payload?.new || {};
          const eventKey = `guidance_requests:insert:${row.id}:${row.created_at || ''}`;
          if (markSeen(eventKey)) return;
          if (profile.role === 'admin') pushActivityToast('New mentorship request received.');
          if (profile.role === 'student' && row.student_id === profile.id) {
            pushActivityToast('Your mentorship request was submitted.');
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'guidance_requests' },
        (payload) => {
          if (profile.role !== 'student') return;
          const row = payload?.new || {};
          if (row.student_id !== profile.id) return;
          const eventKey = `guidance_requests:update:${row.id}:${row.updated_at || ''}`;
          if (markSeen(eventKey)) return;
          if (row.status) pushActivityToast(`Mentorship request updated: ${String(row.status)}`);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'startup_ideas' },
        (payload) => {
          const row = payload?.new || {};
          const eventKey = `startup_ideas:insert:${row.id}:${row.created_at || ''}`;
          if (markSeen(eventKey)) return;
          if (profile.role === 'admin') pushActivityToast('New startup idea submitted.');
          if (profile.role === 'student' && row.user_id === profile.id) {
            pushActivityToast('Your startup idea was submitted.');
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'startup_ideas' },
        (payload) => {
          if (profile.role !== 'student') return;
          const row = payload?.new || {};
          if (row.user_id !== profile.id) return;
          const eventKey = `startup_ideas:update:${row.id}:${row.reviewed_at || row.updated_at || ''}`;
          if (markSeen(eventKey)) return;
          if (row.status && row.status !== 'pending') {
            pushActivityToast(`Startup idea status: ${String(row.status)}`);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'certificates', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          if (profile.role !== 'student') return;
          const row = payload?.new || {};
          const eventKey = `certificates:insert:${row.id}:${row.issued_at || row.created_at || ''}`;
          if (markSeen(eventKey)) return;
          pushActivityToast('New certificate generated for you.');
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'certificates', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          if (profile.role !== 'student') return;
          const row = payload?.new || {};
          const oldRow = payload?.old || {};
          const eventKey = `certificates:update:${row.id}:${row.revoked_at || row.updated_at || ''}`;
          if (markSeen(eventKey)) return;
          if (!oldRow.revoked_at && row.revoked_at) {
            pushActivityToast('A certificate was blocked.');
          } else if (oldRow.revoked_at && !row.revoked_at) {
            pushActivityToast('A certificate was unblocked.');
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'generated_certificates', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          if (profile.role !== 'student') return;
          const row = payload?.new || {};
          const eventKey = `generated_certificates:insert:${row.id}:${row.issued_at || row.created_at || ''}`;
          if (markSeen(eventKey)) return;
          pushActivityToast('New prize certificate added.');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, profile?.role, incrementUnreadNotifications]);

  useEffect(() => {
    if (!profile?.id || profile?.role !== 'student') return undefined;

    let active = true;

    const insertReminderNotification = async (row) => {
      const payload = {
        title: row.title,
        content: row.content,
        type: 'warning',
        target_role: 'student',
        target_user_id: profile.id,
      };

      const { error } = await supabase.from('admin_notifications').insert(payload);
      if (error && isMissingTargetUserColumn(error)) {
        const { target_user_id, content, ...fallback } = payload;
        await supabase.from('admin_notifications').insert({
          ...fallback,
          content: `[target_user_id:${target_user_id}] ${content}`,
        });
      } else if (error) {
        throw error;
      }
    };

    const checkExamReminders = async () => {
      try {
        const now = Date.now();
        const futureCutoff = new Date(now + 61 * 60 * 1000).toISOString();
        const { data: bookings, error: bookingError } = await supabase
          .from('exam_slot_bookings')
          .select('id, slot_id, status')
          .eq('student_id', profile.id)
          .neq('status', 'cancelled');
        if (bookingError) throw bookingError;

        const slotIds = Array.from(new Set((bookings || []).map((booking) => booking.slot_id).filter(Boolean)));
        if (!slotIds.length) return;

        const { data: slots, error: slotError } = await supabase
          .from('exam_live_slots')
          .select('id, title, starts_at, ends_at, exam_id')
          .in('id', slotIds)
          .gte('starts_at', new Date(now).toISOString())
          .lte('starts_at', futureCutoff)
          .neq('status', 'cancelled');
        if (slotError) throw slotError;

        if (!active || !slots?.length) return;

        const bookingBySlotId = new Map((bookings || []).map((booking) => [String(booking.slot_id), booking]));
        const sentKeys = getSentExamReminderKeys(profile.id);
        let changed = false;

        for (const slot of slots) {
          const booking = bookingBySlotId.get(String(slot.id));
          if (!booking) continue;

          const startsAtMs = new Date(slot.starts_at).getTime();
          const minutesUntil = Math.floor((startsAtMs - now) / 60000);
          const reminderType = minutesUntil <= 10 ? '10min' : minutesUntil <= 60 ? '1hr' : null;
          if (!reminderType) continue;

          const key = `${booking.id}:${reminderType}`;
          if (sentKeys.has(key)) continue;

          await insertReminderNotification({
            title: reminderType === '10min' ? 'Exam Starts In 10 Minutes' : 'Exam Starts In 1 Hour',
            content:
              reminderType === '10min'
                ? `You have an exam in 10 minutes. Please be ready before ${formatExamReminderTime(slot.starts_at)}.`
                : `You have an exam in 1 hour. Please prepare and join at ${formatExamReminderTime(slot.starts_at)}.`,
          });

          sentKeys.add(key);
          changed = true;
          incrementUnreadNotifications();
          setExamReminderPopup({
            open: true,
            title: reminderType === '10min' ? 'Exam Starts In 10 Minutes' : 'Exam Starts In 1 Hour',
            message:
              reminderType === '10min'
                ? `You have an exam in 10 minutes. Please be ready before ${formatExamReminderTime(slot.starts_at)}.`
                : `You have an exam in 1 hour. Please prepare and join at ${formatExamReminderTime(slot.starts_at)}.`,
          });
        }

        if (changed) {
          saveSentExamReminderKeys(profile.id, sentKeys);
        }
      } catch (reminderError) {
        logError({ message: String(reminderError?.message || reminderError), source: 'Layout', details: reminderError });
      }
    };

    checkExamReminders();
    const interval = window.setInterval(checkExamReminders, 60000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [profile?.id, profile?.role, incrementUnreadNotifications]);

  // Sidebar width: 16rem (256px) when open, 5rem (80px) when collapsed
  // We'll use a state to track the sidebar width for margin
  const [sidebarWidth, setSidebarWidth] = useState(256); // default w-64

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const sidebar = document.querySelector('aside');
      if (sidebar) {
        if (sidebar.classList.contains('w-20')) {
          setSidebarWidth(80);
        } else {
          setSidebarWidth(256);
        }
      }
    });
    const sidebar = document.querySelector('aside');
    if (sidebar) {
      observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="bg-slate-50 min-h-screen">
      <Toast
        show={toast.show}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast((prev) => ({ ...prev, show: false }))}
      />
      {examReminderPopup.open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Bell size={26} />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-slate-900">{examReminderPopup.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{examReminderPopup.message}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setExamReminderPopup({ open: false, title: '', message: '' })}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => {
                  setExamReminderPopup({ open: false, title: '', message: '' });
                  requestPageSwitch('/app/my-exams');
                }}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
              >
                View My Exams
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <Sidebar
        isMobile={isMobileViewport}
        mobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        onRequestNavigation={requestPageSwitch}
      />
      <ChatOverlay />
      <div
        className="flex flex-col transition-all duration-300"
        style={{ marginLeft: isMobileViewport ? 0 : sidebarWidth, minHeight: '100vh' }}
      >
        {/* Top Navbar */}
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-3 md:px-8 sticky top-0 z-10">
          <div className="flex items-center gap-3 w-full">
            {isMobileViewport ? (
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700"
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
            ) : null}
            <div className="relative w-full max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={panelSearch}
              onFocus={() => setShowPanelSearch(true)}
              onBlur={() => setTimeout(() => setShowPanelSearch(false), 120)}
              onChange={(e) => setPanelSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredTargets.length > 0) {
                  void handlePanelTargetSelect(filteredTargets[0]);
                  setPanelSearch('');
                  setShowPanelSearch(false);
                }
              }}
              placeholder="Search panel pages..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {showPanelSearch && filteredTargets.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg overflow-hidden z-40">
                {filteredTargets.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onMouseDown={() => {
                      void handlePanelTargetSelect(item);
                      setPanelSearch('');
                      setShowPanelSearch(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b last:border-b-0"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            </div>
          </div>
          <div className="flex items-center space-x-3 md:space-x-6">
            <div className="relative cursor-pointer" onClick={() => requestPageSwitch('/app/notifications')}>
              <Bell size={20} className="text-slate-600 hover:text-blue-600 transition" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold animate-pulse">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-3">
                <div className="text-right">
                    <p className="text-sm font-bold text-nani-dark">{profile?.full_name}</p>
                    <p className="text-xs text-slate-500 capitalize">{profile?.role}</p>
                </div>
                <AvatarImage
                  userId={profile?.id}
                  avatarUrl={profile?.avatar_url}
                  alt="Profile"
                  fallbackName={profile?.full_name || 'User'}
                  className="w-10 h-10 rounded-full border-2 border-gold-400 object-cover"
                />
            </div>
          </div>
        </header>
        {/* Main Content */}
        <main className="p-2 md:p-4 flex-1 overflow-hidden h-[calc(100vh-128px)] md:h-[calc(100vh-144px)]">
          <Outlet />
        </main>
        {/* Footer */}
        <footer className="text-center py-4 text-xs text-slate-400">
           &copy; {new Date().getFullYear()} SucessKart. All rights reserved. 
        </footer>
      </div>
    </div>
  );
};

export { Layout };
export default Layout;

