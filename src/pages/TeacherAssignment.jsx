import React, { useMemo, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Users, Search, UserPlus } from 'lucide-react';
import AlertModal from '../components/AlertModal';
import LoadingSpinner from '../components/LoadingSpinner';
import { TEACHING_ROLES } from '../utils/teachingRoles';
import { logError } from '../utils/errorLogger';

const TeacherAssignment = () => {
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [search, setSearch] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [loading, setLoading] = useState(false);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    loadData();
  }, []);

  const pushNotification = async (payload) => {
    try {
      const { error } = await supabase.from('admin_notifications').insert(payload);
      if (error && String(error.message || '').includes('target_user_id')) {
        const { target_user_id, ...fallback } = payload;
        const marker = target_user_id ? `[target_user_id:${target_user_id}] ` : '';
        await supabase.from('admin_notifications').insert({
          ...fallback,
          content:
            marker && !String(fallback.content || '').includes('[target_user_id:')
              ? `${marker}${fallback.content || ''}`
              : fallback.content,
        });
      }
    } catch {
      // Keep assignment flow resilient even if notification insert fails.
    }
  };

  const loadData = async () => {
    try {
      const { data: studs, error: studError } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, role, assigned_teacher_id')
        .eq('role', 'student')
        .order('full_name');
      
      if (studError) {
        logError({ message: 'Error loading students:', source: 'TeacherAssignment', details: studError })
      }
      setStudents(studs || []);

      const { data: tchs, error: tchError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', TEACHING_ROLES)
        .order('full_name');
      
      if (tchError) {
        logError({ message: 'Error loading teachers:', source: 'TeacherAssignment', details: tchError })
      }
      setTeachers(tchs || []);
    } catch (error) {
      logError({ message: 'Error in loadData:', source: 'TeacherAssignment', details: error })
      setAlertModal({
        show: true,
        title: 'Error',
        message: 'Failed to load data: ' + error.message,
        type: 'error'
      });
    }
  };

  const assignTeacher = async () => {
    if (!selectedStudent || !selectedTeacher) {
      setAlertModal({
        show: true,
        title: 'Missing Information',
        message: 'Please select both a student and a teacher',
        type: 'warning'
      });
      return;
    }
    setLoading(true);
    const {
      data: { user }
    } = await supabase.auth.getUser();

    await supabase.from('profiles').update({
      assigned_teacher_id: selectedTeacher
    }).eq('id', selectedStudent.id);

    await supabase.from('teacher_assignments').insert({
      student_id: selectedStudent.id,
      teacher_id: selectedTeacher
    });

    const teacher = teachers.find((t) => t.id === selectedTeacher);
    await pushNotification({
      title: 'Teacher Assigned',
      content: `You have been assigned to ${teacher?.full_name || 'a teacher'}.`,
      type: 'success',
      target_role: 'student',
      target_user_id: selectedStudent.id,
      admin_id: user?.id || null,
    });
    await pushNotification({
      title: 'New Student Assigned',
      content: `${selectedStudent.full_name} has been assigned to you.`,
      type: 'info',
      target_role: 'all',
      target_user_id: selectedTeacher,
      admin_id: user?.id || null,
    });

    setAlertModal({
      show: true,
      title: 'Success',
      message: 'Teacher assigned successfully',
      type: 'success'
    });
    setSelectedStudent(null);
    setStudentQuery('');
    setSelectedTeacher('');
    loadData();
    setLoading(false);
  };

  const filtered = students.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );
  const matchedStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter(
        (s) =>
          (s.full_name || '').toLowerCase().includes(q) ||
          (s.email || '').toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [students, studentQuery]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Teacher Assignment</h1>
        <p className="text-slate-500">Assign teachers to students for guidance and support</p>
      </div>

      <div className="bg-white rounded-xl p-6 border">
        <h2 className="text-lg font-bold mb-4">Assign Teacher</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">Search Student</label>
            <input
              type="text"
              value={studentQuery}
              onChange={(e) => {
                setStudentQuery(e.target.value);
                setSelectedStudent(null);
              }}
              placeholder="Type name or email..."
              className="w-full border rounded-lg p-2"
            />
            {matchedStudents.length > 0 && !selectedStudent && (
              <div className="mt-2 border rounded-lg max-h-44 overflow-auto">
                {matchedStudents.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedStudent(s);
                      setStudentQuery(`${s.full_name} (${s.email})`);
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
              <p className="mt-2 text-xs text-emerald-700">
                Selected: {selectedStudent.full_name} ({selectedStudent.email})
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Select Teacher</label>
            <select 
              className="w-full border rounded-lg p-2"
              value={selectedTeacher}
              onChange={e => setSelectedTeacher(e.target.value)}
            >
              <option value="">Choose teacher...</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>
                  {t.full_name} ({t.email})
                </option>
              ))}
            </select>
          </div>
        </div>
        <button 
          onClick={assignTeacher}
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Assigning...' : 'Assign Teacher'}
        </button>
      </div>

      <div className="bg-white rounded-xl p-6 border">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Student-Teacher Assignments</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Search students..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>
        </div>
        <div className="space-y-2">
          {filtered.map(student => (
            <div key={student.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <img 
                  src={student.avatar_url || 'https://via.placeholder.com/40'} 
                  alt={student.full_name}
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div>
                  <p className="font-semibold">{student.full_name}</p>
                  <p className="text-xs text-slate-500">{student.email}</p>
                </div>
              </div>
              <div>
                {student.assigned_teacher_id ? (
                  <span className="text-xs bg-green-100 text-green-800 px-3 py-1 rounded-full">
                    Assigned to: {student.assigned_teacher?.full_name || 'Teacher'}
                  </span>
                ) : (
                  <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full">
                    Not Assigned
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border">
        <h2 className="text-lg font-bold mb-4">Teacher Load Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teachers.map(teacher => {
            const assignedCount = students.filter(s => s.assigned_teacher_id === teacher.id).length;
            const premiumCount = students.filter(s => 
              s.assigned_teacher_id === teacher.id && 
              s.premium_until && 
              new Date(s.premium_until) > new Date()
            ).length;

            return (
              <div key={teacher.id} className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">{teacher.full_name}</h3>
                <p className="text-xs text-slate-500 mb-3">{teacher.email}</p>
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="bg-blue-50 p-2 rounded">
                    <p className="font-bold text-blue-800">{assignedCount}</p>
                    <p className="text-blue-600">Students</p>
                  </div>
                  <div className="bg-gold-50 p-2 rounded">
                    <p className="font-bold text-gold-800">{premiumCount}</p>
                    <p className="text-gold-600">Premium</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
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

export default TeacherAssignment;
