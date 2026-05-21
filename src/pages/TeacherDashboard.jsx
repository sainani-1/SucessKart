import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import { Users, Calendar, Clock, MessageCircle, CheckSquare, Award } from 'lucide-react';
import { useChatOverlay } from '../context/ChatOverlayContext';

const TeacherDashboard = () => {
  const { profile } = useAuth();
  const { openChat } = useChatOverlay();
  const [students, setStudents] = useState([]);
  const [upcomingSessions, setUpcomingSessions] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);

  const getClassSessionEndTime = (session) => {
    if (session?.ends_at) return new Date(session.ends_at);
    const start = new Date(session.scheduled_for);
    return new Date(start.getTime() + 60 * 60 * 1000);
  };

  useEffect(() => {
    loadData();
  }, [profile]);

  const loadData = async () => {
    if (!profile?.id) return;
    // Primary source of truth: students assigned to this teacher on profile row.
    const { data: assignedProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, premium_until')
      .eq('role', 'student')
      .eq('assigned_teacher_id', profile.id)
      .order('full_name', { ascending: true });

    const studentsById = new Map((assignedProfiles || []).map((s) => [s.id, s]));

    // Secondary source: guidance allocations that may exist before profile assignment sync.
    const { data: guidanceStuds } = await supabase
      .from('guidance_requests')
      .select('student_id')
      .eq('assigned_to_teacher_id', profile.id)
      .in('status', ['pending', 'assigned', 'scheduled']);

    const missingGuidanceStudentIds = Array.from(
      new Set((guidanceStuds || []).map((s) => s.student_id).filter(Boolean))
    ).filter((id) => !studentsById.has(id));

    if (missingGuidanceStudentIds.length > 0) {
      const { data: extraProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, premium_until')
        .in('id', missingGuidanceStudentIds)
        .eq('role', 'student');

      (extraProfiles || []).forEach((s) => {
        studentsById.set(s.id, s);
      });
    }

    setStudents(
      Array.from(studentsById.values()).sort((a, b) =>
        String(a.full_name || '').localeCompare(String(b.full_name || ''))
      )
    );

    // Load upcoming class sessions
    const { data: rawClassSessions } = await supabase
      .from('class_sessions')
      .select('*')
      .eq('teacher_id', profile.id)
      .order('scheduled_for', { ascending: true })
      .limit(30);

    const classSessions = (rawClassSessions || []).filter(
      (s) => getClassSessionEndTime(s) > new Date()
    ).slice(0, 5);
    
    // Load upcoming guidance sessions
    const { data: guidanceSessions } = await supabase
      .from('guidance_sessions')
      .select('*, guidance_requests(*)')
      .eq('teacher_id', profile.id)
      .gte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(5);
    
    // Combine all sessions
    const allSessions = [
      ...(classSessions || []).map(s => ({ ...s, type: 'class' })),
      ...(guidanceSessions || []).map(s => ({ ...s, type: 'guidance' }))
    ].sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for));
    
    setUpcomingSessions(allSessions || []);

    // Load pending leaves
    const { data: leaves } = await supabase
      .from('teacher_leaves')
      .select('*')
      .eq('teacher_id', profile.id)
      .eq('status', 'pending');
    setPendingLeaves(leaves || []);
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-700 p-6 rounded-xl text-white">
        <h1 className="text-2xl font-bold mb-1">Welcome, {profile.full_name}! 👨‍🏫</h1>
        <p className="text-blue-100">Manage your students, classes, and teaching schedule</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard 
          icon={<Users className="text-blue-600" size={24} />}
          label="Assigned Students"
          value={students.length}
          bgColor="bg-blue-50"
        />
        <StatCard 
          icon={<Calendar className="text-green-600" size={24} />}
          label="Upcoming Sessions"
          value={upcomingSessions.length}
          bgColor="bg-green-50"
        />
        <StatCard 
          icon={<Clock className="text-orange-600" size={24} />}
          label="Pending Leaves"
          value={pendingLeaves.length}
          bgColor="bg-orange-50"
        />
        <StatCard 
          icon={<Award className="text-purple-600" size={24} />}
          label="Premium Students"
          value={students.filter(s => s.premium_until && new Date(s.premium_until) > new Date()).length}
          bgColor="bg-purple-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Sessions */}
        <div className="lg:col-span-2 bg-white rounded-xl p-6 border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Upcoming Sessions</h2>
            <Link to="/app/class-schedule" className="text-sm text-blue-600 hover:underline">
              Schedule New
            </Link>
          </div>
          {upcomingSessions.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Calendar className="mx-auto mb-2 text-slate-300" size={48} />
              <p>No upcoming sessions</p>
              <Link to="/app/class-schedule" className="text-blue-600 hover:underline">
                Schedule a Session
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingSessions.map(session => (
                <div key={session.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-sm">
                          {session.type === 'guidance' 
                            ? (session.guidance_requests?.topic || 'Guidance Session')
                            : session.title}
                        </p>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          session.type === 'guidance' 
                            ? 'bg-purple-100 text-purple-700' 
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {session.type === 'guidance' ? 'Guidance' : 'Class'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        📅 {new Date(session.scheduled_for).toLocaleString()}
                      </p>
                      {session.type === 'guidance' && session.guidance_requests?.student_id && (
                        <p className="text-xs text-slate-600 mt-1 font-mono">
                          Student: {session.guidance_requests.student_id.substring(0, 8)}...
                        </p>
                      )}
                    </div>
                  </div>
                  {session.join_link && (
                    <a 
                      href={session.join_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-green-600 text-white px-3 py-2 rounded text-xs hover:bg-green-700 flex items-center justify-center gap-2 w-full mt-2"
                    >
                      🎥 Join Meeting
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-6 border">
            <h2 className="text-lg font-bold mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <Link to="/app/my-students" className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg hover:bg-blue-100 text-blue-900">
                <Users size={20} />
                <span className="text-sm font-medium">My Students</span>
              </Link>
              <Link to="/app/attendance" className="flex items-center gap-3 p-3 bg-green-50 rounded-lg hover:bg-green-100 text-green-900">
                <CheckSquare size={20} />
                <span className="text-sm font-medium">Mark Attendance</span>
              </Link>
              <Link to="/app/class-schedule" className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg hover:bg-purple-100 text-purple-900">
                <Calendar size={20} />
                <span className="text-sm font-medium">Schedule Session</span>
              </Link>
              <Link to="/app/leaves" className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg hover:bg-orange-100 text-orange-900">
                <Clock size={20} />
                <span className="text-sm font-medium">Apply for Leave</span>
              </Link>
              <Link to="/app/teacher-chat" className="flex items-center gap-3 p-3 bg-red-50 rounded-lg hover:bg-red-100 text-red-900">
                <MessageCircle size={20} />
                <span className="text-sm font-medium">Clear Doubts</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Students */}
      <div className="bg-white rounded-xl p-6 border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Your Students</h2>
          <Link to="/app/my-students" className="text-sm text-blue-600 hover:underline">
            View All
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {students.slice(0, 6).map(student => (
            <div
              key={student.id}
              onClick={() => openChat(student.id, student.full_name, student.avatar_url)}
              className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all group"
            >
              <img 
                src={student.avatar_url || 'https://via.placeholder.com/40'} 
                alt={student.full_name}
                className="w-10 h-10 rounded-full object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm group-hover:text-blue-600 transition-colors">{student.full_name}</p>
                <p className="text-xs text-slate-500 truncate">{student.email}</p>
              </div>
              <MessageCircle size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, bgColor }) => (
  <div className={`${bgColor} p-4 rounded-xl border`}>
    <div className="flex items-center justify-between mb-2">
      {icon}
      <span className="text-2xl font-bold">{value}</span>
    </div>
    <p className="text-sm font-medium text-slate-700">{label}</p>
  </div>
);

export default TeacherDashboard;
