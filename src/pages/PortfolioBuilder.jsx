import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Globe2, Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const emptyProject = { title: '', description: '', link: '' };
const emptySkill = '';
const emptyCaseStudy = { title: '', problem: '', process: '', role: '', outcome: '', link: '' };
const emptyTestimonial = { quote: '', author: '', context: '' };
const emptyVisual = { title: '', url: '', caption: '' };
const emptyProcessDoc = { title: '', description: '', link: '' };

const defaultContent = (profile) => ({
  headline: profile?.full_name ? `${profile.full_name} Portfolio` : 'My Portfolio',
  role: profile?.core_subject || 'Student Developer',
  location: '',
  summary: 'I am building practical skills through SucessKart courses, projects, exams, and mentorship.',
  about: '',
  goals: '',
  resumeUrl: '',
  email: profile?.email || '',
  phone: profile?.phone || '',
  linkedin: '',
  github: '',
  website: '',
  skills: ['Communication', 'Problem Solving', 'Learning'],
  projects: [
    {
      title: 'SucessKart Learning Journey',
      description: 'A collection of courses, certificates, and practical work completed through SucessKart.',
      link: '',
    },
  ],
  achievements: ['SucessKart learner'],
  caseStudies: [],
  testimonials: [],
  visuals: [],
  processDocs: [],
});

const themeOptions = [
  { value: 'slate', label: 'Slate' },
  { value: 'emerald', label: 'Emerald' },
  { value: 'amber', label: 'Amber' },
];

const PortfolioBuilder = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [portfolio, setPortfolio] = useState(null);

  const username = profile?.username || '';
  const publicUrl = useMemo(() => {
    if (!username || typeof window === 'undefined') return '';
    return `${window.location.origin}/view-portfolio/${encodeURIComponent(username)}`;
  }, [username]);

  const content = portfolio?.content || defaultContent(profile);

  useEffect(() => {
    let active = true;

    const loadPortfolio = async () => {
      if (!profile?.id) return;
      setLoading(true);
      setStatus({ type: '', message: '' });
      try {
        const { data, error } = await supabase
          .from('student_portfolios')
          .select('*')
          .eq('user_id', profile.id)
          .maybeSingle();
        if (error) throw error;

        if (!active) return;
        setPortfolio(data || {
          user_id: profile.id,
          username,
          title: profile?.full_name ? `${profile.full_name} Portfolio` : 'Student Portfolio',
          tagline: profile?.core_subject || '',
          theme: 'slate',
          is_published: false,
          content: defaultContent(profile),
        });
      } catch (error) {
        if (!active) return;
        setStatus({
          type: 'error',
          message: error.message?.includes('student_portfolios')
            ? 'Portfolio table is not ready. Run supabase/20260426_student_portfolios.sql in Supabase SQL editor.'
            : error.message || 'Could not load portfolio.',
        });
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPortfolio();
    return () => {
      active = false;
    };
  }, [profile?.id, profile?.full_name, profile?.core_subject, profile?.email, profile?.phone, username]);

  const updatePortfolio = (patch) => setPortfolio((prev) => ({ ...prev, ...patch }));
  const updateContent = (patch) => updatePortfolio({ content: { ...content, ...patch } });

  const updateListItem = (key, index, value) => {
    const next = [...(content[key] || [])];
    next[index] = value;
    updateContent({ [key]: next });
  };

  const removeListItem = (key, index) => {
    const next = [...(content[key] || [])];
    next.splice(index, 1);
    updateContent({ [key]: next });
  };

  const updateProject = (index, patch) => {
    const next = [...(content.projects || [])];
    next[index] = { ...next[index], ...patch };
    updateContent({ projects: next });
  };

  const updateCaseStudy = (index, patch) => {
    const next = [...(content.caseStudies || [])];
    next[index] = { ...next[index], ...patch };
    updateContent({ caseStudies: next });
  };

  const updateTestimonial = (index, patch) => {
    const next = [...(content.testimonials || [])];
    next[index] = { ...next[index], ...patch };
    updateContent({ testimonials: next });
  };

  const updateVisual = (index, patch) => {
    const next = [...(content.visuals || [])];
    next[index] = { ...next[index], ...patch };
    updateContent({ visuals: next });
  };

  const updateProcessDoc = (index, patch) => {
    const next = [...(content.processDocs || [])];
    next[index] = { ...next[index], ...patch };
    updateContent({ processDocs: next });
  };

  const savePortfolio = async (publish = false) => {
    if (!profile?.id || !portfolio) return;
    if (!username) {
      setStatus({ type: 'error', message: 'Set your username in Profile before publishing a portfolio.' });
      return;
    }

    setSaving(true);
    setStatus({ type: '', message: '' });
    try {
      const now = new Date().toISOString();
      const payload = {
        user_id: profile.id,
        username,
        title: portfolio.title?.trim() || `${profile.full_name || 'Student'} Portfolio`,
        tagline: portfolio.tagline?.trim() || null,
        theme: portfolio.theme || 'slate',
        is_published: publish ? true : Boolean(portfolio.is_published),
        published_at: publish ? now : portfolio.published_at || null,
        updated_at: now,
        content,
      };

      const { data, error } = await supabase
        .from('student_portfolios')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();
      if (error) throw error;

      setPortfolio(data);
      setStatus({
        type: 'success',
        message: publish ? 'Portfolio published. Your public link is ready.' : 'Portfolio saved.',
      });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error.message || 'Could not save portfolio.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading portfolio builder..." />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-sm">
        <div className="grid gap-6 px-6 py-7 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
              <Globe2 size={14} />
              Portfolio Generator
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Build and publish your portfolio</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Create a public portfolio website hosted inside SucessKart. Share it as your SucessKart profile link.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Public URL</p>
            <p className="mt-2 break-all text-sm font-semibold text-amber-200">{publicUrl || 'Set username first'}</p>
            {publicUrl ? (
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-100"
              >
                <ExternalLink size={16} />
                Open public page
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {status.message ? (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          status.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {status.message}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-5">
          <EditorPanel title="Basics">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Portfolio Title" value={portfolio?.title || ''} onChange={(value) => updatePortfolio({ title: value })} />
              <Field label="Tagline" value={portfolio?.tagline || ''} onChange={(value) => updatePortfolio({ tagline: value })} />
              <Field label="Headline" value={content.headline || ''} onChange={(value) => updateContent({ headline: value })} />
              <Field label="Role / Focus" value={content.role || ''} onChange={(value) => updateContent({ role: value })} />
              <Field label="Location" value={content.location || ''} onChange={(value) => updateContent({ location: value })} />
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Theme</label>
                <select
                  value={portfolio?.theme || 'slate'}
                  onChange={(e) => updatePortfolio({ theme: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                >
                  {themeOptions.map((theme) => <option key={theme.value} value={theme.value}>{theme.label}</option>)}
                </select>
              </div>
            </div>
            <TextArea label="About Summary" value={content.summary || ''} onChange={(value) => updateContent({ summary: value })} />
            <TextArea label="About Me Bio" value={content.about || ''} onChange={(value) => updateContent({ about: value })} />
            <TextArea label="Goals and Personality" value={content.goals || ''} onChange={(value) => updateContent({ goals: value })} />
          </EditorPanel>

          <EditorPanel title="Contact Links">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Email" value={content.email || ''} onChange={(value) => updateContent({ email: value })} />
              <Field label="Phone" value={content.phone || ''} onChange={(value) => updateContent({ phone: value })} />
              <Field label="LinkedIn URL" value={content.linkedin || ''} onChange={(value) => updateContent({ linkedin: value })} />
              <Field label="GitHub URL" value={content.github || ''} onChange={(value) => updateContent({ github: value })} />
              <Field label="Website URL" value={content.website || ''} onChange={(value) => updateContent({ website: value })} />
              <Field label="Resume / CV URL" value={content.resumeUrl || ''} onChange={(value) => updateContent({ resumeUrl: value })} />
            </div>
          </EditorPanel>

          <EditorPanel title="Skills">
            <div className="space-y-3">
              {(content.skills || []).map((skill, index) => (
                <ListRow
                  key={index}
                  value={skill}
                  placeholder="Skill"
                  onChange={(value) => updateListItem('skills', index, value)}
                  onRemove={() => removeListItem('skills', index)}
                />
              ))}
              <AddButton label="Add skill" onClick={() => updateContent({ skills: [...(content.skills || []), emptySkill] })} />
            </div>
          </EditorPanel>

          <EditorPanel title="Projects">
            <div className="space-y-4">
              {(content.projects || []).map((project, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-slate-900">Project {index + 1}</p>
                    <button type="button" onClick={() => removeListItem('projects', index)} className="text-red-500 hover:text-red-700">
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3">
                    <Field label="Title" value={project.title || ''} onChange={(value) => updateProject(index, { title: value })} />
                    <TextArea label="Description" value={project.description || ''} onChange={(value) => updateProject(index, { description: value })} />
                    <Field label="Project Link" value={project.link || ''} onChange={(value) => updateProject(index, { link: value })} />
                  </div>
                </div>
              ))}
              <AddButton label="Add project" onClick={() => updateContent({ projects: [...(content.projects || []), emptyProject] })} />
            </div>
          </EditorPanel>

          <EditorPanel title="Case Studies / Work Samples">
            <div className="space-y-4">
              {(content.caseStudies || []).map((study, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-slate-900">Case Study {index + 1}</p>
                    <button type="button" onClick={() => removeListItem('caseStudies', index)} className="text-red-500 hover:text-red-700">
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3">
                    <Field label="Title" value={study.title || ''} onChange={(value) => updateCaseStudy(index, { title: value })} />
                    <TextArea label="Problem" value={study.problem || ''} onChange={(value) => updateCaseStudy(index, { problem: value })} />
                    <TextArea label="Your Process" value={study.process || ''} onChange={(value) => updateCaseStudy(index, { process: value })} />
                    <Field label="Your Specific Role" value={study.role || ''} onChange={(value) => updateCaseStudy(index, { role: value })} />
                    <TextArea label="Final Outcome" value={study.outcome || ''} onChange={(value) => updateCaseStudy(index, { outcome: value })} />
                    <Field label="Work Sample Link" value={study.link || ''} onChange={(value) => updateCaseStudy(index, { link: value })} />
                  </div>
                </div>
              ))}
              <AddButton label="Add case study" onClick={() => updateContent({ caseStudies: [...(content.caseStudies || []), emptyCaseStudy] })} />
            </div>
          </EditorPanel>

          <EditorPanel title="High-Quality Visuals">
            <div className="space-y-4">
              {(content.visuals || []).map((visual, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-slate-900">Visual {index + 1}</p>
                    <button type="button" onClick={() => removeListItem('visuals', index)} className="text-red-500 hover:text-red-700">
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3">
                    <Field label="Title" value={visual.title || ''} onChange={(value) => updateVisual(index, { title: value })} />
                    <Field label="Image / Video URL" value={visual.url || ''} onChange={(value) => updateVisual(index, { url: value })} />
                    <TextArea label="Caption" value={visual.caption || ''} onChange={(value) => updateVisual(index, { caption: value })} />
                  </div>
                </div>
              ))}
              <AddButton label="Add visual" onClick={() => updateContent({ visuals: [...(content.visuals || []), emptyVisual] })} />
            </div>
          </EditorPanel>

          <EditorPanel title="Process Documentation">
            <div className="space-y-4">
              {(content.processDocs || []).map((doc, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-slate-900">Process Item {index + 1}</p>
                    <button type="button" onClick={() => removeListItem('processDocs', index)} className="text-red-500 hover:text-red-700">
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3">
                    <Field label="Title" value={doc.title || ''} onChange={(value) => updateProcessDoc(index, { title: value })} />
                    <TextArea label="Sketches, Drafts, Prototype Notes" value={doc.description || ''} onChange={(value) => updateProcessDoc(index, { description: value })} />
                    <Field label="Prototype / Document Link" value={doc.link || ''} onChange={(value) => updateProcessDoc(index, { link: value })} />
                  </div>
                </div>
              ))}
              <AddButton label="Add process item" onClick={() => updateContent({ processDocs: [...(content.processDocs || []), emptyProcessDoc] })} />
            </div>
          </EditorPanel>

          <EditorPanel title="Achievements">
            <div className="space-y-3">
              {(content.achievements || []).map((item, index) => (
                <ListRow
                  key={index}
                  value={item}
                  placeholder="Achievement"
                  onChange={(value) => updateListItem('achievements', index, value)}
                  onRemove={() => removeListItem('achievements', index)}
                />
              ))}
              <AddButton label="Add achievement" onClick={() => updateContent({ achievements: [...(content.achievements || []), ''] })} />
            </div>
          </EditorPanel>

          <EditorPanel title="Social Proof / Testimonials">
            <div className="space-y-4">
              {(content.testimonials || []).map((testimonial, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-slate-900">Testimonial {index + 1}</p>
                    <button type="button" onClick={() => removeListItem('testimonials', index)} className="text-red-500 hover:text-red-700">
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3">
                    <TextArea label="Quote / Review / Accolade" value={testimonial.quote || ''} onChange={(value) => updateTestimonial(index, { quote: value })} />
                    <Field label="Author" value={testimonial.author || ''} onChange={(value) => updateTestimonial(index, { author: value })} />
                    <Field label="Context" value={testimonial.context || ''} onChange={(value) => updateTestimonial(index, { context: value })} />
                  </div>
                </div>
              ))}
              <AddButton label="Add testimonial" onClick={() => updateContent({ testimonials: [...(content.testimonials || []), emptyTestimonial] })} />
            </div>
          </EditorPanel>
        </section>

        <aside className="space-y-5">
          <div className="sticky top-20 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Publish</p>
            <h2 className="mt-2 text-xl font-black text-slate-900">{portfolio?.is_published ? 'Portfolio is live' : 'Draft portfolio'}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Save a draft while editing, then publish when ready. Your public page uses your username.
            </p>
            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={() => savePortfolio(false)}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <Save size={18} />
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                type="button"
                onClick={() => savePortfolio(true)}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 font-bold text-white shadow-lg shadow-amber-100 transition hover:bg-amber-600 disabled:opacity-60"
              >
                <Globe2 size={18} />
                Publish Portfolio
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

const EditorPanel = ({ title, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-black text-slate-900">{title}</h2>
    <div className="mt-4 space-y-4">{children}</div>
  </section>
);

const Field = ({ label, value, onChange }) => (
  <div>
    <label className="mb-2 block text-sm font-semibold text-slate-700">{label}</label>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
    />
  </div>
);

const TextArea = ({ label, value, onChange }) => (
  <div>
    <label className="mb-2 block text-sm font-semibold text-slate-700">{label}</label>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
      className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
    />
  </div>
);

const ListRow = ({ value, placeholder, onChange, onRemove }) => (
  <div className="flex gap-2">
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
    />
    <button type="button" onClick={onRemove} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-red-200 text-red-500 hover:bg-red-50">
      <Trash2 size={17} />
    </button>
  </div>
);

const AddButton = ({ label, onClick }) => (
  <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
    <Plus size={16} />
    {label}
  </button>
);

export default PortfolioBuilder;
