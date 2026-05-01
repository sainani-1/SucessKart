import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
  CheckCircle,
  ClipboardList,
  FileText,
  Flame,
  Globe2,
  GraduationCap,
  HelpCircle,
  Lock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { getVideoCompletionPercent, readVideoProgress } from '../utils/videoProgress';

const today = new Date();
const isActivePremium = (value) => value && new Date(value) > today;
const daysSince = (value) => {
  if (!value) return 999;
  return Math.floor((today - new Date(value)) / (1000 * 60 * 60 * 24));
};
const clamp = (value) => Math.min(Math.max(value, 0), 100);

const loadStudentLearningData = async (profileId) => {
  const [enrollmentsResult, certsResult, examsResult, sessionsResult] = await Promise.all([
    supabase.from('enrollments').select('*, courses(*)').eq('student_id', profileId),
    supabase.from('certificates').select('id, course_id, issued_at, revoked_at').eq('user_id', profileId),
    supabase.from('exam_submissions').select('id, exam_id, passed, score_percent, submitted_at, next_attempt_allowed_at, exam:exams(course_id)').eq('user_id', profileId),
    supabase
      .from('class_sessions')
      .select('id, title, scheduled_for, status, class_session_participants!inner(student_id)')
      .eq('class_session_participants.student_id', profileId)
      .gte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(5),
  ]);

  const enrollments = enrollmentsResult.data || [];
  const certificates = certsResult.data || [];
  const submissions = examsResult.data || [];
  const sessions = sessionsResult.data || [];
  const certCourseIds = new Set(certificates.filter((row) => !row.revoked_at).map((row) => String(row.course_id)));
  const submissionsByCourse = new Map();
  submissions.forEach((submission) => {
    const courseId = submission?.exam?.course_id;
    if (!courseId) return;
    const current = submissionsByCourse.get(String(courseId));
    if (!current || new Date(submission.submitted_at || 0) > new Date(current.submitted_at || 0)) {
      submissionsByCourse.set(String(courseId), submission);
    }
  });

  const courses = enrollments.map((enrollment) => {
    const course = enrollment.courses || {};
    const courseId = String(enrollment.course_id || course.id || '');
    const video = readVideoProgress(profileId, courseId);
    const videoPercent = getVideoCompletionPercent(video);
    const progress = clamp(Math.max(Number(enrollment.progress) || 0, videoPercent));
    const submission = submissionsByCourse.get(courseId);
    const certified = certCourseIds.has(courseId);
    return {
      id: courseId,
      enrollmentId: enrollment.id,
      title: course.title || 'Course',
      category: course.category || 'General',
      progress,
      videoPercent,
      completed: Boolean(enrollment.completed || progress >= 100 || certified || submission?.passed),
      certified,
      submission,
      hasVideoProgress: Boolean(video?.currentTime),
      lastActivityAt: video?.updatedAt || enrollment.updated_at || enrollment.created_at,
    };
  });

  return { courses, certificates, submissions, sessions };
};

const PageHeader = ({ icon: Icon, eyebrow, title, description }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
      <Icon size={15} />
      {eyebrow}
    </p>
    <h1 className="mt-3 text-3xl font-black text-slate-900">{title}</h1>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
  </section>
);

const MetricCard = ({ icon: Icon, label, value, tone = 'slate' }) => {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
  };
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${tones[tone] || tones.slate}`}>
      <div className="flex items-center justify-between gap-3">
        <Icon size={22} />
        <span className="text-2xl font-black text-slate-900">{value}</span>
      </div>
      <p className="mt-2 text-sm font-semibold">{label}</p>
    </div>
  );
};

export const StudentDailyPlanner = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ courses: [], sessions: [], certificates: [] });

  useEffect(() => {
    if (!profile?.id) return;
    loadStudentLearningData(profile.id).then(setData).finally(() => setLoading(false));
  }, [profile?.id]);

  if (loading) return <LoadingSpinner message="Preparing today's plan..." />;

  const nextCourse = data.courses.find((course) => !course.completed) || data.courses[0];
  const failedExam = data.courses.find((course) => course.submission && !course.submission.passed);
  const tasks = [
    nextCourse && {
      title: nextCourse.hasVideoProgress ? `Continue ${nextCourse.title}` : `Start ${nextCourse.title}`,
      detail: `${Math.round(nextCourse.progress)}% complete. Open the course and finish the next learning step.`,
      to: `/app/course/${nextCourse.id}`,
      priority: 'High',
    },
    data.sessions[0] && {
      title: data.sessions[0].title || 'Upcoming live class',
      detail: new Date(data.sessions[0].scheduled_for).toLocaleString('en-IN'),
      to: '/app/class-schedule',
      priority: 'Today',
    },
    failedExam && {
      title: `Review exam result for ${failedExam.title}`,
      detail: `Latest score: ${Number(failedExam.submission.score_percent || 0).toFixed(1)}%. Revise before retrying.`,
      to: '/app/exam-readiness',
      priority: 'Focus',
    },
    {
      title: 'Update portfolio proof',
      detail: 'Add your latest certificates, projects, and resume link to your public profile.',
      to: '/app/portfolio',
      priority: 'Growth',
    },
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader icon={Calendar} eyebrow="Daily Planner" title="Today’s Learning Plan" description="A free planner built from your courses, video progress, exams, certificates, and upcoming classes." />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={BookOpen} label="Active courses" value={data.courses.length} tone="blue" />
        <MetricCard icon={CheckCircle} label="Completed courses" value={data.courses.filter((course) => course.completed).length} tone="green" />
        <MetricCard icon={Award} label="Certificates" value={data.certificates.length} tone="amber" />
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black text-slate-900">Recommended Tasks</h2>
        <div className="mt-4 grid gap-3">
          {tasks.map((task) => (
            <Link key={task.title} to={task.to} className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-amber-300 hover:bg-amber-50">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-slate-900">{task.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{task.detail}</p>
                </div>
                <span className="w-fit rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">{task.priority}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

export const CourseCompletionChecklist = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    if (!profile?.id) return;
    loadStudentLearningData(profile.id).then((result) => setCourses(result.courses)).finally(() => setLoading(false));
  }, [profile?.id]);

  if (loading) return <LoadingSpinner message="Loading course checklist..." />;

  return (
    <div className="space-y-6">
      <PageHeader icon={ClipboardList} eyebrow="Course Checklist" title="Course Completion Checklist" description="Every course shows the core journey: learning progress, video progress, exam result, and certificate status." />
      <div className="grid gap-4">
        {courses.map((course) => {
          const steps = [
            { label: 'Course opened', done: true },
            { label: `Video progress ${Math.round(course.videoPercent)}%`, done: course.videoPercent >= 80 },
            { label: 'Exam passed', done: Boolean(course.submission?.passed) },
            { label: 'Certificate issued', done: course.certified },
          ];
          return (
            <article key={course.enrollmentId || course.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{course.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{course.category}</p>
                </div>
                <Link to={`/app/course/${course.id}`} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">Open Course</Link>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${course.progress}%` }} />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                {steps.map((step) => (
                  <div key={step.label} className={`rounded-xl border p-3 ${step.done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      {step.done ? <CheckCircle size={16} className="text-emerald-600" /> : <Lock size={16} className="text-slate-400" />}
                      {step.label}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};

export const ExamReadinessScore = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    if (!profile?.id) return;
    loadStudentLearningData(profile.id).then((result) => setCourses(result.courses)).finally(() => setLoading(false));
  }, [profile?.id]);

  if (loading) return <LoadingSpinner message="Calculating exam readiness..." />;

  return (
    <div className="space-y-6">
      <PageHeader icon={Target} eyebrow="Exam Readiness" title="Exam Readiness Score" description="A no-cost readiness estimate from video progress, course completion, previous attempts, and certificate status." />
      <div className="grid gap-4">
        {courses.map((course) => {
          const score = clamp((course.videoPercent * 0.55) + (course.progress * 0.25) + (course.submission?.passed ? 20 : 0) - (course.submission && !course.submission.passed ? 10 : 0));
          const tone = score >= 80 ? 'green' : score >= 50 ? 'amber' : 'red';
          return (
            <article key={course.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-900">{course.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {score >= 80 ? 'Ready to book/write exam' : score >= 50 ? 'Revise once before exam' : 'Needs more learning time'}
                  </p>
                </div>
                <div className={`rounded-xl border px-4 py-3 text-center ${tone === 'green' ? 'border-emerald-200 bg-emerald-50' : tone === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
                  <p className="text-2xl font-black text-slate-900">{Math.round(score)}%</p>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Ready</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};

export const AchievementTimeline = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!profile?.id) return;
    loadStudentLearningData(profile.id).then(({ courses, certificates, submissions }) => {
      const rows = [
        { date: profile.created_at, title: 'Joined SkillPro', detail: profile.email, icon: Users },
        ...courses.map((course) => ({ date: course.lastActivityAt, title: `Started ${course.title}`, detail: `${Math.round(course.progress)}% progress`, icon: BookOpen })),
        ...submissions.map((submission) => ({ date: submission.submitted_at, title: submission.passed ? 'Passed exam' : 'Attempted exam', detail: `${Number(submission.score_percent || 0).toFixed(1)}% score`, icon: Target })),
        ...certificates.map((cert) => ({ date: cert.issued_at, title: cert.revoked_at ? 'Certificate blocked' : 'Certificate earned', detail: cert.course_id || 'SkillPro certificate', icon: Award })),
      ].filter((row) => row.date).sort((a, b) => new Date(b.date) - new Date(a.date));
      setEvents(rows);
    }).finally(() => setLoading(false));
  }, [profile]);

  if (loading) return <LoadingSpinner message="Building achievement timeline..." />;

  return (
    <div className="space-y-6">
      <PageHeader icon={Sparkles} eyebrow="Achievement Timeline" title="Student Achievement Timeline" description="A timeline of learning milestones that students can use as proof of progress." />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="space-y-4">
          {events.map((event, index) => {
            const Icon = event.icon;
            return (
              <div key={`${event.title}-${index}`} className="flex gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <Icon size={18} />
                </div>
                <div>
                  <p className="font-bold text-slate-900">{event.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{event.detail}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{new Date(event.date).toLocaleString('en-IN')}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export const CourseDoubtHelper = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [question, setQuestion] = useState('');
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    if (!profile?.id) return;
    loadStudentLearningData(profile.id).then((result) => {
      setCourses(result.courses);
      setSelectedId(result.courses[0]?.id || '');
    }).finally(() => setLoading(false));
  }, [profile?.id]);

  const selected = courses.find((course) => course.id === selectedId);
  const answer = useMemo(() => {
    if (!selected) return 'Choose a course to get a study suggestion.';
    const lower = question.toLowerCase();
    if (!question.trim()) return `For ${selected.title}, first revise the overview and finish the next incomplete step. Your current progress is ${Math.round(selected.progress)}%.`;
    if (lower.includes('exam') || lower.includes('test')) return `Exam tip for ${selected.title}: complete at least 80% video progress, revise notes, then use Exam Readiness before booking.`;
    if (lower.includes('certificate')) return selected.certified ? 'Your certificate is already issued. Open My Certificates or your public portfolio proof.' : 'Certificates unlock after passing the linked exam and meeting SkillPro rules.';
    if (lower.includes('video')) return `Your saved video progress is ${Math.round(selected.videoPercent)}%. Continue the course video and avoid skipping important revision sections.`;
    return `Suggested next step: break your doubt into one topic, check the course notes, then ask your teacher in Ask a Doubt if it still feels unclear.`;
  }, [question, selected]);

  if (loading) return <LoadingSpinner message="Starting local doubt helper..." />;

  return (
    <div className="space-y-6">
      <PageHeader icon={HelpCircle} eyebrow="Free Doubt Helper" title="Course Doubt Helper" description="A zero-cost helper with local study guidance. It does not call any paid AI API." />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm">
            {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
          </select>
          <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about video, exam, certificate, notes, or revision..." className="rounded-xl border border-slate-200 px-3 py-3 text-sm" />
        </div>
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-700">Suggested Answer</p>
          <p className="mt-3 text-sm leading-7 text-slate-800">{answer}</p>
          <Link to="/app/chat" className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">Ask Teacher</Link>
        </div>
      </section>
    </div>
  );
};

export const MotivationLeaderboard = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const load = async () => {
      const [profilesResult, certsResult, examsResult, enrollmentsResult] = await Promise.all([
        supabase.from('profiles').select('id, full_name, avatar_url').eq('role', 'student').limit(50),
        supabase.from('certificates').select('user_id, revoked_at'),
        supabase.from('exam_submissions').select('user_id, passed, score_percent'),
        supabase.from('enrollments').select('student_id, progress, completed'),
      ]);
      const certCount = new Map();
      (certsResult.data || []).filter((cert) => !cert.revoked_at).forEach((cert) => certCount.set(cert.user_id, (certCount.get(cert.user_id) || 0) + 1));
      const passCount = new Map();
      (examsResult.data || []).filter((exam) => exam.passed).forEach((exam) => passCount.set(exam.user_id, (passCount.get(exam.user_id) || 0) + 1));
      const completeCount = new Map();
      (enrollmentsResult.data || []).filter((row) => row.completed || Number(row.progress) >= 100).forEach((row) => completeCount.set(row.student_id, (completeCount.get(row.student_id) || 0) + 1));
      const nextRows = (profilesResult.data || []).map((student) => ({
        ...student,
        points: (certCount.get(student.id) || 0) * 75 + (passCount.get(student.id) || 0) * 40 + (completeCount.get(student.id) || 0) * 100,
        certificates: certCount.get(student.id) || 0,
        passed: passCount.get(student.id) || 0,
        completed: completeCount.get(student.id) || 0,
      })).sort((a, b) => b.points - a.points).slice(0, 25);
      setRows(nextRows);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <LoadingSpinner message="Loading leaderboard..." />;

  return (
    <div className="space-y-6">
      <PageHeader icon={Trophy} eyebrow="Motivation" title="Learning Leaderboard" description="A no-cost leaderboard using certificates, passed exams, and completed courses." />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[60px_1fr_120px] sm:items-center">
              <p className="text-2xl font-black text-amber-600">#{index + 1}</p>
              <div>
                <p className="font-bold text-slate-900">{row.full_name || 'SkillPro Student'}</p>
                <p className="text-sm text-slate-500">{row.completed} courses, {row.passed} exams, {row.certificates} certificates</p>
              </div>
              <p className="text-right text-xl font-black text-slate-900">{row.points} pts</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export const AdminAtRiskStudents = ({ teacherOnly = false }) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const load = async () => {
      let studentsQuery = supabase.from('profiles').select('id, full_name, email, premium_until, assigned_teacher_id, created_at').eq('role', 'student');
      if (teacherOnly) studentsQuery = studentsQuery.eq('assigned_teacher_id', profile.id);
      const [studentsResult, enrollmentsResult, examsResult, certsResult] = await Promise.all([
        studentsQuery,
        supabase.from('enrollments').select('student_id, progress, completed, updated_at, created_at'),
        supabase.from('exam_submissions').select('user_id, passed, score_percent, submitted_at'),
        supabase.from('certificates').select('user_id, revoked_at'),
      ]);
      const enrollmentsByStudent = new Map();
      (enrollmentsResult.data || []).forEach((row) => {
        const list = enrollmentsByStudent.get(row.student_id) || [];
        list.push(row);
        enrollmentsByStudent.set(row.student_id, list);
      });
      const examsByStudent = new Map();
      (examsResult.data || []).forEach((row) => {
        const list = examsByStudent.get(row.user_id) || [];
        list.push(row);
        examsByStudent.set(row.user_id, list);
      });
      const certsByStudent = new Map();
      (certsResult.data || []).filter((row) => !row.revoked_at).forEach((row) => certsByStudent.set(row.user_id, (certsByStudent.get(row.user_id) || 0) + 1));
      const nextRows = (studentsResult.data || []).map((student) => {
        const enrollments = enrollmentsByStudent.get(student.id) || [];
        const exams = examsByStudent.get(student.id) || [];
        const lastActivity = [...enrollments.map((row) => row.updated_at || row.created_at), ...exams.map((row) => row.submitted_at)].filter(Boolean).sort().at(-1);
        const failed = exams.filter((exam) => !exam.passed).length;
        const lowProgress = enrollments.length > 0 && enrollments.every((row) => Number(row.progress) < 35 && !row.completed);
        const inactive = daysSince(lastActivity || student.created_at) > 10;
        const paidInactive = isActivePremium(student.premium_until) && inactive;
        const score = (paidInactive ? 35 : 0) + (failed * 20) + (lowProgress ? 25 : 0) + (certsByStudent.get(student.id) ? 0 : 10);
        return { ...student, enrollments: enrollments.length, failed, certificates: certsByStudent.get(student.id) || 0, inactive, lowProgress, paidInactive, riskScore: score };
      }).filter((row) => row.riskScore > 0).sort((a, b) => b.riskScore - a.riskScore);
      setRows(nextRows);
      setLoading(false);
    };
    if (profile?.id) load();
  }, [profile?.id, teacherOnly]);

  if (loading) return <LoadingSpinner message="Finding students who need attention..." />;

  return (
    <div className="space-y-6">
      <PageHeader icon={AlertTriangle} eyebrow={teacherOnly ? 'Teacher Follow Up' : 'Admin Follow Up'} title="At Risk Students" description="Find paid inactive students, low-progress learners, failed attempts, and students with no certificate yet." />
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={Users} label="Needs follow up" value={rows.length} tone="red" />
        <MetricCard icon={Award} label="Paid inactive" value={rows.filter((row) => row.paidInactive).length} tone="amber" />
        <MetricCard icon={Target} label="Failed exams" value={rows.reduce((sum, row) => sum + row.failed, 0)} tone="red" />
        <MetricCard icon={BookOpen} label="Low progress" value={rows.filter((row) => row.lowProgress).length} tone="blue" />
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Signals</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900">{row.full_name || 'Student'}</p>
                    <p className="text-xs text-slate-500">{row.email}</p>
                  </td>
                  <td className="px-4 py-3 font-black text-red-600">{row.riskScore}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {[row.paidInactive && 'paid inactive', row.lowProgress && 'low progress', row.failed ? `${row.failed} failed attempts` : '', !row.certificates && 'no certificate'].filter(Boolean).join(', ')}
                  </td>
                  <td className="px-4 py-3">
                    <Link to={teacherOnly ? '/app/teacher-chat' : `/app/admin/user-access/${row.id}`} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export const TeacherPerformancePanel = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ students: 0, premium: 0, sessions: 0, passed: 0, certificates: 0 });

  useEffect(() => {
    const load = async () => {
      const [studentsResult, sessionsResult, examsResult, certsResult] = await Promise.all([
        supabase.from('profiles').select('id, premium_until').eq('role', 'student').eq('assigned_teacher_id', profile.id),
        supabase.from('class_sessions').select('id, status').eq('teacher_id', profile.id),
        supabase.from('exam_submissions').select('user_id, passed'),
        supabase.from('certificates').select('user_id, revoked_at'),
      ]);
      const studentIds = new Set((studentsResult.data || []).map((student) => student.id));
      setStats({
        students: studentIds.size,
        premium: (studentsResult.data || []).filter((student) => isActivePremium(student.premium_until)).length,
        sessions: (sessionsResult.data || []).length,
        passed: (examsResult.data || []).filter((exam) => exam.passed && studentIds.has(exam.user_id)).length,
        certificates: (certsResult.data || []).filter((cert) => !cert.revoked_at && studentIds.has(cert.user_id)).length,
      });
      setLoading(false);
    };
    if (profile?.id) load();
  }, [profile?.id]);

  if (loading) return <LoadingSpinner message="Loading teacher performance..." />;

  return (
    <div className="space-y-6">
      <PageHeader icon={BarIcon} eyebrow="Teacher Performance" title="Teacher Performance Dashboard" description="A free teaching summary from assigned students, sessions, passes, and certificates." />
      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard icon={Users} label="Students" value={stats.students} tone="blue" />
        <MetricCard icon={Award} label="Premium" value={stats.premium} tone="amber" />
        <MetricCard icon={Calendar} label="Sessions" value={stats.sessions} tone="slate" />
        <MetricCard icon={Target} label="Passed Exams" value={stats.passed} tone="green" />
        <MetricCard icon={GraduationCap} label="Certificates" value={stats.certificates} tone="green" />
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black text-slate-900">Suggested Improvements</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Advice text="Follow up with inactive premium students before their motivation drops." />
          <Advice text="Use class feedback after every session to improve student confidence." />
          <Advice text="Push students with high progress toward exam readiness and certificates." />
        </div>
      </section>
    </div>
  );
};

const BarIcon = (props) => <Trophy {...props} />;
const Advice = ({ text }) => <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">{text}</div>;

export const AdminSecurityReview = () => {
  const checks = [
    { title: 'Protected route layer', status: 'Present', detail: 'Authenticated users pass through ProtectedRoute, with disabled and locked account handling.' },
    { title: 'Admin MFA gates', status: 'Present', detail: 'AdminRoute wraps admin pages with RequireAdminMFA, and sensitive pages use extra MFA gates.' },
    { title: 'Exam proctoring hooks', status: 'Present', detail: 'Fullscreen, blur, tab, camera, and devtools proctor utilities exist in the codebase.' },
    { title: 'Content protection', status: 'Present', detail: 'Course detail blocks common copy, print, direct notes access, and unsafe embedded video patterns.' },
    { title: 'Server-side secrets', status: 'Review', detail: 'Keep Supabase service role keys only in API routes/functions. Never expose them through VITE_ variables.' },
    { title: 'RLS policies', status: 'Review', detail: 'Continue verifying Supabase RLS for profiles, certificates, exams, payments, chats, portfolios, and admin-only tables.' },
    { title: 'Large client bundle', status: 'Improve', detail: 'Code splitting will reduce exposed client surface and improve load speed.' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader icon={ShieldCheck} eyebrow="Security" title="Website Security Review" description="A practical security dashboard for the current SkillPro frontend. It does not replace a professional penetration test, but it keeps the main controls visible." />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={ShieldCheck} label="Strong controls" value={4} tone="green" />
        <MetricCard icon={AlertTriangle} label="Needs review" value={2} tone="amber" />
        <MetricCard icon={Lock} label="Improve later" value={1} tone="blue" />
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3">
          {checks.map((check) => (
            <div key={check.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-bold text-slate-900">{check.title}</p>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${check.status === 'Present' ? 'bg-emerald-600 text-white' : check.status === 'Review' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'}`}>{check.status}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{check.detail}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
