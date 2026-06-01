import React from 'react';
import { Link } from 'react-router-dom';

const AuthShell = ({
  title,
  subtitle,
  highlights = [],
  footerLabel,
  footerLinkTo,
  footerLinkText,
  rightTitle,
  rightSubtitle,
  progress,
  panelClassName = '',
  children,
}) => {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fde68a_0%,#fff8e1_18%,#f8fafc_52%,#e2e8f0_100%)] px-4 py-8 sm:px-6 md:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl grid-cols-1 items-stretch gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:gap-10">
        <aside className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-amber-900 p-8 text-white shadow-2xl md:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.34),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(14,116,144,0.22),transparent_40%)] pointer-events-none" />
          <div className="relative z-10 flex h-full flex-col">
            <div className="inline-flex w-fit items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 shadow-sm backdrop-blur">
              <img
                src="/sucesskart-logo.svg"
                alt="SucessKart logo"
                className="h-10 w-10 rounded-full object-contain"
              />
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-amber-200">SucessKart</p>
                <p className="font-serif text-lg font-bold text-white">Career-first learning</p>
              </div>
            </div>

            <div className="mt-6 inline-flex w-fit items-center rounded-full border border-amber-300/25 bg-amber-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
              Public access
            </div>

            <h1 className="mt-5 font-serif text-3xl font-bold leading-tight md:text-5xl">{title}</h1>
            <p className="mt-4 max-w-md text-sm text-slate-200 md:text-base">{subtitle}</p>

            {highlights.length > 0 ? (
              <div className="mt-8 space-y-3">
                {highlights.map(({ icon: Icon, text }) => (
                  <div
                    key={text}
                    className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-slate-100 shadow-sm backdrop-blur"
                  >
                    {Icon ? <Icon size={18} className="mt-0.5 shrink-0 text-amber-300" /> : null}
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {footerLabel && footerLinkTo && footerLinkText ? (
              <div className="mt-auto pt-8">
                <p className="text-xs text-slate-300">{footerLabel}</p>
                <Link
                  to={footerLinkTo}
                  className="mt-2 inline-flex text-sm font-semibold text-amber-300 transition-colors hover:text-amber-200"
                >
                  {footerLinkText}
                </Link>
              </div>
            ) : null}
          </div>
        </aside>

        <section className={`relative overflow-hidden rounded-3xl border border-white/80 bg-white/90 p-6 shadow-2xl backdrop-blur sm:p-8 md:p-10 ${panelClassName}`}>
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-amber-100/70 via-white to-cyan-100/50" />
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-100/70 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-cyan-100/70 blur-3xl pointer-events-none" />
          <div className="relative z-10">
            {(rightTitle || rightSubtitle) && (
              <div className="mb-6 rounded-3xl border border-slate-200/80 bg-white/85 px-5 py-5 text-center shadow-sm">
                {rightTitle ? <h2 className="font-serif text-2xl font-bold text-nani-dark md:text-3xl">{rightTitle}</h2> : null}
                {rightSubtitle ? <p className="mt-2 text-sm text-slate-500">{rightSubtitle}</p> : null}
              </div>
            )}

            {Array.isArray(progress) && progress.length > 0 ? (
              <div className="mb-6 grid gap-2 rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm" style={{ gridTemplateColumns: `repeat(${progress.length}, minmax(0, 1fr))` }}>
                {progress.map((active, index) => (
                  <div key={index} className={`h-2 rounded-full ${active ? 'bg-amber-500' : 'bg-slate-200'}`} />
                ))}
              </div>
            ) : null}

            {children}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AuthShell;
