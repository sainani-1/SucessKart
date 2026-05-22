import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Sparkles, BookOpen, Target, AlertCircle } from 'lucide-react';
import { logError } from '../utils/errorLogger';

const PersonalizedLearningPaths = () => {
  const { profile } = useAuth();
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState(null);

  useEffect(() => {
    const loadPaths = async () => {
      try {
        // Fetch user's exam scores to determine learning level
        const { data: submissions } = await supabase
          .from('exam_submissions')
          .select('score_percent, exam:exams!inner(course_id)')
          .eq('user_id', profile.id)
          .order('submitted_at', { ascending: false });

        // Generate AI-recommended learning paths based on score
        if (submissions && submissions.length > 0) {
          const avgScore = submissions.reduce((a, b) => a + (b.score_percent || 0), 0) / submissions.length;
          
          const generatedPaths = [
            {
              id: 1,
              title: 'Foundation Building Path',
              description: 'Master core concepts with step-by-step learning',
              difficulty: 'Beginner',
              courses: ['Python Basics', 'Data Structures', 'Web Dev Fundamentals'],
              estimatedDays: 45,
              match: avgScore < 60 ? '95%' : '60%'
            },
            {
              id: 2,
              title: 'Advanced Developer Path',
              description: 'Advanced techniques and best practices',
              difficulty: 'Advanced',
              courses: ['System Design', 'Advanced React', 'Microservices'],
              estimatedDays: 60,
              match: avgScore > 75 ? '90%' : '50%'
            },
            {
              id: 3,
              title: 'Full-Stack Mastery Path',
              description: 'Become a complete full-stack engineer',
              difficulty: 'Intermediate',
              courses: ['React', 'Node.js', 'Database Design', 'DevOps'],
              estimatedDays: 90,
              match: '75%'
            }
          ];
          
          setPaths(generatedPaths);
        }
      } catch (err) {
        logError({ message: 'Error loading paths:', source: 'PersonalizedLearningPaths', details: err })
      } finally {
        setLoading(false);
      }
    };

    if (profile) loadPaths();
  }, [profile]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles className="text-gold-400" size={32} />
        <div>
          <h1 className="text-3xl font-bold text-slate-900">AI Learning Paths</h1>
          <p className="text-slate-600">Personalized course recommendations based on your performance</p>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner fullPage={false} message="Loading your personalized paths..." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paths.map(path => (
            <div
              key={path.id}
              onClick={() => setSelectedPath(path)}
              className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
                selectedPath?.id === path.id
                  ? 'border-gold-400 bg-gold-50'
                  : 'border-slate-200 hover:border-gold-300 bg-white'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-900">{path.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">{path.difficulty}</p>
                </div>
                <div className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded">
                  {path.match} Match
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">{path.description}</p>
              <div className="space-y-2 mb-4">
                <p className="text-xs font-semibold text-slate-700">Courses:</p>
                <ul className="text-xs text-slate-600 space-y-1">
                  {path.courses.map((c, i) => (
                    <li key={i}>• {c}</li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>⏱ {path.estimatedDays} days</span>
                <span className="text-gold-400 font-semibold">→</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PersonalizedLearningPaths;
