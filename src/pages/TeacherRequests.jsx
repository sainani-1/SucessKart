import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import AlertModal from '../components/AlertModal';
import { X } from 'lucide-react';
import useDialog from '../hooks/useDialog.jsx';
import { logError } from '../utils/errorLogger';

const TeacherRequests = () => {
  const { user } = useAuth();
  const { confirm, dialogNode } = useDialog();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    fetchRequests();
  }, []);

  const pushNotification = async (payload) => {
    try {
      const { error } = await supabase.from('admin_notifications').insert(payload);
      if (
        error &&
        String(error.message || '').includes('target_user_id')
      ) {
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
      // Keep request flow resilient if notification insert fails.
    }
  };

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('teacher_assignment_requests')
        .select(`
          id,
          student_id,
          message,
          status,
          created_at
        `)
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
// Fetch student profiles separately
      if (data && data.length > 0) {
        const studentIds = data.map(r => r.student_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url, education_level, study_stream')
          .in('id', studentIds);
        
        // Merge profiles with requests
        const enrichedRequests = data.map(req => ({
          ...req,
          profiles: profiles?.find(p => p.id === req.student_id) || null
        }));
setRequests(enrichedRequests);
      } else {
        setRequests([]);
      }
    } catch (error) {
      logError({ message: 'Error fetching requests:', source: 'TeacherRequests', details: error })
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = async (requestId, status) => {
    if (processing) return;
    
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('teacher_assignment_requests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', requestId);
      
      if (error) throw error;

      const req = requests.find((item) => item.id === requestId);
      if (req?.student_id) {
        await pushNotification({
          title: 'Teacher Request Updated',
          content: `Your request has been ${status}.`,
          type: status === 'accepted' ? 'success' : 'warning',
          target_role: 'student',
          target_user_id: req.student_id,
          admin_id: user?.id || null,
        });
      }
      
      setAlertModal({
        show: true,
        title: 'Success',
        message: `Request ${status} successfully!`,
        type: 'success'
      });
      
      fetchRequests();
    } catch (error) {
      setAlertModal({
        show: true,
        title: 'Error',
        message: error.message,
        type: 'error'
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleClearHistory = async () => {
    const ok = await confirm('Are you sure you want to clear all processed requests? This cannot be undone.', 'Clear Request History');
    if (!ok) {
      return;
    }
    
    if (processing) return;
    
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('teacher_assignment_requests')
        .delete()
        .eq('teacher_id', user.id)
        .neq('status', 'pending');
      
      if (error) throw error;
      
      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Request history cleared successfully!',
        type: 'success'
      });
      
      fetchRequests();
    } catch (error) {
      setAlertModal({
        show: true,
        title: 'Error',
        message: error.message,
        type: 'error'
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading requests..." />;
  }

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const processedRequests = requests.filter(r => r.status !== 'pending');

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {dialogNode}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Student Assignment Requests</h1>
        <p className="text-slate-600">
          Review and respond to student requests to be assigned to you.
        </p>
      </div>

      {/* Pending Requests */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          Pending Requests ({pendingRequests.length})
        </h2>
        
        {pendingRequests.length === 0 ? (
          <div className="bg-slate-50 rounded-lg p-8 text-center">
            <p className="text-slate-500">No pending requests at the moment.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingRequests.map((request) => (
              <div key={request.id} className="bg-white border rounded-xl p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <img
                      src={request.profiles?.avatar_url || 'https://via.placeholder.com/60'}
                      alt={request.profiles?.full_name}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                    <div className="flex-1">
                      <h3 className="font-bold text-lg">{request.profiles?.full_name}</h3>
                      <p className="text-sm text-slate-500 mb-2">{request.profiles?.email}</p>
                      
                      {request.profiles?.education_level && (
                        <div className="flex gap-4 text-sm text-slate-600 mb-2">
                          <span>
                            <span className="font-medium">Education:</span> {request.profiles.education_level}
                          </span>
                          {request.profiles.study_stream && (
                            <span>
                              <span className="font-medium">Stream:</span> {request.profiles.study_stream}
                            </span>
                          )}
                        </div>
                      )}
                      
                      {request.message && (
                        <p className="text-slate-700 italic">"{request.message}"</p>
                      )}
                      
                      <p className="text-xs text-slate-400 mt-2">
                        Requested on {new Date(request.created_at).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleRequest(request.id, 'accepted')}
                      disabled={processing}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleRequest(request.id, 'rejected')}
                      disabled={processing}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Processed Requests */}
      {processedRequests.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-800">
              Processed Requests ({processedRequests.length})
            </h2>
            <button
              onClick={handleClearHistory}
              disabled={processing}
              className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors text-sm flex items-center gap-2"
            >
              <X size={16} />
              Clear History
            </button>
          </div>
          
          <div className="space-y-3">
            {processedRequests.map((request) => (
              <div key={request.id} className="bg-slate-50 border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={request.profiles?.avatar_url || 'https://via.placeholder.com/50'}
                      alt={request.profiles?.full_name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div>
                      <p className="font-semibold">{request.profiles?.full_name}</p>
                      <p className="text-sm text-slate-500">
                        {new Date(request.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div>
                    {request.status === 'accepted' && (
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                        Accepted
                      </span>
                    )}
                    {request.status === 'admin_assigned' && (
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                        Assigned by Admin
                      </span>
                    )}
                    {request.status === 'rejected' && (
                      <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                        Rejected
                      </span>
                    )}
                  </div>
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

export default TeacherRequests;
