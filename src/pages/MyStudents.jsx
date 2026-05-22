import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Users, Mail, Award } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import { logError } from '../utils/errorLogger';

const MyStudents = () => {
  const { profile } = useAuth();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStudents = async () => {
      if (!profile) return;
      
      try {
        // Query profiles where assigned_teacher_id matches current teacher
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url, premium_until, education_level, study_stream')
          .eq('assigned_teacher_id', profile.id)
          .eq('role', 'student')
          .order('full_name', { ascending: true });
        
        if (error) throw error;
        
        setStudents(data || []);
      } catch (error) {
        logError({ message: 'Error fetching students:', source: 'MyStudents', details: error })
        setStudents([]);
      } finally {
        setLoading(false);
      }
    };
    fetchStudents();
  }, [profile]);

  if (loading) return <LoadingSpinner message="Loading students..." />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Students</h1>
        <p className="text-slate-500">Students assigned to you ({students.length})</p>
      </div>

      {students.length === 0 ? (
        <div className="bg-white p-6 rounded-xl border text-center text-slate-500">
          No students assigned yet. Admin will assign students to you.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.map(student => (
            <div key={student.id} className="bg-white p-4 rounded-xl border shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <img 
                  src={student.avatar_url || 'https://via.placeholder.com/60'} 
                  alt={student.full_name}
                  className="w-12 h-12 rounded-full object-cover"
                />
                <div className="flex-1">
                  <h3 className="font-bold">{student.full_name}</h3>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Mail size={12} /> {student.email}
                  </p>
                </div>
              </div>
              {student.premium_until && new Date(student.premium_until) > new Date() ? (
                <span className="inline-flex items-center gap-1 text-xs bg-gold-100 text-gold-800 px-2 py-1 rounded">
                  <Award size={12} /> Premium
                </span>
              ) : (
                <span className="text-xs text-slate-500">Free Plan</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyStudents;
