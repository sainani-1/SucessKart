import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Unlock, Clock, CheckCircle, Search, RefreshCw, ShieldOff, Trash2 } from 'lucide-react';
import usePopup from '../hooks/usePopup.jsx';
import LoadingSpinner from '../components/LoadingSpinner';
import { logAdminActivity } from '../utils/adminActivityLogger';
import { logError } from '../utils/errorLogger';

/**
 * AdminExamRetakes Component
 * ===========================
 * Admin interface to manage locked students and grant exam retake permissions
 * 
 * Features:
 * - View all locked students
 * - See which course they failed and when they get unlocked
 * - Grant immediate retake permission
 * - Clear override permission
 * - Search students by name or email
 */
const AdminExamRetakes = () => {
  const { profile } = useAuth();
  const { popupNode, openPopup } = usePopup();
  const [lockedStudents, setLockedStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [grantingId, setGrantingId] = useState(null);
  const [terminatedStudents, setTerminatedStudents] = useState([]);

  const loadLockedStudents = async () => {
    try {
      setLoading(true);
      
      // Get all students with failed exams that still have cooldown periods
      // OR students who are currently locked
      const { data: submissions, error: submissionsError } = await supabase
        .from('exam_submissions')
        .select(`
          id,
          user_id,
          exam_id,
          passed,
          submitted_at,
          next_attempt_allowed_at,
          exam:exams(
            id,
            course_id,
            course:courses(id, title)
          ),
          user:profiles(
            id,
            full_name,
            email,
            is_locked,
            locked_until
          )
        `)
        .eq('passed', false);

      if (submissionsError) {
        openPopup('Error', 'Failed to load exam data', 'error');
        setLockedStudents([]);
        return;
      }

      // Group by student and filter those with active cooldowns
      const studentMap = new Map();
      const now = new Date();

      (submissions || []).forEach(submission => {
        if (!submission.user) return;
        
        const userId = submission.user.id;
        const nextAttemptDate = submission.next_attempt_allowed_at 
          ? new Date(submission.next_attempt_allowed_at)
          : null;
        
        // Only include if they have an active cooldown OR are currently locked
        const hasActiveCooldown = nextAttemptDate && nextAttemptDate > now;
        const isCurrentlyLocked = submission.user.is_locked;
        
        if (hasActiveCooldown || isCurrentlyLocked) {
          if (!studentMap.has(userId)) {
            studentMap.set(userId, {
              id: submission.user.id,
              full_name: submission.user.full_name,
              email: submission.user.email,
              is_locked: submission.user.is_locked,
              locked_until: submission.user.locked_until,
              failedExams: [],
              overridesMap: {}
            });
          }
          
          const student = studentMap.get(userId);
          student.failedExams.push({
            id: submission.id,
            exam_id: submission.exam_id,
            submitted_at: submission.submitted_at,
            next_attempt_allowed_at: submission.next_attempt_allowed_at,
            exam: submission.exam
          });
        }
      });

      // Get overrides for all students
      const studentIds = Array.from(studentMap.keys());
      if (studentIds.length > 0) {
        const { data: overridesData } = await supabase
          .from('exam_retake_overrides')
          .select('user_id, course_id, allow_retake_at')
          .in('user_id', studentIds);

        if (overridesData) {
          overridesData.forEach(override => {
            const student = studentMap.get(override.user_id);
            if (student) {
              const key = `${override.user_id}_${override.course_id}`;
              student.overridesMap[key] = override.allow_retake_at;
            }
          });
        }
      }

      const { data: attemptBlocks, error: attemptBlocksError } = await supabase
        .from('exam_attempt_blocks')
        .select(`
          user_id,
          exam_id,
          reason,
          unblock_after_question_update_at,
          updated_at,
          exam:exams(
            id,
            course_id,
            course:courses(id, title)
          ),
          user:profiles(
            id,
            full_name,
            email,
            is_locked,
            locked_until
          )
        `)
        .order('updated_at', { ascending: false });

      if (attemptBlocksError) {
        logError({ message: 'Error loading attempt blocks:', source: 'AdminExamRetakes', details: attemptBlocksError });
      } else {
        const terminated = (attemptBlocks || [])
          .filter((row) => row.user)
          .map((row) => ({
            user_id: row.user.id,
            full_name: row.user.full_name,
            email: row.user.email,
            is_locked: row.user.is_locked,
            locked_until: row.user.locked_until,
            exam_id: row.exam_id,
            course_id: row.exam?.course_id,
            course_title: row.exam?.course?.title || `Course ${row.exam?.course_id || ''}`,
            reason: row.reason || 'Strict proctoring block',
            unblock_after_question_update_at: row.unblock_after_question_update_at,
            updated_at: row.updated_at,
          }));
        setTerminatedStudents(terminated);
      }

      setLockedStudents(Array.from(studentMap.values()));
    } catch (error) {
      logError({ message: 'Error loading locked students:', source: 'AdminExamRetakes', details: error });
      openPopup('Error', 'Error loading exam cooldown data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLockedStudents();
  }, []);

  const grantRetakePermission = async (userId, courseId) => {
    try {
      setGrantingId(`${userId}_${courseId}`);
      
      // First, delete any existing override for this student-course combo
      await supabase
        .from('exam_retake_overrides')
        .delete()
        .eq('user_id', userId)
        .eq('course_id', courseId);

      // Then insert new override to allow immediate retake
      const { error } = await supabase
        .from('exam_retake_overrides')
        .insert({
          user_id: userId,
          course_id: courseId,
          allow_retake_at: new Date().toISOString()
        });

      if (error) throw error;

      setLockedStudents((prev) =>
        prev.map((student) => {
          if (student.id !== userId) return student;
          return {
            ...student,
            overridesMap: {
              ...(student.overridesMap || {}),
              [`${userId}_${courseId}`]: new Date().toISOString(),
            },
          };
        })
      );
      openPopup('Permission Granted', 'Student can now retake the exam immediately!', 'success');
      await logAdminActivity({
        adminId: profile?.id,
        action: 'Allowed exam retake again',
        target: `${userId}:${courseId}`,
        details: {
          user_id: userId,
          course_id: courseId,
          source: 'admin_exam_retakes',
          allow_retake_at: new Date().toISOString(),
        },
      });
      await loadLockedStudents();
    } catch (error) {
      logError({ message: 'Error granting permission:', source: 'AdminExamRetakes', details: error });
      openPopup('Error', `Failed to grant permission: ${error.message}`, 'error');
    } finally {
      setGrantingId(null);
    }
  };

  const revokeRetakePermission = async (userId, courseId) => {
    try {
      setGrantingId(`${userId}_${courseId}`);
      
      // Delete override
      const { error } = await supabase
        .from('exam_retake_overrides')
        .delete()
        .eq('user_id', userId)
        .eq('course_id', courseId);

      if (error) throw error;

      setLockedStudents((prev) =>
        prev.map((student) => {
          if (student.id !== userId) return student;
          const overridesMap = { ...(student.overridesMap || {}) };
          delete overridesMap[`${userId}_${courseId}`];
          return {
            ...student,
            overridesMap,
          };
        })
      );
      openPopup('Permission Revoked', 'Retake override has been removed', 'success');
      await logAdminActivity({
        adminId: profile?.id,
        action: 'Removed exam retake override',
        target: `${userId}:${courseId}`,
        details: {
          user_id: userId,
          course_id: courseId,
          source: 'admin_exam_retakes',
        },
      });
      await loadLockedStudents();
    } catch (error) {
      logError({ message: 'Error revoking permission:', source: 'AdminExamRetakes', details: error });
      openPopup('Error', 'Failed to revoke permission', 'error');
    } finally {
      setGrantingId(null);
    }
  };

  const releaseTerminatedExam = async (student) => {
    try {
      const actionKey = `terminated_${student.user_id}_${student.exam_id}`;
      setGrantingId(actionKey);

      const { data: releaseRows, error: releaseError } = await supabase.rpc(
        'admin_release_terminated_exam',
        {
          target_user_id: student.user_id,
          target_exam_id: student.exam_id,
          target_course_id: student.course_id || null,
        }
      );

      if (releaseError) throw releaseError;

      const result = Array.isArray(releaseRows) ? releaseRows[0] : releaseRows;
      if (!result || Number(result.removed_blocks || 0) < 1) {
        throw new Error('Exam block was not removed. Run the admin release RPC migration in Supabase.');
      }
      if (Number(result.unlocked_profiles || 0) < 1) {
        throw new Error('Student account was not unlocked. Check profile data for this user.');
      }

      setTerminatedStudents((prev) =>
        prev.filter(
          (row) => !(row.user_id === student.user_id && row.exam_id === student.exam_id)
        )
      );
      openPopup('Exam Released', 'Student can write the exam again now.', 'success');
      await logAdminActivity({
        adminId: profile?.id,
        action: 'Released terminated exam for rewrite',
        target: `${student.user_id}:${student.exam_id}`,
        details: {
          user_id: student.user_id,
          exam_id: student.exam_id,
          course_id: student.course_id || null,
          source: 'admin_exam_retakes',
          result,
        },
      });
      await loadLockedStudents();
    } catch (error) {
      logError({ message: 'Error releasing terminated exam:', source: 'AdminExamRetakes', details: error });
      openPopup('Error', `Failed to release terminated exam: ${error.message}`, 'error');
    } finally {
      setGrantingId(null);
    }
  };

  const deleteFailedExamRecord = async (student, submission) => {
    try {
      const actionKey = `delete_${submission.id}`;
      setGrantingId(actionKey);

      const { data: deleteRows, error: deleteError } = await supabase.rpc(
        'admin_delete_failed_exam_submission',
        {
          target_submission_id: submission.id,
          target_user_id: student.id,
          target_course_id: submission.exam?.course_id || null,
        }
      );

      if (deleteError) throw deleteError;

      const result = Array.isArray(deleteRows) ? deleteRows[0] : deleteRows;
      if (!result || Number(result.deleted_submissions || 0) < 1) {
        throw new Error('Failed exam record was not deleted. Run the admin delete failed exam RPC migration in Supabase.');
      }

      setLockedStudents((prev) =>
        prev
          .map((row) => {
            if (row.id !== student.id) return row;
            return {
              ...row,
              failedExams: (row.failedExams || []).filter((entry) => entry.id !== submission.id),
            };
          })
          .filter((row) => (row.failedExams || []).length > 0)
      );

      openPopup('Deleted', 'Failed exam record has been deleted.', 'success');
      await logAdminActivity({
        adminId: profile?.id,
        action: 'Deleted failed exam submission',
        target: `${student.id}:${submission.id}`,
        details: {
          user_id: student.id,
          submission_id: submission.id,
          exam_id: submission.exam_id,
          course_id: submission.exam?.course_id || null,
          source: 'admin_exam_retakes',
          result,
        },
      });
      await loadLockedStudents();
    } catch (error) {
      logError({ message: 'Error deleting failed exam record:', source: 'AdminExamRetakes', details: error });
      openPopup('Error', `Failed to delete exam record: ${error.message}`, 'error');
    } finally {
      setGrantingId(null);
    }
  };

  const filteredStudents = lockedStudents.filter(student =>
    student.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getDaysRemaining = (lockedUntil) => {
    const days = Math.ceil((new Date(lockedUntil) - new Date()) / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  const hasOverride = (student, courseId) => {
    const key = `${student.id}_${courseId}`;
    return student.overridesMap[key];
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {popupNode}
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Exam Release Management</h1>
          <p className="text-slate-500 mt-1">Release students from failed-exam cooldowns and strict-proctoring terminations</p>
        </div>
        <button
          onClick={loadLockedStudents}
          className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition-colors"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-3 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Locked Students List - Table View */}
      {terminatedStudents.length > 0 && (
        <div className="bg-white border border-red-200 rounded-lg overflow-hidden shadow-sm">
          <div className="flex items-center justify-between border-b border-red-100 bg-red-50 px-4 py-4">
            <div>
              <h2 className="text-lg font-bold text-red-900">Terminated Exams</h2>
              <p className="text-sm text-red-700">Students blocked by strict-proctoring violations</p>
            </div>
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
              {terminatedStudents.length} blocked
            </span>
          </div>
          <div className="divide-y divide-slate-200">
            {terminatedStudents
              .filter((student) =>
                student.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                student.email.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((student) => {
                const actionKey = `terminated_${student.user_id}_${student.exam_id}`;
                return (
                  <div key={actionKey} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-slate-50 transition-colors">
                    <div className="col-span-3">
                      <p className="font-semibold text-slate-900">{student.full_name}</p>
                      <p className="text-xs text-slate-500">{student.email}</p>
                    </div>
                    <div className="col-span-3">
                      <p className="font-semibold text-slate-900">{student.course_title}</p>
                      <p className="text-xs text-slate-500">{student.reason}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm font-semibold text-red-600">
                        {student.locked_until ? `Locked until ${new Date(student.locked_until).toLocaleDateString('en-IN')}` : 'Blocked'}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <button
                        onClick={() => releaseTerminatedExam(student)}
                        disabled={grantingId === actionKey}
                        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded text-sm font-semibold transition-colors disabled:opacity-50"
                      >
                        <ShieldOff size={14} />
                        {grantingId === actionKey ? 'Releasing...' : 'Allow Again'}
                      </button>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="bg-red-100 text-red-700 text-xs px-3 py-1 rounded-full font-semibold">
                        Terminated
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {filteredStudents.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
          <h2 className="text-xl font-bold text-slate-900">No Students with Exam Cooldowns</h2>
          <p className="text-slate-500 mt-2">All students are currently able to take exams</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
          <div className="border-b border-slate-200 bg-blue-50 px-4 py-4">
            <h2 className="text-lg font-bold text-slate-900">Failed / Cooldown Exams</h2>
            <p className="text-sm text-slate-600">
              Admin can allow failed students to write again immediately by clicking `Allow Again`.
            </p>
          </div>
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 bg-slate-100 p-4 font-semibold text-slate-700 border-b border-slate-200">
            <div className="col-span-3">Student Name</div>
            <div className="col-span-3">Course Name</div>
            <div className="col-span-2">Days Remaining</div>
            <div className="col-span-2">Action</div>
            <div className="col-span-2">Status</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-slate-200">
            {filteredStudents.map((student) =>
              student.failedExams.map((submission, idx) => {
                const courseTitle = submission.exam?.course?.title || `Course ${submission.exam?.course_id}`;
                const courseId = submission.exam?.course_id;
                const overrideExists = hasOverride(student, courseId);
                const nextAttemptDate = submission.next_attempt_allowed_at
                  ? new Date(submission.next_attempt_allowed_at)
                  : null;
                const daysRemaining = nextAttemptDate
                  ? Math.ceil((nextAttemptDate - new Date()) / (1000 * 60 * 60 * 24))
                  : 0;
                const hasActiveCooldown = nextAttemptDate && new Date() < nextAttemptDate;

                return (
                  <div
                    key={`${student.id}_${idx}`}
                    className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-slate-50 transition-colors"
                  >
                    {/* Student Name */}
                    <div className="col-span-3">
                      <p className="font-semibold text-slate-900">{student.full_name}</p>
                      <p className="text-xs text-slate-500">{student.email}</p>
                    </div>

                    {/* Course Name */}
                    <div className="col-span-3">
                      <p className="font-semibold text-slate-900">{courseTitle}</p>
                      <p className="text-xs text-slate-500">
                        Failed on {new Date(submission.submitted_at).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Days Remaining */}
                    <div className="col-span-2">
                      {hasActiveCooldown ? (
                        <p className="text-sm font-bold text-red-600">
                          {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}
                        </p>
                      ) : (
                        <p className="text-sm text-green-600 font-semibold">Can retry now</p>
                      )}
                    </div>

                    {/* Action Button */}
                    <div className="col-span-2 space-y-2">
                      {overrideExists ? (
                        <button
                          onClick={() => revokeRetakePermission(student.id, courseId)}
                          disabled={grantingId === `${student.id}_${courseId}`}
                          className="w-full bg-orange-100 hover:bg-orange-200 text-orange-700 px-3 py-2 rounded text-sm font-semibold transition-colors disabled:opacity-50"
                        >
                          {grantingId === `${student.id}_${courseId}` ? 'Processing...' : 'Remove Allow'}
                        </button>
                      ) : (
                        <button
                          onClick={() => grantRetakePermission(student.id, courseId)}
                          disabled={grantingId === `${student.id}_${courseId}`}
                          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm font-semibold transition-colors disabled:opacity-50"
                        >
                          <Unlock size={14} />
                          {grantingId === `${student.id}_${courseId}` ? 'Granting...' : 'Allow Again'}
                        </button>
                      )}
                      <button
                        onClick={() => deleteFailedExamRecord(student, submission)}
                        disabled={grantingId === `delete_${submission.id}`}
                        className="w-full flex items-center justify-center gap-2 bg-red-100 hover:bg-red-200 text-red-700 px-3 py-2 rounded text-sm font-semibold transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        {grantingId === `delete_${submission.id}` ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>

                    {/* Status Badge */}
                    <div className="col-span-2 text-center">
                      {overrideExists ? (
                        <span className="bg-green-100 text-green-700 text-xs px-3 py-1 rounded-full font-semibold">
                          Allowed Again
                        </span>
                      ) : hasActiveCooldown ? (
                        <span className="bg-red-100 text-red-700 text-xs px-3 py-1 rounded-full font-semibold">
                          Cooldown
                        </span>
                      ) : (
                        <span className="bg-yellow-100 text-yellow-700 text-xs px-3 py-1 rounded-full font-semibold">
                          Ready
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Statistics */}
      {lockedStudents.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-slate-600">Total Locked Students</p>
            <p className="text-3xl font-bold text-red-600">{lockedStudents.length + terminatedStudents.length}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-slate-600">Failed Exam Attempts</p>
            <p className="text-3xl font-bold text-blue-600">
              {lockedStudents.reduce((acc, s) => acc + (s.failedExams?.length || 0), 0)}
            </p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-slate-600">With Override Permission</p>
            <p className="text-3xl font-bold text-yellow-600">
              {lockedStudents.reduce((acc, s) => acc + Object.keys(s.overridesMap).length, 0)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminExamRetakes;

