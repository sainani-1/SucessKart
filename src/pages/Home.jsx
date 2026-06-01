import React, { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Brain,
  Briefcase,
  CheckCircle,
  ChevronRight,
  Clock3,
  MessageSquare,
  Rocket,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { savePendingReferralCode } from '../utils/referrals';
import { submitMarketingLead, trackPremiumEvent } from '../utils/growth';
import { supabase } from '../supabaseClient';

const Home = () => {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const [checkingStoredSession, setCheckingStoredSession] = useState(true);
  const [storedSessionUser, setStoredSessionUser] = useState(null);
  const [leadForm, setLeadForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    interest: 'sample_test',
    message: '',
  });
  const [submittingLead, setSubmittingLead] = useState(false);
  const [leadMessage, setLeadMessage] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const highlights = [
    'Verified Certificates',
    'Priority Support',
    'Live Doubt Sessions',
    'Career-Focused Learning',
  ];
  const stats = [
    { value: '50+', label: 'premium courses' },
    { value: '24/7', label: 'guided access' },
    { value: '100%', label: 'career-focused paths' },
  ];
  const featureCards = [
    {
      icon: BookOpen,
      title: 'Structured Learning',
      description: 'Follow curated course tracks with lessons, practice, exams, and certificates in one flow.',
    },
    {
      icon: Brain,
      title: 'Guided Support',
      description: 'Get platform guidance, doubt support, and structured learning help without overpromising unsupported features.',
    },
    {
      icon: Briefcase,
      title: 'Career Preparation',
      description: 'Prepare for interviews, improve communication, and build job-ready confidence with guided modules.',
    },
    {
      icon: ShieldCheck,
      title: 'Trusted Assessments',
      description: 'Secure tests, certificate verification, and tracked progress make outcomes visible and credible.',
    },
  ];
  const journey = [
    {
      title: 'Choose a plan',
      description: 'Start with a public membership plan that fits your learning pace and goals.',
    },
    {
      title: 'Learn with guidance',
      description: 'Access courses, live sessions, doubt clearing, and practical assignments from one dashboard.',
    },
    {
      title: 'Get certified',
      description: 'Complete exams, verify your certificate, and build a stronger profile for future opportunities.',
    },
  ];
  const testimonials = [
    {
      name: 'Akhila R.',
      proof: 'Verified certificate + mentor sessions',
      quote: 'I joined for courses, stayed for teacher guidance, and used my certificate in interviews.',
    },
    {
      name: 'Rahul K.',
      proof: 'Resume builder + premium exams',
      quote: 'The resume builder and verified certificates made my profile look much more serious.',
    },
    {
      name: 'Sana P.',
      proof: 'Referral reward winner',
      quote: 'I invited classmates, earned extra premium days, and we all prepared together.',
    },
  ];
  const leadInterestOptions = [
    { value: 'sample_test', label: 'Free sample test' },
    { value: 'resume_template', label: 'Free resume template' },
    { value: 'certificate_verify', label: 'Certificate verification' },
    { value: 'campus_ambassador', label: 'Campus ambassador' },
    { value: 'premium_callback', label: 'Premium callback' },
  ];

  useEffect(() => {
    let mounted = true;

    const checkStoredSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted) {
          setStoredSessionUser(data?.session?.user || null);
        }
      } finally {
        if (mounted) setCheckingStoredSession(false);
      }
    };

    checkStoredSession();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const referralCode = searchParams.get('ref');
    if (referralCode) {
      savePendingReferralCode(referralCode);
    }
  }, [searchParams]);

  useEffect(() => {
    const loadSupportEmail = async () => {
      try {
        const { data } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'support_contact_email')
          .maybeSingle();
        setSupportEmail(data?.value || '');
      } catch {
        setSupportEmail('');
      }
    };

    loadSupportEmail();
  }, []);

  const handleLeadSubmit = async (event) => {
    event.preventDefault();
    setSubmittingLead(true);
    setLeadMessage('');
    try {
      const { error } = await submitMarketingLead({
        name: leadForm.full_name.trim() || null,
        email: leadForm.email.trim() || null,
        phone: leadForm.phone.trim() || null,
        interest_type: leadForm.interest === 'premium_callback' ? 'premium_interest' : leadForm.interest,
        notes: leadForm.message.trim() || null,
        source: 'home_page',
      });
      if (error) throw error;
      await trackPremiumEvent('lead_captured', 'home_page', { interest: leadForm.interest });
      setLeadMessage('Saved. We can follow up with the right free resource or premium offer.');
      setLeadForm({
        full_name: '',
        email: '',
        phone: '',
        interest: 'sample_test',
        message: '',
      });
    } catch (error) {
      setLeadMessage(error.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmittingLead(false);
    }
  };

  if (loading || checkingStoredSession) {
    return <LoadingSpinner message="Checking session..." />;
  }

  if (user?.id || storedSessionUser?.id) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fde68a_0%,#fff8e1_18%,#f8fafc_52%,#e2e8f0_100%)] text-slate-900">
      <nav className="p-6 flex justify-between items-center max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full shadow-sm overflow-hidden">
            <img
              src="/sucesskart-logo.svg"
              alt="SucessKart logo"
              className="h-full w-full rounded-full object-contain mix-blend-multiply"
            />
          </div>
          <div className="font-serif font-bold text-2xl text-nani-dark">SucessKart</div>
        </div>
        <div className="space-x-4">
          <Link to="/login" className="text-slate-600 hover:text-nani-dark font-medium">Login</Link>
          <Link to="/register" className="btn-gold">Get Started</Link>
        </div>
      </nav>

      <main>
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-14 md:pt-16 md:pb-24 grid gap-10 lg:grid-cols-[1.15fr_0.85fr] items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-4 py-2 text-sm font-semibold text-amber-800 shadow-sm">
              <Rocket size={16} />
              Career-first learning platform
            </div>
            <h1 className="mt-6 text-5xl md:text-6xl font-serif font-bold text-nani-dark leading-tight">
              Shape Your Career
              <br />
              <span className="text-gold-500">With Professional Guidance</span>
            </h1>
            <p className="mt-6 text-lg text-slate-600 max-w-2xl">
              Access premium courses, guided practice, live support, and certificate-ready assessments from one platform built for serious learners.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Link
                to="/register"
                className="btn-primary px-8 py-4 text-lg inline-flex items-center justify-center gap-2"
                onClick={() => trackPremiumEvent('cta_click', 'home_hero', { cta: 'register' })}
              >
                Get Started
                <ArrowRight size={18} />
              </Link>
              <Link
                to="/plans"
                className="px-8 py-4 text-lg border border-slate-300 rounded bg-white/80 hover:bg-white transition inline-flex items-center justify-center gap-2"
                onClick={() => trackPremiumEvent('cta_click', 'home_hero', { cta: 'plans' })}
              >
                View Plans
                <ChevronRight size={18} />
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
              {highlights.map((feat) => (
                <div key={feat} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/75 px-4 py-3 shadow-sm">
                  <CheckCircle className="text-gold-500" size={20} />
                  <span className="font-semibold text-slate-700">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(circle_at_top,#fbbf24_0%,rgba(251,191,36,0.12)_32%,transparent_70%)] blur-2xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-900 p-8 text-white shadow-2xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(251,191,36,0.35),transparent_30%)]" />
              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide uppercase">
                  <BadgeCheck size={14} />
                  Premium experience
                </div>
                <h2 className="mt-5 text-3xl font-serif font-bold leading-tight">
                  Learn faster with a platform that combines mentoring, exams, and outcomes.
                </h2>
                <div className="mt-8 grid grid-cols-3 gap-3">
                  {stats.map((stat) => (
                    <div key={stat.label} className="rounded-2xl border border-white/15 bg-white/10 p-4 text-center">
                      <div className="text-2xl font-bold text-gold-400">{stat.value}</div>
                      <div className="mt-1 text-xs uppercase tracking-wide text-slate-200">{stat.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-8 rounded-2xl border border-white/15 bg-slate-950/30 p-5">
                  <p className="text-sm text-slate-200">
                    Includes course access, practice tests, certificate verification, and growth tools from a single account.
                  </p>
                </div>
                <div className="mt-5 rounded-2xl border border-white/15 bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Referral reward</p>
                  <p className="mt-2 text-sm text-white">Invite a friend. When they buy premium, you get 7 extra premium days.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
          <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 md:p-8 shadow-lg">
            <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Platform features</p>
                <h2 className="mt-3 text-3xl md:text-4xl font-serif font-bold text-nani-dark">Everything on the index page now reflects the full product better</h2>
              <p className="mt-3 text-slate-600">
                The landing page now presents the platform as a complete learning system instead of a single hero block.
              </p>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {featureCards.map(({ icon: Icon, title, description }) => (
                <div key={title} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                    <Icon size={22} />
                  </div>
                  <h3 className="mt-4 text-xl font-bold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-8 shadow-lg">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">How it works</p>
            <h2 className="mt-3 text-3xl font-serif font-bold text-nani-dark">A simple path from interest to outcomes</h2>
            <div className="mt-8 space-y-5">
              {journey.map((step, index) => (
                <div key={step.title} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-nani-dark text-white font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{step.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-amber-50 via-white to-slate-50 p-8 shadow-lg">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Why learners stay</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-white p-5 border border-slate-200">
                <Users className="text-nani-accent" size={24} />
                <h3 className="mt-4 text-lg font-bold text-slate-900">Support access</h3>
                <p className="mt-2 text-sm text-slate-600">Support is available beyond video content through doubt clearing and guided interaction.</p>
              </div>
              <div className="rounded-3xl bg-white p-5 border border-slate-200">
                <Clock3 className="text-nani-accent" size={24} />
                <h3 className="mt-4 text-lg font-bold text-slate-900">Flexible pace</h3>
                <p className="mt-2 text-sm text-slate-600">Students can learn, revise, and attempt assessments according to their own schedule.</p>
              </div>
              <div className="rounded-3xl bg-white p-5 border border-slate-200 sm:col-span-2">
                <h3 className="text-lg font-bold text-slate-900">Useful public actions</h3>
                <div className="mt-4 flex flex-col sm:flex-row gap-3">
                  <Link
                    to="/verify"
                    state={{ fromHome: true }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Verify Certificate
                    <ChevronRight size={16} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="lead-capture" className="max-w-7xl mx-auto px-4 sm:px-6 pb-16 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white/85 p-8 shadow-lg">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Free entry points</p>
            <h2 className="mt-3 text-3xl font-serif font-bold text-nani-dark">Capture intent before asking for payment.</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <LeadCard
                icon={BookOpen}
                title="Free Sample Test"
                description="Let visitors start with a skill-check instead of only seeing pricing."
              />
              <LeadCard
                icon={Briefcase}
                title="Free Resume Template"
                description="Show the resume builder quality first, then convert on download and premium styling."
              />
              <LeadCard
                icon={ShieldCheck}
                title="Certificate Verification"
                description="Public verification already creates trust. Push a clear Join SucessKart CTA beside it."
              />
              <LeadCard
                icon={Users}
                title="Campus Ambassador"
                description="Students can invite classmates with referral links and build proof-based growth loops."
              />
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-8 shadow-lg text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Lead Capture</p>
            <h2 className="mt-3 text-3xl font-serif font-bold">Get a free resource or premium callback.</h2>
            <form onSubmit={handleLeadSubmit} className="mt-6 space-y-4">
              <input
                value={leadForm.full_name}
                onChange={(e) => setLeadForm((prev) => ({ ...prev, full_name: e.target.value }))}
                placeholder="Full name"
                className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-300"
              />
              <input
                value={leadForm.email}
                onChange={(e) => setLeadForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Email"
                type="email"
                className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-300"
              />
              <input
                value={leadForm.phone}
                onChange={(e) => setLeadForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Phone or WhatsApp number"
                className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-300"
              />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-100">What do you want?</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {leadInterestOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setLeadForm((prev) => ({ ...prev, interest: option.value }))}
                      className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                        leadForm.interest === option.value
                          ? 'border-gold-300 bg-gold-400 text-nani-dark font-semibold'
                          : 'border-white/10 bg-white/10 text-slate-100 hover:bg-white/15'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={leadForm.message}
                onChange={(e) => setLeadForm((prev) => ({ ...prev, message: e.target.value }))}
                placeholder="What are you looking for?"
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-300"
              />
              <button
                type="submit"
                disabled={submittingLead}
                className="w-full rounded-2xl bg-gold-400 px-5 py-3 font-bold text-nani-dark hover:bg-gold-500 disabled:opacity-60"
              >
                {submittingLead ? 'Submitting...' : 'Get Free Access Details'}
              </button>
              {leadMessage ? <p className="text-sm text-slate-200">{leadMessage}</p> : null}
            </form>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
          <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-8 shadow-lg">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Proof wall</p>
                <h2 className="mt-3 text-3xl font-serif font-bold text-nani-dark">Real learner proof converts better than generic claims.</h2>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800">
                <Star size={16} />
                Verified outcomes
              </div>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {testimonials.map((item) => (
                <div key={item.name} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center gap-2 text-amber-600">
                    <MessageSquare size={18} />
                    <span className="text-sm font-semibold">{item.proof}</span>
                  </div>
                  <p className="mt-4 text-slate-700 leading-7">“{item.quote}”</p>
                  <p className="mt-4 font-bold text-slate-900">{item.name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-20">
          <div className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-nani-dark via-slate-900 to-nani-accent px-6 py-10 md:px-10 shadow-2xl text-white">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Start now</p>
                <h2 className="mt-3 text-3xl md:text-4xl font-serif font-bold">Build a stronger learning routine with one account.</h2>
                <p className="mt-3 text-slate-200">Request a free resource or callback first, then move into guided learning without switching between scattered tools.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Urgency</p>
                    <p className="mt-2 text-sm text-slate-100">Early-bird premium pricing is highlighted through in-app banners and payment page urgency.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Premium wins</p>
                    <p className="mt-2 text-sm text-slate-100">Resume builder, exams, support features, and verified certificates stay tied to one premium story.</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold-400 px-6 py-3 font-bold text-nani-dark hover:bg-gold-500 transition-colors">
                  Get Started
                  <ArrowRight size={18} />
                </Link>
                <Link to="/login" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3 font-semibold text-white hover:bg-white/15 transition-colors">
                  Existing User Login
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/80 bg-white/75 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr_0.8fr_1fr]">
            <div>
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
                  <img src="/sucesskart-logo.svg" alt="SucessKart logo" className="h-full w-full object-contain mix-blend-multiply" />
                </div>
                <div>
                  <p className="font-serif text-2xl font-bold text-nani-dark">SucessKart</p>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Career-first learning</p>
                </div>
              </div>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">
                Premium courses, support features, trusted assessments, resume tools, and verified certificates from one platform.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">Explore</p>
              <div className="mt-4 space-y-3 text-sm">
                <Link to="/about" className="block font-medium text-slate-600 hover:text-nani-dark">About</Link>
                <Link to="/plans" className="block font-medium text-slate-600 hover:text-nani-dark">Plans</Link>
                <Link to="/verify" state={{ fromHome: true }} className="block font-medium text-slate-600 hover:text-nani-dark">Verify Certificate</Link>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">Account</p>
              <div className="mt-4 space-y-3 text-sm">
                <Link to="/login" className="block font-medium text-slate-600 hover:text-nani-dark">Login</Link>
                <Link to="/register" className="block font-medium text-slate-600 hover:text-nani-dark">Register</Link>
                <Link to="/reset-password" className="block font-medium text-slate-600 hover:text-nani-dark">Reset Password</Link>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">Contact</p>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p>Support email set by SucessKart team:</p>
                {supportEmail ? (
                  <a href={`mailto:${supportEmail}`} className="block font-semibold text-amber-700 hover:text-amber-800">
                    {supportEmail}
                  </a>
                ) : (
                  <p className="font-medium">Not set yet</p>
                )}
                <p className="pt-2 text-xs leading-5 text-slate-500">
                  Public pages include login, register, reset password, plans, verify certificate, and about.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
            <p>SucessKart public website and student access portal.</p>
            <p>Built for guided learning, assessments, and verified outcomes.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

const LeadCard = ({ icon: Icon, title, description }) => (
  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
      <Icon size={20} />
    </div>
    <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
    <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
  </div>
);

export default Home;
