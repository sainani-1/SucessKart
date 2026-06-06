import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Trophy, Plus, X, ExternalLink, User, Flag, Trash2 } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import AlertModal from '../components/AlertModal';
import PremiumPlusUpgradeGate from '../components/PremiumPlusUpgradeGate';
import { getPremiumPlanType } from '../utils/premium';

const formatDate = (val) => val ? new Date(val).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const ProjectShowcase = () => {
  const { profile } = useAuth();
  const planType = getPremiumPlanType(profile);
  const isAdmin = profile?.role === 'admin';

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, projectId: null, projectTitle: '' });
  const [reportModal, setReportModal] = useState({ show: false, projectId: null, projectTitle: '' });
  const [reportReason, setReportReason] = useState('');

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
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('project-images')
      .upload(filePath, file, { upsert: true });
    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message} (${uploadError.statusCode || 'no status'})`);
    }
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
      if (file && file.size > 2 * 1024 * 1024) {
        setAlertModal({ show: true, title: 'File Too Large', message: 'Image must be under 2 MB.', type: 'warning' });
        setSubmitting(false);
        return;
      }
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

  const handleDeleteProject = async () => {
    const { projectId } = deleteConfirm;
    if (!projectId) return;
    const { error } = await supabase.from('project_showcase').delete().eq('id', projectId);
    if (error) {
      setAlertModal({ show: true, title: 'Error', message: 'Failed to delete project.', type: 'error' });
    } else {
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    }
    setDeleteConfirm({ show: false, projectId: null, projectTitle: '' });
  };

  const handleReportProject = async () => {
    if (!reportReason.trim()) {
      setAlertModal({ show: true, title: 'Missing Reason', message: 'Please provide a reason for reporting this project.', type: 'warning' });
      return;
    }
    try {
      const { error } = await supabase.from('issue_reports').insert({
        reporter_id: profile?.id,
        reporter_role: profile?.role || 'unknown',
        category: 'other',
        subject: `Reported Project: ${reportModal.projectTitle}`,
        description: reportReason.trim(),
        status: 'open',
      });
      if (error) throw error;
      setAlertModal({ show: true, title: 'Report Submitted', message: 'The project has been reported to the admin team.', type: 'success' });
    } catch (err) {
      setAlertModal({ show: true, title: 'Error', message: 'Failed to submit report. Please try again.', type: 'error' });
    }
    setReportModal({ show: false, projectId: null, projectTitle: '' });
    setReportReason('');
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
            <div key={project.id} className="group relative rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-lg">
              {isAdmin && (
                <div className="absolute right-2 top-2 z-10 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setReportModal({ show: true, projectId: project.id, projectTitle: project.title })}
                    className="rounded-lg bg-white/90 p-1.5 text-red-500 shadow hover:bg-red-50 hover:text-red-700"
                    title="Report Project"
                  >
                    <Flag size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm({ show: true, projectId: project.id, projectTitle: project.title })}
                    className="rounded-lg bg-white/90 p-1.5 text-slate-500 shadow hover:bg-red-50 hover:text-red-700"
                    title="Delete Project"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
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

      {reportModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Report Project</h2>
              <button type="button" onClick={() => { setReportModal({ show: false, projectId: null, projectTitle: '' }); setReportReason(''); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <p className="mb-3 text-sm text-slate-600">Reason for reporting <strong>{reportModal.projectTitle}</strong>:</p>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
              placeholder="Explain why this project is inappropriate..."
            />
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => { setReportModal({ show: false, projectId: null, projectTitle: '' }); setReportReason(''); }}
                className="w-full rounded-xl border border-slate-300 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReportProject}
                className="w-full rounded-xl bg-red-600 py-3 font-bold text-white transition hover:bg-red-700"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Delete Project</h2>
            <p className="mt-2 text-sm text-slate-600">Are you sure you want to delete <strong>{deleteConfirm.projectTitle}</strong>? This action cannot be undone.</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm({ show: false, projectId: null, projectTitle: '' })}
                className="w-full rounded-xl border border-slate-300 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteProject}
                className="w-full rounded-xl bg-red-600 py-3 font-bold text-white transition hover:bg-red-700"
              >
                Delete
              </button>
            </div>
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

export default ProjectShowcase;
