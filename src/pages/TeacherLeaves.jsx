import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Calendar, Check, X, AlertCircle, CheckCircle } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import usePopup from '../hooks/usePopup.jsx';
import { sendAdminNotification } from '../utils/adminNotifications';
import { TEACHING_ROLES, isTeachingRole } from '../utils/teachingRoles';
import { logError } from '../utils/errorLogger';

const TeacherLeaves = () => {
  const { profile } = useAuth();
  const { popupNode, openPopup } = usePopup();
  const [leaves, setLeaves] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [teachers, setTeachers] = useState([]);
  const [approvalState, setApprovalState] = useState({
    show: false,
    leave: null,
    teacherId: '',
    comments: '',
    sessions: [],
    loadingSessions: false,
  });
  const [actionModal, setActionModal] = useState({
    show: false,
    leaveId: null,
    action: '',
    title: '',
    label: '',
    requireComment: false,
    comment: ''
  });

  useEffect(() => {
    if (profile?.id) {
      loadLeaves();
      if (profile.role === 'admin') {
        loadTeachers();
      }
    }
  }, [profile?.id, profile?.role]);

  const loadLeaves = async () => {
    try {
      setError('');
      if (isTeachingRole(profile.role)) {
        const { data, error: fetchError } = await supabase
          .from('teacher_leaves')
          .select('*')
          .eq('teacher_id', profile.id)
          .order('created_at', { ascending: false });
        
        if (fetchError) throw fetchError;
        setLeaves(data || []);
      } else if (profile.role === 'admin') {
        const { data, error: fetchError } = await supabase
          .from('teacher_leaves')
          .select('*, teacher:teacher_id(id, full_name, email)')
          .order('created_at', { ascending: false });
        
        if (fetchError) throw fetchError;
        setLeaves(data || []);
      }
    } catch (err) {
      logError({ message: 'Error loading leaves:', source: 'TeacherLeaves', details: err })
      setError('Failed to load leave requests');
    }
  };

  const loadTeachers = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('role', TEACHING_ROLES)
        .order('full_name');

      if (fetchError) throw fetchError;
      setTeachers(data || []);
    } catch (err) {
      logError({ message: 'Error loading teachers:', source: 'TeacherLeaves', details: err })
    }
  };

  const applyLeave = async () => {
    if (!startDate || !endDate || !reason.trim()) {
      setError('Please fill in all fields');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError('Start date must be before end date');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const { error: insertError } = await supabase
        .from('teacher_leaves')
        .insert({
          teacher_id: profile.id,
          start_date: startDate,
          end_date: endDate,
          reason
        });

      if (insertError) throw insertError;

      await sendAdminNotification({
        title: 'New Leave Request',
        content: `${profile?.full_name || 'Teacher'} submitted a leave request from ${new Date(startDate).toLocaleDateString('en-IN')} to ${new Date(endDate).toLocaleDateString('en-IN')}. Reason: ${reason.trim()}`,
        type: 'info',
        target_role: 'admin',
        admin_id: profile?.id || null,
      });

      setStartDate('');
      setEndDate('');
      setReason('');
      setSuccess('Leave request submitted successfully!');
      setTimeout(() => setSuccess(''), 3000);
      await loadLeaves();
    } catch (err) {
      logError({ message: 'Error applying leave:', source: 'TeacherLeaves', details: err })
      setError(err.message || 'Failed to submit leave request');
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async (leaveId, status, comments = '') => {
    try {
      setError('');
      const leave = leaves.find((item) => item.id === leaveId);
      const { error: updateError } = await supabase
        .from('teacher_leaves')
        .update({
          status,
          admin_comments: comments || null,
          decided_at: new Date().toISOString(),
          decided_by: profile.id
        })
        .eq('id', leaveId);

      if (updateError) throw updateError;

      if (leave?.teacher_id) {
        await sendAdminNotification({
          title: 'Leave Request Updated',
          content: `Your leave request is now ${status}${comments ? `: ${comments}` : '.'}`,
          type: status === 'approved' ? 'success' : status === 'rejected' ? 'warning' : 'info',
          target_role: 'all',
          target_user_id: leave.teacher_id,
          admin_id: profile?.id || null,
        });
      }
      openPopup('Updated', `Leave request ${status}.`, 'success');
      await loadLeaves();
    } catch (err) {
      logError({ message: 'Error updating leave:', source: 'TeacherLeaves', details: err })
      setError('Failed to update leave request');
      openPopup('Error', 'Failed to update leave request.', 'error');
    }
  };

  const closeApprovalModal = () => {
    setApprovalState({
      show: false,
      leave: null,
      teacherId: '',
      comments: '',
      sessions: [],
      loadingSessions: false,
    });
  };

  const openApproveModal = async (leave) => {
    setApprovalState({
      show: true,
      leave,
      teacherId: '',
      comments: '',
      sessions: [],
      loadingSessions: true,
    });

    try {
      const startIso = new Date(`${leave.start_date}T00:00:00`).toISOString();
      const endIso = new Date(`${leave.end_date}T23:59:59`).toISOString();
      const { data, error: fetchError } = await supabase
        .from('class_sessions')
        .select('id, title, scheduled_for')
        .eq('teacher_id', leave.teacher_id)
        .gte('scheduled_for', startIso)
        .lte('scheduled_for', endIso)
        .order('scheduled_for', { ascending: true });

      if (fetchError) throw fetchError;
      setApprovalState((prev) => ({ ...prev, sessions: data || [], loadingSessions: false }));
    } catch (err) {
      logError({ message: 'Error loading sessions for leave approval:', source: 'TeacherLeaves', details: err })
      setApprovalState((prev) => ({ ...prev, sessions: [], loadingSessions: false }));
      openPopup('Warning', 'Could not load scheduled classes for this leave. You can still approve it.', 'warning');
    }
  };

  const approveWithReassignment = async () => {
    const leave = approvalState.leave;
    if (!leave) return;

    if (approvalState.sessions.length > 0 && !approvalState.teacherId) {
      openPopup('Validation', 'Select a teacher to reassign the scheduled classes.', 'warning');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const selectedReplacement = teachers.find((teacher) => teacher.id === approvalState.teacherId) || null;
      const adminCommentParts = [];
      if (approvalState.comments.trim()) adminCommentParts.push(approvalState.comments.trim());
      if (selectedReplacement) adminCommentParts.push(`Classes reassigned to ${selectedReplacement.full_name}`);
      if (!selectedReplacement && approvalState.sessions.length === 0) {
        adminCommentParts.push('Approved. No scheduled classes required reassignment.');
      }

      const { error: leaveError } = await supabase
        .from('teacher_leaves')
        .update({
          status: 'approved',
          admin_comments: adminCommentParts.join(' | ') || null,
          decided_at: new Date().toISOString(),
          decided_by: profile.id
        })
        .eq('id', leave.id);

      if (leaveError) throw leaveError;

      if (approvalState.sessions.length > 0 && approvalState.teacherId) {
        const reassignments = approvalState.sessions.map((session) => ({
          session_id: session.id,
          original_teacher_id: leave.teacher_id,
          reassigned_to_teacher_id: approvalState.teacherId,
          leave_id: leave.id,
          reason: `Leave approved for ${leave.start_date} to ${leave.end_date}`
        }));

        const { error: reassignError } = await supabase
          .from('session_reassignments')
          .insert(reassignments);

        if (reassignError) throw reassignError;

        const { error: updateSessionsError } = await supabase
          .from('class_sessions')
          .update({ teacher_id: approvalState.teacherId })
          .in('id', approvalState.sessions.map((session) => session.id));

        if (updateSessionsError) throw updateSessionsError;
      }

      if (leave.teacher_id) {
        await sendAdminNotification({
          title: 'Leave Request Updated',
          content: selectedReplacement
            ? `Your leave request is approved. Scheduled classes were reassigned to ${selectedReplacement.full_name}.`
            : 'Your leave request is approved.',
          type: 'success',
          target_role: 'all',
          target_user_id: leave.teacher_id,
          admin_id: profile?.id || null,
        });
      }

      await sendAdminNotification({
        title: 'Leave Approved',
        content: selectedReplacement
          ? `${leave.teacher?.full_name || 'Teacher'} leave was approved and ${approvalState.sessions.length} class session(s) were reassigned to ${selectedReplacement.full_name}.`
          : `${leave.teacher?.full_name || 'Teacher'} leave was approved.`,
        type: 'success',
        target_role: 'admin',
        admin_id: profile?.id || null,
      });

      closeApprovalModal();
      openPopup('Approved', 'Leave approved successfully.', 'success');
      await loadLeaves();
    } catch (err) {
      logError({ message: 'Error approving leave with reassignment:', source: 'TeacherLeaves', details: err })
      setError(err.message || 'Failed to approve leave request');
      openPopup('Error', err.message || 'Failed to approve leave request.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const revokeLeave = async (leaveId) => {
    try {
      setError('');
      const leave = leaves.find((item) => item.id === leaveId);

      const { data: activeReassignments, error: fetchReassignmentsError } = await supabase
        .from('session_reassignments')
        .select('id, session_id, original_teacher_id')
        .eq('leave_id', leaveId)
        .is('reverted_at', null);

      if (fetchReassignmentsError) throw fetchReassignmentsError;

      if (activeReassignments && activeReassignments.length > 0) {
        const originalTeacherId = leave?.teacher_id || activeReassignments[0]?.original_teacher_id;

        if (originalTeacherId) {
          const { error: restoreSessionsError } = await supabase
            .from('class_sessions')
            .update({ teacher_id: originalTeacherId })
            .in('id', activeReassignments.map((item) => item.session_id));

          if (restoreSessionsError) throw restoreSessionsError;
        }

        const { error: markRevertedError } = await supabase
          .from('session_reassignments')
          .update({ reverted_at: new Date().toISOString() })
          .in('id', activeReassignments.map((item) => item.id));

        if (markRevertedError) throw markRevertedError;
      }

      const { error: updateError } = await supabase
        .from('teacher_leaves')
        .update({
          status: 'revoked',
          decided_at: new Date().toISOString(),
          decided_by: profile.id
        })
        .eq('id', leaveId);

      if (updateError) throw updateError;
      if (leave?.teacher_id) {
        await sendAdminNotification({
          title: 'Leave Revoked',
          content: 'Your approved leave was revoked by admin.',
          type: 'warning',
          target_role: 'all',
          target_user_id: leave.teacher_id,
          admin_id: profile?.id || null,
        });
      }
      await sendAdminNotification({
        title: 'Leave Revoked',
        content: `${leave?.teacher?.full_name || 'Teacher'} leave was revoked and related sessions were restored where applicable.`,
        type: 'warning',
        target_role: 'admin',
        admin_id: profile?.id || null,
      });
      openPopup('Updated', 'Leave revoked successfully.', 'success');
      await loadLeaves();
    } catch (err) {
      logError({ message: 'Error revoking leave:', source: 'TeacherLeaves', details: err })
      setError('Failed to revoke leave');
      openPopup('Error', 'Failed to revoke leave.', 'error');
    }
  };

  const openActionModal = (leaveId, action) => {
    if (action === 'approved') {
      setActionModal({
        show: true,
        leaveId,
        action,
        title: 'Approve Leave',
        label: 'Comments (optional)',
        requireComment: false,
        comment: ''
      });
      return;
    }
    if (action === 'rejected') {
      setActionModal({
        show: true,
        leaveId,
        action,
        title: 'Reject Leave',
        label: 'Reason for rejection',
        requireComment: true,
        comment: ''
      });
      return;
    }
    if (action === 'revoked') {
      setActionModal({
        show: true,
        leaveId,
        action,
        title: 'Revoke Leave',
        label: '',
        requireComment: false,
        comment: ''
      });
    }
  };

  const closeActionModal = () => {
    setActionModal({
      show: false,
      leaveId: null,
      action: '',
      title: '',
      label: '',
      requireComment: false,
      comment: ''
    });
  };

  const submitActionModal = async () => {
    if (!actionModal.leaveId || !actionModal.action) return;
    if (actionModal.requireComment && !actionModal.comment.trim()) {
      openPopup('Validation', 'Please enter a reason.', 'warning');
      return;
    }

    if (actionModal.action === 'revoked') {
      await revokeLeave(actionModal.leaveId);
      closeActionModal();
      return;
    }

    await handleLeave(
      actionModal.leaveId,
      actionModal.action,
      actionModal.comment.trim()
    );
    closeActionModal();
  };

  return (
    <div className="space-y-6 p-6">
      {popupNode}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Teacher Leave Management</h1>
        <p className="text-slate-500 mt-1">Apply for leave or manage leave requests</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-green-700 text-sm">{success}</p>
        </div>
      )}

      {isTeachingRole(profile?.role) && (
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            Apply for Leave
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Start Date</label>
              <input 
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">End Date</label>
              <input 
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Reason</label>
            <textarea 
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain the reason for your leave..."
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
            />
          </div>
          <button 
            onClick={applyLeave}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
          >
            {loading ? 'Submitting...' : 'Submit Leave Request'}
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-amber-600" />
          {profile?.role === 'admin' ? 'All Leave Requests' : 'My Leave Requests'}
        </h2>
        
        {leaves.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No leave requests yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {leaves.map(leave => (
              <div key={leave.id} className="border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    {profile?.role === 'admin' && leave.teacher && (
                      <p className="font-semibold text-slate-900">{leave.teacher.full_name}</p>
                    )}
                    <p className="text-sm text-slate-600 flex items-center gap-2 mt-1">
                      <Calendar className="w-4 h-4" />
                      {new Date(leave.start_date).toLocaleDateString('en-IN')} to {new Date(leave.end_date).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap ${
                    leave.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    leave.status === 'approved' ? 'bg-green-100 text-green-800' :
                    leave.status === 'rejected' ? 'bg-red-100 text-red-800' :
                    'bg-slate-100 text-slate-800'
                  }`}>
                    {leave.status.charAt(0).toUpperCase() + leave.status.slice(1)}
                  </span>
                </div>
                
                <p className="text-sm text-slate-700 mb-2"><strong>Reason:</strong> {leave.reason}</p>
                
                {leave.admin_comments && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3 text-sm">
                    <p className="font-medium text-blue-900">Admin Comments:</p>
                    <p className="text-blue-800">{leave.admin_comments}</p>
                  </div>
                )}

                {profile?.role === 'admin' && leave.status === 'pending' && (
                  <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200">
                    <button 
                      onClick={() => openApproveModal(leave)}
                      className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 transition-colors"
                    >
                      <Check size={16} /> Approve
                    </button>
                    <button 
                      onClick={() => openActionModal(leave.id, 'rejected')}
                      className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 transition-colors"
                    >
                      <X size={16} /> Reject
                    </button>
                  </div>
                )}

                {profile?.role === 'admin' && leave.status === 'approved' && (
                  <div className="pt-4 border-t border-slate-200">
                    <button 
                      onClick={() => openActionModal(leave.id, 'revoked')}
                      className="bg-slate-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-slate-700 transition-colors"
                    >
                      Revoke Leave
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {actionModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-3">{actionModal.title}</h3>
            {actionModal.action === 'revoked' ? (
              <p className="text-sm text-slate-700 mb-4">Are you sure you want to revoke this leave?</p>
            ) : (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">{actionModal.label}</label>
                <textarea
                  value={actionModal.comment}
                  onChange={(e) => setActionModal((prev) => ({ ...prev, comment: e.target.value }))}
                  rows={3}
                  placeholder={actionModal.requireComment ? 'Enter reason...' : 'Enter comments...'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={closeActionModal}
                className="flex-1 bg-slate-200 text-slate-700 py-2 rounded-lg hover:bg-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitActionModal}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
      {approvalState.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4">
            <h3 className="text-lg font-bold mb-2">Approve Leave</h3>
            <p className="text-sm text-slate-600 mb-4">
              Select who should handle this teacher's scheduled classes during the approved leave period.
            </p>

            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">
                  {approvalState.leave?.teacher?.full_name || 'Teacher'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {approvalState.leave?.start_date} to {approvalState.leave?.end_date}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Reassign Teacher</label>
                <select
                  value={approvalState.teacherId}
                  onChange={(e) => setApprovalState((prev) => ({ ...prev, teacherId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  disabled={approvalState.loadingSessions}
                >
                  <option value="">
                    {approvalState.sessions.length > 0 ? 'Select teacher...' : 'No reassignment needed'}
                  </option>
                  {teachers
                    .filter((teacher) => teacher.id !== approvalState.leave?.teacher_id)
                    .map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.full_name} {teacher.email ? `(${teacher.email})` : ''}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {approvalState.sessions.length > 0
                    ? `Required because ${approvalState.sessions.length} scheduled class(es) fall inside the leave dates.`
                    : 'This leave has no scheduled classes in the selected period, so reassignment is optional.'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Admin Comments (Optional)</label>
                <textarea
                  value={approvalState.comments}
                  onChange={(e) => setApprovalState((prev) => ({ ...prev, comments: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  placeholder="Add any note for the teacher..."
                />
              </div>

              <div className="rounded-lg border border-slate-200 p-4 max-h-56 overflow-y-auto">
                <p className="text-sm font-semibold text-slate-800 mb-2">Affected Scheduled Classes</p>
                {approvalState.loadingSessions ? (
                  <p className="text-sm text-slate-500">Loading scheduled classes...</p>
                ) : approvalState.sessions.length === 0 ? (
                  <p className="text-sm text-slate-500">No scheduled classes found in this leave period.</p>
                ) : (
                  <div className="space-y-2">
                    {approvalState.sessions.map((session) => (
                      <div key={session.id} className="rounded border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm font-medium text-slate-800">{session.title || 'Class Session'}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(session.scheduled_for).toLocaleString('en-IN')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={closeApprovalModal}
                className="flex-1 bg-slate-200 text-slate-700 py-2 rounded-lg hover:bg-slate-300 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={approveWithReassignment}
                className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-60"
                disabled={loading || approvalState.loadingSessions}
              >
                {loading ? 'Approving...' : 'Approve Leave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherLeaves;
