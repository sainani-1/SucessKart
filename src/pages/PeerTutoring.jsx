import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Users, Star, MessageCircle, DollarSign, CheckCircle } from 'lucide-react';
import usePopup from '../hooks/usePopup.jsx';
import LoadingSpinner from '../components/LoadingSpinner';
import { logError } from '../utils/errorLogger';

const PeerTutoring = () => {
  const { profile } = useAuth();
  const { popupNode, openPopup } = usePopup();
  const [tutors, setTutors] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selectedTutor, setSelectedTutor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('student'); // 'student' or 'tutor'

  useEffect(() => {
    const loadData = async () => {
      try {
        // Mock tutoring data - in production, query peer_tutoring_profiles table
        const mockTutors = [
          {
            id: 1,
            name: 'Priya Singh',
            expertise: ['React', 'JavaScript', 'Web Dev'],
            rating: 4.9,
            reviews: 47,
            hourlyRate: 500,
            availableHours: '2PM-6PM IST',
            verified: true
          },
          {
            id: 2,
            name: 'Rahul Sharma',
            expertise: ['Python', 'Data Science', 'ML'],
            rating: 4.8,
            reviews: 33,
            hourlyRate: 600,
            availableHours: '3PM-8PM IST',
            verified: true
          },
          {
            id: 3,
            name: 'Isha Patel',
            expertise: ['System Design', 'Backend', 'Databases'],
            rating: 4.7,
            reviews: 28,
            hourlyRate: 700,
            availableHours: '4PM-10PM IST',
            verified: true
          }
        ];
        setTutors(mockTutors);
      } catch (err) {
        logError({ message: 'Error loading tutors:', source: 'PeerTutoring', details: err })
      } finally {
        setLoading(false);
      }
    };

    if (profile) loadData();
  }, [profile]);

  const handleBookSession = (tutor) => {
    openPopup('Session requested', `Booking session with ${tutor.name} for ₹${tutor.hourlyRate}/hour. We will confirm shortly.`, 'success');
  };

  return (
    <div className="p-8 space-y-6">
      {popupNode}
      <div className="flex items-center gap-3">
        <Users className="text-blue-500" size={32} />
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Peer Tutoring Marketplace</h1>
          <p className="text-slate-600">Learn from experienced peers and grow together</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setRole('student')}
          className={`px-4 py-2 rounded-lg ${role === 'student' ? 'bg-nani-dark text-white' : 'bg-slate-200'}`}
        >
          Find Tutors
        </button>
        <button
          onClick={() => setRole('tutor')}
          className={`px-4 py-2 rounded-lg ${role === 'tutor' ? 'bg-nani-dark text-white' : 'bg-slate-200'}`}
        >
          Become a Tutor
        </button>
      </div>

      {role === 'student' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tutors.map(tutor => (
            <div key={tutor.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-900">{tutor.name}</h3>
                  {tutor.verified && (
                    <div className="flex items-center gap-1 text-xs text-green-600 mt-1">
                      <CheckCircle size={12} />
                      Verified Tutor
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Star size={16} className="text-yellow-400 fill-yellow-400" />
                  <span className="font-bold text-sm">{tutor.rating}</span>
                </div>
              </div>
              
              <div className="mb-4">
                <p className="text-xs text-slate-600 font-semibold mb-2">Expertise:</p>
                <div className="flex flex-wrap gap-2">
                  {tutor.expertise.map((skill, i) => (
                    <span key={i} className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2 text-sm mb-4">
                <p className="text-slate-600"><DollarSign size={14} className="inline" /> ₹{tutor.hourlyRate}/hour</p>
                <p className="text-slate-600">⏰ {tutor.availableHours}</p>
                <p className="text-slate-500 text-xs">{tutor.reviews} reviews</p>
              </div>

              <button
                onClick={() => handleBookSession(tutor)}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-semibold"
              >
                Book Session
              </button>
            </div>
          ))}
        </div>
      )}

      {role === 'tutor' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 max-w-2xl">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Earn While You Learn</h2>
          <p className="text-slate-700 mb-6">Share your knowledge and earn up to ₹1000/hour by tutoring peers.</p>
          <button className="bg-nani-dark text-white px-6 py-3 rounded-lg hover:bg-black font-semibold">
            Complete Tutor Profile
          </button>
        </div>
      )}
    </div>
  );
};

export default PeerTutoring;
