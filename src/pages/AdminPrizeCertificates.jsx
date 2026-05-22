import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import AlertModal from '../components/AlertModal';
import { logError } from '../utils/errorLogger';

const PRIZE_TITLE_KEY = 'logic_weekly_prize_title';
const PRIZE_DESC_KEY = 'logic_weekly_prize_description';

const CERT_TYPES = [
  { value: 'course_completion', label: 'Completion Of Certificate' },
  { value: 'weekly_contest_winner', label: 'Winner Of The Weekly Contest' },
  { value: 'custom', label: 'Custom' }
];

export default function AdminPrizeCertificates() {
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingPrize, setSavingPrize] = useState(false);
  const [creating, setCreating] = useState(false);
  const [generated, setGenerated] = useState([]);
  const [studentInput, setStudentInput] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

  const [prizeTitle, setPrizeTitle] = useState('');
  const [prizeDescription, setPrizeDescription] = useState('');

  const [form, setForm] = useState({
    awardType: 'course_completion',
    awardName: '',
    reason: '',
    courseId: '',
    customCourseName: '',
    otherCourse: false
  });

  const matchedStudents = useMemo(() => {
    const q = studentInput.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter(
        (s) =>
          (s.email || '').toLowerCase().includes(q) ||
          (s.full_name || '').toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [students, studentInput]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: studentData, error: studentError } = await supabase
        .from('profiles')
        .select('id, full_name, email, certificate_name, identity_verification_status')
        .eq('role', 'student')
        .order('full_name', { ascending: true });
      if (studentError) throw studentError;

      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('id, title')
        .order('title', { ascending: true });
      if (courseError) throw courseError;

      const { data: settingsData, error: settingsError } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', [PRIZE_TITLE_KEY, PRIZE_DESC_KEY]);
      if (settingsError) throw settingsError;

      // generated_certificates might not exist before migration; do not hard-fail page load.
      const { data: generatedData, error: generatedError } = await supabase
        .from('generated_certificates')
        .select('id, award_type, award_name, reason, course_name, issued_at, user:profiles!generated_certificates_user_id_fkey(full_name, email)')
        .order('issued_at', { ascending: false })
        .limit(50);
      if (generatedError) {
        logError({ message: 'generated_certificates load warning:', source: 'AdminPrizeCertificates', details: generatedError });
      }

      const settingsMap = Object.fromEntries((settingsData || []).map((x) => [x.key, x.value || '']));
      setPrizeTitle(settingsMap[PRIZE_TITLE_KEY] || '');
      setPrizeDescription(settingsMap[PRIZE_DESC_KEY] || '');
      setStudents(studentData || []);
      setCourses(courseData || []);
      setGenerated(generatedData || []);
    } catch (err) {
      setAlertModal({
        show: true,
        title: 'Load Error',
        message: err.message || 'Unable to load admin prize/certificate data.',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const savePrizeSettings = async () => {
    setSavingPrize(true);
    try {
      const payload = [
        { key: PRIZE_TITLE_KEY, value: prizeTitle.trim() },
        { key: PRIZE_DESC_KEY, value: prizeDescription.trim() }
      ];
      const { error } = await supabase.from('settings').upsert(payload, { onConflict: 'key' });
      if (error) throw error;
      setAlertModal({
        show: true,
        title: 'Saved',
        message: 'Weekly contest prize text updated.',
        type: 'success'
      });
    } catch (err) {
      setAlertModal({
        show: true,
        title: 'Save Error',
        message: err.message || 'Failed to save weekly prize settings.',
        type: 'error'
      });
    } finally {
      setSavingPrize(false);
    }
  };

  const createGeneratedCertificate = async (e) => {
    e.preventDefault();
    const resolvedInput = studentInput.trim().toLowerCase();
    const matchedStudent =
      selectedStudent ||
      students.find(
        (s) =>
          (s.email || '').toLowerCase() === resolvedInput ||
          (s.full_name || '').toLowerCase() === resolvedInput
      );
    if (!matchedStudent?.id) {
      setAlertModal({ show: true, title: 'Validation', message: 'Please select a student or enter exact student email/name.', type: 'warning' });
      return;
    }
    if (matchedStudent.identity_verification_status !== 'approved') {
      setAlertModal({
        show: true,
        title: 'Verification Required',
        message: 'This student must be ID verified before a certificate can be generated.',
        type: 'warning'
      });
      return;
    }
    const resolvedAwardName =
      form.awardType === 'course_completion'
        ? 'Course Completion Certificate'
        : form.awardType === 'weekly_contest_winner'
        ? 'Winner Of The Weekly Contest'
        : form.awardName.trim();
    if (!resolvedAwardName) {
      setAlertModal({ show: true, title: 'Validation', message: 'Please enter certificate name.', type: 'warning' });
      return;
    }
    const selectedCourse = courses.find((c) => c.id === form.courseId);
    const resolvedCourseName =
      form.otherCourse || !form.courseId
        ? form.customCourseName.trim()
        : selectedCourse?.title || form.customCourseName.trim();

    if (form.awardType === 'course_completion' && !resolvedCourseName) {
      setAlertModal({ show: true, title: 'Validation', message: 'Please choose or enter a course name.', type: 'warning' });
      return;
    }

    setCreating(true);
    try {
      const now = new Date().toISOString();
      const { data: certData, error: certError } = await supabase
        .from('certificates')
        .insert({
          user_id: matchedStudent.id,
          course_id: form.courseId || null,
          issued_at: now,
          revoked_at: null
        })
        .select('id')
        .single();
      if (certError) throw certError;

      const {
        data: { user }
      } = await supabase.auth.getUser();

      const { error: genError } = await supabase.from('generated_certificates').insert({
        user_id: matchedStudent.id,
        certificate_id: certData?.id || null,
        award_type: form.awardType,
        award_name: resolvedAwardName,
        reason: form.reason.trim() || null,
        course_name: resolvedCourseName || null,
        issued_by: user?.id || null,
        issued_at: now
      });
      if (genError) throw genError;

      setForm({
        awardType: 'course_completion',
        awardName: '',
        reason: '',
        courseId: '',
        customCourseName: '',
        otherCourse: false
      });
      setStudentInput('');
      setSelectedStudent(null);
      await loadAll();
      setAlertModal({
        show: true,
        title: 'Generated',
        message: 'Certificate generated successfully and visible in student panel/verification.',
        type: 'success'
      });
    } catch (err) {
      setAlertModal({
        show: true,
        title: 'Generation Error',
        message: err.message || 'Could not generate certificate.',
        type: 'error'
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 rounded-xl text-white">
        <h1 className="text-2xl font-bold mb-1">Prizes & Generated Certificates</h1>
        <p className="text-blue-100">Configure weekly contest prize and generate student certificates.</p>
      </div>

      <div className="bg-white border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Weekly Contest Prize (Student Panel)</h2>
        <input
          value={prizeTitle}
          onChange={(e) => setPrizeTitle(e.target.value)}
          placeholder="Prize title (e.g., Winner gets 2 months premium)"
          className="w-full border rounded-lg px-3 py-2"
        />
        <textarea
          value={prizeDescription}
          onChange={(e) => setPrizeDescription(e.target.value)}
          placeholder="Prize description shown in logic building panel"
          className="w-full border rounded-lg px-3 py-2 min-h-[80px]"
        />
        <button
          onClick={savePrizeSettings}
          disabled={savingPrize}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {savingPrize ? 'Saving...' : 'Save Prize Text'}
        </button>
      </div>

      <form onSubmit={createGeneratedCertificate} className="bg-white border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Generate Certificate</h2>
        <input
          value={studentInput}
          onChange={(e) => {
            setStudentInput(e.target.value);
            setSelectedStudent(null);
          }}
          placeholder="Enter student email or exact full name"
          className="w-full border rounded-lg px-3 py-2"
        />
        {matchedStudents.length > 0 && (
          <div className="border rounded-lg max-h-44 overflow-auto">
            {matchedStudents.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => {
                  setSelectedStudent(s);
                  setStudentInput(`${s.full_name} (${s.email})`);
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-b-0"
              >
                <p className="text-sm font-medium text-slate-800">{s.full_name}</p>
                <p className="text-xs text-slate-500">{s.email}</p>
              </button>
            ))}
          </div>
        )}
        {selectedStudent && (
          <p className="text-xs text-emerald-700">
            Selected: {selectedStudent.full_name} ({selectedStudent.email})
          </p>
        )}
        {studentInput.trim() && matchedStudents.length === 0 && !selectedStudent && (
          <p className="text-xs text-amber-700">
            No student match list. You can still submit with exact full name/email text.
          </p>
        )}
        <select
          value={form.awardType}
          onChange={(e) => {
            setForm({
              ...form,
              awardType: e.target.value,
              awardName: e.target.value === 'custom' ? form.awardName : ''
            });
          }}
          className="w-full border rounded-lg px-3 py-2"
        >
          {CERT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {form.awardType !== 'custom' && (
          <p className="text-xs text-slate-600">
            Certificate name will be set automatically from selected type.
          </p>
        )}
        {form.awardType === 'custom' && (
          <input
            value={form.awardName}
            onChange={(e) => setForm({ ...form, awardName: e.target.value })}
            placeholder="Enter custom certificate name"
            className="w-full border rounded-lg px-3 py-2"
            required
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            value={form.courseId}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__other__') {
                setForm({ ...form, courseId: '', otherCourse: true });
              } else {
                setForm({ ...form, courseId: v, otherCourse: false });
              }
            }}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="">Select course (optional)</option>
            <option value="__other__">Other (Custom course name)</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          {form.otherCourse && (
            <input
              value={form.customCourseName}
              onChange={(e) => setForm({ ...form, customCourseName: e.target.value })}
              placeholder="Enter custom course name"
              className="w-full border rounded-lg px-3 py-2"
            />
          )}
        </div>

        <textarea
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          placeholder="Reason (e.g., Winner of weekly contest, top performance, etc.)"
          className="w-full border rounded-lg px-3 py-2 min-h-[90px]"
        />
        <button
          type="submit"
          disabled={creating || loading}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {creating ? 'Generating...' : 'Generate Certificate'}
        </button>
      </form>

      <div className="bg-white border rounded-xl p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-3">Generated Certificates</h2>
        {loading ? (
          <p className="text-slate-500">Loading...</p>
        ) : generated.length === 0 ? (
          <p className="text-slate-500">No generated certificates yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Student</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Course</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Issued</th>
                </tr>
              </thead>
              <tbody>
                {generated.map((g) => (
                  <tr key={g.id} className="border-t">
                    <td className="px-3 py-2">{g.user?.full_name || 'Student'} ({g.user?.email || '-'})</td>
                    <td className="px-3 py-2">{CERT_TYPES.find((t) => t.value === g.award_type)?.label || g.award_type}</td>
                    <td className="px-3 py-2">{g.award_name}</td>
                    <td className="px-3 py-2">{g.course_name || '-'}</td>
                    <td className="px-3 py-2">{g.reason || '-'}</td>
                    <td className="px-3 py-2">{new Date(g.issued_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal((prev) => ({ ...prev, show: false }))}
      />
    </div>
  );
}
