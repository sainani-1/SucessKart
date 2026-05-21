import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, User, GraduationCap, Video, Users, CheckSquare, LogOut, FileBadge, ShieldCheck, ClipboardList, Sparkles, MessageCircle, Calendar, Award, UserPlus, Lock, Unlock, Bell, Clock, Briefcase, ChevronLeft, ChevronRight, Settings, Gift, Trash2, Mail, FileText, Wrench, BarChart3, Code2, MessageSquare, KeyRound, MonitorUp, ShieldAlert, CreditCard, X, Download, ListChecks, Globe2, Trophy, Wifi } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { useNotifications } from '../context/NotificationContext';
import { getChatReadTimes, markChatsAsRead } from '../utils/chatReadState';
import { buildPlanCheckoutPath } from '../utils/planCheckout';

const Sidebar = ({ isMobile = false, mobileOpen = false, onClose = () => {}, onRequestNavigation = null }) => {
  const { profile, realProfile, isImpersonating, stopImpersonation, signOut, isPremium, isPremiumPlus } = useAuth();
  const { unreadNotifications } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const role = profile?.role || 'student';
  const [isCollapsed, setIsCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [isHovered, setIsHovered] = useState(false);
  const [unreadChats, setUnreadChats] = useState(0);
  const [newUserRegistrations, setNewUserRegistrations] = useState(0);
  const [newTeacherRequests, setNewTeacherRequests] = useState(0);
  const [newLeaveRequests, setNewLeaveRequests] = useState(0);
  const [newGuidanceRequests, setNewGuidanceRequests] = useState(0);
  const [newStartupIdeas, setNewStartupIdeas] = useState(0);
  const [newMultiSessionAlerts, setNewMultiSessionAlerts] = useState(0);
  const [lastPathname, setLastPathname] = useState(location.pathname);
  const premiumActive = isPremium(profile);
  const premiumPlusActive = isPremiumPlus(profile);
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
  // Fetch new guidance session requests (Admin only)
  useEffect(() => {
    if (!profile?.id || role !== 'admin') return;

    const fetchNewGuidanceRequests = async () => {
      try {
        const lastSeenKey = `lastSeenGuidanceRequests_${profile.id}`;
        const lastSeen = localStorage.getItem(lastSeenKey);
        // If on guidance sessions page, update last seen
        if (location.pathname === '/app/guidance-sessions') {
          localStorage.setItem(lastSeenKey, new Date().toISOString());
          setNewGuidanceRequests(0);
          return;
        }
        const { data, error } = await supabase
          .from('guidance_requests')
          .select('id, created_at, status')
          .eq('status', 'pending')
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (lastSeen && data) {
          const newCount = data.filter(r => new Date(r.created_at) > new Date(lastSeen)).length;
          setNewGuidanceRequests(newCount);
        } else {
          setNewGuidanceRequests(data?.length || 0);
        }
      } catch (err) {
        setNewGuidanceRequests(0);
      }
    };
    fetchNewGuidanceRequests();
    const interval = setInterval(fetchNewGuidanceRequests, 30000);
    return () => clearInterval(interval);
  }, [profile?.id, role, location.pathname]);

  useEffect(() => {
    if (!profile?.id || role !== 'admin') return;

    const fetchNewMultiSessionAlerts = async () => {
      try {
        const lastSeenKey = `lastSeenMultiSessionAlerts_${profile.id}`;
        const lastSeen = localStorage.getItem(lastSeenKey);

        if (location.pathname === '/app/admin/multi-session-alerts') {
          localStorage.setItem(lastSeenKey, new Date().toISOString());
          setNewMultiSessionAlerts(0);
          return;
        }

        const { data, error } = await supabase
          .from('multi_session_alerts')
          .select('id, created_at, admin_status')
          .order('created_at', { ascending: false });

        if (error) throw error;

        const pendingRows = (data || []).filter((row) => row.admin_status === 'new');
        if (lastSeen) {
          const newCount = pendingRows.filter((row) => new Date(row.created_at) > new Date(lastSeen)).length;
          setNewMultiSessionAlerts(newCount);
        } else {
          setNewMultiSessionAlerts(pendingRows.length);
        }
      } catch {
        setNewMultiSessionAlerts(0);
      }
    };

    fetchNewMultiSessionAlerts();
    const interval = setInterval(fetchNewMultiSessionAlerts, 30000);
    return () => clearInterval(interval);
  }, [profile?.id, role, location.pathname]);

  const navItemClass = ({ isActive }) =>
    `flex min-h-[56px] items-center ${isMobile ? 'justify-start gap-3 px-4 py-3' : isCollapsed && !isHovered ? 'justify-center px-2' : 'gap-3 px-4'} rounded-xl transition-all duration-300 whitespace-nowrap [&>svg]:h-6 [&>svg]:w-6 [&>svg]:shrink-0 ${isActive ? 'bg-gold-400 text-nani-dark font-bold shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`;
  const exactNavItemClass = (target) => {
    const current = `${location.pathname}${location.hash || ''}`;
    const isActive = current === target;
    return `flex min-h-[56px] items-center ${isMobile ? 'justify-start gap-3 px-4 py-3' : isCollapsed && !isHovered ? 'justify-center px-2' : 'gap-3 px-4'} rounded-xl transition-all duration-300 whitespace-nowrap [&>svg]:h-6 [&>svg]:w-6 [&>svg]:shrink-0 ${isActive ? 'bg-gold-400 text-nani-dark font-bold shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`;
  };
  const careerSubNavItemClass = (target) => {
    const current = `${location.pathname}${location.hash || ''}`;
    const isActive = current === target;
    return `flex min-h-[56px] items-center ${isMobile ? 'justify-start gap-3 px-4 py-3' : isCollapsed && !isHovered ? 'justify-center px-2' : 'gap-3 px-4'} rounded-xl transition-all duration-300 whitespace-nowrap [&>svg]:h-6 [&>svg]:w-6 [&>svg]:shrink-0 ${isActive ? 'bg-gold-400 text-nani-dark font-bold shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`;
  };

  const shouldShowText = isMobile || !isCollapsed || isHovered;
  const requestNavigation = (path) => {
    if (onRequestNavigation) {
      onRequestNavigation(path);
      return;
    }
    navigate(path);
  };

  const handleSidebarNavigationClick = (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const link = event.target.closest?.('a[href]');
    if (!link || link.target === '_blank') return;

    const url = new URL(link.href, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/app')) return;
    if (url.pathname === location.pathname) return;

    event.preventDefault();
    requestNavigation(`${url.pathname}${url.search}${url.hash}`);
  };

  useEffect(() => {
    if (location.pathname !== lastPathname) {
      setLastPathname(location.pathname);
      if (isMobile && mobileOpen) {
        onClose();
      }
    }
  }, [isMobile, lastPathname, location.pathname, mobileOpen, onClose]);

  useEffect(() => {
    const syncSidebarForViewport = () => {
      if (window.innerWidth < 768) {
        setIsCollapsed(true);
      }
    };

    syncSidebarForViewport();
    window.addEventListener('resize', syncSidebarForViewport);
    return () => window.removeEventListener('resize', syncSidebarForViewport);
  }, []);

  // Fetch unread chats count
  useEffect(() => {
    if (!profile?.id) return;
    if (role !== 'student' && role !== 'teacher') return;

    const fetchUnreadChats = async () => {
      try {
        // Get all chat groups where user is a member
        const { data: memberGroups, error: memberError } = await supabase
          .from('chat_members')
          .select('group_id')
          .eq('user_id', profile.id);

        if (memberError) throw memberError;

        if (!memberGroups || memberGroups.length === 0) {
          setUnreadChats(0);
          return;
        }

        const groupIds = memberGroups.map(m => m.group_id);

        let chatReadTimes = await getChatReadTimes(profile.id, groupIds);

        // If user is on the chat page, mark all chats as read immediately
        if (location.pathname.startsWith('/app/chat')) {
          const now = new Date().toISOString();
          chatReadTimes = await markChatsAsRead(profile.id, groupIds, now);
          setUnreadChats(0);
          return;
        }

        // Check each group for unread messages
        let totalUnread = 0;
        for (const groupId of groupIds) {
          const { data: messages } = await supabase
            .from('chat_messages')
            .select('id, sender_id, created_at')
            .eq('group_id', groupId)
            .order('created_at', { ascending: false });

          // If there are no messages at all, don't flag unread
          if (!messages || messages.length === 0) continue;

          const lastReadAt = chatReadTimes.get(groupId);
          let unreadCount = 0;

          if (lastReadAt) {
            unreadCount = messages.filter(
              m => m.sender_id !== profile.id && new Date(m.created_at) > new Date(lastReadAt)
            ).length;
          } else {
            // If never read, count only messages from others
            unreadCount = messages.filter(m => m.sender_id !== profile.id).length;
          }

          if (unreadCount > 0) totalUnread++;
        }

        setUnreadChats(totalUnread);
      } catch (err) {
        setUnreadChats(0);
      }
    };

    fetchUnreadChats();
    const interval = setInterval(fetchUnreadChats, 60000); // Check every minute
    const onFocus = () => fetchUnreadChats();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchUnreadChats();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [profile?.id, role, location.pathname]);

  // Fetch new user registrations count (Admin only)
  useEffect(() => {
    if (!profile?.id || role !== 'admin') return;

    const fetchNewUsers = async () => {
      try {
        const lastSeenKey = `lastSeenUsers_${profile.id}`;
        const lastSeen = localStorage.getItem(lastSeenKey);

        // If on user management page, update last seen
        if (location.pathname === '/app/admin/user-management') {
          localStorage.setItem(lastSeenKey, new Date().toISOString());
          setNewUserRegistrations(0);
          return;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('id, created_at')
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (lastSeen && data) {
          const newCount = data.filter(u => new Date(u.created_at) > new Date(lastSeen)).length;
          setNewUserRegistrations(newCount);
        } else {
          setNewUserRegistrations(data?.length || 0);
        }
      } catch (err) {
        setNewUserRegistrations(0);
      }
    };

    fetchNewUsers();
    const interval = setInterval(fetchNewUsers, 30000);
    return () => clearInterval(interval);
  }, [profile?.id, role, location.pathname]);

  // Fetch new teacher assignment requests (Admin and Teacher)
  useEffect(() => {
    if (!profile?.id || (role !== 'admin' && role !== 'teacher')) return;

    const fetchNewRequests = async () => {
      try {
        const lastSeenKey = `lastSeenTeacherRequests_${profile.id}`;
        const lastSeen = localStorage.getItem(lastSeenKey);

        // If on requests page, update last seen
        if (location.pathname === '/app/admin/teacher-requests' || location.pathname === '/app/teacher-requests') {
          localStorage.setItem(lastSeenKey, new Date().toISOString());
          setNewTeacherRequests(0);
          return;
        }

        let query = supabase
          .from('teacher_assignment_requests')
          .select('id, created_at, status')
          .eq('status', 'pending');

        // Teachers only see their own requests
        if (role === 'teacher') {
          query = query.eq('teacher_id', profile.id);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        if (lastSeen && data) {
          const newCount = data.filter(r => new Date(r.created_at) > new Date(lastSeen)).length;
          setNewTeacherRequests(newCount);
        } else {
          setNewTeacherRequests(data?.length || 0);
        }
      } catch (err) {
        setNewTeacherRequests(0);
      }
    };

    fetchNewRequests();
    const interval = setInterval(fetchNewRequests, 30000);
    return () => clearInterval(interval);
  }, [profile?.id, role, location.pathname]);

  // Fetch new leave requests (Admin only)
  useEffect(() => {
    if (!profile?.id || role !== 'admin') return;

    const fetchNewLeaves = async () => {
      try {
        const lastSeenKey = `lastSeenLeaves_${profile.id}`;
        const lastSeen = localStorage.getItem(lastSeenKey);

        // If on leaves page, update last seen
        if (location.pathname === '/app/leaves') {
          localStorage.setItem(lastSeenKey, new Date().toISOString());
          setNewLeaveRequests(0);
          return;
        }

        const { data, error } = await supabase
          .from('teacher_leaves')
          .select('id, created_at, status')
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (lastSeen && data) {
          const newCount = data.filter(l => new Date(l.created_at) > new Date(lastSeen)).length;
          setNewLeaveRequests(newCount);
        } else {
          setNewLeaveRequests(data?.length || 0);
        }
      } catch (err) {
        setNewLeaveRequests(0);
      }
    };

    fetchNewLeaves();
    const interval = setInterval(fetchNewLeaves, 30000);
    return () => clearInterval(interval);
  }, [profile?.id, role, location.pathname]);

  // Fetch new startup ideas count (Admin only)
  useEffect(() => {
    if (!profile?.id || role !== 'admin') return;

    const fetchNewStartupIdeas = async () => {
      try {
        const lastSeenKey = `lastSeenStartupIdeas_${profile.id}`;
        const lastSeen = localStorage.getItem(lastSeenKey);

        // If admin is on startup ideas page, mark all as seen
        if (location.pathname === '/app/admin/startup-ideas') {
          localStorage.setItem(lastSeenKey, new Date().toISOString());
          setNewStartupIdeas(0);
          return;
        }

        const { data, error } = await supabase
          .from('startup_ideas')
          .select('id, created_at, status')
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (lastSeen && data) {
          const newCount = data.filter((item) => new Date(item.created_at) > new Date(lastSeen)).length;
          setNewStartupIdeas(newCount);
        } else {
          setNewStartupIdeas(data?.length || 0);
        }
      } catch (err) {
        setNewStartupIdeas(0);
      }
    };

    fetchNewStartupIdeas();
    const interval = setInterval(fetchNewStartupIdeas, 30000);
    return () => clearInterval(interval);
  }, [profile?.id, role, location.pathname]);

  const sidebarWidthClass = isCollapsed && !isHovered ? 'w-20' : 'w-64';
  const desktopSidebarClass = `${sidebarWidthClass} bg-nani-dark text-white h-screen flex flex-col fixed left-0 top-0 transition-all duration-600 z-30`;
  const mobileSidebarClass = `w-[88vw] max-w-[320px] bg-nani-dark text-white h-screen flex flex-col fixed left-0 top-0 z-50 transform transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`;

  return (
    <>
    {isMobile && mobileOpen ? (
      <button
        type="button"
        className="fixed inset-0 z-40 bg-slate-950/50"
        onClick={onClose}
        aria-label="Close menu overlay"
      />
    ) : null}
    <aside
      className={isMobile ? mobileSidebarClass : desktopSidebarClass}
      style={{ minHeight: '100vh' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`${isMobile ? 'p-4' : 'p-6'} border-b border-white/10 flex-shrink-0`}>
        {isMobile ? (
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-white"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>
        ) : null}
        <div
          className={`flex items-center ${isMobile ? 'gap-3' : isCollapsed && !isHovered ? 'justify-center' : 'space-x-2'} cursor-pointer hover:opacity-80 transition-opacity`}
          onClick={() => requestNavigation('/app')}
        >
          <img src="/skillpro-logo.png" alt="SkillPro logo" className={`${isMobile ? 'w-11 h-11' : 'w-10 h-10'} rounded-full object-contain`} />
          {shouldShowText && (
            <div className="min-w-0">
              <span className="block truncate font-bold text-xl tracking-tight">SkillPro</span>
              {isMobile ? <span className="block text-xs text-slate-400">Learning Panel</span> : null}
            </div>
          )}
        </div>
        {shouldShowText && !isMobile ? <p className="text-xs text-slate-400 mt-2 uppercase tracking-wider">{role} Panel</p> : null}
        {shouldShowText && isImpersonating && (
          <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-400/10 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">
              Viewing As {profile?.role}
            </p>
            <p className="mt-1 text-xs text-amber-100">
              Admin: {realProfile?.full_name || realProfile?.email || 'Admin'}
            </p>
            <button
              type="button"
              onClick={stopImpersonation}
              className="mt-2 rounded-md bg-amber-400 px-2.5 py-1 text-xs font-semibold text-slate-900 hover:bg-amber-300"
            >
              Exit User View
            </button>
          </div>
        )}
      </div>

      {/* Toggle Button */}
      {!isMobile ? (
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute top-20 -right-4 bg-gold-400 text-nani-dark rounded-full p-2 shadow-lg hover:bg-gold-300 transition-colors z-20"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      ) : null}

      <nav
        className={`flex-1 ${isMobile ? 'p-3 space-y-2' : 'p-4 space-y-3'} overflow-y-auto scrollbar-thin scrollbar-thumb-gold-400 scrollbar-track-nani-dark/50 flex flex-col`}
        onClickCapture={handleSidebarNavigationClick}
      >
        {role === 'instructor' ? (
          <>
            <NavLink to="/app" end className={navItemClass} title="Dashboard">
              <LayoutDashboard size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Dashboard</span>}
            </NavLink>
            <NavLink to="/app/instructor/all-in-one" className={navItemClass} title="All In One">
              <MonitorUp size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">All In One</span>}
            </NavLink>
            <NavLink to="/app/instructor/live-exams" className={navItemClass} title="Live Exams">
              <ShieldCheck size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Live Exams</span>}
            </NavLink>
          </>
        ) : role === 'verifier' ? (
          <>
            <NavLink to="/app/verifier" end className={navItemClass} title="Verifier Dashboard">
              <LayoutDashboard size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Dashboard</span>}
            </NavLink>
            <NavLink to="/app/verifier/id-verifications" className={navItemClass} title="ID Verifications">
              <ShieldCheck size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">ID Verifications</span>}
            </NavLink>
            <NavLink to="/app/notifications" className={navItemClass} title="Notifications">
              <Bell size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Notifications</span>}
              {unreadNotifications > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/app" end className={navItemClass} title="Dashboard">
              <LayoutDashboard size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Dashboard</span>}
            </NavLink>
            <NavLink to="/app/logic-building-contest" className={navItemClass} title="Logic Building Contest">
              <Sparkles size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Logic Building</span>}
            </NavLink>
            <NavLink to="/app/logic-building-leaderboard" className={navItemClass} title="Logic Building Leaderboard">
              <Trophy size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Leaderboard</span>}
            </NavLink>
            {role === 'admin' && (
              <NavLink to="/app/admin/logic-building-admin-scoreboard" className={navItemClass} title="Logic Building Admin Scoreboard">
                <Award size={28} />
                {shouldShowText && <span className="truncate text-sm font-medium">Admin Scoreboard</span>}
              </NavLink>
            )}

            <NavLink to="/app/courses" className={navItemClass} title="Courses">
              <BookOpen size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Courses</span>}
            </NavLink>

            {role === 'student' && (
              <>
                <NavLink to="/app/daily-planner" className={navItemClass} title="Daily Learning Planner">
                  <Calendar size={28} />
                  {shouldShowText && <span className="truncate text-sm font-medium">Daily Planner</span>}
                </NavLink>
                <NavLink to="/app/course-checklist" className={navItemClass} title="Course Checklist">
                  <ClipboardList size={28} />
                  {shouldShowText && <span className="truncate text-sm font-medium">Course Checklist</span>}
                </NavLink>
                <NavLink to="/app/exam-readiness" className={navItemClass} title="Exam Readiness">
                  <CheckSquare size={28} />
                  {shouldShowText && <span className="truncate text-sm font-medium">Exam Readiness</span>}
                </NavLink>
                <NavLink to="/app/achievement-timeline" className={navItemClass} title="Achievement Timeline">
                  <Sparkles size={28} />
                  {shouldShowText && <span className="truncate text-sm font-medium">Timeline</span>}
                </NavLink>
                <NavLink to="/app/course-doubt-helper" className={navItemClass} title="Course Doubt Helper">
                  <MessageCircle size={28} />
                  {shouldShowText && <span className="truncate text-sm font-medium">Doubt Helper</span>}
                </NavLink>
                <NavLink to="/app/leaderboard" className={navItemClass} title="Learning Leaderboard">
                  <Trophy size={28} />
                  {shouldShowText && <span className="truncate text-sm font-medium">Leaderboard</span>}
                </NavLink>
              </>
            )}

            <NavLink to="/app/notes-library" className={navItemClass} title="Notes Library">
              <FileText size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Notes Library</span>}
            </NavLink>

            <NavLink to="/app/verify" className={navItemClass} title="Verify Certificate">
              <ShieldCheck size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Verify Certificate</span>}
            </NavLink>

            <NavLink to="/app/profile" className={navItemClass} title="Profile">
              <User size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Profile</span>}
            </NavLink>

            <NavLink to="/app/guidance-sessions" className={navItemClass} title="Mentorship Sessions">
              <Calendar size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Mentorship Sessions</span>}
              {role === 'admin' && newGuidanceRequests > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {newGuidanceRequests > 9 ? '9+' : newGuidanceRequests}
                </span>
              )}
            </NavLink>

            <NavLink to="/app/notifications" className={navItemClass} title="Notifications">
              <Bell size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Notifications</span>}
              {unreadNotifications > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </NavLink>
          </>
        )}

        {/* Student Specific */}
        {role === 'student' && (
          <>
            {!premiumPlusActive && (
              <NavLink
                to={buildPlanCheckoutPath(premiumActive ? 'premium_plus' : 'premium')}
                className={navItemClass}
                title={premiumActive ? 'Upgrade to Premium Plus' : 'Buy Premium'}
              >
                <CreditCard size={28} />
                {shouldShowText && (
                  <span className="truncate text-sm font-medium">
                    {premiumActive ? 'Upgrade Premium Plus' : 'Buy Premium'}
                  </span>
                )}
              </NavLink>
            )}
            <NavLink to="/app/my-exams" className={navItemClass} title="My Exams">
              <Calendar size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">My Exams</span>}
            </NavLink>
            <NavLink to="/app/write-test" className={navItemClass} title="Write Test">
              <CheckSquare size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Write Test</span>}
            </NavLink>
            <NavLink to="/app/my-certificates" className={navItemClass} title="My Certificates">
              <GraduationCap size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">My Certificates</span>}
            </NavLink>
            <NavLink to="/app/verify-my-id" className={navItemClass} title="Verify My ID">
              <ShieldCheck size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Verify My ID</span>}
            </NavLink>
            <NavLink to="/app/class-schedule" className={navItemClass} title="Live Classes">
              <Video size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Live Classes</span>}
            </NavLink>
            <NavLink to="/app/demo-sessions" className={navItemClass} title="Demo Sessions">
              <Video size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Demo Sessions</span>}
            </NavLink>
            <NavLink to="/app/premium-status" className={navItemClass} title="Premium Membership">
              <Award size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Premium Membership</span>}
            </NavLink>
            <NavLink to="/app/offers" className={navItemClass} title="Discounts & Offers">
              <Gift size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Discounts & Offers</span>}
            </NavLink>
            <NavLink to="/app/resume-builder" className={navItemClass} title="Resume Builder">
              <FileText size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Resume Builder</span>}
            </NavLink>
            <NavLink to="/app/portfolio" className={navItemClass} title="Portfolio Generator">
              <Globe2 size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Portfolio</span>}
            </NavLink>
            <NavLink to="/app/career-support" className={() => exactNavItemClass('/app/career-support')} title="Career Support">
              <BarChart3 size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Career Support</span>}
            </NavLink>
            <NavLink to="/app/career-support#career-report" className={() => careerSubNavItemClass('/app/career-support#career-report')} title="Career Report PDF">
              <Download size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Career Report PDF</span>}
            </NavLink>
            <NavLink to="/app/career-support#career-tasks" className={() => careerSubNavItemClass('/app/career-support#career-tasks')} title="Career Tasks">
              <ListChecks size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Career Tasks</span>}
            </NavLink>
            <NavLink to="/app/career-support#interview-practice" className={() => careerSubNavItemClass('/app/career-support#interview-practice')} title="Interview Practice">
              <MessageSquare size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Interview Practice</span>}
            </NavLink>
            <NavLink to="/app/career-support#career-history" className={() => careerSubNavItemClass('/app/career-support#career-history')} title="Career History">
              <Clock size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Career History</span>}
            </NavLink>
            <NavLink to="/app/resume-reviews" className={navItemClass} title="Resume Reviews">
              <FileText size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Resume Reviews</span>}
            </NavLink>
            <NavLink to="/app/mock-interviews" className={navItemClass} title="Mock Interviews">
              <MessageSquare size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Mock Interviews</span>}
            </NavLink>
            <NavLink to="/app/personal-roadmap" className={navItemClass} title="Personal Roadmap">
              <Sparkles size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Personal Roadmap</span>}
            </NavLink>
            {premiumPlusActive && (
              <>
                <NavLink to="/app/coding-playground" className={navItemClass} title="Coding Playground">
                  <Code2 size={28} />
                  {shouldShowText && <span className="truncate text-sm font-medium">Coding Playground</span>}
                </NavLink>
                <NavLink to="/app/discussion-forum" className={navItemClass} title="Discussion Forum">
                  <MessageSquare size={28} />
                  {shouldShowText && <span className="truncate text-sm font-medium">Discussion Forum</span>}
                </NavLink>
              </>
            )}
            <NavLink to="/app/attendance" className={navItemClass} title="Attendance">
              <ClipboardList size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Attendance</span>}
            </NavLink>
            <NavLink to="/app/chat" className={navItemClass} title="Ask a Doubt">
              <MessageCircle size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Ask a Doubt</span>}
              {unreadChats > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadChats > 9 ? '9+' : unreadChats}
                </span>
              )}
            </NavLink>
            <NavLink to="/app/request-teacher" className={navItemClass} title="Request Teacher">
              <UserPlus size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Request Teacher</span>}
            </NavLink>
            <NavLink to="/app/report-issue" className={navItemClass} title="Report Issue">
              <Wrench size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Report Issue</span>}
            </NavLink>
          </>
        )}

        {/* Teacher Specific */}
        {role === 'teacher' && (
          <>
            <NavLink to="/app/teacher/performance" className={navItemClass} title="Teacher Performance">
              <BarChart3 size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Performance</span>}
            </NavLink>
            <NavLink to="/app/teacher/at-risk-students" className={navItemClass} title="At Risk Students">
              <ShieldAlert size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">At Risk Students</span>}
            </NavLink>
            <NavLink to="/app/all-in-one" className={navItemClass} title="All In One">
              <MonitorUp size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">All In One</span>}
            </NavLink>
            <NavLink to="/app/live-exams" className={navItemClass} title="Live Exams">
              <ShieldCheck size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Live Exams</span>}
            </NavLink>
            <NavLink to="/app/teacher/tests" className={navItemClass} title="Conduct Tests">
              <CheckSquare size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Conduct Tests</span>}
            </NavLink>
            <NavLink to="/app/teacher/career-queue" className={navItemClass} title="Career Queue">
              <BarChart3 size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Career Queue</span>}
            </NavLink>
            <NavLink to="/app/resume-reviews" className={navItemClass} title="Resume Reviews">
              <FileText size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Resume Reviews</span>}
            </NavLink>
            <NavLink to="/app/mock-interviews" className={navItemClass} title="Mock Interviews">
              <MessageSquare size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Mock Interviews</span>}
            </NavLink>
            <NavLink to="/app/personal-roadmap" className={navItemClass} title="Personal Roadmap">
              <Sparkles size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Personal Roadmap</span>}
            </NavLink>
            <NavLink to="/app/clear-doubts" className={navItemClass} title="Clear Doubts">
              <MessageCircle size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Clear Doubts</span>}
              {unreadChats > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadChats > 9 ? '9+' : unreadChats}
                </span>
              )}
            </NavLink>
            <NavLink to="/app/attendance" className={navItemClass} title="Attendance">
              <CheckSquare size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Attendance</span>}
            </NavLink>
            <NavLink to="/app/my-students" className={navItemClass} title="My Students">
              <Users size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">My Students</span>}
            </NavLink>
            <NavLink to="/app/assigned-classes" className={navItemClass} title="Assigned Classes">
              <Video size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Assigned Classes</span>}
            </NavLink>
            <NavLink to="/app/class-feedback" className={navItemClass} title="Class Feedback">
              <MessageSquare size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Class Feedback</span>}
            </NavLink>
            <NavLink to="/app/class-schedule" className={navItemClass} title="Schedule Sessions">
              <Calendar size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Schedule Sessions</span>}
            </NavLink>
            <NavLink to="/app/demo-sessions" className={navItemClass} title="Demo Sessions">
              <Video size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Demo Sessions</span>}
            </NavLink>
            <NavLink to="/app/leaves" className={navItemClass} title="Apply Leave">
              <Calendar size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Apply Leave</span>}
            </NavLink>
            <NavLink to="/app/session-reassignments" className={navItemClass} title="Session Reassignments">
              <Users size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Session Reassignments</span>}
            </NavLink>
            <NavLink to="/app/teacher-requests" className={navItemClass} title="Student Requests">
              <UserPlus size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Student Requests</span>}
              {newTeacherRequests > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {newTeacherRequests > 9 ? '9+' : newTeacherRequests}
                </span>
              )}
            </NavLink>
            <NavLink to="/app/report-issue" className={navItemClass} title="Report Issue">
              <Wrench size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Report Issue</span>}
            </NavLink>
          </>
        )}

        {/* Admin Specific */}
        {role === 'admin' && (
          <>
            <NavLink to="/app/admin/at-risk-students" className={navItemClass} title="At Risk Students">
              <ShieldAlert size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">At Risk Students</span>}
            </NavLink>
            <NavLink to="/app/admin/security-review" className={navItemClass} title="Security Review">
              <ShieldCheck size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Security Review</span>}
            </NavLink>
            <NavLink to="/app/admin/online" className={navItemClass} title="Online">
              <Wifi size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Online</span>}
            </NavLink>
            <NavLink to="/app/all-in-one" className={navItemClass} title="All In One">
              <MonitorUp size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">All In One</span>}
            </NavLink>
            <NavLink to="/app/live-exams" className={navItemClass} title="Live Exams">
              <ShieldCheck size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Live Exams</span>}
            </NavLink>
            <NavLink to="/app/live-exam-slots" className={navItemClass} title="Live Exam Slots">
              <Calendar size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Exam Slots</span>}
            </NavLink>
            <NavLink to="/app/live-monitoring" className={navItemClass} title="Live Monitoring">
              <Video size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Live Monitoring</span>}
            </NavLink>
            <NavLink to="/app/live-attendance" className={navItemClass} title="Live Attendance">
              <ClipboardList size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Exam Attendance</span>}
            </NavLink>
            <NavLink to="/app/faculty-attendance" className={navItemClass} title="Faculty Attendance">
              <Users size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Faculty Att</span>}
            </NavLink>
            <NavLink to="/app/live-alerts" className={navItemClass} title="Live Alerts">
              <Bell size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Violation Alerts</span>}
            </NavLink>
            <NavLink to="/app/live-messages" className={navItemClass} title="Exam Messages">
              <MessageSquare size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Exam Messages</span>}
            </NavLink>
            <NavLink to="/app/admin/logic-building-setup" className={navItemClass} title="Logic Building Setup">
              <Sparkles size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Logic Building Setup</span>}
            </NavLink>
            <NavLink to="/app/admin/change-course" className={navItemClass} title="Change Course">
              <BookOpen size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Change Course</span>}
            </NavLink>
            {role === 'admin' && (
              <>
                <NavLink to="/app/admin/send-gift" className={navItemClass} title="Send Gift">
                  <Gift size={28} />
                  {shouldShowText && <span className="truncate text-sm font-medium">Send Gift</span>}
                </NavLink>
                <NavLink to="/app/admin/active-coupons" className={navItemClass} title="Active Coupons">
                  <Gift size={28} />
                  {shouldShowText && <span className="truncate text-sm font-medium">Active Coupons</span>}
                </NavLink>
              </>
            )}
            <NavLink to="/app/admin/user-management" className={navItemClass} title="User Management">
              <Users size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">User Management</span>}
              {newUserRegistrations > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {newUserRegistrations > 9 ? '9+' : newUserRegistrations}
                </span>
              )}
            </NavLink>
            <NavLink to="/app/admin/usernames" className={navItemClass} title="Usernames">
              <User size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Usernames</span>}
            </NavLink>
            <NavLink to="/app/admin/certificate-blocks" className={navItemClass} title="Certificate Blocks">
              <Award size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Certificate Blocks</span>}
            </NavLink>
            <NavLink to="/app/admin/prize-certificates" className={navItemClass} title="Prizes & Certificates">
              <FileBadge size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Prizes & Certificates</span>}
            </NavLink>
            <NavLink to="/app/admin/user-ids" className={navItemClass} title="User IDs">
              <User size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">User IDs</span>}
            </NavLink>
            <NavLink to="/app/admin/teacher-progress" className={navItemClass} title="Teacher Progress">
              <Sparkles size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Teacher Progress</span>}
            </NavLink>
            <NavLink to="/app/admin/student-progress" className={navItemClass} title="Student Progress">
              <GraduationCap size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Student Progress</span>}
            </NavLink>
            <NavLink to="/app/admin/career-analytics" className={navItemClass} title="Career Analytics">
              <BarChart3 size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Career Analytics</span>}
            </NavLink>
            <NavLink to="/app/admin/career-queue" className={navItemClass} title="Career Queue">
              <ListChecks size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Career Queue</span>}
            </NavLink>
            <NavLink to="/app/resume-reviews" className={navItemClass} title="Resume Reviews">
              <FileText size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Resume Reviews</span>}
            </NavLink>
            <NavLink to="/app/mock-interviews" className={navItemClass} title="Mock Interviews">
              <MessageSquare size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Mock Interviews</span>}
            </NavLink>
            <NavLink to="/app/personal-roadmap" className={navItemClass} title="Personal Roadmap">
              <Sparkles size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Personal Roadmap</span>}
            </NavLink>
            <NavLink to="/app/class-schedule" className={navItemClass} title="Schedule Live Classes">
              <Video size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Schedule Live Classes</span>}
            </NavLink>
            <NavLink to="/app/class-feedback" className={navItemClass} title="Class Feedback">
              <MessageSquare size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Class Feedback</span>}
            </NavLink>
            <NavLink to="/app/attendance" className={navItemClass} title="Attendance">
              <CheckSquare size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Attendance</span>}
            </NavLink>
            <NavLink to="/app/admin/manage-premium" className={navItemClass} title="Manage Premium">
              <Award size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Manage Premium</span>}
            </NavLink>
            <NavLink to="/app/admin/plans" className={navItemClass} title="Plan Management">
              <CreditCard size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Plan Management</span>}
            </NavLink>
            <NavLink to="/app/admin/notes-library" className={navItemClass} title="Notes Library Admin">
              <FileText size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Notes Library</span>}
            </NavLink>
            <NavLink to="/app/admin/id-verifications" className={navItemClass} title="ID Verifications">
              <ShieldCheck size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">ID Verifications</span>}
            </NavLink>
            <NavLink to="/app/admin/certificate-name-requests" className={navItemClass} title="Certificate Name Requests">
              <FileBadge size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Name Requests</span>}
            </NavLink>
            <NavLink to="/app/admin/teacher-assignment" className={navItemClass} title="Assign Teachers">
              <UserPlus size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Assign Teachers</span>}
            </NavLink>
            <NavLink to="/app/admin/student-reassignments" className={navItemClass} title="Student Reassignments">
              <Users size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Student Reassign</span>}
            </NavLink>
            <NavLink to="/app/admin/auto-assigned-students" className={navItemClass} title="Auto Assigned Students">
              <Users size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Auto Assigned</span>}
            </NavLink>
            <NavLink to="/app/admin/teacher-requests" className={navItemClass} title="Teacher Requests">
              <Users size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Teacher Requests</span>}
              {newTeacherRequests > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {newTeacherRequests > 9 ? '9+' : newTeacherRequests}
                </span>
              )}
            </NavLink>
            <NavLink to="/app/leaves" className={navItemClass} title="Teacher Leaves">
              <Calendar size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Teacher Leaves</span>}
              {newLeaveRequests > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {newLeaveRequests > 9 ? '9+' : newLeaveRequests}
                </span>
              )}
            </NavLink>
            <NavLink to="/app/admin/user-access" className={navItemClass} title="User Access">
              <ShieldCheck size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">User Access</span>}
            </NavLink>
            <NavLink to="/app/admin/accounts" className={navItemClass} title="Account Management">
              <Lock size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Account Management</span>}
            </NavLink>
            <NavLink to="/app/admin/access-codes" className={navItemClass} title="Rotating Access Codes">
              <KeyRound size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Access Codes</span>}
            </NavLink>
            <NavLink to="/app/admin/notifications" className={navItemClass} title="Post Notifications">
              <Bell size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Post Notifications</span>}
            </NavLink>
            <NavLink to="/app/admin/multi-session-alerts" className={navItemClass} title="Multi Session Alerts">
              <ShieldAlert size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Multi Session Alerts</span>}
              {newMultiSessionAlerts > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {newMultiSessionAlerts > 9 ? '9+' : newMultiSessionAlerts}
                </span>
              )}
            </NavLink>
            <NavLink to="/app/admin/courses" className={navItemClass} title="Courses">
              <BookOpen size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Courses</span>}
            </NavLink>
            <NavLink to="/app/admin/exam-overrides" className={navItemClass} title="Exam Retake Overrides">
              <Clock size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Exam Retake Overrides</span>}
            </NavLink>
            <NavLink to="/app/admin/exam-bans" className={navItemClass} title="Exam Bans">
              <ShieldAlert size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Exam Bans</span>}
            </NavLink>
            <NavLink to="/app/admin/choose-meet" className={navItemClass} title="Choose Meet">
              <Video size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Choose Meet</span>}
            </NavLink>
            <NavLink to="/app/admin/demo-sessions" className={navItemClass} title="Demo Sessions">
              <Video size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Demo Sessions</span>}
            </NavLink>
            <NavLink to="/app/admin/allow-failed-to-book-slot" className={navItemClass} title="Allow Failed To Book Slot">
              <KeyRound size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Allow Failed Slot</span>}
            </NavLink>
            <NavLink to="/app/live-cancellations" className={navItemClass} title="Live Slot Cancellations">
              <Trash2 size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Live Slot Cancellations</span>}
            </NavLink>
            <NavLink to="/app/admin/exam-retakes" className={navItemClass} title="Release Terminated Exams">
              <Unlock size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Release Exams</span>}
            </NavLink>
            <NavLink to="/app/admin/exam-settings" className={navItemClass} title="Exam Settings">
              <CheckSquare size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Exam Settings</span>}
            </NavLink>
            <NavLink to="/app/admin/settings" className={navItemClass} title="Admin Settings">
              <Settings size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Admin Settings</span>}
            </NavLink>
            <NavLink to="/app/admin/website-protection" className={navItemClass} title="Website Protection">
              <ShieldCheck size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Website Protection</span>}
            </NavLink>
            <NavLink to="/app/admin/support-contact" className={navItemClass} title="Support Contact">
              <Mail size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Support Contact</span>}
            </NavLink>
            <NavLink to="/app/admin/activity-logs" className={navItemClass} title="Activity Logs">
              <ClipboardList size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Activity Logs</span>}
            </NavLink>
            <NavLink to="/app/admin/lead-inbox" className={navItemClass} title="Lead Inbox">
              <Mail size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Lead Inbox</span>}
            </NavLink>
            <NavLink to="/app/admin/payment-attempts" className={navItemClass} title="Payment Attempts">
              <CreditCard size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Payment Attempts</span>}
            </NavLink>
            <NavLink to="/app/admin/growth-analytics" className={navItemClass} title="Growth Analytics">
              <BarChart3 size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Growth Analytics</span>}
            </NavLink>
            <NavLink to="/app/admin/issue-reports" className={navItemClass} title="Issue Reports">
              <Wrench size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Issue Reports</span>}
            </NavLink>
            <NavLink to="/app/admin/reset-password" className={navItemClass} title="Reset Password">
              <Lock size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Reset Password</span>}
            </NavLink>
            <NavLink to="/app/admin/mfa-management" className={navItemClass} title="MFA Management">
              <ShieldCheck size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">MFA Management</span>}
            </NavLink>
            <NavLink to="/app/admin/login-otp" className={navItemClass} title="Login OTP">
              <KeyRound size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Login OTP</span>}
            </NavLink>
            <NavLink to="/app/admin/mfa-rules" className={navItemClass} title="MFA Rules">
              <ShieldCheck size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">MFA Rules</span>}
            </NavLink>
            <NavLink to="/app/admin/deleted-accounts" className={navItemClass} title="Deleted Accounts">
              <Trash2 size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Deleted Accounts</span>}
            </NavLink>
            <NavLink to="/app/admin/startup-ideas" className={navItemClass} title="Startup Ideas">
              <Briefcase size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Startup Ideas</span>}
              {newStartupIdeas > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {newStartupIdeas > 9 ? '9+' : newStartupIdeas}
                </span>
              )}
            </NavLink>
            <NavLink to="/app/admin/startup-collaborations" className={navItemClass} title="Startup Collaborations">
              <Users size={28} />
              {shouldShowText && <span className="truncate text-sm font-medium">Startup Collabs</span>}
            </NavLink>
            {/* Send Gift - Admin only (single entry) */}
          </>
        )}

        {role !== 'instructor' ? (
          <NavLink to="/app/settings" className={navItemClass} title="Settings">
            <Settings size={28} />
            {shouldShowText && <span className="truncate text-sm font-medium">Settings</span>}
          </NavLink>
        ) : null}

        <div className="pt-8 mt-8 border-t border-white/10 flex-shrink-0">
          <button onClick={signOut} className={`flex min-h-[56px] items-center ${isCollapsed && !isHovered ? 'justify-center px-2' : 'gap-3 px-4'} text-red-400 hover:text-red-300 w-full rounded-xl transition-all duration-300 whitespace-nowrap [&>svg]:h-7 [&>svg]:w-7 [&>svg]:shrink-0 hover:bg-white/5`} title="Sign Out">
            <LogOut size={28} />
            {shouldShowText && <span className="truncate text-sm font-medium">Sign Out</span>}
          </button>
        </div>
      </nav>
    </aside>
    </>
  );
};

export default Sidebar;

