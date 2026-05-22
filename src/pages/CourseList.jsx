import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Unlock, Star, Play, BookOpen as BookIcon, FileText, CheckCircle, AlertCircle, Clock, RotateCcw, Search, Plus, Edit2, Trash2, X, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import usePopup from '../hooks/usePopup.jsx';
import LoadingSpinner from '../components/LoadingSpinner';
import NotesUrlFields from '../components/NotesUrlFields';
import {
  fetchCourseProtectedAssetsMap,
  mergeCoursesWithProtectedAssets,
  upsertCourseProtectedAssets
} from '../utils/courseProtectedAssets';
import { readBrowserState, writeBrowserState } from '../utils/browserState';
import { logError } from '../utils/errorLogger';

const COURSES_CACHE_KEY = 'course_list_cache';
const COURSE_FORM_DRAFT_KEY = 'course_list_new_course_draft';

// 50 course records to populate the grid with category-appropriate thumbnails
const MOCK_COURSES = [
        { id: 1, title: 'Complete Python Mastery', category: 'Programming', lessons: 45, rating: 4.8 },
        { id: 2, title: 'Java for Beginners', category: 'Programming', lessons: 50, rating: 4.7 },
        { id: 3, title: 'Operating Systems Core', category: 'CS Core', lessons: 30, rating: 4.9 },
        { id: 4, title: 'Web Dev with React', category: 'Web', lessons: 60, rating: 4.8 },
        { id: 5, title: 'Database Management (DBMS)', category: 'CS Core', lessons: 25, rating: 4.6 },
        { id: 6, title: 'Data Structures in C++', category: 'Programming', lessons: 42, rating: 4.8 },
        { id: 7, title: 'Algorithms & Problem Solving', category: 'Programming', lessons: 48, rating: 4.9 },
        { id: 8, title: 'Node.js API Development', category: 'Web', lessons: 38, rating: 4.7 },
        { id: 9, title: 'TypeScript Essentials', category: 'Programming', lessons: 32, rating: 4.6 },
        { id: 10, title: 'Advanced React Patterns', category: 'Web', lessons: 44, rating: 4.9 },
        { id: 11, title: 'Next.js Fullstack', category: 'Web', lessons: 40, rating: 4.7 },
        { id: 12, title: 'REST to GraphQL', category: 'Web', lessons: 28, rating: 4.6 },
        { id: 13, title: 'Docker & Containers', category: 'DevOps', lessons: 26, rating: 4.7 },
        { id: 14, title: 'Kubernetes Fundamentals', category: 'DevOps', lessons: 30, rating: 4.7 },
        { id: 15, title: 'Linux Command Line', category: 'CS Core', lessons: 24, rating: 4.6 },
        { id: 16, title: 'Git & Team Workflow', category: 'Productivity', lessons: 18, rating: 4.8 },
        { id: 17, title: 'System Design Basics', category: 'CS Core', lessons: 36, rating: 4.8 },
        { id: 18, title: 'HTTP, DNS, TLS', category: 'CS Core', lessons: 22, rating: 4.5 },
        { id: 19, title: 'Intro to Cybersecurity', category: 'Security', lessons: 30, rating: 4.6 },
        { id: 20, title: 'Ethical Hacking 101', category: 'Security', lessons: 28, rating: 4.5 },
        { id: 21, title: 'SQL for Analysts', category: 'Data', lessons: 26, rating: 4.7 },
        { id: 22, title: 'PostgreSQL Deep Dive', category: 'Data', lessons: 30, rating: 4.8 },
        { id: 23, title: 'MongoDB in Practice', category: 'Data', lessons: 24, rating: 4.6 },
        { id: 24, title: 'Redis for Developers', category: 'Data', lessons: 18, rating: 4.6 },
        { id: 25, title: 'Pandas for Data Science', category: 'Data Science', lessons: 34, rating: 4.8 },
        { id: 26, title: 'NumPy & Linear Algebra', category: 'Data Science', lessons: 30, rating: 4.7 },
        { id: 27, title: 'Machine Learning Intro', category: 'Data Science', lessons: 40, rating: 4.8 },
        { id: 28, title: 'TensorFlow Quickstart', category: 'Data Science', lessons: 28, rating: 4.6 },
        { id: 29, title: 'PyTorch for Beginners', category: 'Data Science', lessons: 28, rating: 4.7 },
        { id: 30, title: 'Data Visualization with D3', category: 'Web', lessons: 22, rating: 4.5 },
        { id: 31, title: 'UI/UX for Developers', category: 'Design', lessons: 20, rating: 4.6 },
        { id: 32, title: 'Figma for Engineers', category: 'Design', lessons: 18, rating: 4.6 },
        { id: 33, title: 'Responsive Web Design', category: 'Web', lessons: 24, rating: 4.7 },
        { id: 34, title: 'Tailwind CSS Mastery', category: 'Web', lessons: 26, rating: 4.8 },
        { id: 35, title: 'Accessibility Fundamentals', category: 'Web', lessons: 18, rating: 4.5 },
        { id: 36, title: 'React Native Basics', category: 'Mobile', lessons: 32, rating: 4.6 },
        { id: 37, title: 'Flutter for Beginners', category: 'Mobile', lessons: 30, rating: 4.6 },
        { id: 38, title: 'Android with Kotlin', category: 'Mobile', lessons: 34, rating: 4.7 },
        { id: 39, title: 'iOS with SwiftUI', category: 'Mobile', lessons: 30, rating: 4.7 },
        { id: 40, title: 'AR/VR Foundations', category: 'Emerging Tech', lessons: 16, rating: 4.4 },
        { id: 41, title: 'Blockchain Basics', category: 'Emerging Tech', lessons: 18, rating: 4.4 },
        { id: 42, title: 'Web3 Smart Contracts', category: 'Emerging Tech', lessons: 20, rating: 4.5 },
        { id: 43, title: 'Cloud Fundamentals (AWS)', category: 'Cloud', lessons: 34, rating: 4.7 },
        { id: 44, title: 'Azure for Developers', category: 'Cloud', lessons: 28, rating: 4.6 },
        { id: 45, title: 'GCP Essentials', category: 'Cloud', lessons: 26, rating: 4.5 },
        { id: 46, title: 'SRE Foundations', category: 'DevOps', lessons: 22, rating: 4.6 },
        { id: 47, title: 'CI/CD Pipelines', category: 'DevOps', lessons: 24, rating: 4.7 },
        { id: 48, title: 'Terraform for Beginners', category: 'DevOps', lessons: 26, rating: 4.6 },
        { id: 49, title: 'Ansible in Practice', category: 'DevOps', lessons: 24, rating: 4.5 },
        { id: 50, title: 'Agile & Scrum for Teams', category: 'Productivity', lessons: 16, rating: 4.6 },
];

// Map categories to photo queries for varied but stable images
const CATEGORY_IMAGE = {
    Programming: 'code',
    'CS Core': 'computer',
    Web: 'web design',
    DevOps: 'devops',
    Productivity: 'productivity desk',
    Security: 'cybersecurity',
    Data: 'database server',
    'Data Science': 'data science',
    Design: 'ui design',
    Mobile: 'mobile app',
    'Emerging Tech': 'future technology',
    Cloud: 'cloud computing'
};

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80';
const EMPTY_NOTES_DRAFT = [''];

const normalizeNotesDraft = (value) => {
  if (Array.isArray(value) && value.length > 0) return value;
  if (typeof value === 'string' && value.trim()) return [value];
  return [...EMPTY_NOTES_DRAFT];
};

const CourseList = () => {
        const { profile, isPremium } = useAuth();
  const { popupNode, openPopup } = usePopup();
          const premium = isPremium(profile);
        const [courses, setCourses] = useState(() => readBrowserState(COURSES_CACHE_KEY, []));
        const [examResults, setExamResults] = useState({});
        const [searchQuery, setSearchQuery] = useState('');
        const [selectedCategory, setSelectedCategory] = useState('All');
        const [showAddCourseModal, setShowAddCourseModal] = useState(false);
        const [editingCourse, setEditingCourse] = useState(null);
        const [showEditModal, setShowEditModal] = useState(false);
        const [deleteConfirm, setDeleteConfirm] = useState(null);
        const [loading, setLoading] = useState(true);
        const [newCourse, setNewCourse] = useState(() => {
          const savedDraft = readBrowserState(COURSE_FORM_DRAFT_KEY, {});
          return {
            title: savedDraft.title || '',
            category: savedDraft.category || '',
            description: savedDraft.description || '',
            video_url: savedDraft.video_url || '',
            notes_urls: normalizeNotesDraft(savedDraft.notes_urls || savedDraft.notes_url),
            thumbnail_url: savedDraft.thumbnail_url || ''
          };
        });
        const [showExamQuestionsModal, setShowExamQuestionsModal] = useState(false);
        const [selectedCourseForExam, setSelectedCourseForExam] = useState(null);
        const [selectedExamId, setSelectedExamId] = useState(null);
        const [examQuestions, setExamQuestions] = useState([]);
        const [premiumCost, setPremiumCost] = useState(null);
        const [newQuestion, setNewQuestion] = useState({
          question: '',
          options: ['', '', '', ''],
          correct_index: 0
        });
        const getQuestionDraftKey = (examId) => `exam_questions_draft_${examId}`;
        const loadQuestionDraft = (examId) => {
          try {
            const raw = localStorage.getItem(getQuestionDraftKey(examId));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : null;
          } catch {
            return null;
          }
        };
        const saveQuestionDraft = (examId, list) => {
          try {
            localStorage.setItem(getQuestionDraftKey(examId), JSON.stringify(list || []));
          } catch {
            // ignore storage errors
          }
        };
        const clearQuestionDraft = (examId) => {
          try {
            localStorage.removeItem(getQuestionDraftKey(examId));
          } catch {
            // ignore storage errors
          }
        };

        const categories = ['All', 'Programming', 'CS Core', 'Web', 'DevOps', 'Data', 'Data Science', 'Design', 'Mobile', 'Security', 'Cloud', 'Productivity', 'Emerging Tech'];

        // Fetch courses from database
        useEffect(() => {
          const fetchCourses = async () => {
            try {
              const { data } = await supabase
                .from('courses')
                .select('*')
                .order('created_at', { ascending: false });
              
              if (data && data.length > 0) {
                const canReadProtectedAssets = ['admin', 'teacher'].includes(profile?.role);
                if (canReadProtectedAssets) {
                  const assetsMap = await fetchCourseProtectedAssetsMap(data.map((course) => course.id));
                  const mergedCourses = mergeCoursesWithProtectedAssets(data, assetsMap);
                  setCourses(mergedCourses);
                  writeBrowserState(COURSES_CACHE_KEY, mergedCourses);
                } else {
                  setCourses(data);
                  writeBrowserState(COURSES_CACHE_KEY, data);
                }
              } else {
                // Fallback to MOCK_COURSES if no database courses or empty
                setCourses(MOCK_COURSES);
                writeBrowserState(COURSES_CACHE_KEY, MOCK_COURSES);
              }
            } catch (error) {
              logError({ message: 'Error fetching courses:', source: 'CourseList', details: error });
              setCourses(MOCK_COURSES);
              writeBrowserState(COURSES_CACHE_KEY, MOCK_COURSES);
            } finally {
              setLoading(false);
            }
          };
          
          fetchCourses();
        }, [profile?.role]);

        useEffect(() => {
          writeBrowserState(COURSE_FORM_DRAFT_KEY, newCourse);
        }, [newCourse]);

        useEffect(() => {
          const loadPremiumCost = async () => {
            try {
              const { data } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'premium_cost')
                .maybeSingle();
              const parsedCost = parseInt(data?.value, 10);
              setPremiumCost(Number.isFinite(parsedCost) ? parsedCost : 199);
            } catch {
              setPremiumCost(199);
            }
          };
          loadPremiumCost();
        }, []);

        // Fetch exam results for premium users
        useEffect(() => {
          if (!profile || !premium) return;

          const fetchExamResults = async () => {
            try {
              const { data: exams } = await supabase
                .from('exams')
                .select('id, course_id');
              
              if (exams && exams.length > 0) {
                const results = {};
                for (const exam of exams) {
                  const { data: submissions } = await supabase
                    .from('exam_submissions')
                    .select('*')
                    .eq('exam_id', exam.id)
                    .eq('user_id', profile.id);
                  
                  if (submissions && submissions.length > 0) {
                    results[exam.course_id] = submissions[0];
                  }
                }
                setExamResults(results);
              }
            } catch (err) {
              logError({ message: 'Error fetching exam results:', source: 'CourseList', details: err });
            }
          };
          fetchExamResults();
        }, [profile, premium]);

        const getDaysUntilRetry = (nextAttemptDate) => {
          if (!nextAttemptDate) return 0;
          const next = new Date(nextAttemptDate);
          const now = new Date();
          const diff = next - now;
          return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
        };

        // Handle add course
        const handleAddCourse = async () => {
          if (!newCourse.title || !newCourse.category) {
            openPopup('Missing details', 'Title and category are required.', 'warning');
            return;
          }

          try {
            const courseData = {
              title: newCourse.title,
              category: newCourse.category,
              description: newCourse.description || null,
              thumbnail_url: newCourse.thumbnail_url || null,
              is_active: true
            };

            const { data, error } = await supabase
              .from('courses')
              .insert([courseData])
              .select()
              .single();

            if (error) throw error;

            const savedAssets = await upsertCourseProtectedAssets(data.id, {
              video_url: newCourse.video_url,
              notes_urls: newCourse.notes_urls,
            });

            // Create default exam
            const { error: examCreateError } = await supabase
              .from('exams')
              .insert([{ course_id: data.id, duration_minutes: 60, pass_percent: 70 }]);
            if (examCreateError) {
              throw new Error(`Course added but exam creation failed: ${examCreateError.message}`);
            }

            setCourses([{ ...data, ...savedAssets }, ...courses]);
            setNewCourse({
              title: '',
              category: '',
              description: '',
              video_url: '',
              notes_urls: [...EMPTY_NOTES_DRAFT],
              thumbnail_url: ''
            });
            writeBrowserState(COURSE_FORM_DRAFT_KEY, {
              title: '',
              category: '',
              description: '',
              video_url: '',
              notes_urls: [...EMPTY_NOTES_DRAFT],
              thumbnail_url: ''
            });
            setShowAddCourseModal(false);
            openPopup('Course added', 'Course added successfully.', 'success');
          } catch (error) {
            logError({ message: 'Error adding course:', source: 'CourseList', details: error });
            openPopup('Add failed', `Error adding course: ${error.message}`, 'error');
          }
        };

        // Handle edit course
        const handleEditCourse = async () => {
          if (!editingCourse.title || !editingCourse.category) {
            openPopup('Missing details', 'Title and category are required.', 'warning');
            return;
          }

          try {
            const { error } = await supabase
              .from('courses')
              .update({
                title: editingCourse.title,
                category: editingCourse.category,
                description: editingCourse.description || null,
                thumbnail_url: editingCourse.thumbnail_url || null
              })
              .eq('id', editingCourse.id);

            if (error) throw error;

            const savedAssets = await upsertCourseProtectedAssets(editingCourse.id, {
              video_url: editingCourse.video_url,
              notes_urls: editingCourse.notes_urls,
            });

            setCourses(courses.map(c => (
              c.id === editingCourse.id
                ? { ...editingCourse, ...savedAssets }
                : c
            )));
            setEditingCourse(null);
            setShowEditModal(false);
            openPopup('Course updated', 'Course updated successfully.', 'success');
          } catch (error) {
            logError({ message: 'Error updating course:', source: 'CourseList', details: error });
            openPopup('Update failed', `Error updating course: ${error.message}`, 'error');
          }
        };

        // Handle delete course
        const handleDeleteCourse = async (courseId) => {
          try {
            // Delete exams and related data
            const { data: exams } = await supabase
              .from('exams')
              .select('id')
              .eq('course_id', courseId);

            if (exams && exams.length > 0) {
              for (const exam of exams) {
                await supabase.from('exam_questions').delete().eq('exam_id', exam.id);
                await supabase.from('exam_submissions').delete().eq('exam_id', exam.id);
              }
              await supabase.from('exams').delete().eq('course_id', courseId);
            }

            // Delete course
            await supabase.from('courses').delete().eq('id', courseId);

            setCourses(courses.filter(c => c.id !== courseId));
            setDeleteConfirm(null);
            openPopup('Course deleted', 'Course deleted successfully.', 'success');
          } catch (error) {
            openPopup('Delete failed', `Error deleting course: ${error.message}`, 'error');
          }
        };

        // Handle manage exam questions
        const openExamQuestionsModal = async (course) => {
          setSelectedCourseForExam(course);
          setSelectedExamId(null);
          try {
            let { data: exams, error: examError } = await supabase
              .from('exams')
              .select('id')
              .eq('course_id', course.id)
              .maybeSingle();

            if (examError) {
              openPopup('Error', `Failed to load exam: ${examError.message}`, 'error');
              setExamQuestions([]);
              setShowExamQuestionsModal(true);
              return;
            }

            if (!exams) {
              setExamQuestions([]);
              setShowExamQuestionsModal(true);
              return;
            }

            if (exams) {
              setSelectedExamId(exams.id);
              const { data: questions } = await supabase
                .from('exam_questions')
                .select('*')
                .eq('exam_id', exams.id)
                .order('order_index');
              const draft = loadQuestionDraft(exams.id);
              setExamQuestions(draft || questions || []);
            }
          } catch (error) {
            logError({ message: 'Error loading questions:', source: 'CourseList', details: error });
            openPopup('Error', `Error loading exam: ${error.message}`, 'error');
            setExamQuestions([]);
            setSelectedExamId(null);
          }
          setShowExamQuestionsModal(true);
        };

        const handleAddQuestion = async () => {
          if (!newQuestion.question.trim()) {
            openPopup('Question required', 'Please enter a question.', 'warning');
            return;
          }
          if (newQuestion.options.some(opt => !opt.trim())) {
            openPopup('Options required', 'All options must be filled.', 'warning');
            return;
          }

          try {
            if (!selectedExamId) {
              openPopup('No exam found', 'Please create an exam for this course first.', 'warning');
              return;
            }

            const nextQuestions = [
              ...examQuestions,
              {
                exam_id: selectedExamId,
                question: newQuestion.question,
                options: newQuestion.options,
                correct_index: newQuestion.correct_index,
                order_index: examQuestions.length
              }
            ];
            setExamQuestions(nextQuestions);
            saveQuestionDraft(selectedExamId, nextQuestions);
            setNewQuestion({ question: '', options: ['', '', '', ''], correct_index: 0 });
            openPopup('Draft saved', 'Question saved to draft. Click Publish Questions to make it live.', 'success');
          } catch (error) {
            openPopup('Add failed', `Error adding question: ${error.message}`, 'error');
          }
        };

        const handleDeleteQuestion = async (questionIndex) => {
          try {
            const nextQuestions = examQuestions.filter((_, idx) => idx !== questionIndex);
            setExamQuestions(nextQuestions);
            if (selectedExamId) saveQuestionDraft(selectedExamId, nextQuestions);
            openPopup('Draft updated', 'Question removed from draft. Publish to apply changes.', 'success');
          } catch (error) {
            openPopup('Delete failed', `Error deleting question: ${error.message}`, 'error');
          }
        };

        const handleSaveDraftQuestions = async () => {
          try {
            if (!selectedExamId) throw new Error('No exam found for this course');
            saveQuestionDraft(selectedExamId, examQuestions);
            openPopup('Draft saved', 'Draft saved. Students cannot see these questions until publish.', 'success');
          } catch (error) {
            openPopup('Save failed', `Error saving draft: ${error.message}`, 'error');
          }
        };

        const handlePublishQuestions = async () => {
          try {
            if (!selectedExamId) throw new Error('No exam found for this course');

            const { error: deleteError } = await supabase
              .from('exam_questions')
              .delete()
              .eq('exam_id', selectedExamId);
            if (deleteError) throw deleteError;

            if (examQuestions.length > 0) {
              const payload = examQuestions.map((q, idx) => ({
                exam_id: selectedExamId,
                question: q.question,
                options: q.options,
                correct_index: q.correct_index,
                order_index: idx
              }));
              const { error: insertError } = await supabase
                .from('exam_questions')
                .insert(payload);
              if (insertError) throw insertError;
            }

            clearQuestionDraft(selectedExamId);
            openPopup('Published', 'Questions published successfully.', 'success');
          } catch (error) {
            openPopup('Publish failed', `Error publishing questions: ${error.message}`, 'error');
          }
        };

        const handleCreateExamForCourse = async () => {
          try {
            if (!selectedCourseForExam?.id) {
              openPopup('Missing course', 'Please reopen the question manager and try again.', 'warning');
              return;
            }

            const { data: newExam, error: createError } = await supabase
              .from('exams')
              .insert([{
                course_id: selectedCourseForExam.id,
                duration_minutes: 60,
                pass_percent: 70
              }])
              .select('id')
              .single();

            if (createError) throw createError;

            setSelectedExamId(newExam.id);
            setExamQuestions([]);
            openPopup('Exam created', 'Exam created successfully. You can now add questions.', 'success');
          } catch (error) {
            openPopup('Create exam failed', `Unable to create exam: ${error.message}`, 'error');
          }
        };

        // Filter courses
        const filteredCourses = courses.filter(course => {
          const matchesSearch = course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                 course.category.toLowerCase().includes(searchQuery.toLowerCase());
          const matchesCategory = selectedCategory === 'All' || course.category === selectedCategory;
          return matchesSearch && matchesCategory;
        });

        const getExamButton = (courseId, examResult) => {
          const bookingPath = `/app/live-exams?courseId=${courseId}`;
          if (!examResult) {
            return (
              <Link to={bookingPath} className="flex items-center justify-center gap-1 bg-orange-50 text-orange-700 py-2 rounded-md hover:bg-orange-100 transition-colors">
                <BookIcon size={14}/> Book
              </Link>
            );
          }

          if (examResult.passed) {
            return (
              <div className="flex items-center justify-center gap-1 bg-green-50 text-green-700 py-2 rounded-md cursor-default">
                <CheckCircle size={14}/> Passed
              </div>
            );
          }

          const daysLeft = getDaysUntilRetry(examResult.next_attempt_allowed_at);
          if (daysLeft > 0) {
            return (
              <div className="flex items-center justify-center gap-1 bg-orange-50 text-orange-700 py-2 rounded-md cursor-default text-xs">
                <Clock size={14}/> {daysLeft}d wait
              </div>
            );
          }

          return (
            <Link to={bookingPath} className="flex items-center justify-center gap-1 bg-blue-50 text-blue-700 py-2 rounded-md hover:bg-blue-100 transition-colors">
              <RotateCcw size={14}/> Book
            </Link>
          );
        };

  return (
    <div>
       {popupNode}
       {!premium && (
         <div className="bg-gradient-to-r from-gold-400 to-gold-600 p-6 rounded-xl mb-6 flex items-center justify-between text-white">
           <div>
             <h2 className="text-xl font-bold mb-1">Unlock All 50+ Courses</h2>
            <p className="text-gold-100 text-sm">
              Get 6 months unlimited access for just {premiumCost !== null ? `₹${premiumCost}` : 'our premium price'}
            </p>
           </div>
           <Link to="/app/payment" className="group bg-white text-gold-600 px-6 py-3 rounded-lg font-semibold border-2 border-gold-600 hover:bg-gradient-to-r hover:from-gold-500 hover:to-gold-700 hover:text-white hover:shadow-2xl hover:shadow-gold-400/50 hover:scale-110 hover:-translate-y-1 transition-all duration-300 ease-in-out cursor-pointer relative overflow-hidden">
             <span className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></span>
             Upgrade Now
           </Link>
         </div>
       )}
 
       {/* Header with Search and Add Course */}
       <div className="mb-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold text-nani-dark">All Courses</h1>
              <p className="text-slate-500">Explore over {filteredCourses.length} professional courses.</p>
            </div>
            {profile?.role === 'admin' && (
              <button 
                onClick={() => setShowAddCourseModal(true)}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus size={18} /> Add Course
              </button>
            )}
          </div>

          {/* Search Bar */}
          <div className="mb-6 relative">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search courses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2">
             {categories.map(cat => (
               <button 
                 key={cat}
                 onClick={() => setSelectedCategory(cat)}
                 className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                   selectedCategory === cat
                     ? 'bg-blue-600 text-white' 
                     : 'bg-white border border-slate-300 text-slate-700 hover:border-slate-400'
                 }`}
               >
                 {cat}
               </button>
             ))}
          </div>
       </div>

       {/* Loading State */}
       {loading && (
         <div className="text-center py-12">
           <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
           <p className="mt-4 text-slate-600">Loading courses...</p>
         </div>
       )}

       {/* Courses Grid */}
       {!loading && filteredCourses.length > 0 ? (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredCourses.map(course => {
                  const isFree = !!course.is_free;
                  const canAccess = premium || isFree;
                  return (
                    <div key={course.id} className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all group relative">
                      {/* Course Image */}
                      <div className="h-40 bg-slate-200 relative">
                        <img 
                          src={course.thumbnail_url || FALLBACK_IMAGE}
                          onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
                          className="w-full h-full object-cover" 
                          alt={course.title} 
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="absolute top-2 right-2 flex gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${isFree ? 'bg-green-600 text-white' : 'bg-yellow-500 text-white'}`}>{isFree ? 'Free' : 'Premium'}</span>
                          <span className="bg-black/50 text-white px-2 py-1 rounded text-xs backdrop-blur-sm">{course.category}</span>
                        </div>
                        {/* Admin Edit/Delete Buttons */}
                        {profile?.role === 'admin' && (
                          <div className="absolute top-2 left-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setEditingCourse(course);
                                setShowEditModal(true);
                              }}
                              className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
                              title="Edit course"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => openExamQuestionsModal(course)}
                              className="bg-purple-600 text-white p-2 rounded hover:bg-purple-700"
                              title="Manage exam questions"
                            >
                              <FileText size={14} />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(course.id)}
                              className="bg-red-600 text-white p-2 rounded hover:bg-red-700"
                              title="Delete course"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                        {!canAccess && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs font-semibold">
                            <Lock size={16} className="mr-1" /> Premium required
                          </div>
                        )}
                      </div>
                      {/* Course Info */}
                      <div className="p-5">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-bold text-lg leading-tight group-hover:text-blue-600 transition-colors line-clamp-2">{course.title}</h3>
                        </div>
                        {course.rating && (
                          <div className="flex items-center text-xs text-slate-500 mb-4 space-x-3">
                            <span className="flex items-center"><Star size={12} className="text-gold-400 mr-1"/> {course.rating}</span>
                            {course.lessons && <span>{course.lessons} Lessons</span>}
                          </div>
                        )}
                        {canAccess ? (
                          <div className="space-y-2">
                            <Link to={`/app/course/${course.id}`} className="w-full block text-center bg-nani-dark text-white py-2 rounded-lg hover:bg-nani-accent transition-colors">
                              Open Course
                            </Link>
                            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                              <Link to={`/app/course/${course.id}`} className="flex items-center justify-center gap-1 bg-blue-50 text-blue-700 py-2 rounded-md hover:bg-blue-100 transition-colors">
                                <Play size={14}/> Watch
                              </Link>
                              <Link to={`/app/course/${course.id}`} className="flex items-center justify-center gap-1 bg-emerald-50 text-emerald-700 py-2 rounded-md hover:bg-emerald-100 transition-colors">
                                <FileText size={14}/> Notes
                              </Link>
                              {getExamButton(course.id, examResults[course.id])}
                            </div>
                          </div>
                        ) : (
                          <div className="w-full block text-center bg-slate-100 text-slate-400 py-2 rounded-lg flex items-center justify-center cursor-not-allowed">
                            <Lock size={14} className="mr-2" /> Premium Only
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
         </div>
       ) : (
         !loading && (
           <div className="text-center py-12">
             <p className="text-slate-600 text-lg">No courses found matching your search.</p>
           </div>
         )
       )}

       {/* Add Course Modal */}
       {showAddCourseModal && (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
           <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
             <div className="flex justify-between items-center mb-6">
               <h2 className="text-2xl font-bold">Add New Course</h2>
               <button onClick={() => setShowAddCourseModal(false)} className="text-slate-400 hover:text-slate-600">
                 <X size={24} />
               </button>
             </div>

             <div className="space-y-4">
               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1">Course Title *</label>
                 <input
                   type="text"
                   value={newCourse.title}
                   onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })}
                   placeholder="e.g., Complete Python Mastery"
                   className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                 />
               </div>

               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1">Category *</label>
                 <select
                   value={newCourse.category}
                   onChange={(e) => setNewCourse({ ...newCourse, category: e.target.value })}
                   className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                 >
                   <option value="">Select Category</option>
                   {categories.filter(c => c !== 'All').map(cat => (
                     <option key={cat} value={cat}>{cat}</option>
                   ))}
                 </select>
               </div>

               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                 <textarea
                   value={newCourse.description}
                   onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                   placeholder="Course overview and what students will learn..."
                   rows="3"
                   className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                 />
               </div>

               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1">Thumbnail/Image URL</label>
                 <input
                   type="url"
                   value={newCourse.thumbnail_url}
                   onChange={(e) => setNewCourse({ ...newCourse, thumbnail_url: e.target.value })}
                   placeholder="https://example.com/image.jpg"
                   className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                 />
               </div>

               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1">Video URL or Embed Code</label>
                 <textarea
                   value={newCourse.video_url}
                   onChange={(e) => setNewCourse({ ...newCourse, video_url: e.target.value })}
                   placeholder="Direct MP4 URL or Google Drive file/embed link"
                   rows="3"
                   className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                 />
                 <p className="text-xs text-slate-500 mt-1">
                   Use a Google Drive file link or embed code. Avoid YouTube here because it can expose the original video outside SkillPro.
                 </p>
               </div>

               <NotesUrlFields
                 label="Notes/PDF URLs"
                 values={normalizeNotesDraft(newCourse.notes_urls)}
                 onChange={(nextValues) => setNewCourse({ ...newCourse, notes_urls: nextValues })}
                 placeholder="https://example.com/course-notes.pdf"
               />
             </div>

             <div className="flex gap-3 mt-8">
               <button
                 onClick={() => setShowAddCourseModal(false)}
                 className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-semibold"
               >
                 Cancel
               </button>
               <button
                 onClick={handleAddCourse}
                 className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
               >
                 Add Course
               </button>
             </div>
           </div>
         </div>
       )}

       {/* Edit Course Modal */}
       {showEditModal && editingCourse && (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
           <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
             <div className="flex justify-between items-center mb-6">
               <h2 className="text-2xl font-bold">Edit Course</h2>
               <button onClick={() => { setShowEditModal(false); setEditingCourse(null); }} className="text-slate-400 hover:text-slate-600">
                 <X size={24} />
               </button>
             </div>

             <div className="space-y-4">
               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1">Course Title *</label>
                 <input
                   type="text"
                   value={editingCourse.title}
                   onChange={(e) => setEditingCourse({ ...editingCourse, title: e.target.value })}
                   className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                 />
               </div>

               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1">Category *</label>
                 <select
                   value={editingCourse.category}
                   onChange={(e) => setEditingCourse({ ...editingCourse, category: e.target.value })}
                   className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                 >
                   <option value="">Select Category</option>
                   {categories.filter(c => c !== 'All').map(cat => (
                     <option key={cat} value={cat}>{cat}</option>
                   ))}
                 </select>
               </div>

               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                 <textarea
                   value={editingCourse.description || ''}
                   onChange={(e) => setEditingCourse({ ...editingCourse, description: e.target.value })}
                   rows="3"
                   className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                 />
               </div>

               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1">Thumbnail/Image URL</label>
                 <input
                   type="url"
                   value={editingCourse.thumbnail_url || ''}
                   onChange={(e) => setEditingCourse({ ...editingCourse, thumbnail_url: e.target.value })}
                   className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                 />
               </div>

               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1">Video URL or Embed Code</label>
                 <textarea
                   value={editingCourse.video_url || ''}
                   onChange={(e) => setEditingCourse({ ...editingCourse, video_url: e.target.value })}
                   rows="3"
                   className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                 />
                 <p className="text-xs text-slate-500 mt-1">
                   Use a Google Drive file link or embed code. Avoid YouTube here because it can expose the original video outside SkillPro.
                 </p>
               </div>

               <NotesUrlFields
                 label="Notes/PDF URLs"
                 values={normalizeNotesDraft(editingCourse.notes_urls)}
                 onChange={(nextValues) => setEditingCourse({ ...editingCourse, notes_urls: nextValues })}
                 placeholder="https://example.com/course-notes.pdf"
               />
             </div>

             <div className="flex gap-3 mt-8">
               <button
                 onClick={() => { setShowEditModal(false); setEditingCourse(null); }}
                 className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-semibold"
               >
                 Cancel
               </button>
               <button
                 onClick={handleEditCourse}
                 className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
               >
                 Update Course
               </button>
             </div>
           </div>
         </div>
       )}

       {/* Delete Confirmation Modal */}
       {deleteConfirm && (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
           <div className="bg-white rounded-xl max-w-md w-full p-6">
             <div className="flex items-center gap-3 mb-4">
               <AlertTriangle size={24} className="text-red-600" />
               <h2 className="text-xl font-bold text-red-600">Delete Course?</h2>
             </div>
             <p className="text-slate-700 mb-6">
               Are you sure you want to delete this course? This action is permanent and will delete all related exams, questions, and student submissions.
             </p>
             <div className="flex gap-3">
               <button
                 onClick={() => setDeleteConfirm(null)}
                 className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-semibold"
               >
                 Cancel
               </button>
               <button
                 onClick={() => handleDeleteCourse(deleteConfirm)}
                 className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
               >
                 Delete
               </button>
             </div>
           </div>
         </div>
       )}

       {/* Exam Questions Modal */}
       {showExamQuestionsModal && selectedCourseForExam && (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
           <div className="bg-white rounded-xl max-w-2xl w-full my-8">
             <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-700 text-white p-6 flex justify-between items-center">
               <div>
                 <h2 className="text-2xl font-bold">{selectedCourseForExam.title}</h2>
                 <p className="text-blue-100 text-sm">Manage Exam Questions</p>
               </div>
               <button
                 onClick={() => {
                   setShowExamQuestionsModal(false);
                   setSelectedExamId(null);
                 }}
                 className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
               >
                 <X size={24} />
               </button>
             </div>

             <div className="p-6 max-h-96 overflow-y-auto">
               <h3 className="text-lg font-bold text-slate-900 mb-4">Questions ({examQuestions.length})</h3>
               {!selectedExamId && (
                 <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                   <p className="text-sm font-semibold text-amber-900">No exam found for this course.</p>
                   <p className="text-xs text-amber-800 mt-1">Create exam first, then add and publish questions.</p>
                   <button
                     onClick={handleCreateExamForCourse}
                     className="mt-3 bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors text-sm font-semibold"
                   >
                     Create Exam
                   </button>
                 </div>
               )}
               
               {examQuestions.length > 0 ? (
                 <div className="space-y-4 mb-6">
                   {examQuestions.map((q, idx) => (
                     <div key={q.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                       <div className="flex justify-between items-start mb-2">
                         <p className="font-semibold text-slate-900">Q{idx + 1}: {q.question}</p>
                         <button
                           onClick={() => handleDeleteQuestion(idx)}
                           className="text-red-600 hover:bg-red-50 p-1 rounded transition-colors"
                         >
                           <Trash2 size={18} />
                         </button>
                       </div>
                       <div className="space-y-2 text-sm">
                         {q.options.map((opt, optIdx) => (
                           <div key={optIdx} className="flex items-center">
                             <span className={`inline-block w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-2 ${
                               optIdx === q.correct_index ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-600'
                             }`}>
                               {optIdx === q.correct_index ? '✓' : String.fromCharCode(65 + optIdx)}
                             </span>
                             {opt}
                           </div>
                         ))}
                       </div>
                     </div>
                   ))}
                 </div>
               ) : (
                 <p className="text-slate-500 text-center py-4 mb-6">No questions added yet</p>
               )}

               {/* Add Question Form */}
               <div className="border-t border-slate-200 pt-6">
                 <h3 className="text-lg font-bold text-slate-900 mb-4">Add New Question</h3>
                 <div className="space-y-4">
                   <div>
                     <label className="block text-sm font-semibold text-slate-700 mb-2">Question</label>
                     <textarea
                       value={newQuestion.question}
                       onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })}
                       className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-600"
                       placeholder="Enter the question..."
                       rows="2"
                     />
                   </div>

                   <div>
                     <label className="block text-sm font-semibold text-slate-700 mb-2">Options</label>
                     <div className="space-y-2">
                       {newQuestion.options.map((option, idx) => (
                         <div key={idx} className="flex gap-2 items-center">
                           <button
                             onClick={() => setNewQuestion({ ...newQuestion, correct_index: idx })}
                             className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                               newQuestion.correct_index === idx
                                 ? 'bg-green-500 text-white'
                                 : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                             }`}
                             title="Mark as correct answer"
                           >
                             {String.fromCharCode(65 + idx)}
                           </button>
                           <input
                             type="text"
                             value={option}
                             onChange={(e) => {
                               const updatedOptions = [...newQuestion.options];
                               updatedOptions[idx] = e.target.value;
                               setNewQuestion({ ...newQuestion, options: updatedOptions });
                             }}
                             className="flex-1 border border-slate-300 rounded-lg p-2 text-sm focus:outline-none focus:border-blue-600"
                             placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                           />
                         </div>
                       ))}
                     </div>
                     <p className="text-xs text-slate-500 mt-2">Click the letter button to mark the correct answer</p>
                   </div>

                   <button
                     onClick={handleAddQuestion}
                     disabled={!selectedExamId}
                     title={!selectedExamId ? 'Create exam first' : 'Add question'}
                     className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                   >
                     Add Question
                   </button>
                   <button
                     onClick={handleSaveDraftQuestions}
                     disabled={!selectedExamId}
                     title={!selectedExamId ? 'Create exam first' : 'Save draft'}
                     className="w-full bg-amber-600 text-white font-semibold py-2 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                   >
                     Save Draft
                   </button>
                   <button
                     onClick={handlePublishQuestions}
                     disabled={!selectedExamId}
                     title={!selectedExamId ? 'Create exam first' : 'Publish questions'}
                     className="w-full bg-emerald-600 text-white font-semibold py-2 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                   >
                     Publish Questions
                   </button>
                 </div>
               </div>
             </div>
           </div>
         </div>
       )}
    </div>
  );
};

export default CourseList;
