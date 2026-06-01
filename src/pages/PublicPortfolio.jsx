import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Award, ExternalLink, Github, Globe2, Linkedin, Mail, Phone, ShieldCheck } from 'lucide-react';
import { supabase } from '../supabaseClient';
import AvatarImage from '../components/AvatarImage';
import LoadingSpinner from '../components/LoadingSpinner';

const themeClass = {
  slate: {
    hero: 'from-slate-950 via-slate-900 to-amber-800',
    accent: 'text-amber-300',
    button: 'bg-amber-500 hover:bg-amber-600',
  },
  emerald: {
    hero: 'from-emerald-950 via-slate-900 to-teal-700',
    accent: 'text-emerald-300',
    button: 'bg-emerald-500 hover:bg-emerald-600',
  },
  amber: {
    hero: 'from-zinc-950 via-stone-900 to-orange-700',
    accent: 'text-orange-300',
    button: 'bg-orange-500 hover:bg-orange-600',
  },
};

const toExternalUrl = (value) => {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^(mailto:|tel:|https?:\/\/)/i.test(url)) return url;
  return `https://${url}`;
};

const isImageUrl = (value) => /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(String(value || ''));

const generateDeterministicCode = (seed) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  let code = '';
  for (let i = 0; i < 12; i += 1) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    code += alphabet[hash % alphabet.length];
  }
  return code;
};

const formatCertificateId = (cert) => {
  const date = cert?.issued_at ? new Date(cert.issued_at) : new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const random = generateDeterministicCode(String(cert?.id ?? `${y}${m}${d}`));
  return `SucessKart-${y}-${m}-${d}-${random}`;
};

const PublicPortfolio = () => {
  const { username } = useParams();
  const [loading, setLoading] = useState(true);
  const [portfolio, setPortfolio] = useState(null);
  const [profile, setProfile] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [error, setError] = useState('');

  const decodedUsername = useMemo(() => decodeURIComponent(username || ''), [username]);
  const content = portfolio?.content || {};
  const theme = themeClass[portfolio?.theme] || themeClass.slate;
  const resumeUrl = toExternalUrl(content.resumeUrl || content.cvUrl || content.resume || '');

  useEffect(() => {
    let active = true;

    const loadPortfolio = async () => {
      setLoading(true);
      setError('');
      try {
        const { data, error: fetchError } = await supabase
          .from('student_portfolios')
          .select('*')
          .ilike('username', decodedUsername)
          .eq('is_published', true)
          .maybeSingle();
        if (fetchError) throw fetchError;
        if (!active) return;
        if (!data) {
          setPortfolio(null);
          setError('This portfolio is not published yet.');
          return;
        }

        setPortfolio(data);
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, core_subject, education_level, study_stream')
          .eq('id', data.user_id)
          .maybeSingle();
        if (active) setProfile(profileData || null);

        const { data: certRows } = await supabase
          .from('certificates')
          .select('id, course_id, issued_at, revoked_at, course:courses!certificates_course_id_fkey(title, category)')
          .eq('user_id', data.user_id)
          .is('revoked_at', null)
          .order('issued_at', { ascending: false });
        if (active) setCertificates(certRows || []);
      } catch (err) {
        if (!active) return;
        setError(err.message?.includes('student_portfolios') ? 'Portfolio publishing is not configured yet.' : err.message || 'Could not load portfolio.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPortfolio();
    return () => {
      active = false;
    };
  }, [decodedUsername]);

  if (loading) return <LoadingSpinner message="Opening portfolio..." />;

  if (error || !portfolio) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Globe2 size={26} />
          </div>
          <h1 className="mt-5 text-2xl font-black text-slate-900">Portfolio unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{error || 'This portfolio could not be found.'}</p>
          <Link to="/" className="mt-6 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">
            Go to SucessKart
          </Link>
        </div>
      </div>
    );
  }

  const links = [
    { label: 'Email', href: content.email ? `mailto:${content.email}` : '', icon: Mail },
    { label: 'Phone', href: content.phone ? `tel:${content.phone}` : '', icon: Phone },
    { label: 'LinkedIn', href: toExternalUrl(content.linkedin), icon: Linkedin },
    { label: 'GitHub', href: toExternalUrl(content.github), icon: Github },
    { label: 'Website', href: toExternalUrl(content.website), icon: ExternalLink },
    { label: 'Resume / CV', href: resumeUrl, icon: ExternalLink },
  ].filter((item) => item.href);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <section className={`bg-gradient-to-br ${theme.hero} px-4 py-12 text-white sm:py-16`}>
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_320px] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-white">
              <Globe2 size={14} />
              SucessKart Portfolio
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">{content.headline || portfolio.title}</h1>
            <p className={`mt-4 text-xl font-bold ${theme.accent}`}>{content.role || portfolio.tagline || profile?.core_subject || 'Student'}</p>
            {content.summary ? <p className="mt-5 max-w-3xl text-base leading-8 text-slate-200">{content.summary}</p> : null}
            <div className="mt-7 flex flex-wrap gap-3">
              {links.map((item) => {
                const Icon = item.icon;
                return (
                  <a key={item.label} href={item.href} target={item.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={`inline-flex items-center gap-2 rounded-xl ${theme.button} px-4 py-3 text-sm font-bold text-white transition`}>
                    <Icon size={17} />
                    {item.label}
                  </a>
                );
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur">
            <AvatarImage
              userId={profile?.id || portfolio.user_id}
              avatarUrl={profile?.avatar_url}
              alt={profile?.full_name || portfolio.username}
              fallbackName={profile?.full_name || portfolio.username}
              className="h-28 w-28 rounded-2xl border-2 border-white/30 object-cover"
            />
            <h2 className="mt-4 text-2xl font-black">{profile?.full_name || portfolio.username}</h2>
            <p className="mt-1 text-sm text-slate-300">@{portfolio.username}</p>
            {content.location ? <p className="mt-3 text-sm text-slate-200">{content.location}</p> : null}
            {profile?.education_level ? <p className="mt-2 text-sm text-slate-300">{profile.education_level}{profile.study_stream ? `, ${profile.study_stream}` : ''}</p> : null}
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-100">
              <ShieldCheck size={15} />
              SucessKart verified profile
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        {(content.about || content.goals) ? (
          <section className="grid gap-4 lg:grid-cols-2">
            {content.about ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-black">About Me</h2>
                <p className="mt-4 text-sm leading-7 text-slate-600">{content.about}</p>
              </div>
            ) : null}
            {content.goals ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-black">Goals and Personality</h2>
                <p className="mt-4 text-sm leading-7 text-slate-600">{content.goals}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {resumeUrl ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Resume / CV</p>
                <h2 className="mt-2 text-2xl font-black text-slate-900">Professional history</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  View or download the resume/CV for full education, skills, and work details.
                </p>
              </div>
              <a
                href={resumeUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                Open Resume / CV
                <ExternalLink size={16} />
              </a>
            </div>
          </section>
        ) : null}

        {certificates.length ? (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                  <ShieldCheck size={14} />
                  Verified SucessKart Proof
                </p>
                <h2 className="mt-2 text-2xl font-black text-slate-900">Certificates earned on SucessKart</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  These certificates are pulled from SucessKart records and shown only when active.
                </p>
              </div>
              <span className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">{certificates.length} verified</span>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {certificates.map((cert) => (
                <div key={cert.id} className="rounded-xl border border-emerald-200 bg-white p-4">
                  <p className="flex items-center gap-2 font-bold text-slate-900">
                    <Award size={18} className="text-emerald-600" />
                    {cert.course?.title || 'Verified SucessKart Certificate'}
                  </p>
                  {cert.course?.category ? <p className="mt-1 text-xs text-slate-500">{cert.course.category}</p> : null}
                  <p className="mt-2 break-all font-mono text-xs font-semibold text-emerald-700">
                    Verify ID: {formatCertificateId(cert)}
                  </p>
                  {cert.issued_at ? <p className="mt-2 text-sm font-semibold text-emerald-700">Issued {new Date(cert.issued_at).toLocaleDateString('en-IN')}</p> : null}
                  <Link
                    to={`/verify/${encodeURIComponent(formatCertificateId(cert))}`}
                    className="mt-3 inline-flex rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    Verify Certificate
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {(content.skills || []).filter(Boolean).length ? (
          <section>
            <h2 className="text-2xl font-black">Skills</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {(content.skills || []).filter(Boolean).map((skill, index) => (
                <span key={`${skill}-${index}`} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm">
                  {skill}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {(content.caseStudies || []).filter((study) => study?.title || study?.problem || study?.process || study?.outcome).length ? (
          <section>
            <h2 className="text-2xl font-black">Case Studies / Work Samples</h2>
            <div className="mt-4 grid gap-5">
              {(content.caseStudies || []).filter((study) => study?.title || study?.problem || study?.process || study?.outcome).map((study, index) => (
                <article key={index} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <h3 className="text-xl font-black">{study.title || `Case Study ${index + 1}`}</h3>
                    {study.link ? (
                      <a href={toExternalUrl(study.link)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-amber-700 hover:text-amber-800">
                        View work
                        <ExternalLink size={15} />
                      </a>
                    ) : null}
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <CaseBlock title="Problem" value={study.problem} />
                    <CaseBlock title="My Role" value={study.role} />
                    <CaseBlock title="Process" value={study.process} />
                    <CaseBlock title="Outcome" value={study.outcome} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {(content.projects || []).filter((project) => project?.title || project?.description).length ? (
          <section>
            <h2 className="text-2xl font-black">Projects</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {(content.projects || []).filter((project) => project?.title || project?.description).map((project, index) => (
                <article key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-black">{project.title || 'Untitled Project'}</h3>
                  {project.description ? <p className="mt-3 text-sm leading-6 text-slate-600">{project.description}</p> : null}
                  {project.link ? (
                    <a href={toExternalUrl(project.link)} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-amber-700 hover:text-amber-800">
                      View project
                      <ExternalLink size={15} />
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {(content.visuals || []).filter((visual) => visual?.url || visual?.caption || visual?.title).length ? (
          <section>
            <h2 className="text-2xl font-black">Visual Work</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {(content.visuals || []).filter((visual) => visual?.url || visual?.caption || visual?.title).map((visual, index) => {
                const visualUrl = toExternalUrl(visual.url);
                return (
                  <article key={index} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    {visualUrl && isImageUrl(visualUrl) ? (
                      <img src={visualUrl} alt={visual.title || 'Portfolio visual'} className="h-64 w-full object-cover" />
                    ) : visualUrl ? (
                      <div className="flex h-40 items-center justify-center bg-slate-100">
                        <a href={visualUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800">
                          Open visual
                          <ExternalLink size={15} />
                        </a>
                      </div>
                    ) : null}
                    <div className="p-5">
                      <h3 className="font-black">{visual.title || `Visual ${index + 1}`}</h3>
                      {visual.caption ? <p className="mt-2 text-sm leading-6 text-slate-600">{visual.caption}</p> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {(content.processDocs || []).filter((doc) => doc?.title || doc?.description || doc?.link).length ? (
          <section>
            <h2 className="text-2xl font-black">Process Documentation</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {(content.processDocs || []).filter((doc) => doc?.title || doc?.description || doc?.link).map((doc, index) => (
                <article key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-black">{doc.title || `Process Item ${index + 1}`}</h3>
                  {doc.description ? <p className="mt-3 text-sm leading-6 text-slate-600">{doc.description}</p> : null}
                  {doc.link ? (
                    <a href={toExternalUrl(doc.link)} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-amber-700 hover:text-amber-800">
                      View prototype/document
                      <ExternalLink size={15} />
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {(content.achievements || []).filter(Boolean).length ? (
          <section>
            <h2 className="text-2xl font-black">Achievements</h2>
            <div className="mt-4 grid gap-3">
              {(content.achievements || []).filter(Boolean).map((item, index) => (
                <div key={`${item}-${index}`} className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-700 shadow-sm">
                  {item}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {(content.testimonials || []).filter((item) => item?.quote || item?.author).length ? (
          <section>
            <h2 className="text-2xl font-black">Social Proof / Testimonials</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {(content.testimonials || []).filter((item) => item?.quote || item?.author).map((item, index) => (
                <figure key={index} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  {item.quote ? <blockquote className="text-sm leading-7 text-slate-700">"{item.quote}"</blockquote> : null}
                  <figcaption className="mt-4">
                    <p className="font-black text-slate-900">{item.author || 'Reviewer'}</p>
                    {item.context ? <p className="text-sm text-slate-500">{item.context}</p> : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
};

const CaseBlock = ({ title, value }) => {
  if (!value) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
};

export default PublicPortfolio;
