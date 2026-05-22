import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import { Users, Clock, TrendingUp, Award, MessageSquare } from 'lucide-react';
import { logError } from '../utils/errorLogger';

const TeacherProgress = () => {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('students');

  useEffect(() => {
    loadTeacherProgress();
  }, []);

  const loadTeacherProgress = async () => {
    setLoading(true);
    try {
      // Fetch all teachers
      const { data: teachersData, error: teachersError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, created_at, avatar_url')
        .eq('role', 'teacher')
        .order('full_name');


      if (!teachersData || teachersData.length === 0) {
        setTeachers([]);
        setLoading(false);
        return;
      }

      // Fetch data for each teacher
      const teachersWithProgress = await Promise.all(
        teachersData.map(async (teacher) => {
          // Count assigned students
          const { count: studentCount } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('assigned_teacher_id', teacher.id);

          // Count guidance sessions (active time indicator)
          const { data: sessions } = await supabase
            .from('guidance_sessions')
            .select('id, created_at')
            .eq('mentor_id', teacher.id)
            .order('created_at', { ascending: false })
            .limit(100);

          // Count student messages (chat activity)
          const { count: messageCount } = await supabase
            .from('chat_messages')
            .select('id', { count: 'exact', head: true })
            .eq('teacher_id', teacher.id);

          // Calculate total active hours from guidance sessions
          let totalActiveHours = 0;
          if (sessions && sessions.length > 0) {
            const sessionDates = sessions.map(s => new Date(s.created_at));
            const lastActive = sessionDates[0];
            const firstActive = sessionDates[sessionDates.length - 1];
            const daysActive = Math.floor((lastActive - firstActive) / (1000 * 60 * 60 * 24));
            totalActiveHours = daysActive * 2; // Estimate 2 hours per day
          }

          // Get days since joined
          const daysJoined = Math.floor((new Date() - new Date(teacher.created_at)) / (1000 * 60 * 60 * 24));

          return {
            ...teacher,
            studentCount: studentCount || 0,
            sessionCount: sessions?.length || 0,
            messageCount: messageCount || 0,
            activeHours: totalActiveHours,
            daysJoined,
            lastSession: sessions?.[0]?.created_at || null
          };
        })
      );
      setTeachers(teachersWithProgress);
    } catch (error) {
      logError({ message: 'Error loading teacher progress:', source: 'TeacherProgress', details: error })
    }
    setLoading(false);
  };

  const filtered = teachers.filter(t =>
    t.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    t.email?.toLowerCase().includes(search.toLowerCase()) ||
    t.core_subject?.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'students':
        return b.studentCount - a.studentCount;
      case 'sessions':
        return b.sessionCount - a.sessionCount;
      case 'messages':
        return b.messageCount - a.messageCount;
      case 'active':
        return b.activeHours - a.activeHours;
      case 'name':
        return a.full_name.localeCompare(b.full_name);
      default:
        return 0;
    }
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-green-600 to-blue-700 p-6 rounded-xl text-white">
        <h1 className="text-2xl font-bold mb-1">Teacher Progress & Analytics</h1>
        <p className="text-green-100">Monitor teacher performance, student assignments, and engagement</p>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-xl shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSortBy('students')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                sortBy === 'students'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Students
            </button>
            <button
              onClick={() => setSortBy('sessions')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                sortBy === 'sessions'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Sessions
            </button>
            <button
              onClick={() => setSortBy('messages')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                sortBy === 'messages'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Messages
            </button>
            <button
              onClick={() => setSortBy('active')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                sortBy === 'active'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Active Hours
            </button>
            <button
              onClick={() => setSortBy('name')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                sortBy === 'name'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Name
            </button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or subject"
            className="px-3 py-2 border rounded-lg w-full md:w-64"
          />
        </div>
      </div>

      {/* Teachers Grid */}
      {sorted.length === 0 ? (
        <div className="bg-white p-8 rounded-xl text-center text-slate-500 space-y-4">
          <Users size={48} className="mx-auto mb-4 opacity-40" />
          <p>No teachers found</p>
          <p className="text-xs">Total teachers loaded: {teachers.length} | Filtered: {filtered.length}</p>
          <p className="text-xs">Search: "{search}" | Sort: {sortBy}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((teacher) => (
            <div key={teacher.id} className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-lg transition-shadow">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 flex-1">
                  {teacher.avatar_url ? (
                    <img src={teacher.avatar_url} alt={teacher.full_name} className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                      {teacher.full_name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-bold truncate">{teacher.full_name}</h3>
                    <p className="text-xs text-slate-500 truncate">{teacher.email}</p>
                  </div>
                </div>
              </div>

              {/* Subject & Tenure */}
              <div className="mb-4 pb-4 border-b space-y-2">
                <p className="text-sm text-slate-600">
                  Joined {teacher.daysJoined} days ago
                </p>
              </div>

              {/* Metrics */}
              <div className="space-y-3">
                {/* Active Students */}
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-blue-600" />
                    <span className="text-sm font-semibold">Active Students</span>
                  </div>
                  <span className="text-lg font-bold text-blue-600">{teacher.studentCount}</span>
                </div>

                {/* Guidance Sessions */}
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} className="text-green-600" />
                    <span className="text-sm font-semibold">Sessions</span>
                  </div>
                  <span className="text-lg font-bold text-green-600">{teacher.sessionCount}</span>
                </div>

                {/* Student Messages */}
                <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={16} className="text-purple-600" />
                    <span className="text-sm font-semibold">Messages</span>
                  </div>
                  <span className="text-lg font-bold text-purple-600">{teacher.messageCount}</span>
                </div>

                {/* Active Hours */}
                <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-orange-600" />
                    <span className="text-sm font-semibold">Est. Active Hours</span>
                  </div>
                  <span className="text-lg font-bold text-orange-600">{Math.round(teacher.activeHours)}</span>
                </div>

                {/* Last Active */}
                {teacher.lastSession && (
                  <p className="text-xs text-slate-500 text-center pt-2 border-t">
                    Last active: {new Date(teacher.lastSession).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeacherProgress;
