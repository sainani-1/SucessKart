import AdminExamSettings from './pages/AdminExamSettings';
import AdminContestSetup from './logicBuilding/AdminContestSetup';
import LogicBuildingContest from './logicBuilding/LogicBuildingContest';
import AdminChangeCourse from './pages/AdminChangeCourse';
import AdminScoreboard from './logicBuilding/AdminScoreboard';
import LogicBuildingLeaderboard from './logicBuilding/LogicBuildingLeaderboard';
import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';
import RequireAdminMFA from './components/RequireAdminMFA';
import RequireSensitiveAdminMFA from './components/RequireSensitiveAdminMFA';
import RequireConfiguredSensitiveAdminMFA from './components/RequireConfiguredSensitiveAdminMFA';
import { supabase } from './supabaseClient';
import AdminMFASetup from "./pages/AdminMFASetup";
import AdminMFAVerify from "./pages/AdminMFAVerify";
import AdminAuthChoice from "./pages/AdminAuthChoice";
// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import Home from './pages/Home';
import About from './pages/About';
import Plans from './pages/Plans';
import Dashboard from './pages/Dashboard';
import CourseList from './pages/CourseList';
import CourseDetail from './pages/CourseDetail';
import Exam from './pages/Exam';
import TestExam from './pages/TestExam';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import VerifyCertificate from './pages/VerifyCertificate';
import RegisterAdmin from './pages/RegisterAdmin';
import RegisterTeacher from './pages/RegisterTeacher';
import CareerGuidance from './pages/CareerGuidance';
import MyCertificates from './pages/MyCertificates';
import MyRegisteredExams from './pages/MyRegisteredExams';
import AdminDashboard from './pages/AdminDashboard';
import AdminSettings from './pages/AdminSettings';
import AdminCourses from './pages/AdminCourses';
import StudentProgress from './pages/StudentProgress';
import StudentDetail from './pages/StudentDetail';
import ManagePremium from './pages/ManagePremium';
import TeacherAssignment from './pages/TeacherAssignment';
import GuidanceSessions from './pages/GuidanceSessions';
import TeacherLeaves from './pages/TeacherLeaves';
import ChatWithTeacher from './pages/ChatWithTeacher';
import Attendance from './pages/Attendance';
import MyStudents from './pages/MyStudents';
import AssignedClasses from './pages/AssignedClasses';
import Payment from './pages/Payment';
import ClassSchedule from './pages/ClassSchedule';
import AccountManagement from './pages/AccountManagement';
import TeacherChat from './pages/TeacherChat';
import LiveClass from './pages/LiveClass';
import Notifications from './pages/Notifications';
import AdminNotifications from './pages/AdminNotifications';
import SessionReassignments from './pages/SessionReassignments';
import CareerChatbot from './pages/CareerChatbot';
import AILearningPath from './pages/AILearningPath';
import AdminExamOverrides from './pages/AdminExamOverrides';
import InterviewPrep from './pages/InterviewPrep';
import PremiumStatus from './pages/PremiumStatus';
import NotesLibrary from './pages/NotesLibrary';
import Offers from './pages/Offers';
import AdminExamRetakes from './pages/AdminExamRetakes';
import AdminActiveCoupons from './pages/AdminActiveCoupons';
import UserManagementPage from './pages/UserManagementPage';
import TeacherProgress from './pages/TeacherProgress';
import TeacherConductTests from './pages/TeacherConductTests';
import ClearDoubts from './pages/ClearDoubts';
import AdminUserIds from './pages/AdminUserIds';
import NotFound from './pages/NotFound';
import AdminSendGift from './pages/AdminSendGift';
import RequestTeacher from './pages/RequestTeacher';
import TeacherRequests from './pages/TeacherRequests';
import AdminTeacherRequests from './pages/AdminTeacherRequests';
import CertificateBlocks from './pages/CertificateBlocks';
import AdminResetPassword from './pages/AdminResetPassword';
import AdminUserPasswordResetPage from './pages/AdminUserPasswordResetPage';
import StartupIdeas from './pages/StartupIdeas';
import AdminStartupIdeas from './pages/AdminStartupIdeas';
import StartupCollaborations from './pages/StartupCollaborations';
import AdminStartupCollaborations from './pages/AdminStartupCollaborations';
import AdminPrizeCertificates from './pages/AdminPrizeCertificates';
import AdminStudentReassignments from './pages/AdminStudentReassignments';
import AdminMFAManagement from './pages/AdminMFAManagement';
import CertificatePreview from './pages/CertificatePreview';
import AdminDeletedAccounts from './pages/AdminDeletedAccounts';
import TermsAndConditions from './pages/TermsAndConditions';
import CompleteGoogleProfile from './pages/CompleteGoogleProfile';
import AdminSupportContact from './pages/AdminSupportContact';
import AdminActivityLogs from './pages/AdminActivityLogs';
import AdminOnline from './pages/AdminOnline';
import StudentWriteTest from './pages/StudentWriteTest';
import ResumeBuilder from './pages/ResumeBuilder';
import ReportIssue from './pages/ReportIssue';
import AdminIssueReports from './pages/AdminIssueReports';
import AdminExamBans from './pages/AdminExamBans';
import AdminGrowthAnalytics from './pages/AdminGrowthAnalytics';
import AdminLeadInbox from './pages/AdminLeadInbox';
import AdminPaymentAttempts from './pages/AdminPaymentAttempts';
import CodingPlayground from './pages/CodingPlayground';
import DiscussionForum from './pages/DiscussionForum';
import SkillBadges from './pages/SkillBadges';
import AdminWebsiteProtection from './pages/AdminWebsiteProtection';
import UniversalAssistant from './pages/UniversalAssistant';
import AdminUserAccess from './pages/AdminUserAccess';
import LiveExamProctoring from './pages/LiveExamProctoring';
import FacultyAttendance from './pages/FacultyAttendance';
import AdminAccessCodes from './pages/AdminAccessCodes';
import AdminLiveExamBookingControls from './pages/AdminLiveExamBookingControls';
import AdminChooseMeet from './pages/AdminChooseMeet';
import AdminDemoSessions from './pages/AdminDemoSessions';
import ClassFeedback from './pages/ClassFeedback';
import AdminAutoAssignedStudents from './pages/AdminAutoAssignedStudents';
import AdminMFARules from './pages/AdminMFARules';
import AdminMultiSessionAlerts from './pages/AdminMultiSessionAlerts';
import AdminNotesLibrary from './pages/AdminNotesLibrary';
import StudentIdVerification from './pages/StudentIdVerification';
import AdminIdVerifications from './pages/AdminIdVerifications';
import AdminCertificateNameRequests from './pages/AdminCertificateNameRequests';
import VerifierDashboard from './pages/VerifierDashboard';
import AdminUsernames from './pages/AdminUsernames';
import PremiumPlusResumeReviews from './pages/PremiumPlusResumeReviews';
import PremiumPlusMockInterviews from './pages/PremiumPlusMockInterviews';
import PremiumPlusRoadmap from './pages/PremiumPlusRoadmap';
import CareerSupportDashboard from './pages/CareerSupportDashboard';
import TeacherCareerQueue from './pages/TeacherCareerQueue';
import AdminCareerAnalytics from './pages/AdminCareerAnalytics';
import PortfolioBuilder from './pages/PortfolioBuilder';
import PublicPortfolio from './pages/PublicPortfolio';
import AdminLoginOtpSettings from './pages/AdminLoginOtpSettings';
import {
  AchievementTimeline,
  AdminAtRiskStudents,
  AdminSecurityReview,
  CourseCompletionChecklist,
  CourseDoubtHelper,
  ExamReadinessScore,
  MotivationLeaderboard,
  StudentDailyPlanner,
  TeacherPerformancePanel,
} from './pages/ZeroCostGrowthPanels';

const ProtectedRoute = ({ children }) => {
  const { user, profile, realProfile, isImpersonating, loading } = useAuth();
  const [supportContactEmail, setSupportContactEmail] = useState('');

  const handleBlockedAccountLogout = async () => {
    await supabase.auth.signOut();
  };

  useEffect(() => {
    let mounted = true;
    const loadSupportEmail = async () => {
      try {
        const { data } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'support_contact_email')
          .maybeSingle();
        if (mounted) setSupportContactEmail(data?.value || '');
      } catch {
        if (mounted) setSupportContactEmail('');
      }
    };
    if (realProfile?.is_disabled || realProfile?.is_locked) {
      loadSupportEmail();
    }
    return () => {
      mounted = false;
    };
  }, [realProfile?.is_disabled, realProfile?.is_locked]);

  if (loading) return <LoadingSpinner message="Initializing your account..." />;
  if (!user) return <Navigate to="/login" />;
  const isGoogleAuth = user?.app_metadata?.provider === 'google' || profile?.auth_provider === 'google';
  const googleProfileIncomplete =
    isGoogleAuth && (!profile?.google_profile_completed || !profile?.terms_accepted);
  if (googleProfileIncomplete) return <Navigate to="/complete-profile" />;

  // Check if user is disabled
  if (realProfile?.is_disabled && !isImpersonating) {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-red-950 text-white p-6 flex items-center justify-center relative overflow-hidden">
        <img
          src="/skillpro-logo.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 m-auto w-72 h-72 object-contain opacity-15 mix-blend-multiply pointer-events-none select-none"
        />
        <div className="max-w-xl w-full rounded-2xl border border-red-300/30 bg-white/5 backdrop-blur-sm shadow-2xl p-8 text-center space-y-4 relative z-10">
          <h1 className="text-3xl font-bold text-red-300">Account Disabled</h1>
          <p className="text-red-100">
            {realProfile?.disabled_reason
              ? `Reason: ${realProfile.disabled_reason}`
              : 'Your account has been disabled by the SkillPro team due to suspicious activity.'}
          </p>
          <div className="rounded-xl bg-red-500/10 border border-red-300/30 p-4">
            <p className="text-sm text-red-100">Please contact the SkillPro team for reactivation.</p>
            {supportContactEmail ? (
              <a className="inline-block mt-2 text-sm font-semibold underline text-red-200" href={`mailto:${supportContactEmail}`}>
                {supportContactEmail}
              </a>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleBlockedAccountLogout}
            className="inline-flex items-center justify-center rounded-xl border border-red-200/40 bg-white/10 px-5 py-3 font-semibold text-white transition hover:bg-white/20"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  // Check if user is locked
  if (realProfile?.is_locked && !isImpersonating) {
    const lockedUntil = realProfile?.locked_until ? new Date(realProfile.locked_until) : null;
    const hasActiveLock = !lockedUntil || lockedUntil > new Date();
    if (hasActiveLock) {
      return (
        <div className="h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-red-950 text-white p-6 flex items-center justify-center relative overflow-hidden">
          <img
            src="/skillpro-logo.png"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 m-auto w-72 h-72 object-contain opacity-15 mix-blend-multiply pointer-events-none select-none"
          />
          <div className="max-w-xl w-full rounded-2xl border border-red-300/30 bg-white/5 backdrop-blur-sm shadow-2xl p-8 text-center space-y-4 relative z-10">
            <h1 className="text-3xl font-bold text-red-300">Account Locked</h1>
            <p className="text-red-100">{realProfile?.lock_reason || 'Your account has been locked due to suspicious activity detected during an exam.'}</p>
            <div className="rounded-xl bg-red-500/10 border border-red-300/30 p-4 text-sm text-red-100">
              {lockedUntil ? (
                <p>Lock expires on: {lockedUntil.toLocaleDateString('en-IN')}</p>
              ) : (
                <p>Your account is locked until the SkillPro team reviews it.</p>
              )}
              {supportContactEmail ? (
                <p className="mt-2">Need help? Contact <a className="font-semibold underline text-red-200" href={`mailto:${supportContactEmail}`}>{supportContactEmail}</a>.</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleBlockedAccountLogout}
              className="inline-flex items-center justify-center rounded-xl border border-red-200/40 bg-white/10 px-5 py-3 font-semibold text-white transition hover:bg-white/20"
            >
              Logout
            </button>
          </div>
        </div>
      );
    }
  }

  return children;
};

const AdminRoute = ({ children }) => {

  const { realProfile, loading } = useAuth();

  if (loading)
    return <LoadingSpinner message="Loading dashboard..." />;

  if (realProfile?.role !== "admin")
    return <Navigate to="/app" />;

  return <RequireAdminMFA>{children}</RequireAdminMFA>;
};

const TeacherRoute = ({ children }) => {
  const { profile, loading } = useAuth();

  if (loading) return <LoadingSpinner message="Loading dashboard..." />;
  if (!profile || profile.role !== "teacher")
    return <Navigate to="/app" />;

  return children;
};

const InstructorRoute = ({ children }) => {
  const { profile, loading } = useAuth();

  if (loading) return <LoadingSpinner message="Loading dashboard..." />;
  if (!profile || profile.role !== "instructor")
    return <Navigate to="/app" />;

  return children;
};

const VerifierRoute = ({ children }) => {
  const { profile, loading } = useAuth();

  if (loading) return <LoadingSpinner message="Loading verifier panel..." />;
  if (!profile || profile.role !== "verifier") return <Navigate to="/app" />;

  return children;
};

const StaffAllInOneRoute = ({ children }) => {
  const { realProfile, profile, loading } = useAuth();
  const activeRole = realProfile?.role || profile?.role;

  if (loading) return <LoadingSpinner message="Loading live monitoring..." />;
  if (!['admin', 'teacher', 'instructor'].includes(activeRole)) {
    return <Navigate to="/app" />;
  }

  return activeRole === 'admin' ? <RequireAdminMFA>{children}</RequireAdminMFA> : children;
};

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
        <Route path="/complete-profile" element={<CompleteGoogleProfile />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/reset-password-confirm" element={<ResetPassword />} />
        <Route path="/register-admin" element={<RegisterAdmin />} />
        <Route path="/register-teacher" element={<RegisterTeacher />} />
        <Route path="/admin-auth-choice" element={<AdminAuthChoice />} />
        <Route path="/verify/:id" element={<VerifyCertificate />} />
        <Route path="/verify" element={<VerifyCertificate />} />
        <Route path="/certificate-preview/:id" element={<CertificatePreview />} />
        <Route path="/view-portfolio/:username" element={<PublicPortfolio />} />
        <Route path="/view-portifolio/:username" element={<PublicPortfolio />} />
        <Route
          path="/admin-reset-pass"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <RequireSensitiveAdminMFA>
                  <AdminUserPasswordResetPage />
                </RequireSensitiveAdminMFA>
              </AdminRoute>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />

        {/* Protected Routes */}
        <Route path="/app" element={<ProtectedRoute><RequireAdminMFA><RequireConfiguredSensitiveAdminMFA><Layout /></RequireConfiguredSensitiveAdminMFA></RequireAdminMFA></ProtectedRoute>}>
                              <Route path="admin/logic-building-setup" element={<AdminRoute><AdminContestSetup /></AdminRoute>} />
                    <Route path="logic-building-contest" element={<LogicBuildingContest />} />
                    <Route path="logic-building-leaderboard" element={<LogicBuildingLeaderboard />} />
          <Route path="admin/exam-settings" element={<AdminRoute><AdminExamSettings /></AdminRoute>} />
          <Route index element={<Dashboard />} />
          <Route path="courses" element={<CourseList />} />
          <Route path="daily-planner" element={<StudentDailyPlanner />} />
          <Route path="course-checklist" element={<CourseCompletionChecklist />} />
          <Route path="exam-readiness" element={<ExamReadinessScore />} />
          <Route path="achievement-timeline" element={<AchievementTimeline />} />
          <Route path="course-doubt-helper" element={<CourseDoubtHelper />} />
          <Route path="leaderboard" element={<MotivationLeaderboard />} />
          <Route path="notes-library" element={<NotesLibrary />} />
          <Route path="all-in-one" element={<StaffAllInOneRoute><LiveExamProctoring forcedPanel="all-in-one" /></StaffAllInOneRoute>} />
          <Route path="write-test" element={<StudentWriteTest />} />
          <Route path="course/:courseId" element={<CourseDetail />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="payment" element={<Payment />} />
          <Route path="guidance" element={<CareerGuidance />} />
          <Route path="guidance-sessions" element={<GuidanceSessions />} />
          <Route path="clear-doubts" element={<ClearDoubts />} />
          <Route path="my-certificates" element={<MyCertificates />} />
          <Route path="verify" element={<VerifyCertificate />} />
          <Route path="chat" element={<ChatWithTeacher />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="my-students" element={<MyStudents />} />
          <Route path="assigned-classes" element={<AssignedClasses />} />
          <Route path="class-schedule" element={<ClassSchedule />} />
          <Route path="demo-sessions" element={<AdminDemoSessions />} />
          <Route path="class-feedback" element={<ClassFeedback />} />
          <Route path="assistant" element={<UniversalAssistant />} />
          <Route path="live-exams" element={<LiveExamProctoring />} />
          <Route path="my-exams" element={<MyRegisteredExams />} />
          <Route path="live-exam-slots" element={<LiveExamProctoring forcedPanel="slots" />} />
          <Route path="live-monitoring" element={<LiveExamProctoring forcedPanel="monitoring" />} />
          <Route path="live-attendance" element={<LiveExamProctoring forcedPanel="attendance" />} />
          <Route path="live-alerts" element={<LiveExamProctoring forcedPanel="alerts" />} />
          <Route path="live-messages" element={<LiveExamProctoring forcedPanel="messages" />} />
          <Route path="live-cancellations" element={<AdminRoute><LiveExamProctoring forcedPanel="cancellations" /></AdminRoute>} />
          <Route path="faculty-attendance" element={<AdminRoute><FacultyAttendance /></AdminRoute>} />
          <Route path="career-chatbot" element={<CareerChatbot />} />
          <Route path="learning-path" element={<AILearningPath />} />
          <Route path="interview-prep" element={<InterviewPrep />} />
          <Route path="premium-status" element={<PremiumStatus />} />
          <Route path="verify-my-id" element={<StudentIdVerification />} />
          <Route path="verify-id" element={<StudentIdVerification />} />
          <Route path="verifymyid" element={<StudentIdVerification />} />
          <Route path="offers" element={<Offers />} />
          <Route path="coding-playground" element={<CodingPlayground />} />
          <Route path="discussion-forum" element={<DiscussionForum />} />
          <Route path="skill-badges" element={<SkillBadges />} />
          <Route path="resume-builder" element={<ResumeBuilder />} />
          <Route path="portfolio" element={<PortfolioBuilder />} />
          <Route path="career-support" element={<CareerSupportDashboard />} />
          <Route path="teacher/career-queue" element={<TeacherRoute><TeacherCareerQueue /></TeacherRoute>} />
          <Route path="teacher/performance" element={<TeacherRoute><TeacherPerformancePanel /></TeacherRoute>} />
          <Route path="teacher/at-risk-students" element={<TeacherRoute><AdminAtRiskStudents teacherOnly /></TeacherRoute>} />
          <Route path="admin/career-queue" element={<AdminRoute><TeacherCareerQueue /></AdminRoute>} />
          <Route path="admin/career-analytics" element={<AdminRoute><AdminCareerAnalytics /></AdminRoute>} />
          <Route path="admin/at-risk-students" element={<AdminRoute><AdminAtRiskStudents /></AdminRoute>} />
          <Route path="admin/security-review" element={<AdminRoute><AdminSecurityReview /></AdminRoute>} />
          <Route path="resume-reviews" element={<PremiumPlusResumeReviews />} />
          <Route path="mock-interviews" element={<PremiumPlusMockInterviews />} />
          <Route path="personal-roadmap" element={<PremiumPlusRoadmap />} />
          <Route path="request-teacher" element={<RequestTeacher />} />
          <Route path="startup-ideas" element={<StartupIdeas />} />
          <Route path="startup-collaborations" element={<StartupCollaborations />} />
          <Route path="teacher-requests" element={<TeacherRequests />} />
          <Route path="mycertificates" element={<Navigate to="/app/my-certificates" replace />} />
          <Route path="leaves" element={<TeacherLeaves />} />
          <Route path="session-reassignments" element={<SessionReassignments />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="report-issue" element={<ReportIssue />} />
          <Route path="teacher-chat" element={<TeacherChat />} />
          <Route path="admin/users" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="admin/leaves" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="admin/user-management" element={<AdminRoute><UserManagementPage /></AdminRoute>} />
          <Route path="admin/username" element={<AdminRoute><AdminUsernames /></AdminRoute>} />
          <Route path="admin/usernames" element={<AdminRoute><AdminUsernames /></AdminRoute>} />
          <Route path="admin/user-ids" element={<AdminRoute><AdminUserIds /></AdminRoute>} />
          <Route path="admin/teacher-progress" element={<AdminRoute><TeacherProgress /></AdminRoute>} />
          <Route path="admin/courses" element={<AdminRoute><AdminCourses /></AdminRoute>} />
          <Route path="teacher/tests" element={<TeacherRoute><TeacherConductTests /></TeacherRoute>} />
          <Route path="instructor/live-exams" element={<InstructorRoute><LiveExamProctoring forcedPanel="slots" /></InstructorRoute>} />
          <Route path="instructor/all-in-one" element={<InstructorRoute><LiveExamProctoring forcedPanel="all-in-one" /></InstructorRoute>} />
          <Route path="instructor/live-exam-slots" element={<InstructorRoute><LiveExamProctoring forcedPanel="slots" /></InstructorRoute>} />
          <Route path="instructor/live-monitoring" element={<InstructorRoute><LiveExamProctoring forcedPanel="monitoring" /></InstructorRoute>} />
          <Route path="instructor/live-attendance" element={<InstructorRoute><LiveExamProctoring forcedPanel="attendance" /></InstructorRoute>} />
          <Route path="instructor/live-alerts" element={<InstructorRoute><LiveExamProctoring forcedPanel="alerts" /></InstructorRoute>} />
          <Route path="instructor/live-messages" element={<InstructorRoute><LiveExamProctoring forcedPanel="messages" /></InstructorRoute>} />
          <Route path="verifier" element={<VerifierRoute><VerifierDashboard /></VerifierRoute>} />
          <Route path="verifier/id-verifications" element={<VerifierRoute><AdminIdVerifications /></VerifierRoute>} />
          <Route path="admin/student-progress" element={<AdminRoute><StudentProgress /></AdminRoute>} />
          <Route path="admin/student/:studentId" element={<AdminRoute><StudentDetail /></AdminRoute>} />
          <Route path="admin/user-access" element={<AdminRoute><AdminUserAccess /></AdminRoute>} />
          <Route path="admin/user-access/:userId" element={<AdminRoute><AdminUserAccess /></AdminRoute>} />
          <Route path="admin/manage-premium" element={<AdminRoute><ManagePremium /></AdminRoute>} />
          <Route path="admin/plans" element={<AdminRoute><AdminSettings /></AdminRoute>} />
          <Route path="admin/notes-library" element={<AdminRoute><AdminNotesLibrary /></AdminRoute>} />
          <Route path="admin/id-verifications" element={<AdminRoute><AdminIdVerifications /></AdminRoute>} />
          <Route path="admin/certificate-name-requests" element={<AdminRoute><AdminCertificateNameRequests /></AdminRoute>} />
          <Route path="admin/teacher-assignment" element={<AdminRoute><TeacherAssignment /></AdminRoute>} />
          <Route path="admin/student-reassignments" element={<AdminRoute><AdminStudentReassignments /></AdminRoute>} />
          <Route path="admin/auto-assigned-students" element={<AdminRoute><AdminAutoAssignedStudents /></AdminRoute>} />
          <Route path="admin/teacher-requests" element={<AdminRoute><AdminTeacherRequests /></AdminRoute>} />
          <Route path="admin/certificate-blocks" element={<AdminRoute><CertificateBlocks /></AdminRoute>} />
          <Route path="admin/accounts" element={<AdminRoute><AccountManagement /></AdminRoute>} />
          <Route path="admin/access-codes" element={<AdminRoute><AdminAccessCodes /></AdminRoute>} />
          <Route path="admin/notifications" element={<AdminRoute><AdminNotifications /></AdminRoute>} />
          <Route path="admin/exam-overrides" element={<AdminRoute><AdminExamOverrides /></AdminRoute>} />
          <Route path="admin/exam-bans" element={<AdminRoute><AdminExamBans /></AdminRoute>} />
          <Route path="admin/live-exam-booking-controls" element={<AdminRoute><AdminLiveExamBookingControls /></AdminRoute>} />
          <Route path="admin/allow-failed-to-book-slot" element={<AdminRoute><AdminLiveExamBookingControls /></AdminRoute>} />
          <Route path="admin/choose-meet" element={<AdminRoute><AdminChooseMeet /></AdminRoute>} />
          <Route path="admin/demo-sessions" element={<AdminRoute><AdminDemoSessions /></AdminRoute>} />
          <Route path="admin/exam-retakes" element={<AdminRoute><AdminExamRetakes /></AdminRoute>} />
          <Route path="admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
          <Route path="admin/website-protection" element={<AdminRoute><AdminWebsiteProtection /></AdminRoute>} />
          <Route path="admin/support-contact" element={<AdminRoute><AdminSupportContact /></AdminRoute>} />
          <Route path="admin/activity-logs" element={<AdminRoute><AdminActivityLogs /></AdminRoute>} />
          <Route path="admin/online" element={<AdminRoute><AdminOnline /></AdminRoute>} />
          <Route path="admin/growth-analytics" element={<AdminRoute><AdminGrowthAnalytics /></AdminRoute>} />
          <Route path="admin/lead-inbox" element={<AdminRoute><AdminLeadInbox /></AdminRoute>} />
          <Route path="admin/payment-attempts" element={<AdminRoute><AdminPaymentAttempts /></AdminRoute>} />
          <Route path="admin/issue-reports" element={<AdminRoute><AdminIssueReports /></AdminRoute>} />
          <Route path="admin/reset-password" element={<AdminRoute><AdminResetPassword /></AdminRoute>} />
          <Route path="admin/mfa-management" element={<AdminRoute><AdminMFAManagement /></AdminRoute>} />
          <Route path="admin/login-otp" element={<AdminRoute><AdminLoginOtpSettings /></AdminRoute>} />
          <Route path="admin/mfa-rules" element={<AdminRoute><RequireSensitiveAdminMFA><AdminMFARules /></RequireSensitiveAdminMFA></AdminRoute>} />
          <Route path="admin/multi-session-alerts" element={<AdminRoute><AdminMultiSessionAlerts /></AdminRoute>} />
          <Route path="admin/deleted-accounts" element={<AdminRoute><AdminDeletedAccounts /></AdminRoute>} />
          <Route path="admin/startup-ideas" element={<AdminRoute><AdminStartupIdeas /></AdminRoute>} />
          <Route path="admin/startup-collaborations" element={<AdminRoute><AdminStartupCollaborations /></AdminRoute>} />
          <Route path="admin/prize-certificates" element={<AdminRoute><AdminPrizeCertificates /></AdminRoute>} />
          <Route path="admin/send-gift" element={<AdminRoute><AdminSendGift /></AdminRoute>} />
          <Route path="admin/active-coupons" element={<AdminRoute><AdminActiveCoupons /></AdminRoute>} />
          <Route path="admin/change-course" element={<AdminRoute><AdminChangeCourse /></AdminRoute>} />
          <Route path="admin/logic-building-admin-scoreboard" element={<AdminRoute><AdminScoreboard /></AdminRoute>} />
        </Route>

        {/* Exam is outside layout for fullscreen enforcement */}
        <Route path="/exam/:courseId" element={<ProtectedRoute><Exam /></ProtectedRoute>} />
        <Route path="/test-exam/:examId" element={<ProtectedRoute><TestExam /></ProtectedRoute>} />
        <Route path="/live-test/:examId" element={<ProtectedRoute><Exam examMode="live-proctored" /></ProtectedRoute>} />

        {/* Live Class is outside layout for fullscreen */}
        <Route path="/live-class/:sessionId" element={<ProtectedRoute><LiveClass /></ProtectedRoute>} />
        <Route path="/admin-mfa-setup" element={<AdminMFASetup />} />
        <Route path="/admin-mfa-verify" element={<AdminMFAVerify />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;


