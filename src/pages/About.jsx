import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Mail, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '../supabaseClient';

const About = () => {
  const [supportEmail, setSupportEmail] = useState('');

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

  const cards = [
    {
      icon: BookOpen,
      title: 'Learning Platform',
      description: 'SucessKart brings courses, guided practice, assessments, and certificates into one structured student flow.',
    },
    {
      icon: Users,
      title: 'Mentor Support',
      description: 'Students can combine self-learning with mentor guidance, doubt clearing, and practical growth support.',
    },
    {
      icon: ShieldCheck,
      title: 'Verified Outcomes',
      description: 'Certificate verification, tracked progress, and exam-linked outcomes help build trust around learner achievements.',
    },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fde68a_0%,#fff8e1_18%,#f8fafc_52%,#e2e8f0_100%)] text-slate-900">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-6 sm:px-6">
        <Link to="/" className="flex items-center gap-3">
          <div className="h-12 w-12 overflow-hidden rounded-full shadow-sm">
            <img
              src="/sucesskart-logo.svg"
              alt="SucessKart logo"
              className="h-full w-full rounded-full object-contain mix-blend-multiply"
            />
          </div>
          <div className="font-serif text-2xl font-bold text-nani-dark">SucessKart</div>
        </Link>
      </nav>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-16">
        <div className="rounded-[2rem] border border-slate-200 bg-white/85 p-8 shadow-xl md:p-10">
          <div className="mb-6">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Back to Home
            </Link>
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">About SucessKart</p>
          <h1 className="mt-4 font-serif text-4xl font-bold text-nani-dark md:text-5xl">Career-first learning with guidance, practice, and proof.</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600">
            SucessKart is built for students who want more than just video lessons. The platform combines learning paths,
            teacher support, assessments, certificate verification, and growth tools in one account experience.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register" className="btn-gold">Create Account</Link>
            <Link
              to="/verify"
              state={{ fromAbout: true }}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Verify Certificate
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <div className="grid gap-5 md:grid-cols-3">
          {cards.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Icon size={22} />
              </div>
              <h2 className="mt-4 text-xl font-bold text-slate-900">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-8 text-white shadow-xl md:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Contact</p>
          <h2 className="mt-3 text-3xl font-serif font-bold">Need help or want more details?</h2>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-5">
            <div className="flex items-center gap-3">
              <Mail size={18} className="text-amber-300" />
              <div>
                <p className="text-sm text-slate-300">Support email</p>
                {supportEmail ? (
                  <a href={`mailto:${supportEmail}`} className="text-lg font-semibold text-white hover:text-amber-200">
                    {supportEmail}
                  </a>
                ) : (
                  <p className="text-lg font-semibold text-white">Contact email not set yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
