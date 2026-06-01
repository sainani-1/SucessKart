import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import AlertModal from '../components/AlertModal';
import { sendAdminNotification } from '../utils/adminNotifications';
import { logError } from '../utils/errorLogger';

const RequestTeacher = () => {
  const { user, profile, isPremium } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [myRequests, setMyRequests] = useState([]);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    fetchMyRequests();
  }, []);

  const fetchMyRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('teacher_assignment_requests')
        .select(`
          id,
          teacher_id,
          message,
          status,
          created_at
        `)
        .eq('student_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const teacherIds = data.map((row) => row.teacher_id).filter(Boolean);
        if (teacherIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', teacherIds);

          const enrichedRequests = data.map((request) => ({
            ...request,
            profiles: request.teacher_id ? profiles?.find((item) => item.id === request.teacher_id) : null
          }));
          setMyRequests(enrichedRequests);
        } else {
          setMyRequests(data);
        }
      } else {
        setMyRequests([]);
      }
    } catch (error) {
      logError({ message: 'Error fetching requests:', source: 'RequestTeacher', details: error })
    } finally {
      setLoading(false);
    }
  };

  const sendRequest = async () => {
    if (sendingRequest) return;

    if (profile?.assigned_teacher_id) {
      setAlertModal({
        show: true,
        title: 'Already Assigned',
        message: 'You already have a teacher assigned. Contact the SucessKart team if you need to change.',
        type: 'info'
      });
      return;
    }

    const existingRequest = myRequests.find((request) => request.status === 'pending');
    if (existingRequest) {
      setAlertModal({
        show: true,
        title: 'Request Pending',
        message: 'You already have a pending teacher assignment request with the SucessKart team.',
        type: 'info'
      });
      return;
    }

    setSendingRequest(true);
    try {
      const { error } = await supabase
        .from('teacher_assignment_requests')
        .insert([{
          student_id: user.id,
          teacher_id: null,
          message: 'I would like to be assigned a teacher. Please assign a suitable teacher for me.',
          status: 'pending'
        }]);

      if (error) throw error;

      await sendAdminNotification({
        title: 'New Teacher Assignment Request',
        content: `${profile?.full_name || 'Student'} requested a teacher or mentor assignment.`,
        admin_id: profile?.id || null,
      });

      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Request sent to the SucessKart team successfully. You will be assigned a teacher or mentor soon.',
        type: 'success'
      });

      fetchMyRequests();
    } catch (error) {
      setAlertModal({
        show: true,
        title: 'Error',
        message: error.message,
        type: 'error'
      });
    } finally {
      setSendingRequest(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading requests..." />;
  }

  const isFreeStudent = profile?.role === 'student' && !isPremium(profile);

  if (isFreeStudent) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Request Teacher Assignment</h1>
          <p className="text-slate-600">
            Send a request to the SucessKart team and they will assign a suitable teacher for you.
          </p>
        </div>
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-6">
          <h2 className="text-xl font-bold text-amber-900 mb-2">Upgrade to Premium</h2>
          <p className="text-amber-800 mb-4">
            Teacher assignment requests are available for premium members only.
          </p>
          <a
            href="/app/payment"
            className="inline-block px-5 py-2.5 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700"
          >
            Upgrade Now
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Request Teacher Assignment</h1>
        <p className="text-slate-600">
          Send a request to the SucessKart team and they will assign a suitable teacher for you.
        </p>
      </div>

      {profile?.assigned_teacher_id && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-green-800 font-medium">
            You already have a teacher assigned. Contact the SucessKart team if you need to change.
          </p>
        </div>
      )}

      {!profile?.assigned_teacher_id && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-blue-800 font-medium mb-1">Need a teacher?</p>
            <p className="text-blue-600 text-sm">The SucessKart team will review your request and assign the right teacher.</p>
          </div>
          <button
            onClick={sendRequest}
            disabled={sendingRequest || myRequests.some((request) => request.status === 'pending' && !request.teacher_id)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            Request SucessKart Team Assignment
          </button>
        </div>
      )}

      {myRequests.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">My Requests</h2>
          <div className="space-y-3">
            {myRequests.map((request) => (
              <div key={request.id} className="bg-white border rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={request.profiles?.avatar_url || 'https://via.placeholder.com/50'}
                    alt={request.profiles?.full_name || 'SucessKart Team Assignment'}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <p className="font-semibold">
                      {request.profiles?.full_name || 'SucessKart Team Assignment Request'}
                    </p>
                    <p className="text-sm text-slate-500">
                      Sent {new Date(request.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div>
                  {request.status === 'pending' && (
                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                      Pending
                    </span>
                  )}
                  {request.status === 'accepted' && (
                    <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                      Accepted
                    </span>
                  )}
                  {request.status === 'admin_assigned' && (
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                      Assigned by SucessKart Team
                    </span>
                  )}
                  {request.status === 'rejected' && (
                    <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                      Rejected by {request.profiles?.full_name || 'SucessKart Team'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

export default RequestTeacher;
