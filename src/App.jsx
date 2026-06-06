import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';
import RequireAdminMFA from './components/RequireAdminMFA';
import RequireSensitiveAdminMFA from './components/RequireSensitiveAdminMFA';
import RequireConfiguredSensitiveAdminMFA from './components/RequireConfiguredSensitiveAdminMFA';
import { supabase } from './supabaseClient';
import { isProfileComplete } from './utils/profileCompletion';
import { getFaceAuthSettings, isFaceMfaVerified } from './utils/faceAuth';
import { useVisitorTracking } from './hooks/useVisitorTracking';

const AdminExamSettings = lazy(() => import('./pages/AdminExamSettings'));
const AdminContestSetup = lazy(() => import('./logicBuilding/AdminContestSetup'));
const LogicBuildingContest = lazy(() => import('./logicBuilding/LogicBuildingContest'));
const AdminChangeCourse = lazy(() => import('./pages/AdminChangeCourse'));
const AdminScoreboard = lazy(() => import('./logicBuilding/AdminScoreboard'));
const LogicBuildingLeaderboard = lazy(() => import('./logicBuilding/LogicBuildingLeaderboard'));
const AdminMFASetup = lazy(() => import("./pages/AdminMFASetup"));
const AdminMFAVerify = lazy(() => import("./pages/AdminMFAVerify"));
const AdminAuthChoice = lazy(() => import("./pages/AdminAuthChoice"));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Home = lazy(() => import('./pages/Home'));
const About = lazy(() => import('./pages/About'));
const Plans = lazy(() => import('./pages/Plans'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CourseList = lazy(() => import('./pages/CourseList'));
const CourseDetail = lazy(() => import('./pages/CourseDetail'));
const Exam = lazy(() => import('./pages/Exam'));
const TestExam = lazy(() => import('./pages/TestExam'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));
const VerifyCertificate = lazy(() => import('./pages/VerifyCertificate'));
const RegisterAdmin = lazy(() => import('./pages/RegisterAdmin'));
const RegisterTeacher = lazy(() => import('./pages/RegisterTeacher'));
const CareerGuidance = lazy(() => import('./pages/CareerGuidance'));
const MyCertificates = lazy(() => import('./pages/MyCertificates'));
const MyRegisteredExams = lazy(() => import('./pages/MyRegisteredExams'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminSettings = lazy(() => import('./pages/AdminSettings'));
const AdminCourses = lazy(() => import('./pages/AdminCourses'));
const StudentProgress = lazy(() => import('./pages/StudentProgress'));
const StudentDetail = lazy(() => import('./pages/StudentDetail'));
const ManagePremium = lazy(() => import('./pages/ManagePremium'));
const TeacherAssignment = lazy(() => import('./pages/TeacherAssignment'));
const GuidanceSessions = lazy(() => import('./pages/GuidanceSessions'));
const TeacherLeaves = lazy(() => import('./pages/TeacherLeaves'));
const ChatWithTeacher = lazy(() => import('./pages/ChatWithTeacher'));
const Attendance = lazy(() => import('./pages/Attendance'));
const MyStudents = lazy(() => import('./pages/MyStudents'));
const AssignedClasses = lazy(() => import('./pages/AssignedClasses'));
const Payment = lazy(() => import('./pages/Payment'));
const ClassSchedule = lazy(() => import('./pages/ClassSchedule'));
const AccountManagement = lazy(() => import('./pages/AccountManagement'));
const TeacherChat = lazy(() => import('./pages/TeacherChat'));
const LiveClass = lazy(() => import('./pages/LiveClass'));
const Notifications = lazy(() => import('./pages/Notifications'));
const AdminNotifications = lazy(() => import('./pages/AdminNotifications'));
const SessionReassignments = lazy(() => import('./pages/SessionReassignments'));
const CareerChatbot = lazy(() => import('./pages/CareerChatbot'));
const AILearningPath = lazy(() => import('./pages/AILearningPath'));
const AdminExamOverrides = lazy(() => import('./pages/AdminExamOverrides'));
const InterviewPrep = lazy(() => import('./pages/InterviewPrep'));
const PremiumStatus = lazy(() => import('./pages/PremiumStatus'));
const NotesLibrary = lazy(() => import('./pages/NotesLibrary'));
const Offers = lazy(() => import('./pages/Offers'));
const AdminExamRetakes = lazy(() => import('./pages/AdminExamRetakes'));
const AdminActiveCoupons = lazy(() => import('./pages/AdminActiveCoupons'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
const TeacherProgress = lazy(() => import('./pages/TeacherProgress'));
const TeacherConductTests = lazy(() => import('./pages/TeacherConductTests'));
const ClearDoubts = lazy(() => import('./pages/ClearDoubts'));
const AdminUserIds = lazy(() => import('./pages/AdminUserIds'));
const NotFound = lazy(() => import('./pages/NotFound'));
const AdminSendGift = lazy(() => import('./pages/AdminSendGift'));
const RequestTeacher = lazy(() => import('./pages/RequestTeacher'));
const TeacherRequests = lazy(() => import('./pages/TeacherRequests'));
const AdminTeacherRequests = lazy(() => import('./pages/AdminTeacherRequests'));
const CertificateBlocks = lazy(() => import('./pages/CertificateBlocks'));
const AdminResetPassword = lazy(() => import('./pages/AdminResetPassword'));
const AdminUserPasswordResetPage = lazy(() => import('./pages/AdminUserPasswordResetPage'));
const StartupIdeas = lazy(() => import('./pages/StartupIdeas'));
const AdminStartupIdeas = lazy(() => import('./pages/AdminStartupIdeas'));
const StartupCollaborations = lazy(() => import('./pages/StartupCollaborations'));
const AdminStartupCollaborations = lazy(() => import('./pages/AdminStartupCollaborations'));
const AdminPrizeCertificates = lazy(() => import('./pages/AdminPrizeCertificates'));
const AdminStudentReassignments = lazy(() => import('./pages/AdminStudentReassignments'));
const AdminMFAManagement = lazy(() => import('./pages/AdminMFAManagement'));
const CertificatePreview = lazy(() => import('./pages/CertificatePreview'));
const AdminDeletedAccounts = lazy(() => import('./pages/AdminDeletedAccounts'));
const TermsAndConditions = lazy(() => import('./pages/TermsAndConditions'));
const CompleteGoogleProfile = lazy(() => import('./pages/CompleteGoogleProfile'));
const FaceAuthSettings = lazy(() => import('./pages/FaceAuthSettings'));
const FaceMfaVerify = lazy(() => import('./pages/FaceMfaVerify'));
const AdminSupportContact = lazy(() => import('./pages/AdminSupportContact'));
const AdminActivityLogs = lazy(() => import('./pages/AdminActivityLogs'));
const AdminOnline = lazy(() => import('./pages/AdminOnline'));
const AdminVisitors = lazy(() => import('./pages/AdminVisitors'));
const StudentWriteTest = lazy(() => import('./pages/StudentWriteTest'));
const ResumeBuilder = lazy(() => import('./pages/ResumeBuilder'));
const ReportIssue = lazy(() => import('./pages/ReportIssue'));
const AdminIssueReports = lazy(() => import('./pages/AdminIssueReports'));
const AdminExamBans = lazy(() => import('./pages/AdminExamBans'));
const AdminGrowthAnalytics = lazy(() => import('./pages/AdminGrowthAnalytics'));
const AdminLeadInbox = lazy(() => import('./pages/AdminLeadInbox'));
const AdminPaymentAttempts = lazy(() => import('./pages/AdminPaymentAttempts'));
const AdminPaymentQR = lazy(() => import('./pages/AdminPaymentQR'));
const AdminPaymentResponses = lazy(() => import('./pages/AdminPaymentResponses'));
const AdminSendEmail = lazy(() => import('./pages/AdminSendEmail'));
const CodingPlayground = lazy(() => import('./pages/CodingPlayground'));
const DiscussionForum = lazy(() => import('./pages/DiscussionForum'));
const InternshipBoard = lazy(() => import('./pages/InternshipBoard'));
const ProjectShowcase = lazy(() => import('./pages/ProjectShowcase'));
const SkillBadges = lazy(() => import('./pages/SkillBadges'));
const AdminWebsiteProtection = lazy(() => import('./pages/AdminWebsiteProtection'));
const UniversalAssistant = lazy(() => import('./pages/UniversalAssistant'));
const AdminUserAccess = lazy(() => import('./pages/AdminUserAccess'));
const LiveExamProctoring = lazy(() => import('./pages/LiveExamProctoring'));
const FacultyAttendance = lazy(() => import('./pages/FacultyAttendance'));
const AdminAccessCodes = lazy(() => import('./pages/AdminAccessCodes'));
const AdminLiveExamBookingControls = lazy(() => import('./pages/AdminLiveExamBookingControls'));
const AdminChooseMeet = lazy(() => import('./pages/AdminChooseMeet'));
const AdminDemoSessions = lazy(() => import('./pages/AdminDemoSessions'));
const ClassFeedback = lazy(() => import('./pages/ClassFeedback'));
const AdminAutoAssignedStudents = lazy(() => import('./pages/AdminAutoAssignedStudents'));
const AdminMFARules = lazy(() => import('./pages/AdminMFARules'));
const AdminMultiSessionAlerts = lazy(() => import('./pages/AdminMultiSessionAlerts'));
const AdminNotesLibrary = lazy(() => import('./pages/AdminNotesLibrary'));
const StudentIdVerification = lazy(() => import('./pages/StudentIdVerification'));
const AdminIdVerifications = lazy(() => import('./pages/AdminIdVerifications'));
const AdminCertificateNameRequests = lazy(() => import('./pages/AdminCertificateNameRequests'));
const VerifierDashboard = lazy(() => import('./pages/VerifierDashboard'));
const AdminUsernames = lazy(() => import('./pages/AdminUsernames'));
const PremiumPlusResumeReviews = lazy(() => import('./pages/PremiumPlusResumeReviews'));
const PremiumPlusMockInterviews = lazy(() => import('./pages/PremiumPlusMockInterviews'));
const PremiumPlusRoadmap = lazy(() => import('./pages/PremiumPlusRoadmap'));
const CareerSupportDashboard = lazy(() => import('./pages/CareerSupportDashboard'));
const TeacherCareerQueue = lazy(() => import('./pages/TeacherCareerQueue'));
const AdminCareerAnalytics = lazy(() => import('./pages/AdminCareerAnalytics'));
const PortfolioBuilder = lazy(() => import('./pages/PortfolioBuilder'));
const PublicPortfolio = lazy(() => import('./pages/PublicPortfolio'));
const AdminLoginOtpSettings = lazy(() => import('./pages/AdminLoginOtpSettings'));
const AdminTriedToRegister = lazy(() => import('./pages/AdminTriedToRegister'));
const AdminUserTools = lazy(() => import('./pages/AdminUserTools'));
const AdminErrorLogs = lazy(() => import('./pages/AdminErrorLogs'));
const AchievementTimeline = lazy(() => import('./pages/ZeroCostGrowthPanels').then(m => ({ default: m.AchievementTimeline })));
const AdminAtRiskStudents = lazy(() => import('./pages/ZeroCostGrowthPanels').then(m => ({ default: m.AdminAtRiskStudents })));
const AdminSecurityReview = lazy(() => import('./pages/ZeroCostGrowthPanels').then(m => ({ default: m.AdminSecurityReview })));
const CourseCompletionChecklist = lazy(() => import('./pages/ZeroCostGrowthPanels').then(m => ({ default: m.CourseCompletionChecklist })));
const CourseDoubtHelper = lazy(() => import('./pages/ZeroCostGrowthPanels').then(m => ({ default: m.CourseDoubtHelper })));
const ExamReadinessScore = lazy(() => import('./pages/ZeroCostGrowthPanels').then(m => ({ default: m.ExamReadinessScore })));
const MotivationLeaderboard = lazy(() => import('./pages/ZeroCostGrowthPanels').then(m => ({ default: m.MotivationLeaderboard })));
const StudentDailyPlanner = lazy(() => import('./pages/ZeroCostGrowthPanels').then(m => ({ default: m.StudentDailyPlanner })));
const TeacherPerformancePanel = lazy(() => import('./pages/ZeroCostGrowthPanels').then(m => ({ default: m.TeacherPerformancePanel })));

const ViewPortfolioRedirect = () => {
  const loc = useLocation();
  return <Navigate to={loc.pathname.replace('/view-portifolio/', '/view-portfolio/')} replace />;
};

const ProtectedRoute = ({ children }) => {
  const auth = useAuth();
  const { user, profile, realProfile, isImpersonating, loading, profileChecked } = auth || {};
  const location = useLocation();
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

  if (!auth) return null;
  if (!user) return <Navigate to="/login" />;
  if (!isImpersonating && !profile) {
    if (!profileChecked) return <LoadingSpinner message="Loading..." />;
    if (user?.user_metadata?.role === 'admin') return <Navigate to="/app" replace />;
    return <Navigate to="/complete-profile" replace />;
  }
  if (!isImpersonating && profile && profile.role !== 'admin' && !isProfileComplete(profile)) {
    return <Navigate to="/complete-profile" replace />;
  }
  const faceSettings = getFaceAuthSettings(profile);
  if (
    !isImpersonating &&
    faceSettings.mfaEnabled &&
    !isFaceMfaVerified(profile.id) &&
    location.pathname !== '/face-verify'
  ) {
    return <Navigate to="/face-verify" replace state={{ next: location.pathname.startsWith('/app') ? location.pathname : '/app' }} />;
  }

  // Check if user is disabled
  if (realProfile?.is_disabled && !isImpersonating) {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-red-950 text-white p-6 flex items-center justify-center relative overflow-hidden">
        <img
          src="/sucesskart-logo.svg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 m-auto w-72 h-72 object-contain opacity-15 mix-blend-multiply pointer-events-none select-none"
        />
        <div className="max-w-xl w-full rounded-2xl border border-red-300/30 bg-white/5 backdrop-blur-sm shadow-2xl p-8 text-center space-y-4 relative z-10">
          <h1 className="text-3xl font-bold text-red-300">Account Disabled</h1>
          <p className="text-red-100">
            {realProfile?.disabled_reason
              ? `Reason: ${realProfile.disabled_reason}`
              : 'Your account has been disabled by the SucessKart team due to suspicious activity.'}
          </p>
          <div className="rounded-xl bg-red-500/10 border border-red-300/30 p-4">
            <p className="text-sm text-red-100">Please contact the SucessKart team for reactivation.</p>
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
            src="/sucesskart-logo.svg"
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
                <p>Your account is locked until the SucessKart team reviews it.</p>
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
  const auth = useAuth();
  const { realProfile, loading } = auth || {};

  if (loading || !auth) return children;

  if (realProfile?.role !== "admin")
    return <Navigate to="/app" />;

  return <RequireAdminMFA>{children}</RequireAdminMFA>;
};

const TeacherRoute = ({ children }) => {
  const auth = useAuth();
  const { profile, loading } = auth || {};

  if (loading || !auth) return children;
  if (!profile || profile.role !== "teacher")
    return <Navigate to="/app" />;

  return children;
};

const InstructorRoute = ({ children }) => {
  const auth = useAuth();
  const { profile, loading } = auth || {};

  if (loading || !auth) return children;
  if (!profile || profile.role !== "instructor")
    return <Navigate to="/app" />;

  return children;
};

const VerifierRoute = ({ children }) => {
  const auth = useAuth();
  const { profile, loading } = auth || {};

  if (loading || !auth) return children;
  if (!profile || profile.role !== "verifier") return <Navigate to="/app" />;

  return children;
};

const StaffAllInOneRoute = ({ children }) => {
  const auth = useAuth();
  const { realProfile, profile, loading } = auth || {};
  const activeRole = realProfile?.role || profile?.role;

  if (loading || !auth) return children;
  if (!['admin', 'teacher', 'instructor'].includes(activeRole)) {
    return <Navigate to="/app" />;
  }

  return activeRole === 'admin' ? <RequireAdminMFA>{children}</RequireAdminMFA> : children;
};

function App() {
  useVisitorTracking();
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<LoadingSpinner message="Loading..." />}>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
        <Route path="/complete-profile" element={<CompleteGoogleProfile />} />
        <Route path="/face-verify" element={<FaceMfaVerify />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/reset-password-confirm" element={<ResetPassword />} />
        <Route path="/register-admin" element={<RegisterAdmin />} />
        <Route path="/register-teacher" element={<RegisterTeacher />} />
        <Route path="/admin-auth-choice" element={<AdminAuthChoice />} />
        <Route path="/verify/:id" element={<VerifyCertificate />} />
        <Route path="/verify" element={<VerifyCertificate />} />
        <Route path="/certificate-preview/:id" element={<CertificatePreview />} />
        <Route path="/view-portfolio/:username" element={<PublicPortfolio />} />
        <Route path="/view-portifolio/:username" element={<ViewPortfolioRedirect />} />
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
          <Route path="face-auth" element={<FaceAuthSettings />} />
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
          <Route path="internships" element={<InternshipBoard />} />
          <Route path="project-showcase" element={<ProjectShowcase />} />
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
          <Route path="admin/error-logs" element={<AdminRoute><AdminErrorLogs /></AdminRoute>} />
          <Route path="admin/online" element={<AdminRoute><AdminOnline /></AdminRoute>} />
          <Route path="admin/visitors" element={<AdminRoute><AdminVisitors /></AdminRoute>} />
          <Route path="admin/growth-analytics" element={<AdminRoute><AdminGrowthAnalytics /></AdminRoute>} />
          <Route path="admin/lead-inbox" element={<AdminRoute><AdminLeadInbox /></AdminRoute>} />
          <Route path="admin/payment-attempts" element={<AdminRoute><AdminPaymentAttempts /></AdminRoute>} />
          <Route path="admin/payment-qr" element={<AdminRoute><AdminPaymentQR /></AdminRoute>} />
          <Route path="admin/payment-responses" element={<AdminRoute><AdminPaymentResponses /></AdminRoute>} />
          <Route path="admin/send-email" element={<AdminRoute><AdminSendEmail /></AdminRoute>} />
          <Route path="admin/issue-reports" element={<AdminRoute><AdminIssueReports /></AdminRoute>} />
          <Route path="admin/reset-password" element={<AdminRoute><AdminResetPassword /></AdminRoute>} />
          <Route path="admin/mfa-management" element={<AdminRoute><AdminMFAManagement /></AdminRoute>} />
          <Route path="admin/login-otp" element={<AdminRoute><AdminLoginOtpSettings /></AdminRoute>} />
          <Route path="admin/tried-to-register" element={<AdminRoute><AdminTriedToRegister /></AdminRoute>} />
          <Route path="admin/user-tools" element={<AdminRoute><AdminUserTools /></AdminRoute>} />
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
      </Suspense>
    </BrowserRouter>
  );
}

export default App;


