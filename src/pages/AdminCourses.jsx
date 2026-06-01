import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import AlertModal from '../components/AlertModal';
import { Save, RefreshCw, Edit2, X, Plus, Trash2, Award } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import NotesUrlFields from '../components/NotesUrlFields';
import { useAuth } from '../context/AuthContext';
import {
  fetchCourseProtectedAssetsMap,
  mergeCoursesWithProtectedAssets,
  upsertCourseProtectedAssets
} from '../utils/courseProtectedAssets';
import { readBrowserState, writeBrowserState } from '../utils/browserState';

const ADMIN_NEW_COURSE_DRAFT_KEY = 'admin_courses_new_course_draft';

const CODING_LANGUAGES = ['python', 'java', 'cpp', 'c'];
const makeDefaultQuestion = (examId, orderIndex = 0) => ({
  exam_id: examId,
  question: '',
  question_type: 'mcq',
  coding_description: '',
  options: ['', '', '', ''],
  correct_index: 0,
  coding_language: 'python',
  shown_test_cases: [],
  hidden_test_cases: [],
  order_index: orderIndex,
});

function normalizeCases(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

const EMPTY_NOTES_DRAFT = [''];

function normalizeNotesDraft(value) {
  if (Array.isArray(value) && value.length > 0) return value;
  if (typeof value === 'string' && value.trim()) return [value];
  return [...EMPTY_NOTES_DRAFT];
}

function extractMissingExamQuestionColumn(error) {
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
}

const AdminCourses = () => {
  const { profile } = useAuth();
  const isTeacher = profile?.role === 'teacher';
  const [courses, setCourses] = useState([]);
  const [minQuestionsByCourse, setMinQuestionsByCourse] = useState({});
  const [exams, setExams] = useState({});
  const [questions, setQuestions] = useState({});
  const [submissions, setSubmissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courseSearch, setCourseSearch] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });
  const [showNewCourseForm, setShowNewCourseForm] = useState(false);
  const [newCourse, setNewCourse] = useState(() => {
    const savedDraft = readBrowserState(ADMIN_NEW_COURSE_DRAFT_KEY, {});
    return {
      title: savedDraft.title || '',
      category: savedDraft.category || '',
      description: savedDraft.description || '',
      video_url: savedDraft.video_url || '',
      thumbnail_url: savedDraft.thumbnail_url || '',
      notes_image_url: savedDraft.notes_image_url || '',
      notes_urls: normalizeNotesDraft(savedDraft.notes_urls || savedDraft.notes_url),
      is_free: !!savedDraft.is_free,
    };
  });
  const [deleteModal, setDeleteModal] = useState({ show: false, courseId: null, courseTitle: '' });
  const [questionEditor, setQuestionEditor] = useState({ open: false, examId: null, index: 0 });
  const getQuestionDraftKey = (examId) => `exam_questions_draft_${examId}`;

  const loadDraftQuestions = (examId) => {
    try {
      const raw = localStorage.getItem(getQuestionDraftKey(examId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const saveDraftQuestions = (examId, list) => {
    try {
      localStorage.setItem(getQuestionDraftKey(examId), JSON.stringify(list || []));
    } catch {
      // ignore storage errors
    }
  };

  const clearDraftQuestions = (examId) => {
    try {
      localStorage.removeItem(getQuestionDraftKey(examId));
    } catch {
      // ignore storage errors
    }
  };

  const filteredCourses = courses.filter((course) => {
    const q = courseSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(course.id || '').toLowerCase().includes(q) ||
      String(course.title || '').toLowerCase().includes(q) ||
      String(course.category || '').toLowerCase().includes(q)
    );
  });

  const loadData = async () => {
    setLoading(true);
    setMessage('');
    let teacherAllowedCourseIds = null;

    if (isTeacher && profile?.id) {
      const { data: assignedStudents } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'student')
        .eq('assigned_teacher_id', profile.id);

      const studentIds = (assignedStudents || []).map((s) => s.id).filter(Boolean);
      if (studentIds.length === 0) {
        teacherAllowedCourseIds = [];
      } else {
        const { data: enrollmentRows } = await supabase
          .from('enrollments')
          .select('course_id')
          .in('student_id', studentIds);
        teacherAllowedCourseIds = Array.from(
          new Set((enrollmentRows || []).map((r) => r.course_id).filter(Boolean))
        );
      }
    }
    
    // Load courses
    const { data: coursesData, error: coursesError } = await supabase
      .from('courses')
      .select('*')
      .order('id');

    if (coursesError) {
      setMessage(coursesError.message);
    } else {
      const scopedCourses = isTeacher
        ? (coursesData || []).filter((c) => (teacherAllowedCourseIds || []).includes(c.id))
        : (coursesData || []);
      const assetsMap = await fetchCourseProtectedAssetsMap(scopedCourses.map((course) => course.id));
      setCourses(mergeCoursesWithProtectedAssets(scopedCourses, assetsMap));
      // Load min_questions for each course
      const minMap = {};
      scopedCourses?.forEach(c => {
        minMap[c.id] = c.min_questions || null;
      });
      setMinQuestionsByCourse(minMap);
    }

    // Load exams
    const { data: examsData } = await supabase
      .from('exams')
      .select('*');
    
    const examsMap = {};
    const scopedExams = isTeacher
      ? (examsData || []).filter((e) => (teacherAllowedCourseIds || []).includes(e.course_id))
      : (examsData || []);
    scopedExams?.forEach(exam => {
      examsMap[exam.course_id] = exam;
    });
    setExams(examsMap);

    // Load exam questions
    const { data: questionsData } = await supabase
      .from('exam_questions')
      .select('*');
    
    const questionsMap = {};
    const allowedExamIds = new Set(Object.values(examsMap).map((e) => e.id));
    const scopedQuestions = (questionsData || []).filter((q) => allowedExamIds.has(q.exam_id));
    scopedQuestions?.forEach(q => {
      if (!questionsMap[q.exam_id]) questionsMap[q.exam_id] = [];
      questionsMap[q.exam_id].push(q);
    });
    setQuestions(questionsMap);

    // Load submissions
    const { data: submissionsData } = await supabase
      .from('exam_submissions')
      .select('*, user:profiles(id, full_name, email)')
      .order('submitted_at', { ascending: false });
    
    const submissionsMap = {};
    submissionsData?.forEach(s => {
      if (!submissionsMap[s.exam_id]) submissionsMap[s.exam_id] = [];
      submissionsMap[s.exam_id].push(s);
    });
    setSubmissions(submissionsMap);
    
    setLoading(false);
  };

  useEffect(() => {
    if (!profile?.id) return;
    loadData();
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    writeBrowserState(ADMIN_NEW_COURSE_DRAFT_KEY, newCourse);
  }, [newCourse]);

  const handleCourseChange = (id, field, value) => {
    setCourses(prev => prev.map(c => {
      if (c.id === id) {
        // Ensure min_questions is always a number
        if (field === 'min_questions') {
          return { ...c, [field]: parseInt(value) || 1 };
        }
        return { ...c, [field]: value };
      }
      return c;
    }));
    if (field === 'min_questions') {
      setMinQuestionsByCourse(prev => ({ ...prev, [id]: value }));
    }
  };

  const handleExamChange = (courseId, field, value) => {
    setExams(prev => ({
      ...prev,
      [courseId]: {
        ...prev[courseId],
        [field]: value
      }
    }));
  };

  const handleSaveCourse = async (course) => {
    if (isTeacher) {
      setAlertModal({
        show: true,
        title: 'Access Restricted',
        message: 'Teachers can conduct/publish tests only. Course editing is admin-only.',
        type: 'warning'
      });
      return;
    }
    setSavingId(`course-${course.id}`);
    setMessage('');
    const { error } = await supabase
      .from('courses')
      .update({
        title: course.title,
        category: course.category,
        description: course.description,
        thumbnail_url: course.thumbnail_url,
        min_questions: typeof course.min_questions === 'number' ? course.min_questions : parseInt(course.min_questions) || 1
      })
      .eq('id', course.id);
    
    if (error) setMessage(`Error: ${error.message}`);
    else setMessage('✅ Course saved');
    
    if (!error) {
      try {
        const savedAssets = await upsertCourseProtectedAssets(course.id, {
          video_url: course.video_url,
          notes_image_url: course.notes_image_url,
          notes_urls: course.notes_urls,
        });
        setCourses((prev) => prev.map((item) => (
          item.id === course.id ? { ...item, ...savedAssets } : item
        )));
        setMessage('Course saved');
      } catch (assetError) {
        setMessage(`Error: ${assetError.message}`);
      }
    }

    setSavingId(null);
    setTimeout(() => setMessage(''), 2000);
  };

  const handleCreateCourse = async () => {
    if (isTeacher) {
      setAlertModal({
        show: true,
        title: 'Access Restricted',
        message: 'Creating courses is admin-only.',
        type: 'warning'
      });
      return;
    }
    if (!newCourse.title || !newCourse.category) {
      setAlertModal({
        show: true,
        title: 'Missing Information',
        message: 'Please provide at least course title and category',
        type: 'warning'
      });
      return;
    }

    try {
      const { video_url, notes_image_url, notes_urls, ...coursePayload } = newCourse;
      const { data, error } = await supabase
        .from('courses')
        .insert([{ ...coursePayload, is_free: !!newCourse.is_free }])
        .select()
        .single();

      if (error) throw error;

      await upsertCourseProtectedAssets(data.id, { video_url, notes_image_url, notes_urls });

      // Create default exam for the course
      const { error: examCreateError } = await supabase
        .from('exams')
        .insert([{
          course_id: data.id,
          duration_minutes: 60,
          pass_percent: 70
        }]);
      if (examCreateError) {
        throw new Error(`Course created but exam creation failed: ${examCreateError.message}`);
      }

      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Course created successfully!',
        type: 'success'
      });

      setShowNewCourseForm(false);
      setNewCourse({
        title: '',
        category: '',
        description: '',
        video_url: '',
        thumbnail_url: '',
        notes_image_url: '',
        notes_urls: [...EMPTY_NOTES_DRAFT],
        is_free: false
      });
      writeBrowserState(ADMIN_NEW_COURSE_DRAFT_KEY, {
        title: '',
        category: '',
        description: '',
        video_url: '',
        thumbnail_url: '',
        notes_image_url: '',
        notes_urls: [...EMPTY_NOTES_DRAFT],
        is_free: false
      });
      loadData();
    } catch (error) {
      setAlertModal({
        show: true,
        title: 'Error',
        message: error.message,
        type: 'error'
      });
    }
  };

  const deleteCourse = async () => {
    if (isTeacher) {
      setAlertModal({
        show: true,
        title: 'Access Restricted',
        message: 'Deleting courses is admin-only.',
        type: 'warning'
      });
      return;
    }
    const courseId = deleteModal.courseId;
    setDeleteModal({ show: false, courseId: null, courseTitle: '' });

    try {
      // Delete related data first
      const exam = exams[courseId];
      if (exam) {
        await supabase.from('exam_questions').delete().eq('exam_id', exam.id);
        await supabase.from('exam_submissions').delete().eq('exam_id', exam.id);
        await supabase.from('exams').delete().eq('id', exam.id);
      }

      // Delete course
      const { error } = await supabase
        .from('courses')
        .delete()
        .eq('id', courseId);

      if (error) throw error;

      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Course deleted successfully',
        type: 'success'
      });

      loadData();
    } catch (error) {
      setAlertModal({
        show: true,
        title: 'Error',
        message: error.message,
        type: 'error'
      });
    }
  };

  const handleSaveExam = async (courseId) => {
    if (!exams[courseId]) return;
    
    setSavingId(`exam-${courseId}`);
    setMessage('');
    const exam = exams[courseId];
    
    const { error } = await supabase
      .from('exams')
      .update({
        duration_minutes: parseInt(exam.duration_minutes),
        pass_percent: parseInt(exam.pass_percent)
      })
      .eq('id', exam.id);
    
    if (error) setMessage(`Error: ${error.message}`);
    else setMessage('✅ Exam settings saved');
    
    setSavingId(null);
    setTimeout(() => setMessage(''), 2000);
  };

  const addQuestion = (examId) => {
    setQuestions(prev => {
      const next = {
        ...prev,
        [examId]: [
          ...(prev[examId] || []),
          makeDefaultQuestion(examId, (prev[examId]?.length || 0))
        ]
      };
      saveDraftQuestions(examId, next[examId]);
      return next;
    });
  };

  const addQuestionAndOpenEditor = (examId) => {
    const newIndex = (questions[examId] || []).length;
    addQuestion(examId);
    setQuestionEditor({ open: true, examId, index: newIndex });
  };

  const saveQuestionsDraft = (examId) => {
    saveDraftQuestions(examId, questions[examId] || []);
    setMessage('✅ Draft saved. Students cannot see these questions until you publish.');
    setTimeout(() => setMessage(''), 2500);
  };

  const deleteQuestion = (examId, index) => {
    setQuestions(prev => {
      const next = {
        ...prev,
        [examId]: (prev[examId] || []).filter((_, i) => i !== index)
      };
      saveDraftQuestions(examId, next[examId]);
      return next;
    });
  };

  const deleteQuestionWithEditorState = (examId, index) => {
    const currentLen = (questions[examId] || []).length;
    deleteQuestion(examId, index);
    setQuestionEditor(prev => {
      if (!prev.open || prev.examId !== examId) return prev;
      const remaining = currentLen - 1;
      if (remaining <= 0) return { open: false, examId: null, index: 0 };
      if (index < prev.index) return { ...prev, index: prev.index - 1 };
      if (index === prev.index) {
        return { ...prev, index: Math.max(0, Math.min(prev.index, remaining - 1)) };
      }
      return prev;
    });
  };

  const openQuestionEditor = (examId, index) => {
    setQuestionEditor({ open: true, examId, index });
  };

  const closeQuestionEditor = () => {
    setQuestionEditor({ open: false, examId: null, index: 0 });
  };

  const handleQuestionChange = (examId, index, field, value) => {
    setQuestions(prev => {
      const next = {
        ...prev,
        [examId]: (prev[examId] || []).map((q, i) => 
          i === index ? { ...q, [field]: value } : q
        )
      };
      saveDraftQuestions(examId, next[examId]);
      return next;
    });
  };

  const handleOptionChange = (examId, qIndex, optIndex, value) => {
    setQuestions(prev => {
      const next = {
        ...prev,
        [examId]: (prev[examId] || []).map((q, i) => {
          if (i === qIndex) {
            const newOptions = [...(q.options || [])];
            newOptions[optIndex] = value;
            return { ...q, options: newOptions };
          }
          return q;
        })
      };
      saveDraftQuestions(examId, next[examId]);
      return next;
    });
  };

  const addTestCase = (examId, qIndex, bucket) => {
    setQuestions(prev => {
      const next = {
        ...prev,
        [examId]: (prev[examId] || []).map((q, i) => {
          if (i !== qIndex) return q;
          return { ...q, [bucket]: [...normalizeCases(q[bucket]), { input: '', output: '' }] };
        })
      };
      saveDraftQuestions(examId, next[examId]);
      return next;
    });
  };

  const updateTestCase = (examId, qIndex, bucket, testIndex, field, value) => {
    setQuestions(prev => {
      const next = {
        ...prev,
        [examId]: (prev[examId] || []).map((q, i) => {
          if (i !== qIndex) return q;
          const list = normalizeCases(q[bucket]).map((tc, idx) => idx === testIndex ? { ...tc, [field]: value } : tc);
          return { ...q, [bucket]: list };
        })
      };
      saveDraftQuestions(examId, next[examId]);
      return next;
    });
  };

  const deleteTestCase = (examId, qIndex, bucket, testIndex) => {
    setQuestions(prev => {
      const next = {
        ...prev,
        [examId]: (prev[examId] || []).map((q, i) => {
          if (i !== qIndex) return q;
          const list = normalizeCases(q[bucket]).filter((_, idx) => idx !== testIndex);
          return { ...q, [bucket]: list };
        })
      };
      saveDraftQuestions(examId, next[examId]);
      return next;
    });
  };

  useEffect(() => {
    if (activeTab !== 'questions' || !selectedCourse || !exams[selectedCourse.id]?.id) return;
    const examId = exams[selectedCourse.id].id;
    const draft = loadDraftQuestions(examId);
    if (!draft) return;
    setQuestions(prev => ({ ...prev, [examId]: draft }));
  }, [activeTab, selectedCourse, exams]);

  useEffect(() => {
    if (activeTab !== 'questions' || !selectedCourse) {
      closeQuestionEditor();
    }
  }, [activeTab, selectedCourse]);

  const handleSaveQuestions = async (examId) => {
    if (!questions[examId]) return;

    setSavingId(`questions-${examId}`);
    setMessage('');

    try {
      const { error: deleteError } = await supabase
        .from('exam_questions')
        .delete()
        .eq('exam_id', examId);

      if (deleteError) throw deleteError;

      const questionsToInsert = questions[examId].map((q, idx) => ({
        exam_id: examId,
        question: q.question,
        question_type: q.question_type === 'coding' ? 'coding' : 'mcq',
        coding_description: q.question_type === 'coding' ? (q.coding_description || '') : null,
        options: q.question_type === 'coding' ? [] : (q.options || []),
        // Keep numeric value to support existing DB schemas where correct_index is NOT NULL.
        correct_index: q.question_type === 'coding' ? 0 : q.correct_index,
        coding_language: q.question_type === 'coding' ? (q.coding_language || 'python') : null,
        shown_test_cases: q.question_type === 'coding' ? normalizeCases(q.shown_test_cases) : [],
        hidden_test_cases: q.question_type === 'coding' ? normalizeCases(q.hidden_test_cases) : [],
        order_index: idx
      }));

      if (questionsToInsert.length === 0) {
        throw new Error('Add at least one question before publishing.');
      }

      let insertPayload = questionsToInsert;
      for (let i = 0; i < 8; i += 1) {
        const { error: insertError } = await supabase
          .from('exam_questions')
          .insert(insertPayload);
        if (!insertError) break;
        const missingCol = extractMissingExamQuestionColumn(insertError);
        if (!missingCol) throw insertError;
        insertPayload = insertPayload.map((row) => {
          const clone = { ...row };
          delete clone[missingCol];
          return clone;
        });
        if (i === 7) throw insertError;
      }
      clearDraftQuestions(examId);
      await supabase
        .from('exams')
        .update({ question_set_updated_at: new Date().toISOString() })
        .eq('id', examId);
      setMessage('✅ Questions published successfully');
      setAlertModal({
        show: true,
        title: 'Published',
        message: `Questions published successfully (${questionsToInsert.length} question${questionsToInsert.length > 1 ? 's' : ''}).`,
        type: 'success'
      });
    } catch (err) {
      setMessage(`Error: ${err.message}`);
      setAlertModal({
        show: true,
        title: 'Publish Failed',
        message: err.message || 'Failed to publish questions.',
        type: 'error'
      });
    }

    setSavingId(null);
    setTimeout(() => setMessage(''), 2000);
  };

  const generateCertificate = async (submission) => {
    if (!submission.passed) {
      setAlertModal({
        show: true,
        title: 'Cannot Generate Certificate',
        message: 'Certificate can only be generated for passed exams',
        type: 'warning'
      });
      return;
    }

    try {
      setSavingId(`cert-${submission.id}`);
      const courseId = Object.values(exams).find(e => e.id === submission.exam_id)?.course_id;
      
      const { error } = await supabase
        .from('certificates')
        .insert({
          user_id: submission.user_id,
          course_id: courseId,
          exam_submission_id: submission.id,
          issued_at: new Date().toISOString()
        });

      if (error) {
        if (error.code === '23505') {
          setAlertModal({
            show: true,
            title: 'Certificate Exists',
            message: 'Certificate already exists for this submission',
            type: 'info'
          });
        } else {
          throw error;
        }
      } else {
        setAlertModal({
          show: true,
          title: 'Success',
          message: 'Certificate generated successfully',
          type: 'success'
        });
      }
    } catch (err) {
      setAlertModal({
        show: true,
        title: 'Error',
        message: `Error generating certificate: ${err.message}`,
        type: 'error'
      });
    } finally {
      setSavingId(null);
    }
  };

  const openCourseDetail = (course) => {
    setSelectedCourse(course);
    setActiveTab('overview');
  };

  const closeCourseDetail = () => {
    setSelectedCourse(null);
    setActiveTab('overview');
  };

  const activeExamId = selectedCourse ? exams[selectedCourse.id]?.id : null;
  const activeQuestions = activeExamId ? (questions[activeExamId] || []) : [];
  const editingQuestion =
    questionEditor.open && questionEditor.examId === activeExamId
      ? activeQuestions[questionEditor.index]
      : null;

  return (
    <div className="flex h-screen bg-slate-50">
      <AlertModal 
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 p-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {isTeacher ? 'Conduct Tests' : 'Admin Course Management'}
            </h1>
            <p className="text-slate-500 text-sm">
              {isTeacher
                ? 'Create and publish exam questions for courses of your assigned students.'
                : 'Edit course details, exam duration, and video links'}
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
            <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-3">
              <input
                type="text"
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                placeholder="Search courses by title, category, or ID..."
                className="w-full text-sm outline-none"
              />
              {courseSearch && (
                <button
                  onClick={() => setCourseSearch('')}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button 
                onClick={loadData} 
                className="flex items-center gap-2 text-sm bg-white border px-3 py-2 rounded-lg hover:bg-slate-50"
              >
                <RefreshCw size={16} /> Refresh
              </button>
              {!isTeacher && (
                <button 
                  onClick={() => setShowNewCourseForm(true)} 
                  className="flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  <Plus size={16} /> Add New Course
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-semibold">
              Total Courses: {courses.length}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-slate-200 text-slate-700 font-semibold">
              Showing: {filteredCourses.length}
            </span>
          </div>
        </div>

      {message && (
        <div className={`text-sm p-3 rounded-lg ${message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message}
        </div>
      )}

      {loading ? (
        <LoadingSpinner message="Loading courses and exams..." />
      ) : courses.length === 0 ? (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
          {isTeacher ? '0 tests available right now. Once your students are assigned and enrolled, tests will appear here.' : 'No courses found'}
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
          No matching courses for "{courseSearch}"
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4">
            {filteredCourses.map(course => (
              <div key={course.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Course Header */}
              <div className="p-4 bg-gradient-to-r from-blue-50 to-slate-50 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => setExpandedCourse(expandedCourse === course.id ? null : course.id)}>
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-slate-900">{course.title || 'Untitled Course'}</h3>
                  <p className="text-sm text-slate-600">ID: {course.id} • Category: {course.category}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!isTeacher && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();                      setDeleteModal({ show: true, courseId: course.id, courseTitle: course.title });
                      }}
                      className="flex items-center gap-1 bg-red-600 text-white px-3 py-1.5 rounded text-sm hover:bg-red-700 transition-colors font-semibold"
                      title="Delete Course"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();                      openCourseDetail(course);
                    }}
                    className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 transition-colors font-semibold"
                  >
                    <Edit2 size={14} /> Details
                  </button>
                  <span className="text-blue-600 font-semibold text-sm">
                    {expandedCourse === course.id ? '▼' : '▶'}
                  </span>
                </div>
              </div>

              {/* Expanded Course Details */}
              {expandedCourse === course.id && (
                <div className="border-t border-slate-200 p-6 space-y-6">
                  {/* Course Information */}
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                      <Edit2 size={16} /> Course Information
                    </h4>
                    
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Course Title</label>
                        <input
                          type="text"
                          className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={course.title || ''}
                          onChange={e => handleCourseChange(course.id, 'title', e.target.value)}
                          placeholder="Enter course title"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
                        <input
                          type="text"
                          className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={course.category || ''}
                          onChange={e => handleCourseChange(course.id, 'category', e.target.value)}
                          placeholder="e.g., Web Development"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Course Image URL</label>
                      <input
                        type="url"
                        className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={course.thumbnail_url || ''}
                        onChange={e => handleCourseChange(course.id, 'thumbnail_url', e.target.value)}
                        placeholder="https://example.com/image.jpg"
                      />
                      <p className="text-xs text-slate-500 mt-1">Direct image URL or Google Drive shared link</p>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Video Link (YouTube or Drive Iframe)</label>
                      <textarea
                        className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={course.video_url || ''}
                        onChange={e => handleCourseChange(course.id, 'video_url', e.target.value)}
                        placeholder="Direct MP4 URL or Google Drive file/embed link"
                        rows="3"
                      />
                      <p className="text-xs text-slate-500 mt-1">Use a Google Drive file link or embed code. Avoid YouTube here because it can expose the original video outside SucessKart.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
                      <textarea
                        className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={course.description || ''}
                        onChange={e => handleCourseChange(course.id, 'description', e.target.value)}
                        placeholder="Enter course description"
                        rows="3"
                      />
                    </div>

                    <NotesUrlFields
                      label="Notes/Study Material Links"
                      values={normalizeNotesDraft(course.notes_urls)}
                      onChange={(nextValues) => handleCourseChange(course.id, 'notes_urls', nextValues)}
                      placeholder="https://drive.google.com/file/d/... or https://docs.google.com/document/d/..."
                    />

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Notes Preview Image URL</label>
                      <input
                        type="url"
                        className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={course.notes_image_url || ''}
                        onChange={e => handleCourseChange(course.id, 'notes_image_url', e.target.value)}
                        placeholder="https://example.com/advanced-notes-cover.jpg"
                      />
                      <p className="text-xs text-slate-500 mt-1">This image is shown only as an in-site preview card. Users do not get a clickable external link.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Description/Notes</label>
                      <textarea
                        className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-24"
                        value={course.description || ''}
                        onChange={e => handleCourseChange(course.id, 'description', e.target.value)}
                        placeholder="Course description and important notes..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Minimum Questions for This Course</label>
                      <input
                        type="number"
                        className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={minQuestionsByCourse[course.id] || ''}
                        onChange={e => handleCourseChange(course.id, 'min_questions', parseInt(e.target.value) || 1)}
                        min="1"
                        max="100"
                      />
                      <p className="text-xs text-slate-500 mt-1">Override global minimum for this course.</p>
                    </div>
                    {!isTeacher && (
                      <button
                        onClick={() => handleSaveCourse(course)}
                        disabled={savingId === `course-${course.id}`}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 font-semibold"
                      >
                        <Save size={18} />
                        {savingId === `course-${course.id}` ? 'Saving...' : 'Save Course'}
                      </button>
                    )}
                  </div>

                  {/* Exam Settings */}
                  {exams[course.id] && (
                    <div className="border-t pt-6 space-y-4">
                      <h4 className="font-bold text-slate-900 flex items-center gap-2">
                        <Edit2 size={16} /> Exam Settings
                      </h4>
                      
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Exam Duration (minutes)</label>
                          <input
                            type="number"
                            className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            value={exams[course.id].duration_minutes || 100}
                            onChange={e => handleExamChange(course.id, 'duration_minutes', e.target.value)}
                            min="1"
                            max="600"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Pass Percentage (%)</label>
                          <input
                            type="number"
                            className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            value={exams[course.id].pass_percent || 70}
                            onChange={e => handleExamChange(course.id, 'pass_percent', e.target.value)}
                            min="0"
                            max="100"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => handleSaveExam(course.id)}
                        disabled={savingId === `exam-${course.id}`}
                        className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-60 font-semibold"
                      >
                        <Save size={18} />
                        {savingId === `exam-${course.id}` ? 'Saving...' : 'Save Exam Settings'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            ))}
          </div>
        </div>
      )}
      </div>

      {/* Course Details Modal */}
      {selectedCourse && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeCourseDetail}
        >
        <div
          className="bg-white w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 text-white flex items-center justify-between">
            <div>
              <h2 className="font-bold text-xl">{selectedCourse.title}</h2>
              <p className="text-xs text-blue-100 mt-0.5">
                ID: {selectedCourse.id} | Category: {selectedCourse.category || 'General'}
              </p>
            </div>
            <button
              onClick={closeCourseDetail}
              className="p-1.5 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b px-6 py-3 bg-white">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-lg font-semibold text-sm transition-colors ${
                activeTab === 'overview'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('questions')}
              className={`px-3 py-1.5 rounded-lg font-semibold text-sm transition-colors ${
                activeTab === 'questions'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Questions
            </button>
            <button
              onClick={() => setActiveTab('results')}
              className={`px-3 py-1.5 rounded-lg font-semibold text-sm transition-colors ${
                activeTab === 'results'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Results
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-slate-50 to-slate-100">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-4 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Video Link</label>
                  <input
                    type="url"
                    className="w-full text-xs p-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={selectedCourse.video_url || ''}
                    onChange={e => {
                      setCourses(prev => prev.map(c => c.id === selectedCourse.id ? { ...c, video_url: e.target.value } : c));
                      setSelectedCourse(prev => ({ ...prev, video_url: e.target.value }));
                    }}
                    placeholder="https://youtube.com/..."
                  />
                </div>

                <NotesUrlFields
                  label="Notes/Study Material Links"
                  values={normalizeNotesDraft(selectedCourse.notes_urls)}
                  onChange={(nextValues) => {
                    setCourses(prev => prev.map(c => c.id === selectedCourse.id ? { ...c, notes_urls: nextValues } : c));
                    setSelectedCourse(prev => ({ ...prev, notes_urls: nextValues }));
                  }}
                  placeholder="https://drive.google.com/file/d/... or https://docs.google.com/document/d/..."
                  inputClassName="w-full text-xs p-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  labelClassName="block text-xs font-semibold text-slate-700 mb-1"
                  addButtonClassName="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                  removeButtonClassName="inline-flex items-center justify-center rounded border border-red-200 px-2 py-2 text-red-600 hover:bg-red-50"
                />

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Notes Preview Image URL</label>
                  <input
                    type="url"
                    className="w-full text-xs p-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={selectedCourse.notes_image_url || ''}
                    onChange={e => {
                      setCourses(prev => prev.map(c => c.id === selectedCourse.id ? { ...c, notes_image_url: e.target.value } : c));
                      setSelectedCourse(prev => ({ ...prev, notes_image_url: e.target.value }));
                    }}
                    placeholder="https://example.com/advanced-notes-cover.jpg"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">Shown inside SucessKart as a preview image only.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                  <textarea
                    className="w-full text-xs p-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-16"
                    value={selectedCourse.description || ''}
                    onChange={e => {
                      setCourses(prev => prev.map(c => c.id === selectedCourse.id ? { ...c, description: e.target.value } : c));
                      setSelectedCourse(prev => ({ ...prev, description: e.target.value }));
                    }}
                    placeholder="Course description..."
                  />
                </div>

                {!isTeacher && (
                  <button
                    onClick={() => handleSaveCourse(selectedCourse)}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 transition-colors font-semibold"
                  >
                    <Save size={16} /> Save Overview
                  </button>
                )}
              </div>
            )}

            {/* Questions Tab */}
            {activeTab === 'questions' && exams[selectedCourse.id] && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-slate-900">Exam Questions ({activeQuestions.length})</h3>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => addQuestionAndOpenEditor(activeExamId)} className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700 font-semibold"><Plus size={16} /> Add Question</button>
                      <button onClick={() => saveQuestionsDraft(activeExamId)} className="flex items-center gap-2 bg-amber-600 text-white px-3 py-2 rounded text-sm hover:bg-amber-700 font-semibold"><Save size={16} /> Save Draft</button>
                      <button onClick={() => handleSaveQuestions(activeExamId)} disabled={savingId === `questions-${activeExamId}`} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 font-semibold disabled:opacity-60"><Save size={16} /> {savingId === `questions-${activeExamId}` ? 'Publishing...' : 'Publish Questions'}</button>
                    </div>
                  </div>
                </div>

                {activeQuestions.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 bg-white border border-slate-200 rounded-xl">No questions added yet</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeQuestions.map((q, idx) => (
                      <div key={idx} role="button" tabIndex={0} onClick={() => openQuestionEditor(activeExamId, idx)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openQuestionEditor(activeExamId, idx); }} className="text-left bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-blue-300 transition cursor-pointer">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded">Q{idx + 1}</span>
                            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${(q.question_type || 'mcq') === 'coding' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>{(q.question_type || 'mcq') === 'coding' ? 'Coding' : 'MCQ'}</span>
                          </div>
                          <button type="button" onClick={(e) => { e.stopPropagation(); deleteQuestionWithEditorState(activeExamId, idx); }} className="text-red-600 hover:text-red-700 p-1 hover:bg-red-50 rounded" title="Delete question"><Trash2 size={14} /></button>
                        </div>
                        <p className="text-sm text-slate-800 mt-3">{q.question?.trim() || 'No question text yet'}</p>
                      </div>
                    ))}
                  </div>
                )}

                {editingQuestion && (
                  <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-4xl max-h-[92vh] overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
                        <p className="text-sm font-semibold text-slate-900">Edit Question {questionEditor.index + 1} of {activeQuestions.length}</p>
                        <button onClick={closeQuestionEditor} className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200"><X size={16} /></button>
                      </div>
                      <div className="p-5 overflow-y-auto max-h-[72vh] space-y-4">
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3">
                          <div>
                            <label className="text-xs font-semibold text-slate-600 block mb-1">Question Text</label>
                            <textarea className="w-full text-xs p-2 border border-slate-300 rounded-lg min-h-[80px]" value={editingQuestion.question || ''} onChange={e => handleQuestionChange(activeExamId, questionEditor.index, 'question', e.target.value)} placeholder="Enter question..." />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600 block mb-1">Question Type</label>
                            <select className="w-full text-xs p-2 border border-slate-300 rounded-lg" value={editingQuestion.question_type || 'mcq'} onChange={e => handleQuestionChange(activeExamId, questionEditor.index, 'question_type', e.target.value)}>
                              <option value="mcq">MCQ</option>
                              <option value="coding">Coding</option>
                            </select>
                          </div>
                        </div>

                        {(editingQuestion.question_type || 'mcq') === 'mcq' ? (
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-600 block">Options</label>
                            {(editingQuestion.options || []).map((opt, oIdx) => (
                              <div key={oIdx} className="flex items-center gap-2 p-2 rounded border border-slate-200" style={editingQuestion.correct_index === oIdx ? { backgroundColor: '#dcfce7', borderColor: '#22c55e' } : {}}>
                                <input type="radio" name={`correct-editor-${questionEditor.index}`} checked={editingQuestion.correct_index === oIdx} onChange={() => handleQuestionChange(activeExamId, questionEditor.index, 'correct_index', oIdx)} className="w-3 h-3" />
                                <input type="text" className="flex-1 text-xs p-1.5 border border-slate-300 rounded" value={opt} onChange={e => handleOptionChange(activeExamId, questionEditor.index, oIdx, e.target.value)} placeholder={`Option ${oIdx + 1}`} />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div>
                              <label className="text-xs font-semibold text-slate-600 block mb-1">Coding Description</label>
                              <textarea className="w-full text-xs p-2 border border-slate-300 rounded-lg min-h-[140px]" value={editingQuestion.coding_description || ''} onChange={e => handleQuestionChange(activeExamId, questionEditor.index, 'coding_description', e.target.value)} placeholder="Describe problem statement..." />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-slate-600 block mb-1">Default Language</label>
                              <select className="w-full md:w-[220px] text-xs p-2 border border-slate-300 rounded-lg" value={editingQuestion.coding_language || 'python'} onChange={e => handleQuestionChange(activeExamId, questionEditor.index, 'coding_language', e.target.value)}>
                                {CODING_LANGUAGES.map((lang) => (<option key={lang} value={lang}>{lang.toUpperCase()}</option>))}
                              </select>
                            </div>

                            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-slate-700">Shown Test Cases ({normalizeCases(editingQuestion.shown_test_cases).length})</label>
                                <button type="button" onClick={() => addTestCase(activeExamId, questionEditor.index, 'shown_test_cases')} className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"><Plus size={12} /> Add Shown</button>
                              </div>
                              {normalizeCases(editingQuestion.shown_test_cases).map((tc, tcIdx) => (
                                <div key={`shown-${tcIdx}`} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 p-2 border border-slate-200 rounded bg-white">
                                  <textarea className="text-xs p-2 border border-slate-300 rounded min-h-[68px]" placeholder="Input" value={tc.input || ''} onChange={e => updateTestCase(activeExamId, questionEditor.index, 'shown_test_cases', tcIdx, 'input', e.target.value)} />
                                  <textarea className="text-xs p-2 border border-slate-300 rounded min-h-[68px]" placeholder="Expected output" value={tc.output || ''} onChange={e => updateTestCase(activeExamId, questionEditor.index, 'shown_test_cases', tcIdx, 'output', e.target.value)} />
                                  <button type="button" onClick={() => deleteTestCase(activeExamId, questionEditor.index, 'shown_test_cases', tcIdx)} className="text-red-600 hover:text-red-700 px-2 py-1 border border-red-200 rounded text-xs h-fit">Delete</button>
                                </div>
                              ))}
                            </div>

                            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-slate-700">Hidden Test Cases ({normalizeCases(editingQuestion.hidden_test_cases).length})</label>
                                <button type="button" onClick={() => addTestCase(activeExamId, questionEditor.index, 'hidden_test_cases')} className="inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200"><Plus size={12} /> Add Hidden</button>
                              </div>
                              {normalizeCases(editingQuestion.hidden_test_cases).map((tc, tcIdx) => (
                                <div key={`hidden-${tcIdx}`} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 p-2 border border-slate-200 rounded bg-white">
                                  <textarea className="text-xs p-2 border border-slate-300 rounded min-h-[68px]" placeholder="Input" value={tc.input || ''} onChange={e => updateTestCase(activeExamId, questionEditor.index, 'hidden_test_cases', tcIdx, 'input', e.target.value)} />
                                  <textarea className="text-xs p-2 border border-slate-300 rounded min-h-[68px]" placeholder="Expected output" value={tc.output || ''} onChange={e => updateTestCase(activeExamId, questionEditor.index, 'hidden_test_cases', tcIdx, 'output', e.target.value)} />
                                  <button type="button" onClick={() => deleteTestCase(activeExamId, questionEditor.index, 'hidden_test_cases', tcIdx)} className="text-red-600 hover:text-red-700 px-2 py-1 border border-red-200 rounded text-xs h-fit">Delete</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between px-5 py-4 border-t border-slate-200 bg-white">
                        <button type="button" onClick={() => deleteQuestionWithEditorState(activeExamId, questionEditor.index)} className="text-red-600 hover:text-red-700 px-3 py-2 border border-red-200 rounded text-xs font-semibold">Delete Question</button>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setQuestionEditor(prev => ({ ...prev, index: Math.max(prev.index - 1, 0) }))} disabled={questionEditor.index === 0} className="px-3 py-2 border border-slate-300 rounded text-xs font-semibold disabled:opacity-50">Previous</button>
                          <button type="button" onClick={() => setQuestionEditor(prev => ({ ...prev, index: Math.min(prev.index + 1, Math.max(activeQuestions.length - 1, 0)) }))} disabled={questionEditor.index >= activeQuestions.length - 1} className="px-3 py-2 border border-slate-300 rounded text-xs font-semibold disabled:opacity-50">Next</button>
                          <button type="button" onClick={closeQuestionEditor} className="px-3 py-2 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700">Done</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Results Tab */}
            {activeTab === 'results' && exams[selectedCourse.id] && (
              <div className="space-y-3 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <h3 className="font-semibold text-slate-900">Student Results</h3>
                {(() => {
                  const rows = submissions[exams[selectedCourse.id].id] || [];
                  if (rows.length === 0) return null;
                  const scores = rows.map((r) => Number(r.score_percent || 0));
                  const avg = scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1);
                  const best = Math.max(...scores);
                  return (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-slate-500">Average Marks</p>
                        <p className="font-semibold text-slate-800">{Math.round(avg)}%</p>
                      </div>
                      <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-slate-500">Top Marks</p>
                        <p className="font-semibold text-slate-800">{Math.round(best)}%</p>
                      </div>
                    </div>
                  );
                })()}
                
                {(submissions[exams[selectedCourse.id].id] || []).length === 0 ? (
                  <p className="text-xs text-slate-600 text-center py-4">No submissions yet</p>
                ) : (
                  (submissions[exams[selectedCourse.id].id] || []).map(sub => (
                    <div key={sub.id} className="bg-slate-50 p-3 rounded border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-xs font-semibold text-slate-900">{sub.user?.full_name}</p>
                          <p className="text-xs text-slate-600">{sub.user?.email}</p>
                        </div>
                        {sub.passed ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded">
                            Passed
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded">
                            Failed
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-600">
                        <p>Score: <span className="font-semibold">{Math.round(sub.score_percent || 0)}%</span></p>
                        <p>Submitted: {new Date(sub.submitted_at).toLocaleDateString()}</p>
                      </div>

                      {sub.passed && (
                        <button
                          onClick={() => generateCertificate(sub)}
                          disabled={savingId === `cert-${sub.id}`}
                          className="w-full flex items-center justify-center gap-1 bg-amber-600 text-white px-2 py-1.5 rounded text-xs hover:bg-amber-700 transition-colors font-semibold disabled:opacity-60"
                        >
                          <Award size={14} /> {savingId === `cert-${sub.id}` ? 'Generating...' : 'Generate Certificate'}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      {/* New Course Form Modal */}
      {showNewCourseForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold mb-6 text-slate-900">Create New Course</h3>
            
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Course Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCourse.title}
                  onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })}
                  placeholder="e.g., Introduction to Python Programming"
                  className="w-full p-2 border border-slate-300 rounded"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCourse.category}
                  onChange={(e) => setNewCourse({ ...newCourse, category: e.target.value })}
                  placeholder="e.g., Programming, Web Development, Data Science"
                  className="w-full p-2 border border-slate-300 rounded"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newCourse.description}
                  onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                  placeholder="Course overview, what students will learn..."
                  rows="3"
                  className="w-full p-2 border border-slate-300 rounded"
                />
              </div>

              {/* Image URL */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Image URL
                </label>
                <input
                  type="url"
                  value={newCourse.thumbnail_url}
                  onChange={(e) => setNewCourse({ ...newCourse, thumbnail_url: e.target.value })}
                  placeholder="https://example.com/course-image.jpg"
                  className="w-full p-2 border border-slate-300 rounded"
                />
                <p className="text-xs text-slate-500 mt-1">Direct image URL or Google Drive shared link</p>
              </div>

              {/* Video URL / Iframe */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Video URL or Embed Code
                </label>
                <textarea
                  value={newCourse.video_url}
                  onChange={(e) => setNewCourse({ ...newCourse, video_url: e.target.value })}
                  placeholder="Direct MP4 URL or Google Drive file/embed link"
                  rows="3"
                  className="w-full p-2 border border-slate-300 rounded font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Use a Google Drive file link or embed code. Avoid YouTube here because it can expose the original video outside SucessKart.
                </p>
              </div>

              {/* Notes URL */}
              <NotesUrlFields
                label="Notes/PDF URLs"
                values={normalizeNotesDraft(newCourse.notes_urls)}
                onChange={(nextValues) => setNewCourse({ ...newCourse, notes_urls: nextValues })}
                placeholder="https://example.com/course-notes.pdf"
              />

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Notes Preview Image URL
                </label>
                <input
                  type="url"
                  value={newCourse.notes_image_url}
                  onChange={(e) => setNewCourse({ ...newCourse, notes_image_url: e.target.value })}
                  placeholder="https://example.com/course-notes-cover.jpg"
                  className="w-full p-2 border border-slate-300 rounded"
                />
                <p className="text-xs text-slate-500 mt-1">Used for the protected notes preview card inside the website only.</p>
              </div>

              {/* Free/Paid Toggle */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Course Type
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!newCourse.is_free}
                      onChange={e => setNewCourse({ ...newCourse, is_free: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-blue-600"
                    />
                    <span className="text-blue-700 font-semibold">Free Course</span>
                  </label>
                  <span className="text-slate-500 text-xs">If checked, anyone can access this course without premium.</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowNewCourseForm(false);
                  setNewCourse({ title: '', category: '', description: '', video_url: '', thumbnail_url: '', notes_image_url: '', notes_urls: [...EMPTY_NOTES_DRAFT], is_free: false });
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded hover:bg-slate-50 transition-colors font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCourse}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-semibold"
              >
                Create Course
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {!isTeacher && deleteModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4 text-red-600">Delete Course?</h3>
            <p className="text-slate-700 mb-2">
              Are you sure you want to delete <strong>{deleteModal.courseTitle}</strong>?
            </p>
            <p className="text-sm text-red-600 mb-6">
              ⚠️ This action cannot be undone. All related exams, questions, and student submissions will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal({ show: false, courseId: null, courseTitle: '' })}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded hover:bg-slate-50 transition-colors font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={deleteCourse}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-semibold"
              >
                Delete Course
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCourses;



