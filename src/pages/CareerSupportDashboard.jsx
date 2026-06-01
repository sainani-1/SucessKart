import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle, Download, FileText, ListChecks, MessageSquare, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import PremiumPlusUpgradeGate from '../components/PremiumPlusUpgradeGate';
import {
  canUseCareerSupport,
  formatCareerCycle,
  getCareerCycleMonth,
  getInterviewQuestionsForRole,
  scoreResume,
  readBuilderResume,
} from '../utils/careerSupport';

const pct = (value) => `${Math.max(0, Math.min(100, Math.round(Number(value) || 0)))}%`;

const quotaLabel = (used, limit) => {
  const safeUsed = Number(used) || 0;
  const safeLimit = Number(limit) || 0;
  if (safeUsed <= safeLimit) return `${safeUsed}/${safeLimit} used this month`;
  return `${safeLimit}/${safeLimit} used this month • ${safeUsed - safeLimit} extra request${safeUsed - safeLimit === 1 ? '' : 's'}`;
};

const SectionHeader = ({ eyebrow, title, children }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">{eyebrow}</p>
    <h2 className="mt-1 text-xl font-bold text-slate-900">{title}</h2>
    {children ? <p className="mt-1 text-sm text-slate-500">{children}</p> : null}
  </div>
);

const CareerSupportDashboard = () => {
  const { profile, user } = useAuth();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({ resumes: [], interviews: [], roadmaps: [], profileReviews: [], tasks: [], goals: null });
  const cycleMonth = getCareerCycleMonth();
  const allowed = canUseCareerSupport(profile);
  const builderResume = useMemo(() => readBuilderResume(profile, user), [profile, user]);
  const ats = useMemo(() => scoreResume(builderResume || {}), [builderResume]);

  const loadDashboard = async () => {
    if (!profile?.id || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [
        resumes,
        interviews,
        roadmaps,
        profileReviews,
        tasks,
        goals,
      ] = await Promise.all([
        supabase.from('career_resume_reviews').select('*').eq('student_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('career_mock_interviews').select('*').eq('student_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('career_roadmaps').select('*').eq('student_id', profile.id).order('updated_at', { ascending: false }),
        supabase.from('career_profile_reviews').select('*').eq('student_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('career_tasks').select('*').eq('student_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('career_goals').select('*').eq('student_id', profile.id).maybeSingle(),
      ]);
      const failed = [resumes, interviews, roadmaps, profileReviews, tasks, goals].find((result) => result.error);
      if (failed?.error) throw failed.error;
      setData({
        resumes: resumes.data || [],
        interviews: interviews.data || [],
        roadmaps: roadmaps.data || [],
        profileReviews: profileReviews.data || [],
        tasks: tasks.data || [],
        goals: goals.data || null,
      });
    } catch (loadError) {
      setError(loadError.message || 'Failed to load career support dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [profile?.id, allowed]);

  useEffect(() => {
    if (loading || typeof window === 'undefined' || !window.location.hash) return;
    const target = document.querySelector(window.location.hash);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading]);

  const currentResumes = data.resumes.filter((row) => row.cycle_month === cycleMonth);
  const currentInterviews = data.interviews.filter((row) => row.cycle_month === cycleMonth);
  const completedTasks = data.tasks.filter((task) => task.status === 'completed').length;
  const taskScore = data.tasks.length ? (completedTasks / data.tasks.length) * 100 : 0;
  const latestInterview = data.interviews.find((row) => row.status === 'completed') || data.interviews[0];
  const interviewScore = latestInterview
    ? Math.round((['communication_score', 'technical_score', 'confidence_score', 'project_explanation_score']
      .reduce((sum, key) => sum + (Number(latestInterview[key]) || 0), 0) / 20) * 100)
    : 0;
  const roadmapScore = data.roadmaps.some((row) => row.cycle_month === cycleMonth) ? 100 : 0;
  const profileScore = data.profileReviews.some((row) => row.status === 'reviewed') ? 100 : data.profileReviews.length ? 50 : 0;
  const readinessScore = Math.round((ats.score + interviewScore + roadmapScore + profileScore + taskScore) / 5);
  const questions = getInterviewQuestionsForRole(data.goals?.target_role || profile?.core_subject);
  const activeSection = location.hash || '#career-overview';
  const showSection = (sectionHash) => activeSection === sectionHash;

  const markTaskComplete = async (task) => {
    const { data: updated, error: updateError } = await supabase
      .from('career_tasks')
      .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', task.id)
      .select('*')
      .single();
    if (updateError) {
      setError(updateError.message || 'Failed to update task.');
      return;
    }
    setData((prev) => ({ ...prev, tasks: prev.tasks.map((row) => (row.id === task.id ? updated : row)) }));
  };

  const downloadReport = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const lines = [
      'SucessKart Career Report',
      `Student: ${profile?.full_name || profile?.email || '-'}`,
      `Month: ${formatCareerCycle(cycleMonth)}`,
      `Career Readiness: ${readinessScore}/100`,
      `Resume ATS: ${ats.score}/100`,
      `Mock Interview: ${interviewScore}/100`,
      `Roadmap: ${roadmapScore}/100`,
      `Profile Review: ${profileScore}/100`,
      `Task Completion: ${pct(taskScore)}`,
      '',
      'Latest Resume Feedback:',
      data.resumes.find((row) => row.teacher_feedback)?.teacher_feedback || 'No feedback yet.',
      '',
      'Latest Mock Interview Feedback:',
      latestInterview?.teacher_feedback || 'No feedback yet.',
      '',
      'Current Tasks:',
      ...data.tasks.slice(0, 8).map((task) => `- ${task.title}: ${task.status}`),
    ];
    doc.text(lines, 12, 16);
    doc.save('SucessKart-career-report.pdf');
  };

  if (loading) return <LoadingSpinner message="Loading career support dashboard..." />;
  if (!allowed) return <PremiumPlusUpgradeGate profile={profile} title="Unlock Career Support Dashboard" message="Premium Plus unlocks your complete career support dashboard." />;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-slate-950 p-6 text-white">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-200">Premium Plus</p>
        <h1 className="mt-2 text-3xl font-bold">Career Support Dashboard</h1>
        <p className="mt-2 text-slate-300">One place for resume, interview, roadmap, profile reviews, tasks, and readiness.</p>
      </section>
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {showSection('#career-overview') ? <section id="career-overview" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader eyebrow="Overview" title="Career Readiness Scores">
          These scores combine resume quality, interview performance, roadmap status, profile reviews, and task completion.
        </SectionHeader>
        <div className="mt-5 grid gap-4 md:grid-cols-5">
          {[
            ['Readiness', `${readinessScore}/100`],
            ['Resume ATS', `${ats.score}/100`],
            ['Interview', `${interviewScore}/100`],
            ['Roadmap', pct(roadmapScore)],
            ['Tasks', pct(taskScore)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      </section> : null}
      {showSection('#career-quota') ? <section id="career-quota" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader eyebrow="Monthly Quota" title="Premium Plus Usage This Month">
          Resume reviews and mock interviews reset every calendar month.
        </SectionHeader>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Link to="/app/resume-reviews" className="rounded-xl border border-slate-200 bg-slate-50 p-5 hover:bg-slate-100"><FileText /><p className="mt-3 font-bold">Resume Reviews</p><p className="text-sm text-slate-500">{quotaLabel(currentResumes.length, 2)}</p></Link>
          <Link to="/app/mock-interviews" className="rounded-xl border border-slate-200 bg-slate-50 p-5 hover:bg-slate-100"><MessageSquare /><p className="mt-3 font-bold">Mock Interview</p><p className="text-sm text-slate-500">{quotaLabel(currentInterviews.length, 1)}</p></Link>
          <Link to="/app/personal-roadmap" className="rounded-xl border border-slate-200 bg-slate-50 p-5 hover:bg-slate-100"><Sparkles /><p className="mt-3 font-bold">Roadmap</p><p className="text-sm text-slate-500">{roadmapScore ? 'Updated this month' : 'Not generated yet'}</p></Link>
        </div>
      </section> : null}
      {showSection('#career-report') ? <section id="career-report" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader eyebrow="Documents" title="Career Report PDF">
            Download your resume, interview, roadmap, profile review, and task summary.
          </SectionHeader>
          <button type="button" onClick={downloadReport} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"><Download size={16} /> Download Career Report PDF</button>
        </div>
      </section> : null}
      {showSection('#career-tasks') ? <section id="career-tasks" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader eyebrow="Action Items" title="Career Tasks">
          When your teacher assigns a task, you will receive a notification and it will appear here.
        </SectionHeader>
        <div className="mt-4 grid gap-3">
          {data.tasks.length === 0 ? <p className="text-sm text-slate-500">No teacher tasks assigned yet.</p> : data.tasks.map((task) => (
            <div key={task.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div><p className="font-bold text-slate-900">{task.title}</p><p className="mt-1 text-sm text-slate-600">{task.description || 'No details added.'}</p></div>
                {task.status === 'completed' ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Completed</span> : <button type="button" onClick={() => markTaskComplete(task)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><CheckCircle size={16} /> Mark Done</button>}
              </div>
            </div>
          ))}
        </div>
      </section> : null}
      {showSection('#interview-practice') ? <section id="interview-practice" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader eyebrow="Practice" title="Interview Question Practice">
          Questions are selected from your target role or subject.
        </SectionHeader>
        <div className="mt-4 grid gap-3">
          {questions.map((question) => <div key={question} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{question}</div>)}
        </div>
      </section> : null}
      {showSection('#career-history') ? <section id="career-history" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader eyebrow="History" title="Monthly History">
          Your month-wise Premium Plus career support usage.
        </SectionHeader>
        <div className="mt-4 grid gap-3">
          {Array.from(new Set([...data.resumes, ...data.interviews, ...data.roadmaps, ...data.profileReviews].map((row) => row.cycle_month).filter(Boolean))).map((month) => (
            <div key={month} className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
              <b>{formatCareerCycle(month)}</b>: {data.resumes.filter((row) => row.cycle_month === month).length} resume reviews, {data.interviews.filter((row) => row.cycle_month === month).length} mock interviews, {data.profileReviews.filter((row) => row.cycle_month === month).length} profile reviews
            </div>
          ))}
        </div>
      </section> : null}
    </div>
  );
};

export default CareerSupportDashboard;
