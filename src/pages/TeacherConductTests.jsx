import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import AlertModal from '../components/AlertModal';
import LoadingSpinner from '../components/LoadingSpinner';
import { Save, Plus, Trash2, BookOpen, Users, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sendAdminNotification } from '../utils/adminNotifications';
import { logWarn } from '../utils/errorLogger';

const makeEmptyQuestion = (examId, orderIndex = 0) => ({
  exam_id: examId,
  question: '',
  question_type: 'mcq',
  options: ['', '', '', ''],
  correct_index: 0,
  coding_description: '',
  coding_language: 'python',
  shown_test_cases: [],
  hidden_test_cases: [],
  order_index: orderIndex,
});

const normalizeTestCases = (value) => (Array.isArray(value) ? value : []);

const isTargetUserIdColumnError = (error) => {
  const text = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ').toLowerCase();
  return text.includes('target_user_id') && (text.includes('column') || text.includes('schema cache'));
};

function TeacherConductTests() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [coursesById, setCoursesById] = useState({});
  const [examsByCourseId, setExamsByCourseId] = useState({});
  const [questionsByExamId, setQuestionsByExamId] = useState({});
  const [submissionsByExamId, setSubmissionsByExamId] = useState({});
  const [conductedExamIds, setConductedExamIds] = useState([]);
  const [conductedTestsByExamId, setConductedTestsByExamId] = useState({});
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [testName, setTestName] = useState('');
  const [publishForAllStudents, setPublishForAllStudents] = useState(true);
  const [targetStudentIds, setTargetStudentIds] = useState([]);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const studentCourses = useMemo(() => {
    if (!selectedStudentId) return [];
    const rows = enrollments.filter((e) => e.student_id === selectedStudentId);
    const seen = new Set();
    const out = [];
    rows.forEach((r) => {
      if (!seen.has(r.course_id) && coursesById[r.course_id]) {
        seen.add(r.course_id);
        out.push(coursesById[r.course_id]);
      }
    });
    return out;
  }, [selectedStudentId, enrollments, coursesById]);

  const availableCourses = useMemo(
    () =>
      Object.values(coursesById).sort((a, b) =>
        String(a.title || `Course ${a.id}`).localeCompare(String(b.title || `Course ${b.id}`))
      ),
    [coursesById]
  );

  useEffect(() => {
    if (!selectedCourseId || !availableCourses.find((c) => String(c.id) === String(selectedCourseId))) {
      setSelectedCourseId(availableCourses[0]?.id ? String(availableCourses[0].id) : '');
    }
  }, [availableCourses, selectedCourseId]);

  const selectedExam = selectedCourseId ? examsByCourseId[selectedCourseId] || null : null;
  const selectedExamQuestions = selectedExam ? (questionsByExamId[selectedExam.id] || []) : [];
  const selectedExamSubmissions =
    selectedExam && conductedExamIds.includes(selectedExam.id)
      ? (submissionsByExamId[selectedExam.id] || [])
      : [];

  useEffect(() => {
    setTestName(selectedExam?.test_name || '');
  }, [selectedExam?.id, selectedExam?.test_name]);

  useEffect(() => {
    if (!selectedExam?.id) {
      setPublishForAllStudents(true);
      setTargetStudentIds([]);
      return;
    }
    const conducted = conductedTestsByExamId[selectedExam.id];
    const isSelectedAudience = conducted?.audience_mode === 'selected_students';
    setPublishForAllStudents(!isSelectedAudience);
    setTargetStudentIds(isSelectedAudience ? (conducted?.target_student_ids || []).map(String) : []);
  }, [selectedExam?.id, conductedTestsByExamId]);
  const selectedStudentTestwiseResults = useMemo(() => {
    if (!selectedStudentId) return [];
    const rows = [];
    Object.entries(examsByCourseId).forEach(([courseId, exam]) => {
      if (!conductedExamIds.includes(exam.id)) return;
      const list = (submissionsByExamId[exam.id] || [])
        .filter((s) => s.user_id === selectedStudentId)
        .sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
      const latest = list[0];
      if (latest) {
        rows.push({
          courseId,
          courseTitle: exam?.test_name || coursesById[courseId]?.title || `Course ${courseId}`,
          score: Number(latest.score_percent || 0),
          passed: !!latest.passed,
          submittedAt: latest.submitted_at,
        });
      }
    });
    return rows.sort((a, b) => a.courseTitle.localeCompare(b.courseTitle));
  }, [selectedStudentId, examsByCourseId, submissionsByExamId, coursesById, conductedExamIds]);

  const extractMissingExamQuestionColumn = (error) => {
    const text = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
    const patterns = [
      /Could not find the ['"]([^'"]+)['"] column/i,
      /column ['"]([^'"]+)['"]/i,
      /column "([^"]+)"/i,
      /missing column[:\s]+([a-zA-Z_][a-zA-Z0-9_]*)/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) return m[1];
    }
    return null;
  };

  const loadData = async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const { data: studentRows, error: studentErr } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'student')
        .eq('assigned_teacher_id', profile.id)
        .order('full_name');
      if (studentErr) throw studentErr;

      const studentList = studentRows || [];
      setStudents(studentList);
      if (!selectedStudentId && studentList.length > 0) {
        setSelectedStudentId(studentList[0].id);
      } else if (selectedStudentId && !studentList.find((s) => s.id === selectedStudentId)) {
        setSelectedStudentId(studentList[0]?.id || '');
      }

      const studentIds = studentList.map((s) => s.id);
      if (studentIds.length === 0) {
        setEnrollments([]);
        setCoursesById({});
        setExamsByCourseId({});
        setQuestionsByExamId({});
        setSubmissionsByExamId({});
        return;
      }

      const { data: enrollmentRows, error: enrollmentErr } = await supabase
        .from('enrollments')
        .select('student_id, course_id')
        .in('student_id', studentIds);
      if (enrollmentErr) throw enrollmentErr;

      const enrollList = enrollmentRows || [];
      setEnrollments(enrollList);
      const { data: courseRows, error: courseErr } = await supabase
        .from('courses')
        .select('id, title, category')
        .order('title');
      if (courseErr) throw courseErr;

      const courseMap = {};
      (courseRows || []).forEach((c) => {
        courseMap[c.id] = c;
      });
      setCoursesById(courseMap);

      const courseIds = Array.from(new Set((courseRows || []).map((row) => row.id).filter(Boolean)));
      if (courseIds.length === 0) {
        setExamsByCourseId({});
        setQuestionsByExamId({});
        setSubmissionsByExamId({});
        return;
      }

      const { data: examRows, error: examErr } = await supabase
        .from('exams')
        .select('*')
        .in('course_id', courseIds);
      if (examErr) throw examErr;

      const { data: conductedRows } = await supabase
        .from('teacher_conducted_tests')
        .select('exam_id, created_at, audience_mode, target_student_ids')
        .eq('teacher_id', profile.id);
      const conductedSet = new Set((conductedRows || []).map((r) => r.exam_id));
      setConductedExamIds(Array.from(conductedSet));
      setConductedTestsByExamId(
        Object.fromEntries((conductedRows || []).map((row) => [row.exam_id, row])),
      );

      const examMap = {};
      (examRows || []).forEach((e) => {
        examMap[e.course_id] = e;
      });
      setExamsByCourseId(examMap);

      const examIds = (examRows || []).map((e) => e.id);
      if (examIds.length === 0) {
        setQuestionsByExamId({});
        setSubmissionsByExamId({});
        return;
      }

      const { data: questionRows, error: questionErr } = await supabase
        .from('exam_questions')
        .select('*')
        .in('exam_id', examIds)
        .order('order_index', { ascending: true });
      if (questionErr) throw questionErr;

      const qMap = {};
      (questionRows || []).forEach((q) => {
        if (!qMap[q.exam_id]) qMap[q.exam_id] = [];
        qMap[q.exam_id].push(q);
      });
      setQuestionsByExamId(qMap);

      const { data: submissionRows } = await supabase
        .from('exam_submissions')
        .select('id, exam_id, user_id, score_percent, passed, submitted_at, user:profiles(id, full_name, email)')
        .in('user_id', studentIds)
        .in('exam_id', examIds)
        .order('submitted_at', { ascending: false });
      const sMap = {};
      (submissionRows || []).forEach((s) => {
        if (!conductedSet.has(s.exam_id)) return;
        if (!sMap[s.exam_id]) sMap[s.exam_id] = [];
        sMap[s.exam_id].push(s);
      });
      setSubmissionsByExamId(sMap);
    } catch (err) {
      setAlertModal({
        show: true,
        title: 'Load Failed',
        message: err.message || 'Failed to load assigned students/tests.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!profile?.id) return;
    loadData();
  }, [profile?.id]);

  const ensureExamForCourse = async (courseId) => {
    const existing = examsByCourseId[courseId];
    if (existing) return existing;
    const { data, error } = await supabase
      .from('exams')
      .insert([{
        course_id: courseId,
        duration_minutes: 60,
        pass_percent: 70,
        test_name: testName || null,
        generate_certificate: false,
      }])
      .select()
      .single();
    if (error) throw error;
    setExamsByCourseId((prev) => ({ ...prev, [courseId]: data }));
    setQuestionsByExamId((prev) => ({ ...prev, [data.id]: prev[data.id] || [] }));
    return data;
  };

  const addQuestion = async () => {
    if (!selectedCourseId) return;
    try {
      const exam = await ensureExamForCourse(selectedCourseId);
      setQuestionsByExamId((prev) => {
        const current = prev[exam.id] || [];
        return {
          ...prev,
          [exam.id]: [...current, makeEmptyQuestion(exam.id, current.length)],
        };
      });
    } catch (err) {
      setAlertModal({
        show: true,
        title: 'Cannot Add Question',
        message: err.message || 'Could not initialize test.',
        type: 'error',
      });
    }
  };

  const updateQuestion = (examId, index, field, value) => {
    setQuestionsByExamId((prev) => ({
      ...prev,
      [examId]: (prev[examId] || []).map((q, i) => (i === index ? { ...q, [field]: value } : q)),
    }));
  };

  const updateOption = (examId, qIndex, optionIndex, value) => {
    setQuestionsByExamId((prev) => ({
      ...prev,
      [examId]: (prev[examId] || []).map((q, i) => {
        if (i !== qIndex) return q;
        const options = [...(q.options || ['', '', '', ''])];
        options[optionIndex] = value;
        return { ...q, options };
      }),
    }));
  };

  const addCodingTestCase = (examId, qIndex, bucket) => {
    setQuestionsByExamId((prev) => ({
      ...prev,
      [examId]: (prev[examId] || []).map((q, i) => {
        if (i !== qIndex) return q;
        const list = normalizeTestCases(q[bucket]);
        return { ...q, [bucket]: [...list, { input: '', output: '' }] };
      }),
    }));
  };

  const updateCodingTestCase = (examId, qIndex, bucket, testIndex, field, value) => {
    setQuestionsByExamId((prev) => ({
      ...prev,
      [examId]: (prev[examId] || []).map((q, i) => {
        if (i !== qIndex) return q;
        const list = normalizeTestCases(q[bucket]).map((tc, idx) =>
          idx === testIndex ? { ...tc, [field]: value } : tc
        );
        return { ...q, [bucket]: list };
      }),
    }));
  };

  const deleteCodingTestCase = (examId, qIndex, bucket, testIndex) => {
    setQuestionsByExamId((prev) => ({
      ...prev,
      [examId]: (prev[examId] || []).map((q, i) => {
        if (i !== qIndex) return q;
        const list = normalizeTestCases(q[bucket]).filter((_, idx) => idx !== testIndex);
        return { ...q, [bucket]: list };
      }),
    }));
  };

  const deleteQuestion = (examId, index) => {
    setQuestionsByExamId((prev) => ({
      ...prev,
      [examId]: (prev[examId] || []).filter((_, i) => i !== index).map((q, i) => ({ ...q, order_index: i })),
    }));
  };

  const toggleTargetStudent = (studentId) => {
    setTargetStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const publishQuestions = async () => {
    if (!selectedCourseId) return;
    setSaving(true);
    try {
      const exam = await ensureExamForCourse(selectedCourseId);
      const list = (questionsByExamId[exam.id] || []).map((q, i) => ({
        exam_id: exam.id,
        question: q.question || '',
        question_type: q.question_type === 'coding' ? 'coding' : 'mcq',
        options: q.question_type === 'coding' ? [] : (q.options || ['', '', '', '']),
        correct_index: q.question_type === 'coding' ? 0 : Number(q.correct_index || 0),
        coding_description: q.question_type === 'coding' ? (q.coding_description || '') : null,
        coding_language: q.question_type === 'coding' ? (q.coding_language || 'python') : null,
        shown_test_cases: q.question_type === 'coding' ? (q.shown_test_cases || []) : [],
        hidden_test_cases: q.question_type === 'coding' ? (q.hidden_test_cases || []) : [],
        order_index: i,
      }));

      if (list.length === 0) {
        throw new Error('Add at least one question before publishing.');
      }

      if (!publishForAllStudents && targetStudentIds.length === 0) {
        throw new Error('Select at least one student if this test is not for all assigned students.');
      }

      await supabase
        .from('exams')
        .update({
          test_name: testName || null,
          generate_certificate: false,
          question_set_updated_at: new Date().toISOString(),
        })
        .eq('id', exam.id);

      const { error: delErr } = await supabase.from('exam_questions').delete().eq('exam_id', exam.id);
      if (delErr) throw delErr;

      let insertPayload = list;
      for (let i = 0; i < 8; i += 1) {
        const { error: insErr } = await supabase.from('exam_questions').insert(insertPayload);
        if (!insErr) break;
        const missingCol = extractMissingExamQuestionColumn(insErr);
        if (!missingCol) throw insErr;
        insertPayload = insertPayload.map((row) => {
          const clone = { ...row };
          delete clone[missingCol];
          return clone;
        });
        if (i === 7) throw insErr;
      }

      setAlertModal({
        show: true,
        title: 'Published',
        message: publishForAllStudents
          ? 'Test published successfully for all assigned students.'
          : `Test published successfully for ${targetStudentIds.length} selected student(s).`,
        type: 'success',
      });
      await supabase
        .from('teacher_conducted_tests')
        .upsert([
          {
            teacher_id: profile.id,
            exam_id: exam.id,
            audience_mode: publishForAllStudents ? 'all_assigned' : 'selected_students',
            target_student_ids: publishForAllStudents ? [] : targetStudentIds,
          },
        ], { onConflict: 'teacher_id,exam_id' });

      const notificationStudentIds = publishForAllStudents ? students.map((student) => student.id) : targetStudentIds;

      const studentNotificationRows = notificationStudentIds.map((studentId) => ({
        title: testName?.trim() ? `Test Updated: ${testName.trim()}` : 'Assigned Test Updated',
        content: testName?.trim()
          ? `Your teacher updated and republished "${testName.trim()}". You can write the test now.`
          : 'Your teacher updated and republished a test. You can write the test now.',
        type: 'info',
        target_role: 'student',
        target_user_id: studentId,
      }));

      if (studentNotificationRows.length > 0) {
        let { error: notificationError } = await supabase
          .from('admin_notifications')
          .insert(studentNotificationRows);

        if (notificationError && isTargetUserIdColumnError(notificationError)) {
          const fallbackRows = studentNotificationRows.map(({ target_user_id, content, ...rest }) => ({
            ...rest,
            content: `[target_user_id:${target_user_id}] ${content}`,
          }));
          const fallback = await supabase
            .from('admin_notifications')
            .insert(fallbackRows);
          notificationError = fallback.error;
        }

        if (notificationError) {
          logWarn({ message: 'Teacher test notifications could not be created:', source: 'TeacherConductTests', details: notificationError.message || notificationError })
        }
      }

      await loadData();

      await sendAdminNotification({
        title: 'Teacher Published Test',
        content: `${profile?.full_name || 'Teacher'} published ${testName?.trim() ? `"${testName.trim()}"` : 'a test'} ${publishForAllStudents ? 'for all assigned students' : `for ${targetStudentIds.length} selected student(s)`}.`,
        admin_id: profile?.id || null,
      });
    } catch (err) {
      setAlertModal({
        show: true,
        title: 'Publish Failed',
        message: err.message || 'Could not publish test.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading teacher test workspace..." />;

  return (
    <div className="p-6 space-y-5">
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-teal-50 via-white to-cyan-50 p-5">
        <h1 className="text-2xl font-bold text-slate-900">Teacher Test Console</h1>
        <p className="text-sm text-slate-600 mt-1">
          Add and publish tests only for your assigned students. Published tests are attempted in the separate `TestExam.jsx` flow.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-slate-600" />
            <h2 className="font-semibold text-slate-800">Assigned Students</h2>
          </div>
          {students.length === 0 ? (
            <p className="text-sm text-slate-500">No assigned students yet.</p>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
              {students.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStudentId(s.id)}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                    selectedStudentId === s.id
                      ? 'border-teal-400 bg-teal-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-800">{s.full_name || 'Student'}</p>
                  <p className="text-xs text-slate-500">{s.email}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={16} className="text-slate-600" />
            <h2 className="font-semibold text-slate-800">Test Builder</h2>
          </div>

          {students.length === 0 ? (
            <p className="text-sm text-slate-500">No assigned students available for test publishing.</p>
          ) : availableCourses.length === 0 ? (
            <p className="text-sm text-slate-500">
              No course buckets are available yet. Add at least one course in admin panel so teacher tests can be created for assigned students.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Test Audience</label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 space-y-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={publishForAllStudents}
                        onChange={(e) => setPublishForAllStudents(e.target.checked)}
                      />
                      <span className="font-medium">This test is for all assigned students</span>
                    </label>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!publishForAllStudents}
                          onChange={(e) => setPublishForAllStudents(!e.target.checked)}
                        />
                        <span className="font-medium">Check for whom this test is</span>
                      </label>
                      {!publishForAllStudents ? (
                        <div className="mt-3 space-y-2 max-h-44 overflow-auto pr-1">
                          {students.map((student) => (
                            <label key={student.id} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2">
                              <input
                                type="checkbox"
                                checked={targetStudentIds.includes(student.id)}
                                onChange={() => toggleTargetStudent(student.id)}
                                className="mt-1"
                              />
                              <span>
                                <span className="block text-sm font-semibold text-slate-800">{student.full_name || 'Student'}</span>
                                <span className="block text-xs text-slate-500">{student.email}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500">
                      {publishForAllStudents
                        ? 'This test will be visible to all students assigned to you.'
                        : `This test will be visible only to ${targetStudentIds.length} selected student(s).`}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-slate-600">
                  Questions: <span className="font-semibold">{selectedExamQuestions.length}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Custom Test Name</label>
                <input
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  placeholder="e.g., Arrays Weekly Test 1"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                />
                <p className="text-xs text-slate-500 mt-1">Certificate generation is disabled for teacher tests.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addQuestion}
                  className="inline-flex items-center gap-2 bg-teal-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-teal-700"
                >
                  <Plus size={14} /> Add Question
                </button>
                <button
                  type="button"
                  onClick={publishQuestions}
                  disabled={saving}
                  className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60"
                >
                  <Save size={14} /> {saving ? 'Publishing...' : 'Publish Test'}
                </button>
              </div>

              {selectedExamQuestions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                  0 tests at beginning. Add questions and publish so students can write in exam with strict proctoring.
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedExamQuestions.map((q, idx) => (
                    <div key={idx} className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-slate-800">Question {idx + 1}</p>
                        <button
                          type="button"
                          onClick={() => deleteQuestion(selectedExam.id, idx)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-2 mb-2">
                        <input
                          className="border border-slate-300 rounded p-2 text-sm"
                          placeholder="Enter topic / question text"
                          value={q.question || ''}
                          onChange={(e) => updateQuestion(selectedExam.id, idx, 'question', e.target.value)}
                        />
                        <select
                          className="border border-slate-300 rounded p-2 text-sm"
                          value={q.question_type || 'mcq'}
                          onChange={(e) => updateQuestion(selectedExam.id, idx, 'question_type', e.target.value)}
                        >
                          <option value="mcq">MCQ</option>
                          <option value="coding">Coding</option>
                        </select>
                      </div>

                      {(q.question_type || 'mcq') === 'mcq' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {[0, 1, 2, 3].map((op) => (
                            <div key={op} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`correct-${idx}`}
                                checked={Number(q.correct_index) === op}
                                onChange={() => updateQuestion(selectedExam.id, idx, 'correct_index', op)}
                              />
                              <input
                                className="w-full border border-slate-300 rounded p-2 text-sm"
                                placeholder={`Option ${op + 1}`}
                                value={(q.options || [])[op] || ''}
                                onChange={(e) => updateOption(selectedExam.id, idx, op, e.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <select
                            className="border border-slate-300 rounded p-2 text-sm"
                            value={q.coding_language || 'python'}
                            onChange={(e) => updateQuestion(selectedExam.id, idx, 'coding_language', e.target.value)}
                          >
                            <option value="python">Python</option>
                            <option value="java">Java</option>
                            <option value="cpp">C++</option>
                            <option value="c">C</option>
                          </select>
                          <textarea
                            className="w-full border border-slate-300 rounded p-2 text-sm min-h-[100px]"
                            placeholder="Coding problem description"
                            value={q.coding_description || ''}
                            onChange={(e) => updateQuestion(selectedExam.id, idx, 'coding_description', e.target.value)}
                          />
                          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 space-y-1">
                            <p className="font-semibold">Array input/output format</p>
                            <p>Input: write values exactly as the program should read them.</p>
                            <p>Example input: `5` on first line and `1 2 3 4 5` on second line.</p>
                            <p>Example output: `15` for sum, or `1 2 3 4 5` for printing the array.</p>
                            <p>For 2D arrays, use one row per line. Example: `1 2 3` then `4 5 6`.</p>
                          </div>

                          <div className="rounded-lg border border-slate-200 bg-white p-2 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-slate-700">
                                Shown Test Cases ({normalizeTestCases(q.shown_test_cases).length})
                              </p>
                              <button
                                type="button"
                                onClick={() => addCodingTestCase(selectedExam.id, idx, 'shown_test_cases')}
                                className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                              >
                                + Add Shown
                              </button>
                            </div>
                            {normalizeTestCases(q.shown_test_cases).map((tc, tcIdx) => (
                              <div key={`shown-${tcIdx}`} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
                                <textarea
                                  className="border border-slate-300 rounded p-2 text-xs min-h-[64px]"
                                  placeholder="Input"
                                  value={tc.input || ''}
                                  onChange={(e) => updateCodingTestCase(selectedExam.id, idx, 'shown_test_cases', tcIdx, 'input', e.target.value)}
                                />
                                <textarea
                                  className="border border-slate-300 rounded p-2 text-xs min-h-[64px]"
                                  placeholder="Expected output"
                                  value={tc.output || ''}
                                  onChange={(e) => updateCodingTestCase(selectedExam.id, idx, 'shown_test_cases', tcIdx, 'output', e.target.value)}
                                />
                                <button
                                  type="button"
                                  onClick={() => deleteCodingTestCase(selectedExam.id, idx, 'shown_test_cases', tcIdx)}
                                  className="text-red-600 hover:text-red-700 text-xs border border-red-200 rounded px-2 py-1 h-fit"
                                >
                                  Delete
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="rounded-lg border border-slate-200 bg-white p-2 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-slate-700">
                                Hidden Test Cases ({normalizeTestCases(q.hidden_test_cases).length})
                              </p>
                              <button
                                type="button"
                                onClick={() => addCodingTestCase(selectedExam.id, idx, 'hidden_test_cases')}
                                className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200"
                              >
                                + Add Hidden
                              </button>
                            </div>
                            {normalizeTestCases(q.hidden_test_cases).map((tc, tcIdx) => (
                              <div key={`hidden-${tcIdx}`} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
                                <textarea
                                  className="border border-slate-300 rounded p-2 text-xs min-h-[64px]"
                                  placeholder="Input"
                                  value={tc.input || ''}
                                  onChange={(e) => updateCodingTestCase(selectedExam.id, idx, 'hidden_test_cases', tcIdx, 'input', e.target.value)}
                                />
                                <textarea
                                  className="border border-slate-300 rounded p-2 text-xs min-h-[64px]"
                                  placeholder="Expected output"
                                  value={tc.output || ''}
                                  onChange={(e) => updateCodingTestCase(selectedExam.id, idx, 'hidden_test_cases', tcIdx, 'output', e.target.value)}
                                />
                                <button
                                  type="button"
                                  onClick={() => deleteCodingTestCase(selectedExam.id, idx, 'hidden_test_cases', tcIdx)}
                                  className="text-red-600 hover:text-red-700 text-xs border border-red-200 rounded px-2 py-1 h-fit"
                                >
                                  Delete
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <h3 className="font-semibold text-slate-800 mb-2">Student Marks</h3>
                {selectedExamSubmissions.length === 0 ? (
                  <p className="text-sm text-slate-500">No marks yet for this test.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedExamSubmissions.slice(0, 20).map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-sm border border-slate-200 rounded p-2">
                        <div>
                          <p className="font-medium text-slate-800">{s.user?.full_name || s.user?.email || 'Student'}</p>
                          <p className="text-xs text-slate-500">{s.submitted_at ? new Date(s.submitted_at).toLocaleString('en-IN') : '—'}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-900">{Math.round(s.score_percent || 0)}%</p>
                          <p className={`text-xs ${s.passed ? 'text-emerald-700' : 'text-rose-700'}`}>{s.passed ? 'Passed' : 'Failed'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <h3 className="font-semibold text-slate-800 mb-2">Test-wise Results</h3>
                {!selectedStudent ? (
                  <p className="text-sm text-slate-500">Select a student to view results.</p>
                ) : selectedStudentTestwiseResults.length === 0 ? (
                  <p className="text-sm text-slate-500">No test-wise results yet for this student.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedStudentTestwiseResults.map((r) => (
                      <div key={`${r.courseId}-${r.submittedAt}`} className="flex items-center justify-between text-sm border border-slate-200 rounded p-2">
                        <div>
                          <p className="font-medium text-slate-800">{r.courseTitle}</p>
                          <p className="text-xs text-slate-500">{r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-IN') : '—'}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-900">{Math.round(r.score)}%</p>
                          <p className={`text-xs ${r.passed ? 'text-emerald-700' : 'text-rose-700'}`}>{r.passed ? 'Passed' : 'Failed'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5" />
                After publish, students can attempt the test from Write Test and strict proctoring in `TestExam.jsx` is applied.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TeacherConductTests;
