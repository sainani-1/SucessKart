import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Trophy, Plus, X, ExternalLink, User, Image } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import AlertModal from '../components/AlertModal';
import PremiumPlusUpgradeGate from '../components/PremiumPlusUpgradeGate';
import { getPremiumPlanType } from '../utils/premium';

const formatDate = (val) => val ? new Date(val).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const ProjectShowcase = () => {
  const { profile } = useAuth();
  const planType = getPremiumPlanType(profile);
  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

  const [form, setForm] = useState({ title: '', description: '', project_url: '' });
  const [file, setFile] = useState(null);

  const fetchProjects = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('project_showcase')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setProjects(data);
    setLoading(false);
  };

  useEffect(() => { fetchProjects(); }, []);

  const handleShowcaseClick = () => {
    if (planType === 'premium_plus') {
      setShowForm(true);
    } else {
      setShowGate(true);
    }
  };

  const uploadImage = async (userId) => {
    if (!file) return null;
    const ext = file.name.split('.').pop();
    const filePath = `project_showcase/${userId}_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('project-images')
      .upload(filePath, file, { upsert: true });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('project-images').getPublicUrl(filePath);
    return data?.publicUrl || null;
  };

  const handleSubmitProject = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setAlertModal({ show: true, title: 'Missing Fields', message: 'Project title is required.', type: 'warning' });
      return;
    }
    setSubmitting(true);
    try {
      let imageUrl = null;
      if (file) {
        imageUrl = await uploadImage(profile.id);
      }
      const { error } = await supabase.from('project_showcase').insert({
        user_id: profile.id,
        student_name: profile.full_name || profile.email || 'Student',
        title: form.title.trim(),
        description: form.description.trim() || null,
        project_url: form.project_url.trim() || null,
        image_url: imageUrl,
      });
      if (error) throw error;
      setForm({ title: '', description: '', project_url: '' });
      setFile(null);
      setShowForm(false);
      fetchProjects();
    } catch (err) {
      setAlertModal({ show: true, title: 'Error', message: err.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading projects..." />;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Student Project Showcase</h1>
          <p className="mt-1 text-sm text-slate-500">Discover amazing projects by students</p>
        </div>
        {profile?.role === 'student' && (
          <button
            type="button"
            onClick={handleShowcaseClick}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3 font-bold text-white shadow-lg transition hover:from-amber-600 hover:to-orange-600"
          >
            <Plus size={18} /> Showcase My Project
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <Trophy size={40} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">No projects showcased yet.</p>
          {profile?.role === 'student' && (
            <button type="button" onClick={handleShowcaseClick} className="mt-3 text-sm font-semibold text-amber-600 hover:underline">
              Be the first to showcase your project
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div key={project.id} className="group rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-lg">
              {project.image_url && (
                <div className="aspect-video w-full overflow-hidden rounded-t-2xl bg-slate-100">
                  <img src={project.image_url} alt={project.title} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="p-5">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <User size={14} />
                  <span className="font-medium text-slate-700">{project.student_name}</span>
                </div>
                <h3 className="mt-2 text-lg font-bold text-slate-900">{project.title}</h3>
                {project.description && (
                  <p className="mt-1.5 text-sm leading-6 text-slate-500 line-clamp-3">{project.description}</p>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-slate-400">{formatDate(project.created_at)}</span>
                  {project.project_url && (
                    <a
                      href={project.project_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
                    >
                      View Project <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Showcase Your Project</h2>
              <button type="button" onClick={() => { setShowForm(false); setFile(null); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitProject} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Project Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  placeholder="e.g. AI-Powered Chatbot"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none"
                  placeholder="Tell us about your project..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Project Link</label>
                <input
                  type="url"
                  value={form.project_url}
                  onChange={(e) => setForm({ ...form, project_url: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  placeholder="https://github.com/..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Project Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
                />
                {file && <p className="mt-1 text-xs text-green-600">Selected: {file.name}</p>}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowForm(false); setFile(null); }} className="w-full rounded-xl border border-slate-300 py-3 font-semibold text-slate-700 transition hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 font-bold text-white transition hover:from-amber-600 hover:to-orange-600 disabled:opacity-60">
                  {submitting ? 'Submitting...' : 'Submit Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGate && (
        <PremiumPlusUpgradeGate
          profile={profile}
          title="Premium Plus Required"
          message="Only Premium Plus members can showcase projects. Upgrade to share your work with the community."
          onClose={() => setShowGate(false)}
        />
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

export default ProjectShowcase;
