import React, { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import AlertModal from '../components/AlertModal';
import AvatarImage from '../components/AvatarImage';
import { logError } from '../utils/errorLogger';

const CertificateBlocks = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('student');
  const [certUpdatingUserId, setCertUpdatingUserId] = useState(null);
  const [certModal, setCertModal] = useState({ open: false, user: null, loading: false, rows: [] });
  const [certActionId, setCertActionId] = useState(null);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null });

  useEffect(() => {
    loadUsers();
  }, []);

  const pushNotification = async (payload) => {
    try {
      const { error } = await supabase.from('admin_notifications').insert(payload);
      if (error && String(error.message || '').includes('target_user_id')) {
        if (payload?.target_user_id) {
          // Legacy fallback: keep it role-scoped but encode intended recipient in content.
          // Reader pages will filter by this marker so it does not broadcast to all students.
          const { target_user_id, ...fallback } = payload;
          const marker = `[target_user_id:${target_user_id}] `;
          await supabase.from('admin_notifications').insert({
            ...fallback,
            content: `${marker}${payload.content || ''}`,
          });
        } else {
          const { target_user_id, ...fallback } = payload;
          await supabase.from('admin_notifications').insert(fallback);
        }
      }
    } catch {
      // Keep certificate workflows resilient even if notification insert fails.
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const [{ data: profileData, error: profileError }, { data: certData, error: certError }, { data: passedData, error: passedError }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, role, avatar_url')
          .order('full_name'),
        supabase
          .from('certificates')
          .select('user_id, revoked_at, exam_submission_id, course_id'),
        supabase
          .from('exam_submissions')
          .select('id, user_id, exam:exams(course_id)')
          .eq('passed', true),
      ]);

      if (profileError) throw profileError;
      if (certError) throw certError;
      if (passedError) throw passedError;

      const certMap = {};
      const certBySubmission = {};
      const certByCourse = {};
      (certData || []).forEach(cert => {
        if (!certMap[cert.user_id]) {
          certMap[cert.user_id] = { total: 0, active: 0 };
        }
        certMap[cert.user_id].total += 1;
        if (!cert.revoked_at) certMap[cert.user_id].active += 1;

        if (!certBySubmission[cert.user_id]) certBySubmission[cert.user_id] = new Set();
        if (!certByCourse[cert.user_id]) certByCourse[cert.user_id] = new Set();
        if (cert.exam_submission_id) certBySubmission[cert.user_id].add(String(cert.exam_submission_id));
        if (cert.course_id) certByCourse[cert.user_id].add(String(cert.course_id));
      });

      // Include passed exams that are shown as fallback certificates in student view.
      (passedData || []).forEach(sub => {
        if (!certMap[sub.user_id]) {
          certMap[sub.user_id] = { total: 0, active: 0 };
        }
        const subId = sub?.id ? String(sub.id) : null;
        const courseId = sub?.exam?.course_id ? String(sub.exam.course_id) : null;
        const seenBySub = subId && certBySubmission[sub.user_id]?.has(subId);
        const seenByCourse = courseId && certByCourse[sub.user_id]?.has(courseId);
        if (!seenBySub && !seenByCourse) {
          certMap[sub.user_id].total += 1;
          certMap[sub.user_id].active += 1;
        }
      });

      const merged = (profileData || []).map(u => ({
        ...u,
        certs: certMap[u.id] || { total: 0, active: 0 }
      }));

      setUsers(merged);
    } catch (err) {
      logError({ message: 'Failed to load certificate block data:', source: 'CertificateBlocks', details: err });
      setAlertModal({
        show: true,
        title: 'Load Error',
        message: err.message || 'Failed to load certificate data',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const ensureCertificateRowsForPassedExams = async (userId, revokedAt = null) => {
    const [{ data: certRows, error: certErr }, { data: passedRows, error: passedErr }] = await Promise.all([
      supabase
        .from('certificates')
        .select('exam_submission_id, course_id')
        .eq('user_id', userId),
      supabase
        .from('exam_submissions')
        .select('id, submitted_at, exam:exams(course_id)')
        .eq('user_id', userId)
        .eq('passed', true),
    ]);

    if (certErr) throw certErr;
    if (passedErr) throw passedErr;

    const certBySubmission = new Set((certRows || []).map(c => c.exam_submission_id).filter(Boolean).map(String));
    const certByCourse = new Set((certRows || []).map(c => c.course_id).filter(Boolean).map(String));

    const rowsToInsert = (passedRows || [])
      .filter(sub => !certBySubmission.has(String(sub.id)))
      .filter(sub => {
        const courseId = sub?.exam?.course_id;
        if (!courseId) return true;
        return !certByCourse.has(String(courseId));
      })
      .map(sub => ({
        user_id: userId,
        exam_submission_id: sub.id,
        course_id: sub?.exam?.course_id || null,
        issued_at: sub.submitted_at || new Date().toISOString(),
        revoked_at: revokedAt
      }));

    if (!rowsToInsert.length) return;
    const { error: insertError } = await supabase.from('certificates').insert(rowsToInsert);
    if (insertError && insertError.code !== '23505') {
      throw insertError;
    }
  };

  const updateUserCertificates = async (user, action) => {
    setCertUpdatingUserId(user.id);
    try {
      const {
        data: { user: adminUser }
      } = await supabase.auth.getUser();
      if (action === 'block') {
        const revokedAt = new Date().toISOString();
        try {
          await ensureCertificateRowsForPassedExams(user.id, revokedAt);
        } catch (insertErr) {
          logError({ message: 'Could not materialize fallback certificates before blocking:', source: 'CertificateBlocks', details: insertErr });
        }
        const { error } = await supabase
          .from('certificates')
          .update({ revoked_at: revokedAt })
          .eq('user_id', user.id)
          .is('revoked_at', null);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('certificates')
          .update({ revoked_at: null })
          .eq('user_id', user.id);
        if (error) throw error;
      }

      await pushNotification({
        title: action === 'block' ? 'Certificates Blocked' : 'Certificates Unblocked',
        content:
          action === 'block'
            ? 'Your certificates were blocked by admin due to policy violation.'
            : 'Your certificates were restored by admin.',
        type: action === 'block' ? 'warning' : 'success',
        target_role: 'student',
        target_user_id: user.id,
        admin_id: adminUser?.id || null,
      });

      await loadUsers();
      setAlertModal({
        show: true,
        title: 'Success',
        message: action === 'block' ? 'Certificates blocked.' : 'Certificates unblocked.',
        type: 'success'
      });
    } catch (err) {
      logError({ message: 'Certificate update error:', source: 'CertificateBlocks', details: err });
      setAlertModal({
        show: true,
        title: 'Error',
        message: err.message || 'Failed to update certificates',
        type: 'error'
      });
    } finally {
      setCertUpdatingUserId(null);
    }
  };

  const openUserCertificateManager = async (user) => {
    setCertModal({ open: true, user, loading: true, rows: [] });
    try {
      try {
        await ensureCertificateRowsForPassedExams(user.id, null);
      } catch (insertErr) {
        logError({ message: 'Could not materialize missing certificate rows:', source: 'CertificateBlocks', details: insertErr });
      }

      const [{ data: certRows, error: certError }, { data: generatedRows, error: generatedError }] = await Promise.all([
        supabase
          .from('certificates')
          .select('id, user_id, issued_at, revoked_at, exam_submission_id, course_id, course:courses(title, category)')
          .eq('user_id', user.id)
          .order('issued_at', { ascending: false }),
        supabase
          .from('generated_certificates')
          .select('id, certificate_id, award_type, award_name, reason, course_name')
          .eq('user_id', user.id)
      ]);
      if (certError) throw certError;
      if (generatedError) throw generatedError;

      const generatedByCert = new Map(
        (generatedRows || [])
          .filter((g) => g.certificate_id)
          .map((g) => [String(g.certificate_id), g])
      );

      const rows = (certRows || []).map((c) => {
        const g = generatedByCert.get(String(c.id));
        return {
          ...c,
          generated: g || null,
          displayTitle:
            g?.course_name ||
            g?.award_name ||
            c?.course?.title ||
            'Certificate',
          reason: g?.reason || null
        };
      });

      setCertModal({ open: true, user, loading: false, rows });
    } catch (err) {
      setCertModal({ open: true, user, loading: false, rows: [] });
      setAlertModal({
        show: true,
        title: 'Load Error',
        message: err.message || 'Failed to load certificates for this user.',
        type: 'error'
      });
    }
  };

  const refreshCertModalRows = async () => {
    if (!certModal.user?.id) return;
    await openUserCertificateManager(certModal.user);
  };

  const toggleSingleCertificate = async (cert) => {
    setCertActionId(cert.id);
    try {
      const {
        data: { user: adminUser }
      } = await supabase.auth.getUser();
      const revokedAt = cert.revoked_at ? null : new Date().toISOString();
      const { error } = await supabase.from('certificates').update({ revoked_at: revokedAt }).eq('id', cert.id);
      if (error) throw error;
      if (certModal.user?.id) {
        await pushNotification({
          title: revokedAt ? 'Certificate Blocked' : 'Certificate Unblocked',
          content: revokedAt
            ? `Certificate "${cert.displayTitle}" has been blocked by admin.`
            : `Certificate "${cert.displayTitle}" has been restored by admin.`,
          type: revokedAt ? 'warning' : 'success',
          target_role: 'student',
          target_user_id: certModal.user.id,
          admin_id: adminUser?.id || null,
        });
      }
      await Promise.all([loadUsers(), refreshCertModalRows()]);
    } catch (err) {
      setAlertModal({
        show: true,
        title: 'Update Error',
        message: err.message || 'Failed to update certificate status.',
        type: 'error'
      });
    } finally {
      setCertActionId(null);
    }
  };

  const blockAllInModal = async () => {
    if (!certModal.user) return;
    setCertActionId('all');
    try {
      const {
        data: { user: adminUser }
      } = await supabase.auth.getUser();
      const revokedAt = new Date().toISOString();
      try {
        await ensureCertificateRowsForPassedExams(certModal.user.id, revokedAt);
      } catch (insertErr) {
        logError({ message: 'Could not materialize missing certificates before block all:', source: 'CertificateBlocks', details: insertErr });
      }
      const { error } = await supabase
        .from('certificates')
        .update({ revoked_at: revokedAt })
        .eq('user_id', certModal.user.id)
        .is('revoked_at', null);
      if (error) throw error;
      await pushNotification({
        title: 'All Certificates Blocked',
        content: 'All your active certificates were blocked by admin.',
        type: 'warning',
        target_role: 'student',
        target_user_id: certModal.user.id,
        admin_id: adminUser?.id || null,
      });
      await Promise.all([loadUsers(), refreshCertModalRows()]);
      setAlertModal({
        show: true,
        title: 'Success',
        message: 'All active certificates blocked for this user.',
        type: 'success'
      });
    } catch (err) {
      setAlertModal({
        show: true,
        title: 'Block All Error',
        message: err.message || 'Failed to block all certificates.',
        type: 'error'
      });
    } finally {
      setCertActionId(null);
    }
  };

  const requestUpdate = (user, action) => {
    const message = action === 'block'
      ? 'Block all active certificates for this user?'
      : 'Unblock all certificates for this user?';
    setConfirmModal({
      show: true,
      title: 'Confirm Action',
      message,
      onConfirm: () => updateUserCertificates(user, action)
    });
  };

  const filtered = users.filter(u => {
    const matchesSearch = u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-red-600 to-rose-700 p-6 rounded-xl text-white">
        <h1 className="text-2xl font-bold mb-1">Certificate Blocks</h1>
        <p className="text-rose-100">Block or restore certificates for students and teachers.</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm space-y-4">
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setRoleFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                roleFilter === 'all'
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All ({users.length})
            </button>
            <button
              onClick={() => setRoleFilter('student')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                roleFilter === 'student'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Students ({users.filter(u => u.role === 'student').length})
            </button>
            <button
              onClick={() => setRoleFilter('teacher')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                roleFilter === 'teacher'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Teachers ({users.filter(u => u.role === 'teacher').length})
            </button>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email"
            className="px-3 py-2 border rounded-lg w-full md:w-64"
          />
        </div>

        <div className="border border-slate-200 rounded-xl overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Certificates</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center"><LoadingSpinner fullPage={false} message="Loading users..." /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No users found</td></tr>
              ) : (
                filtered.map(u => {
                  const hasCertificates = u.certs?.total > 0;
                  const hasActiveCertificates = u.certs?.active > 0;
                  return (
                    <tr key={u.id} className="border-t">
                      <td className="px-4 py-3 flex items-center gap-2">
                        <AvatarImage
                          userId={u.id}
                          avatarUrl={u.avatar_url}
                          alt={u.full_name}
                          fallbackName={u.full_name || 'User'}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <span className="font-semibold text-slate-800">{u.full_name}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          u.role === 'admin' ? 'bg-red-100 text-red-700' :
                          u.role === 'teacher' ? 'bg-blue-100 text-blue-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {u.role === 'admin' ? 'Nani' : u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {hasCertificates ? (
                          <div className="flex flex-col gap-2">
                            <span className="text-xs text-slate-600">
                              Active {u.certs.active} / Total {u.certs.total}
                            </span>
                            <button
                              onClick={() => openUserCertificateManager(u)}
                              className="px-3 py-1 rounded text-xs font-semibold transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200"
                            >
                              Manage Certificates
                            </button>
                            {hasActiveCertificates && (
                              <button
                                onClick={() => requestUpdate(u, 'block')}
                                disabled={certUpdatingUserId === u.id}
                                className="px-3 py-1 rounded text-xs font-semibold transition-colors bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-60"
                              >
                                {certUpdatingUserId === u.id ? 'Blocking...' : 'Block All'}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">None</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirmModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">{confirmModal.title}</h3>
            <p className="text-sm text-slate-600">{confirmModal.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmModal({ show: false, title: '', message: '', onConfirm: null })}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const action = confirmModal.onConfirm;
                  setConfirmModal({ show: false, title: '', message: '', onConfirm: null });
                  if (action) await action();
                }}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {certModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Manage Certificates</h3>
                <p className="text-sm text-slate-600">
                  {certModal.user?.full_name} ({certModal.user?.email})
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={blockAllInModal}
                  disabled={certActionId === 'all' || certModal.loading || certModal.rows.length === 0}
                  className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {certActionId === 'all' ? 'Blocking...' : 'Block All Certificates'}
                </button>
                <button
                  onClick={() => setCertModal({ open: false, user: null, loading: false, rows: [] })}
                  className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>

            {certModal.loading ? (
              <LoadingSpinner fullPage={false} message="Loading certificates..." />
            ) : certModal.rows.length === 0 ? (
              <p className="text-slate-500 text-sm">No certificates found for this user.</p>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Certificate</th>
                      <th className="px-3 py-2 text-left">Issued</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certModal.rows.map((c) => (
                      <tr key={c.id} className="border-t">
                        <td className="px-3 py-2">
                          <p className="font-semibold text-slate-900">{c.displayTitle}</p>
                          <p className="text-xs text-slate-500">ID: {c.id}</p>
                          {c.reason && <p className="text-xs text-slate-500">Reason: {c.reason}</p>}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{new Date(c.issued_at).toLocaleString()}</td>
                        <td className="px-3 py-2">
                          {c.revoked_at ? (
                            <span className="text-xs font-semibold px-2 py-1 rounded bg-red-100 text-red-700">Blocked</span>
                          ) : (
                            <span className="text-xs font-semibold px-2 py-1 rounded bg-green-100 text-green-700">Active</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => window.open(`/verify/${encodeURIComponent(c.id)}`, '_blank', 'noopener,noreferrer')}
                              className="px-3 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200"
                            >
                              View
                            </button>
                            <button
                              onClick={() => toggleSingleCertificate(c)}
                              disabled={certActionId === c.id}
                              className={`px-3 py-1 rounded text-xs font-semibold ${
                                c.revoked_at
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                  : 'bg-red-100 text-red-700 hover:bg-red-200'
                              } disabled:opacity-60`}
                            >
                              {certActionId === c.id ? 'Updating...' : c.revoked_at ? 'Unblock' : 'Block'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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

export default CertificateBlocks;
