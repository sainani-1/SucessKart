import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { Users, Award, TrendingUp, Search, Calendar } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import { logError } from '../utils/errorLogger';

const StudentProgress = () => {
  const { profile } = useAuth();
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStudents = async () => {
      const { data: studentData } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          email,
          avatar_url,
          premium_until,
          enrollments:enrollments(course_id, progress, completed),
          certificates:certificates(id)
        `)
        .eq('role', 'student')
        .order('full_name');

      // Fetch attendance for each student
      const studentsWithAttendance = await Promise.all(
        (studentData || []).map(async (student) => {
          const { data: classAtt, error: classErr } = await supabase
            .from('class_attendance')
            .select('attended')
            .eq('student_id', student.id);
          
          const { data: guidanceAtt, error: guidanceErr } = await supabase
            .from('guidance_attendance')
            .select('attended')
            .eq('student_id', student.id);

          if (classErr) logError({ message: 'Class attendance error:', source: 'StudentProgress', details: classErr })
          if (guidanceErr) logError({ message: 'Guidance attendance error:', source: 'StudentProgress', details: guidanceErr })

          const allAttendance = [...(classAtt || []), ...(guidanceAtt || [])];
          const present = allAttendance.filter(a => a.attended).length;
          const total = allAttendance.length;
          const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

          return {
            ...student,
            attendance: { total, present, percentage }
          };
        })
      );

      setStudents(studentsWithAttendance);
      setLoading(false);
    };
    fetchStudents();
  }, []);

  const filtered = students.filter(s => 
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingSpinner message="Loading students..." />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Student Progress</h1>
          <p className="text-slate-500">Track all student progress and achievements</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search students..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2 border rounded-lg w-64"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(student => {
          const isPremium = student.premium_until && new Date(student.premium_until) > new Date();
          const enrolledCount = student.enrollments?.length || 0;
          const completedCount = student.enrollments?.filter(e => e.completed).length || 0;
          const certCount = student.certificates?.length || 0;

          return (
            <Link 
              key={student.id}
              to={`/app/admin/student/${student.id}`}
              className="bg-white p-4 rounded-xl border shadow-sm hover:shadow-lg transition-all"
            >
              <div className="flex items-start gap-3 mb-3">
                <img 
                  src={student.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(student.full_name) + '&background=random'} 
                  alt={student.full_name}
                  className="w-14 h-14 rounded-full object-cover"
                  onError={(e) => {
                    e.target.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(student.full_name) + '&background=random';
                  }}
                />
                <div className="flex-1">
                  <h3 className="font-bold">{student.full_name}</h3>
                  <p className="text-xs text-slate-500">{student.email}</p>
                  {isPremium && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-gold-100 text-gold-800 px-2 py-0.5 rounded mt-1">
                      <Award size={10} /> Premium
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-blue-50 p-2 rounded">
                  <p className="font-bold text-blue-800">{enrolledCount}</p>
                  <p className="text-blue-600">Enrolled</p>
                </div>
                <div className="bg-green-50 p-2 rounded">
                  <p className="font-bold text-green-800">{completedCount}</p>
                  <p className="text-green-600">Completed</p>
                </div>
                <div className="bg-gold-50 p-2 rounded">
                  <p className="font-bold text-gold-800">{certCount}</p>
                  <p className="text-gold-600">Certs</p>
                </div>
                <div className="bg-purple-50 p-2 rounded">
                  <p className="font-bold text-purple-800">{student.attendance?.percentage}%</p>
                  <p className="text-purple-600">Attend</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default StudentProgress;
