import React, { useState, useEffect } from 'react';
import { Briefcase, Compass, PhoneCall, ArrowRight, MessageSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import { logError } from '../utils/errorLogger';

const recommendations = [
  { title: 'Backend Engineer Path', steps: ['Data Structures & Algorithms', 'APIs with Node.js', 'SQL + PostgreSQL', 'System Design Basics'], cta: 'View roadmap' },
  { title: 'Frontend Engineer Path', steps: ['HTML/CSS fundamentals', 'React + Routing', 'State Management', 'Accessibility & Performance'], cta: 'Start learning' },
  { title: 'Data Analyst Path', steps: ['SQL essentials', 'Pandas & Excel', 'Dashboards', 'Storytelling with Data'], cta: 'See modules' }
];

const mentors = [
  { name: 'Ananya', role: 'Senior Frontend', slots: '2 slots left' },
  { name: 'Rahul', role: 'Backend Lead', slots: '1 slot left' },
  { name: 'Sara', role: 'Data Specialist', slots: '3 slots left' }
];

const CareerGuidance = () => {
  const { profile } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const isPremium = profile?.role === 'teacher' || profile?.role === 'admin' || (profile?.premium_until && new Date(profile.premium_until) > new Date());
  const isTeacher = profile?.role === 'teacher';

  useEffect(() => {
    if (profile && isTeacher) {
      loadTeacherRequests();
    }
  }, [profile, isTeacher]);

  const loadTeacherRequests = async () => {
    try {
      const { data } = await supabase
        .from('guidance_requests')
        .select(`
          id,
          topic,
          notes,
          status,
          created_at,
          student_id,
          student:student_id(full_name)
        `)
        .eq('assigned_to_teacher_id', profile.id)
        .order('created_at', { ascending: false });
      setRequests(data || []);
    } catch (error) {
      logError({ message: 'Error loading requests:', source: 'CareerGuidance', details: error });
    } finally {
      setLoading(false);
    }
  };

  if (!isPremium) {
    return (
      <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm text-center">
        <h1 className="text-2xl font-bold text-slate-900">Premium required</h1>
        <p className="text-slate-500 mt-1">Upgrade to access career mentorship, mentoring, and roadmaps.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-nani-accent font-semibold">Career Mentorship</p>
          <h1 className="text-3xl font-bold text-slate-900 mt-1">Pick a path and get mentored</h1>
          <p className="text-slate-600 mt-2">Choose a track, follow the curated steps, and book time with a mentor.</p>
      <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/app/guidance-sessions" className="px-4 py-2 bg-nani-dark text-white rounded-lg text-sm hover:bg-nani-accent transition-colors flex items-center gap-2">
              <MessageSquare size={16} /> Request Guidance
            </Link>
            <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2">
              <PhoneCall size={16} /> Talk to a mentor
            </button>
          </div>
        </div>
        <Briefcase className="text-nani-accent flex-shrink-0" size={40} />
      </header>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-3">Recommended tracks</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {recommendations.map((rec, idx) => (
            <div key={idx} className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-3">
              <h3 className="font-semibold text-slate-900">{rec.title}</h3>
              <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
                {rec.steps.map((step, i) => <li key={i}>{step}</li>)}
              </ul>
              <button className="text-nani-dark text-sm font-semibold inline-flex items-center gap-1 hover:text-nani-accent">
                {rec.cta} <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {isTeacher && (
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-3">Requests Assigned to You</h2>
          {loading ? (
            <div className="text-slate-500">Loading requests...</div>
          ) : requests.length === 0 ? (
            <div className="border border-slate-200 rounded-xl bg-white p-4 text-sm text-slate-700">
              <p className="text-slate-500">No guidance requests assigned yet. When students request guidance, they will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {requests.map(req => (
                <div key={req.id} className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{req.topic}</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      <strong>Student:</strong> {req.student?.full_name}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Requested: {new Date(req.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {req.notes && (
                    <p className="text-sm text-slate-600 italic">{req.notes}</p>
                  )}
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                    req.status === 'assigned' ? 'bg-blue-100 text-blue-800' :
                    req.status === 'scheduled' ? 'bg-purple-100 text-purple-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {req.status}
                  </span>
                  <Link 
                    to="/app/guidance-sessions"
                    className="inline-block text-nani-dark text-sm font-semibold hover:text-nani-accent"
                  >
                    Manage Request → 
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-3">Mentor slots</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {mentors.map((m, i) => (
            <div key={i} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">{m.name}</p>
                <p className="text-xs text-slate-500">{m.role}</p>
              </div>
              <span className="text-xs bg-nani-light text-white px-3 py-1 rounded-full">{m.slots}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default CareerGuidance;
