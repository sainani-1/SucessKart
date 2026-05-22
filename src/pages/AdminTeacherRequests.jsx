import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import AlertModal from '../components/AlertModal';
import { UserPlus, X, Trash2 } from 'lucide-react';
import useDialog from '../hooks/useDialog.jsx';
import { logError } from '../utils/errorLogger';

const AdminTeacherRequests = () => {
  const { confirm, dialogNode } = useDialog();
  const [requests, setRequests] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });
  const [assigningRequest, setAssigningRequest] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch all requests
      const { data: requestsData, error: reqError } = await supabase
        .from('teacher_assignment_requests')
        .select(`
          id,
          student_id,
          teacher_id,
          message,
          status,
          created_at
        `)
        .order('created_at', { ascending: false });
      
      if (reqError) throw reqError;
      
      
      // Fetch student and teacher profiles separately
      if (requestsData && requestsData.length > 0) {
        const studentIds = requestsData.map(r => r.student_id);
        const teacherIds = requestsData.map(r => r.teacher_id).filter(Boolean);
        
        const { data: studentProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url, education_level, study_stream')
          .in('id', studentIds);
        
        let teacherProfiles = [];
        if (teacherIds.length > 0) {
          const { data } = await supabase
            .from('profiles')
            .select('id, full_name, email, avatar_url')
            .in('id', teacherIds);
          teacherProfiles = data || [];
        }
        
        // Merge profiles with requests
        const enrichedRequests = requestsData.map(req => ({
          ...req,
          student: studentProfiles?.find(p => p.id === req.student_id) || null,
          teacher: req.teacher_id ? teacherProfiles?.find(p => p.id === req.teacher_id) : null
        }));
        setRequests(enrichedRequests);
      } else {
        setRequests([]);
      }

      // Fetch all teachers
      const { data: teachersData, error: teachersError } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, education_level, study_stream')
        .eq('role', 'teacher')
        .order('full_name');
      
      if (teachersError) throw teachersError;
      setTeachers(teachersData || []);
    } catch {} finally {
      setLoading(false);
    }
  };

  const handleAssignTeacher = async (requestId, teacherId) => {
    if (processing) return;
    
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('teacher_assignment_requests')
        .update({ 
          teacher_id: teacherId,
          status: 'admin_assigned',
          updated_at: new Date().toISOString() 
        })
        .eq('id', requestId);
      
      if (error) throw error;
      
      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Teacher assigned successfully!',
        type: 'success'
      });
      
      setAssigningRequest(null);
      fetchData();
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

  const handleRejectRequest = async (requestId) => {
    if (processing) return;
    
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('teacher_assignment_requests')
        .update({ 
          status: 'rejected',
          updated_at: new Date().toISOString() 
        })
        .eq('id', requestId);
      
      if (error) throw error;
      
      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Request rejected.',
        type: 'success'
      });
      
      fetchData();
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
        .neq('status', 'pending');
      
      if (error) throw error;
      
      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Request history cleared successfully!',
        type: 'success'
      });
      
      fetchData();
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
    <div className="p-6 max-w-7xl mx-auto">
      {dialogNode}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Teacher Assignment Requests</h1>
        <p className="text-slate-600">
          Review and assign teachers to student requests.
        </p>
      </div>

      {/* Pending Requests */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <UserPlus size={24} className="text-blue-600" />
          Pending Requests ({pendingRequests.length})
        </h2>
        
        {pendingRequests.length === 0 ? (
          <div className="bg-slate-50 rounded-lg p-8 text-center">
            <p className="text-slate-500">No pending requests at the moment.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingRequests.map((request) => (
              <div key={request.id} className="bg-white border-2 border-blue-200 rounded-xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4 flex-1">
                    <img
                      src={request.student?.avatar_url || 'https://via.placeholder.com/60'}
                      alt={request.student?.full_name}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                    <div className="flex-1">
                      <h3 className="font-bold text-lg">{request.student?.full_name}</h3>
                      <p className="text-sm text-slate-500 mb-1">{request.student?.email}</p>
                      
                      {request.student?.education_level && (
                        <div className="flex gap-4 text-sm text-slate-600 mb-2">
                          <span>
                            <span className="font-medium">Education:</span> {request.student.education_level}
                          </span>
                          {request.student.study_stream && (
                            <span>
                              <span className="font-medium">Stream:</span> {request.student.study_stream}
                            </span>
                          )}
                        </div>
                      )}
                      
                      {request.message && (
                        <p className="text-slate-700 italic text-sm">"{request.message}"</p>
                      )}
                      
                      <p className="text-xs text-slate-400 mt-2">
                        Requested on {new Date(request.created_at).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="ml-4">
                    {request.teacher_id ? (
                      <div className="text-sm">
                        <p className="font-medium text-slate-700">Preferred Teacher:</p>
                        <div className="flex items-center gap-2 mt-1">
                          <img
                            src={request.teacher?.avatar_url || 'https://via.placeholder.com/32'}
                            alt={request.teacher?.full_name}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                          <span className="text-slate-800">{request.teacher?.full_name}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium">
                        No Teacher Specified
                      </span>
                    )}
                  </div>
                </div>

                {assigningRequest === request.id ? (
                  <div className="bg-slate-50 rounded-lg p-4 mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-slate-800">Select Teacher to Assign:</h4>
                      <button
                        onClick={() => setAssigningRequest(null)}
                        className="text-slate-500 hover:text-slate-700"
                      >
                        <X size={20} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                      {teachers.map((teacher) => (
                        <button
                          key={teacher.id}
                          onClick={() => handleAssignTeacher(request.id, teacher.id)}
                          disabled={processing}
                          className="flex items-center gap-3 p-3 border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors disabled:opacity-50 text-left"
                        >
                          <img
                            src={teacher.avatar_url || 'https://via.placeholder.com/40'}
                            alt={teacher.full_name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                          <div>
                            <p className="font-semibold text-slate-800">{teacher.full_name}</p>
                            <p className="text-xs text-slate-500">
                              {teacher.education_level}{teacher.study_stream ? ` - ${teacher.study_stream}` : ''}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setAssigningRequest(request.id)}
                      disabled={processing}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {request.teacher_id ? 'Approve & Assign' : 'Assign Teacher'}
                    </button>
                    {request.teacher_id && (
                      <button
                        onClick={() => handleAssignTeacher(request.id, request.teacher_id)}
                        disabled={processing}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        Quick Approve (Preferred)
                      </button>
                    )}
                    <button
                      onClick={() => handleRejectRequest(request.id)}
                      disabled={processing}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                )}
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
                      src={request.student?.avatar_url || 'https://via.placeholder.com/50'}
                      alt={request.student?.full_name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div>
                      <p className="font-semibold">{request.student?.full_name}</p>
                      <p className="text-sm text-slate-500">
                        {new Date(request.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {request.teacher && (
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-sm text-slate-600">→</span>
                        <img
                          src={request.teacher.avatar_url || 'https://via.placeholder.com/40'}
                          alt={request.teacher.full_name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                        <span className="text-sm font-medium">{request.teacher.full_name}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    {request.status === 'accepted' && (
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                        Accepted by Teacher
                      </span>
                    )}
                    {request.status === 'admin_assigned' && (
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                        Assigned by Admin
                      </span>
                    )}
                    {request.status === 'rejected' && (
                      <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                        Rejected{request.teacher ? ` by ${request.teacher.full_name}` : ''}
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

export default AdminTeacherRequests;
