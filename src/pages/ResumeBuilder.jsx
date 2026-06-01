import React, { useEffect, useRef, useState } from 'react';
import { Download, Eye, FileText, MessageCircle, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import { buildWhatsAppShareUrl, trackPremiumEvent } from '../utils/growth';
import { buildPlanCheckoutPath } from '../utils/planCheckout';

const ATS_SCORE = 99;
const PDF_MARGIN = 16;
const PDF_LINE_HEIGHT = 6;
const PDF_SECTION_GAP = 10;

const defaultResume = {
  role: 'Frontend Developer',
  summary:
    'Frontend developer with hands-on experience in responsive web applications, reusable UI components, debugging, version control, and cross-functional collaboration. Focused on clean code, performance, accessibility, and delivery.',
  email: '',
  phone: '',
  location: 'India',
  linkedin: 'linkedin.com/in/your-profile',
  portfolio: 'portfolio.example.com',
  skills: 'React, JavaScript, TypeScript, HTML, CSS, Tailwind CSS, Git, REST API Integration, Responsive Design, Debugging, Problem Solving, Communication',
  experience1Title: 'Frontend Developer Intern',
  experience1Company: 'Self-driven Learning',
  experience1Period: '2025 - Present',
  experience1Description:
    'Built responsive interfaces, improved page structure, integrated APIs, fixed UI bugs, and delivered assignment-based projects using React and modern frontend workflows.',
  experience2Title: 'Project Team Member',
  experience2Company: 'Student Initiatives',
  experience2Period: '2024 - Present',
  experience2Description:
    'Collaborated with peers on mini-projects, documentation, presentations, testing, and delivery planning while meeting deadlines and quality expectations.',
  project1Title: 'Portfolio Website',
  project1Description:
    'Developed a personal portfolio website with responsive layouts, project showcases, contact information, and optimized user experience.',
  project2Title: 'Course or Product UI Project',
  project2Description:
    'Created a mobile-friendly web interface with reusable components, consistent styling, usability improvements, and structured content sections.',
  education:
    'Add your degree, school or college, board/university, and graduation year here.',
  achievements:
    'Mention certifications, awards, top exam scores, contests, leadership, volunteering, or notable milestones.',
};

const ResumeBuilder = () => {
  const { profile, user, isPremium, isPremiumPlus } = useAuth();
  const previewRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [resume, setResume] = useState(defaultResume);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessMode, setAccessMode] = useState('premium');

  useEffect(() => {
    const loadAccessMode = async () => {
      try {
        const { data } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'resume_builder_access')
          .maybeSingle();
        setAccessMode(data?.value === 'free' ? 'free' : 'premium');
      } finally {
        setAccessLoading(false);
      }
    };

    loadAccessMode();
  }, []);

  useEffect(() => {
    if (!profile?.id && !user?.id) return;
    trackPremiumEvent('resume_builder_viewed', 'resume_builder', { accessMode }, profile?.id || user?.id || null);
  }, [profile?.id, user?.id, accessMode]);

  useEffect(() => {
    if (!profile && !user) return;

    const storageKey = `resume_builder_${profile?.id || user?.id || 'guest'}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        setResume((prev) => ({ ...prev, ...JSON.parse(stored) }));
        return;
      } catch {
        localStorage.removeItem(storageKey);
      }
    }

    setResume((prev) => ({
      ...prev,
      email: profile?.email || user?.email || '',
      phone: profile?.phone || '',
      role: profile?.core_subject ? `${profile.core_subject} Specialist` : prev.role,
      education:
        profile?.education_level || profile?.study_stream || profile?.diploma_certificate
          ? [profile?.education_level, profile?.study_stream, profile?.diploma_certificate]
              .filter(Boolean)
              .join(' | ')
          : prev.education,
    }));
  }, [profile, user]);

  useEffect(() => {
    const storageKey = `resume_builder_${profile?.id || user?.id || 'guest'}`;
    localStorage.setItem(storageKey, JSON.stringify(resume));
  }, [resume, profile?.id, user?.id]);

  const updateField = (field, value) => {
    setResume((prev) => ({ ...prev, [field]: value }));
  };

  const downloadResume = async () => {
    if (!isPremiumPlus(profile)) return;
    setDownloading(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const contentWidth = pageWidth - PDF_MARGIN * 2;
      const fullName = profile?.full_name || user?.email?.split('@')[0] || 'Your Name';
      const safeEmail = resume.email || profile?.email || user?.email || 'yourname@gmail.com';
      const safePhone = resume.phone || '+91 98765 43210';
      const safeLocation = resume.location || 'India';
      const safeLinkedIn = resume.linkedin || 'linkedin.com/in/your-profile';
      const safePortfolio = resume.portfolio || 'portfolio.example.com';

      let y = PDF_MARGIN;

      const ensureSpace = (heightNeeded = PDF_LINE_HEIGHT) => {
        if (y + heightNeeded <= pageHeight - PDF_MARGIN) return;
        pdf.addPage();
        y = PDF_MARGIN;
      };

      const writeWrappedText = (text, options = {}) => {
        const { fontSize = 11, fontStyle = 'normal', gapAfter = 0, indent = 0 } = options;
        if (!text) return;
        pdf.setFont('helvetica', fontStyle);
        pdf.setFontSize(fontSize);
        const lines = pdf.splitTextToSize(text, contentWidth - indent);
        ensureSpace(lines.length * PDF_LINE_HEIGHT);
        pdf.text(lines, PDF_MARGIN + indent, y);
        y += lines.length * PDF_LINE_HEIGHT + gapAfter;
      };

      const writeSection = (title, body) => {
        if (!body) return;
        const normalizedBody = Array.isArray(body) ? body.filter(Boolean) : [body];
        if (!normalizedBody.length) return;
        ensureSpace(PDF_SECTION_GAP + PDF_LINE_HEIGHT * 2);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.text(title.toUpperCase(), PDF_MARGIN, y);
        y += PDF_LINE_HEIGHT + 1;
        normalizedBody.forEach((item) => {
          writeWrappedText(item, { fontSize: 11, fontStyle: 'normal', gapAfter: 2 });
        });
        y += 2;
      };

      const writeBulletList = (items) => {
        items.filter(Boolean).forEach((item) => {
          const bulletLines = pdf.splitTextToSize(item, contentWidth - 6);
          ensureSpace(bulletLines.length * PDF_LINE_HEIGHT);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(11);
          pdf.text('•', PDF_MARGIN, y);
          pdf.text(bulletLines, PDF_MARGIN + 5, y);
          y += bulletLines.length * PDF_LINE_HEIGHT + 1;
        });
      };

      const splitIntoBullets = (text) =>
        String(text || '')
          .split(/\r?\n|[.;]\s+/)
          .map((item) => item.trim())
          .filter(Boolean);

      const writeRoleSection = (title, roles) => {
        const filteredRoles = roles.filter((role) => role && [role.title, role.company, role.period, role.description].some(Boolean));
        if (!filteredRoles.length) return;
        ensureSpace(PDF_SECTION_GAP + PDF_LINE_HEIGHT * 3);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.text(title.toUpperCase(), PDF_MARGIN, y);
        y += PDF_LINE_HEIGHT + 1;
        filteredRoles.forEach((role) => {
          const heading = [role.title, role.company].filter(Boolean).join(' | ');
          writeWrappedText(heading, { fontSize: 11, fontStyle: 'bold', gapAfter: 0 });
          if (role.period) {
            writeWrappedText(role.period, { fontSize: 10, gapAfter: 1 });
          }
          writeBulletList(splitIntoBullets(role.description));
          y += 2;
        });
      };

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(20);
      pdf.text(fullName, PDF_MARGIN, y);
      y += 9;
      writeWrappedText(resume.role, { fontSize: 13, fontStyle: 'bold', gapAfter: 1 });
      writeWrappedText(`Email: ${safeEmail}`, { fontSize: 10, gapAfter: 0 });
      writeWrappedText(`Phone: ${safePhone}`, { fontSize: 10, gapAfter: 0 });
      writeWrappedText(`Location: ${safeLocation}`, { fontSize: 10, gapAfter: 0 });
      writeWrappedText(`LinkedIn: ${safeLinkedIn}`, { fontSize: 10, gapAfter: 0 });
      writeWrappedText(`Portfolio: ${safePortfolio}`, { fontSize: 10, gapAfter: 5 });

      writeSection('Professional Summary', resume.summary);
      writeSection('Skills', skillList.join(' | '));
      writeRoleSection('Professional Experience', [
        {
          title: resume.experience1Title,
          company: resume.experience1Company,
          period: resume.experience1Period,
          description: resume.experience1Description,
        },
        {
          title: resume.experience2Title,
          company: resume.experience2Company,
          period: resume.experience2Period,
          description: resume.experience2Description,
        },
      ]);
      writeRoleSection('Projects', [
        {
          title: resume.project1Title,
          company: '',
          period: '',
          description: resume.project1Description,
        },
        {
          title: resume.project2Title,
          company: '',
          period: '',
          description: resume.project2Description,
        },
      ]);
      writeSection('Education', resume.education);
      writeSection('Certifications And Achievements', resume.achievements);

      const safeName = (profile?.full_name || user?.email || 'resume')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
      pdf.save(`${safeName || 'resume'}-resume.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  const skillList = resume.skills
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (accessLoading) {
    return <LoadingSpinner message="Loading resume builder..." />;
  }

  const hasAccess = accessMode === 'free' || isPremium(profile);
  const canDownload = isPremiumPlus(profile);

  if (!hasAccess) {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-slate-950 via-nani-dark to-amber-900 p-6 md:p-8 text-white shadow-xl">
          <h1 className="text-3xl md:text-4xl font-serif font-bold">Resume Builder</h1>
          <p className="mt-3 text-slate-200">
            This feature is currently available for premium users only.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 space-y-5">
          <div>
            <p className="text-lg font-semibold">Premium access required</p>
            <p className="mt-2 text-sm">
              Admin has set Resume Builder to premium-only mode. Upgrade to Premium to open the builder. Premium Plus unlocks PDF download.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.2em]">Preview</p>
              <p className="mt-3 text-sm">Live resume preview, polished layout, and PDF export stay unlocked with premium.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.2em]">Why upgrade</p>
              <p className="mt-3 text-sm">Get direct teacher support + resume builder + premium certificates in one plan.</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="grid grid-cols-3 bg-slate-900 text-white text-sm font-semibold">
              <div className="px-4 py-3">Feature</div>
              <div className="px-4 py-3">Free</div>
              <div className="px-4 py-3">Premium</div>
            </div>
            {[
              ['Resume builder access', 'Preview only', 'Builder preview'],
              ['PDF download', 'No', 'Premium Plus'],
              ['Mentorship sessions', 'No', 'Yes'],
              ['Verified exams + certs', 'Limited', 'Yes'],
            ].map(([feature, free, premium]) => (
              <div key={feature} className="grid grid-cols-3 border-t border-slate-200 text-sm">
                <div className="px-4 py-3 font-medium text-slate-900">{feature}</div>
                <div className="px-4 py-3 text-slate-600">{free}</div>
                <div className="px-4 py-3 font-semibold text-slate-900">{premium}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to={buildPlanCheckoutPath('premium')}
              onClick={() => trackPremiumEvent('upgrade_click', 'resume_builder_gate', { accessMode }, profile?.id || user?.id || null)}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 font-bold text-white hover:bg-slate-800"
            >
              Buy Premium
            </Link>
            <Link
              to="/app/premium-status"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Compare Premium Benefits
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const resumeShareText = `I built my resume on SucessKart. Create yours here: ${window.location.origin}/register`;
  const resumeWhatsAppUrl = buildWhatsAppShareUrl(resumeShareText);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-slate-950 via-nani-dark to-amber-900 p-6 md:p-8 text-white shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
              <Sparkles size={14} />
              Resume Builder
            </p>
            <h1 className="mt-4 text-3xl md:text-4xl font-serif font-bold">Create a resume that looks premium at first glance.</h1>
            <p className="mt-3 text-slate-200">
              {canDownload
                ? 'Edit your details, review the live preview, and download a polished PDF in one place.'
                : 'Edit your details and review the live preview here. Premium Plus unlocks PDF download.'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-3 font-semibold text-white hover:bg-white/15"
            >
              <Eye size={18} />
              Preview
            </button>
            <button
              type="button"
              onClick={canDownload ? downloadResume : undefined}
              disabled={downloading || !canDownload}
              title={canDownload ? 'Download resume PDF' : 'Premium Plus required for PDF download'}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold-400 px-5 py-3 font-bold text-nani-dark hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={18} />
              {downloading ? 'Preparing PDF...' : canDownload ? 'Download' : 'Download locked'}
            </button>
            <a
              href={resumeWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackPremiumEvent('whatsapp_share', 'resume_builder', {}, profile?.id || user?.id || null)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 font-semibold text-white hover:bg-white/15"
            >
              <MessageCircle size={18} />
              Share
            </a>
          </div>
        </div>
      </div>

      {!canDownload ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Preview Only</p>
          <h2 className="mt-2 text-xl font-bold">PDF download is available on Premium Plus.</h2>
          <p className="mt-2 text-sm text-amber-900">
            Your current plan lets you build and review the resume here. Upgrade only when you want to export the PDF.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link
              to={buildPlanCheckoutPath('premium_plus')}
              onClick={() => trackPremiumEvent('upgrade_click', 'resume_builder_download_gate', { accessMode }, profile?.id || user?.id || null)}
              className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-5 py-3 font-semibold text-white hover:bg-amber-700"
            >
              Upgrade to Premium Plus
            </Link>
            <Link
              to="/app/premium-status"
              className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-5 py-3 font-semibold text-amber-900 hover:bg-amber-100"
            >
              Compare Plans
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6 items-start">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm space-y-5">
          <h2 className="text-xl font-bold text-slate-900">Resume Details</h2>
          <Field label="Target Role" value={resume.role} onChange={(value) => updateField('role', value)} />
          <Textarea label="Professional Summary" value={resume.summary} onChange={(value) => updateField('summary', value)} rows={4} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Email" value={resume.email} onChange={(value) => updateField('email', value)} />
            <Field label="Phone" value={resume.phone} onChange={(value) => updateField('phone', value)} />
            <Field label="Location" value={resume.location} onChange={(value) => updateField('location', value)} />
            <Field label="LinkedIn" value={resume.linkedin} onChange={(value) => updateField('linkedin', value)} />
          </div>
          <Field label="Portfolio / Website" value={resume.portfolio} onChange={(value) => updateField('portfolio', value)} />
          <Textarea label="Skills (comma separated)" value={resume.skills} onChange={(value) => updateField('skills', value)} rows={3} />

          <SectionTitle title="Experience" />
          <Field label="Experience 1 Role" value={resume.experience1Title} onChange={(value) => updateField('experience1Title', value)} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Experience 1 Organization" value={resume.experience1Company} onChange={(value) => updateField('experience1Company', value)} />
            <Field label="Experience 1 Period" value={resume.experience1Period} onChange={(value) => updateField('experience1Period', value)} />
          </div>
          <Textarea label="Experience 1 Description" value={resume.experience1Description} onChange={(value) => updateField('experience1Description', value)} rows={3} />
          <Field label="Experience 2 Role" value={resume.experience2Title} onChange={(value) => updateField('experience2Title', value)} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Experience 2 Organization" value={resume.experience2Company} onChange={(value) => updateField('experience2Company', value)} />
            <Field label="Experience 2 Period" value={resume.experience2Period} onChange={(value) => updateField('experience2Period', value)} />
          </div>
          <Textarea label="Experience 2 Description" value={resume.experience2Description} onChange={(value) => updateField('experience2Description', value)} rows={3} />

          <SectionTitle title="Projects" />
          <Field label="Project 1 Title" value={resume.project1Title} onChange={(value) => updateField('project1Title', value)} />
          <Textarea label="Project 1 Description" value={resume.project1Description} onChange={(value) => updateField('project1Description', value)} rows={3} />
          <Field label="Project 2 Title" value={resume.project2Title} onChange={(value) => updateField('project2Title', value)} />
          <Textarea label="Project 2 Description" value={resume.project2Description} onChange={(value) => updateField('project2Description', value)} rows={3} />

          <SectionTitle title="Education & Achievements" />
          <Textarea label="Education" value={resume.education} onChange={(value) => updateField('education', value)} rows={3} />
          <Textarea label="Achievements" value={resume.achievements} onChange={(value) => updateField('achievements', value)} rows={3} />
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-600">
            <FileText size={18} />
            <span className="font-semibold">Live Preview</span>
          </div>
          <div className="overflow-auto rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] p-4 md:p-6 shadow-inner">
            <div
              ref={previewRef}
              className="mx-auto w-full max-w-[850px] bg-white min-h-[1120px] overflow-hidden rounded-[1.5rem] border border-slate-300 shadow-2xl"
            >
              <div className="border-b border-slate-300 px-8 py-10">
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.32em] text-slate-500">Professional Resume</p>
                    <h2 className="mt-3 text-4xl font-serif font-bold text-slate-950">{profile?.full_name || user?.email?.split('@')[0] || 'Your Name'}</h2>
                    <p className="mt-2 text-xl text-slate-600">{resume.role}</p>
                  </div>
                  <div className="text-sm leading-7 text-slate-600 md:text-right">
                    <p>{resume.email || 'your.email@example.com'}</p>
                    <p>{resume.phone || '+91 00000 00000'}</p>
                    <p>{resume.location}</p>
                    <p>{resume.linkedin}</p>
                    <p>{resume.portfolio}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr] gap-0">
                <div className="px-8 py-8 space-y-8">
                  <ResumeSection title="Profile Summary">
                    <p className="text-slate-700 leading-7">{resume.summary}</p>
                  </ResumeSection>

                  <ResumeSection title="Experience">
                    <ExperienceCard
                      title={resume.experience1Title}
                      company={resume.experience1Company}
                      period={resume.experience1Period}
                      description={resume.experience1Description}
                    />
                    <ExperienceCard
                      title={resume.experience2Title}
                      company={resume.experience2Company}
                      period={resume.experience2Period}
                      description={resume.experience2Description}
                    />
                  </ResumeSection>

                  <ResumeSection title="Selected Projects">
                    <ProjectCard title={resume.project1Title} description={resume.project1Description} />
                    <ProjectCard title={resume.project2Title} description={resume.project2Description} />
                  </ResumeSection>
                </div>

                <div className="bg-slate-50/70 px-8 py-8 space-y-8 border-t md:border-t-0 md:border-l border-slate-200">
                  <ResumeSection title="Core Skills">
                    <div className="flex flex-wrap gap-2">
                      {skillList.map((skill) => (
                        <span key={skill} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </ResumeSection>

                  <ResumeSection title="Education">
                    <p className="text-slate-700 leading-7 whitespace-pre-line">{resume.education}</p>
                  </ResumeSection>

                  <ResumeSection title="Achievements">
                    <p className="text-slate-700 leading-7 whitespace-pre-line">{resume.achievements}</p>
                  </ResumeSection>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SectionTitle = ({ title }) => <h3 className="pt-2 text-sm font-bold uppercase tracking-[0.2em] text-slate-500">{title}</h3>;

const Field = ({ label, value, onChange }) => (
  <label className="block">
    <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white"
    />
  </label>
);

const Textarea = ({ label, value, onChange, rows = 4 }) => (
  <label className="block">
    <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white"
    />
  </label>
);

const ResumeSection = ({ title, children }) => (
  <section>
    <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-slate-600">{title}</h3>
    <div className="mt-4 space-y-4">{children}</div>
  </section>
);

const ExperienceCard = ({ title, company, period, description }) => (
  <div className="rounded-2xl border border-slate-200 p-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h4 className="text-lg font-bold text-slate-900">{title}</h4>
        <p className="text-sm font-semibold text-slate-600">{company}</p>
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{period}</p>
    </div>
    <p className="mt-3 text-sm leading-7 text-slate-700">{description}</p>
  </div>
);

const ProjectCard = ({ title, description }) => (
  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200">
    <h4 className="text-base font-bold text-slate-900">{title}</h4>
    <p className="mt-2 text-sm leading-7 text-slate-700">{description}</p>
  </div>
);

export default ResumeBuilder;
