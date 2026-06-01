import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { Briefcase, ExternalLink, Plus, X, Linkedin, Globe, Award, Lock } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import AlertModal from '../components/AlertModal';
import { hasPremiumAccess } from '../utils/premium';
import { buildPlanCheckoutPath } from '../utils/planCheckout';

const SOURCES = ['LinkedIn', 'Wellfound', 'Internshala', 'Startup Communities', 'Other'];

const sourceIcons = {
  'LinkedIn': Linkedin,
  'Wellfound': Globe,
  'Internshala': Globe,
  'Startup Communities': Briefcase,
  'Other': Globe,
};

const formatDate = (val) => val ? new Date(val).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const InternshipBoard = () => {
  const { profile } = useAuth();
  const role = profile?.role;
  const isStaff = role === 'admin' || role === 'teacher';
  const hasAccess = hasPremiumAccess(profile);

  const [internships, setInternships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

  const [form, setForm] = useState({ title: '', url: '', source: '', description: '' });

  const fetchInternships = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('internships')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setInternships(data);
    setLoading(false);
  };

  useEffect(() => { fetchInternships(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.url.trim() || !form.source) {
      setAlertModal({ show: true, title: 'Missing Fields', message: 'Title, URL, and Source are required.', type: 'warning' });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('internships').insert({
      title: form.title.trim(),
      url: form.url.trim(),
      source: form.source,
      description: form.description.trim() || null,
      added_by: profile.id,
    });
    setSubmitting(false);
    if (error) {
      setAlertModal({ show: true, title: 'Error', message: error.message, type: 'error' });
      return;
    }
    setForm({ title: '', url: '', source: '', description: '' });
    setShowForm(false);
    fetchInternships();
  };

  if (loading) return <LoadingSpinner message="Loading internships..." />;

  if (!hasAccess && !isStaff) {
    return (
      <div className="mx-auto flex max-w-lg items-center justify-center p-8 pt-20">
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
            <Lock size={32} className="text-slate-400" />
          </div>
          <h2 className="mt-5 text-2xl font-bold text-slate-900">Premium Feature</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Internship board is available with Premium. Upgrade to access curated opportunities from LinkedIn, Wellfound, Internshala, and more.
          </p>
          <Link
            to={buildPlanCheckoutPath('premium')}
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-3 font-bold text-white shadow-lg transition hover:from-amber-600 hover:to-amber-700"
          >
            <Award size={18} className="mr-2" /> Buy Premium
          </Link>
          <p className="mt-3 text-xs text-slate-400">Premium Plus members also get access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Internship Board</h1>
          <p className="mt-1 text-sm text-slate-500">Curated opportunities from top platforms</p>
        </div>
        {isStaff && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white shadow-lg transition hover:bg-slate-800"
          >
            <Plus size={18} /> Add Internship
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        {SOURCES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600">
            {s === 'LinkedIn' ? <Linkedin size={14} className="text-blue-600" /> : <Globe size={14} className="text-slate-400" />}
            {s}
          </span>
        ))}
      </div>

      {internships.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <Briefcase size={40} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">No internships posted yet.</p>
          {isStaff && (
            <button type="button" onClick={() => setShowForm(true)} className="mt-3 text-sm font-semibold text-blue-600 hover:underline">
              Add the first internship
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {internships.map((item) => {
            const Icon = sourceIcons[item.source] || Globe;
            return (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-lg hover:border-blue-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Icon size={18} className="text-blue-600 shrink-0" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">{item.source}</span>
                  </div>
                  <ExternalLink size={16} className="shrink-0 text-slate-300 transition group-hover:text-blue-600" />
                </div>
                <h3 className="mt-3 font-bold text-slate-900 group-hover:text-blue-700">{item.title}</h3>
                {item.description && (
                  <p className="mt-1.5 text-sm leading-6 text-slate-500 line-clamp-2">{item.description}</p>
                )}
                <p className="mt-3 text-xs text-slate-400">{formatDate(item.created_at)}</p>
              </a>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Add Internship</h2>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="e.g. Software Developer Intern"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">URL *</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="https://linkedin.com/jobs/..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Source *</label>
                <select
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">Select source</option>
                  {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                  placeholder="Optional details..."
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="w-full rounded-xl border border-slate-300 py-3 font-semibold text-slate-700 transition hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="w-full rounded-xl bg-slate-900 py-3 font-bold text-white transition hover:bg-slate-800 disabled:opacity-60">
                  {submitting ? 'Adding...' : 'Add Internship'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
    </div>
  );
};

export default InternshipBoard;
