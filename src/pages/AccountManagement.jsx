import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Lock, Unlock, Award, Trash2, Search, Filter, AlertTriangle } from 'lucide-react';
import AlertModal from '../components/AlertModal';
import LoadingSpinner from '../components/LoadingSpinner';
import AvatarImage from '../components/AvatarImage';
import { logAdminActivity } from '../utils/adminActivityLogger';
import { useNavigate } from 'react-router-dom';
import { assignBalancedTeacherToStudent } from '../utils/teacherAssignment';
import { deleteUserFromAdmin } from '../utils/adminUserDeletion';
import { hasPremiumAccess } from '../utils/premium';
import { clearTeacherAssignmentForStudent } from '../utils/teacherAssignment';
import { clearUserPremiumPlanType } from '../utils/premiumPlanTypes';

const LIFETIME_PREMIUM_DATE = '9999-12-31T23:59:59.000Z';
const LIFETIME_LOCK_DATE = '9999-12-31T23:59:59.000Z';

const AccountManagement = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, locked, premium, no-premium
  const [selectedUser, setSelectedUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [action, setAction] = useState(''); // unlock, grant-premium, revoke-premium, disable, delete
  const [premiumDate, setPremiumDate] = useState('');
  const [premiumReason, setPremiumReason] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [grantLifetimePremium, setGrantLifetimePremium] = useState(false);
  const [lockCustomDays, setLockCustomDays] = useState('');
  const [lockType, setLockType] = useState('60d'); // 60d, custom, lifetime
  const [deleteConfirm, setDeleteConfirm] = useState(''); // For double confirmation of delete
  const [loading, setLoading] = useState(false);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

  const isPremiumActive = (userProfile) => hasPremiumAccess(userProfile);
  const isLifetimePremium = (premiumUntil) =>
    Boolean(premiumUntil) && new Date(premiumUntil).getUTCFullYear() >= 9999;
  const isLifetimeLock = (lockedUntil) =>
    Boolean(lockedUntil) && new Date(lockedUntil).getUTCFullYear() >= 9999;
  const isEffectivelyLocked = (profile) => {
    if (!profile?.is_locked) return false;
    if (!profile?.locked_until) return false;
    if (isLifetimeLock(profile.locked_until)) return true;
    return new Date(profile.locked_until).getTime() > Date.now();
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*, auth_user_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    setUsers(data || []);
  };

  const getFilteredUsers = () => {
    let filtered = users.filter(u =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    );

    if (filterType === 'locked') {
      filtered = filtered.filter(u => isEffectivelyLocked(u));
    } else if (filterType === 'premium') {
      filtered = filtered.filter((u) => isPremiumActive(u));
    } else if (filterType === 'no-premium') {
      filtered = filtered.filter((u) => !isPremiumActive(u));
    }

    return filtered;
  };

  const executeAction = async () => {
    if (!selectedUser) return;
    setLoading(true);

    try {
      const {
        data: { user: adminUser },
      } = await supabase.auth.getUser();
      let updatePayload = null;
      let successMsg = '';

      if (action === 'unlock') {
        updatePayload = { is_locked: false, locked_until: null, lock_reason: null };
        successMsg = '✅ Account unlocked successfully!';
      } else if (action === 'lock') {
        let lockedUntil;
        let lockLabel;
        if (lockType === 'lifetime') {
          lockedUntil = new Date(LIFETIME_LOCK_DATE);
          lockLabel = 'lifetime';
        } else if (lockType === 'custom') {
          const days = parseInt(lockCustomDays, 10);
          if (!days || days < 1) {
            setAlertModal({
              show: true,
              title: 'Invalid Days',
              message: 'Please enter a valid number of days.',
              type: 'warning'
            });
            setLoading(false);
            return;
          }
          lockedUntil = new Date();
          lockedUntil.setDate(lockedUntil.getDate() + days);
          lockLabel = `${days} days`;
        } else {
          lockedUntil = new Date();
          lockedUntil.setDate(lockedUntil.getDate() + 60);
          lockLabel = '60 days';
        }
        updatePayload = {
          is_locked: true,
          locked_until: lockedUntil.toISOString(),
          lock_reason: actionReason.trim() || 'Account locked by admin.'
        };
        successMsg = `✅ Account locked for ${lockLabel}.`;
      } else if (action === 'grant-premium') {
        if (!grantLifetimePremium && !premiumDate) {
          setAlertModal({
            show: true,
            title: 'Missing Date',
            message: 'Please select a valid premium expiration date',
            type: 'warning'
          });
          return;
        }
        if (!premiumReason.trim()) {
          setAlertModal({
            show: true,
            title: 'Missing Reason',
            message: 'Please enter the reason for granting premium.',
            type: 'warning'
          });
          return;
        }
        updatePayload = {
          premium_until: grantLifetimePremium
            ? LIFETIME_PREMIUM_DATE
            : new Date(`${premiumDate}T23:59:59.000Z`).toISOString(),
        };
        successMsg = grantLifetimePremium ? 'Premium granted with lifetime access.' : 'Premium granted successfully.';
      } else if (action === 'revoke-premium') {
        updatePayload = { premium_until: null };
        successMsg = 'Premium revoked successfully.';
      } else if (action === 'disable') {
        updatePayload = {
          is_disabled: true,
          disabled_reason: actionReason.trim() || 'Account disabled by admin.'
        };
        successMsg = '✅ Account disabled! User cannot login.';
      } else if (action === 'enable') {
        updatePayload = { is_disabled: false, disabled_reason: null };
        successMsg = '✅ Account enabled!';
      } else if (action === 'delete') {
        const fnData = await deleteUserFromAdmin({
          user: selectedUser,
          adminUser,
          sourceLabel: 'Account Management',
        });

        setAlertModal({
          show: true,
          title: fnData?.deleted ? 'Success' : 'Partial Success',
          message: fnData?.message || (fnData?.deleted
            ? 'Account permanently deleted!'
            : 'Account cleanup completed.'),
          type: fnData?.deleted ? 'success' : 'warning'
        });
        await logAdminActivity({
          adminId: adminUser?.id,
          eventType: 'action',
          action: fnData?.deleted ? 'Deleted user account' : 'Attempted user deletion (partial)',
          target: selectedUser.id,
          details: {
            module: 'account-management',
            user_email: selectedUser.email || null,
            response_message: fnData?.message || null,
          },
        });
        await loadUsers();
        setShowModal(false);
        setDeleteConfirm('');
        setLoading(false);
        return;
      }

      if (!updatePayload) return;

      const { data, error } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', selectedUser.id)
        .select('id, full_name, email, role, is_locked, locked_until, lock_reason, premium_until, avatar_url, is_disabled, disabled_reason')
        .single();

      if (error) throw error;

      if (action === 'revoke-premium') {
        await clearUserPremiumPlanType(selectedUser.id);
        await clearTeacherAssignmentForStudent(supabase, selectedUser.id);
      }

      if (action === 'unlock') {
        const unlockStamp = new Date().toISOString();
        const { data: terminatedSessions, error: terminatedSessionsError } = await supabase
          .from('exam_live_sessions')
          .select('id, booking_id')
          .eq('student_id', selectedUser.id)
          .eq('status', 'terminated');
        if (terminatedSessionsError) throw terminatedSessionsError;

        const bookingIds = Array.from(
          new Set((terminatedSessions || []).map((row) => row.booking_id).filter(Boolean))
        );

        if (bookingIds.length > 0) {
          const { error: bookingResetError } = await supabase
            .from('exam_slot_bookings')
            .update({
              status: 'booked',
              cancelled_at: null,
              cancellation_reason: null,
              updated_at: unlockStamp,
            })
            .in('id', bookingIds);
          if (bookingResetError) throw bookingResetError;
        }

        if ((terminatedSessions || []).length > 0) {
          const { error: sessionResetError } = await supabase
            .from('exam_live_sessions')
            .update({
              status: 'scheduled',
              attendance_status: 'pending',
              ended_at: null,
              termination_reason: null,
              camera_connected: false,
              mic_connected: false,
              screen_share_connected: false,
              violation_count: 0,
              last_violation_type: null,
              last_violation_at: null,
              updated_at: unlockStamp,
            })
            .eq('student_id', selectedUser.id)
            .eq('status', 'terminated');
          if (sessionResetError) throw sessionResetError;
        }
      }

      if (action === 'grant-premium') {
        const { error: grantLogError } = await supabase
          .from('premium_grants')
          .insert({
            user_id: selectedUser.id,
            granted_by: adminUser?.id || null,
            valid_until: updatePayload.premium_until,
            reason: premiumReason.trim(),
          });
        if (grantLogError) throw grantLogError;
        await assignBalancedTeacherToStudent(supabase, selectedUser.id);
      }
      if (!data) throw new Error('Update failed — no rows returned');

      // Show success message
      setAlertModal({
        show: true,
        title: 'Success',
        message: successMsg,
        type: 'success'
      });
      const actionLabelMap = {
        unlock: 'Unlocked user account',
        lock: 'Locked user account',
        'grant-premium': 'Granted premium via account management',
        'revoke-premium': 'Revoked premium via account management',
        disable: 'Disabled user account',
        enable: 'Enabled user account',
      };
      await logAdminActivity({
        adminId: adminUser?.id,
        eventType: 'action',
        action: actionLabelMap[action] || `Updated user account (${action})`,
        target: selectedUser.id,
        details: {
          module: 'account-management',
          user_email: selectedUser.email || null,
          role: selectedUser.role || null,
          payload: updatePayload,
          reason:
            action === 'grant-premium'
              ? premiumReason.trim()
              : ['lock', 'disable'].includes(action)
                ? actionReason.trim() || null
                : null,
        },
      });
      setSelectedUser(data);
      await loadUsers();
      setShowModal(false);
      setPremiumDate('');
      setPremiumReason('');
      setActionReason('');
      setGrantLifetimePremium(false);
      setDeleteConfirm('');
    } catch (error) {
      // Only show error alerts, not success
      setAlertModal({
        show: true,
        title: 'Error',
        message: 'Error: ' + error.message,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const openModal = (user, actionType) => {
    setSelectedUser(user);
    setAction(actionType);
    setPremiumDate('');
    setPremiumReason('');
    setActionReason('');
    setGrantLifetimePremium(false);
    setLockCustomDays('');
    setLockType('60d');
    setDeleteConfirm('');
    setShowModal(true);
  };

  const filteredUsers = getFilteredUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Account Management</h1>
        <p className="text-slate-500">Unlock accounts, manage premium access, and account status</p>
      </div>

      {/* Search and Filter */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-gold-400 outline-none"
          />
        </div>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gold-400 outline-none"
        >
          <option value="all">All Users</option>
          <option value="locked">Locked Accounts</option>
          <option value="premium">Active Premium</option>
          <option value="no-premium">No Premium</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">Name</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Email</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Role</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Premium</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Account</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr key={user.id} className="border-b hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <AvatarImage
                        userId={user.id}
                        avatarUrl={user.avatar_url}
                        alt={user.full_name}
                        fallbackName={user.full_name || 'User'}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <span className="font-medium">{user.full_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      user.role === 'admin' ? 'bg-red-100 text-red-800' :
                      user.role === 'teacher' ? 'bg-blue-100 text-blue-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {user.role === 'admin' ? 'Nani' : user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {isEffectivelyLocked(user) ? (
                      <div className="flex items-center gap-2">
                        <Lock size={16} className="text-red-600" />
                        <div>
                          <span className="text-sm text-red-600 font-semibold">Locked</span>
                          {user.locked_until && (
                            <span className="ml-2 text-xs text-red-500">
                              {isLifetimeLock(user.locked_until) ? '(Lifetime)' : `until ${new Date(user.locked_until).toLocaleDateString('en-IN')}`}
                            </span>
                          )}
                          {user.lock_reason ? (
                            <p className="mt-1 text-xs text-red-500 max-w-xs">{user.lock_reason}</p>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-green-600 font-semibold">Active</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {isPremiumActive(user) ? (
                      <div className="flex items-center gap-2">
                        <Award size={16} className="text-gold-400" />
                        <span className="text-sm font-semibold text-gold-600">
                          {isLifetimePremium(user.premium_until)
                            ? 'Lifetime'
                            : `Until ${new Date(user.premium_until).toLocaleDateString('en-IN')}`}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-500">No Premium</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {user.is_disabled ? (
                      <div>
                        <span className="text-xs font-semibold px-2 py-1 bg-red-100 text-red-700 rounded">
                          Disabled
                        </span>
                        {user.disabled_reason ? (
                          <p className="mt-1 text-xs text-red-500 max-w-xs">{user.disabled_reason}</p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-1 bg-green-100 text-green-700 rounded">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      {isEffectivelyLocked(user) ? (
                        <button
                          onClick={() => openModal(user, 'unlock')}
                          className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 text-xs font-semibold flex items-center gap-1"
                        >
                          <Unlock size={14} /> Unlock
                        </button>
                      ) : (
                        <button
                          onClick={() => openModal(user, 'lock')}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-xs font-semibold flex items-center gap-1"
                        >
                          <Lock size={14} /> Lock 60d
                        </button>
                      )}
                      <button
                        onClick={() => openModal(user, 'grant-premium')}
                        className="px-3 py-1 bg-gold-100 text-gold-700 rounded hover:bg-gold-200 text-xs font-semibold flex items-center gap-1"
                      >
                        <Award size={14} /> Premium
                      </button>
                      {isPremiumActive(user) && (
                        <button
                          onClick={() => openModal(user, 'revoke-premium')}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-xs font-semibold"
                        >
                          Revoke
                        </button>
                      )}
                      {user.is_disabled ? (
                        <button
                          onClick={() => openModal(user, 'enable')}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-xs font-semibold flex items-center gap-1"
                        >
                          <Unlock size={14} /> Enable
                        </button>
                      ) : (
                        <button
                          onClick={() => openModal(user, 'disable')}
                          className="px-3 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 text-xs font-semibold flex items-center gap-1"
                        >
                          <AlertTriangle size={14} /> Disable
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/app/admin/user-access/${user.id}`)}
                        className="px-3 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 text-xs font-semibold"
                        title="Open admin access view"
                      >
                        Access
                      </button>
                      <button
                        onClick={() => openModal(user, 'delete')}
                        className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-xs font-semibold flex items-center gap-1"
                        title="Permanently delete account"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredUsers.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            No users found
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">
              {action === 'unlock' && 'Unlock Account'}
              {action === 'lock' && `Lock Account${lockType === 'lifetime' ? ' (Lifetime)' : lockType === 'custom' && lockCustomDays ? ` (${lockCustomDays} days)` : ' (60 days)'}`}
              {action === 'grant-premium' && 'Grant Premium Access'}
              {action === 'revoke-premium' && 'Revoke Premium Access'}
              {action === 'disable' && 'Disable Account'}
              {action === 'enable' && 'Enable Account'}
              {action === 'delete' && 'Delete Account Permanently'}
            </h2>

            <div className="mb-4 p-3 bg-slate-100 rounded">
              <p className="text-sm">
                <strong>User:</strong> {selectedUser.full_name}
              </p>
              <p className="text-sm text-slate-600">{selectedUser.email}</p>
            </div>

            {action === 'grant-premium' && (
              <div className="mb-4">
                <label className="flex items-center gap-2 mb-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={grantLifetimePremium}
                    onChange={e => setGrantLifetimePremium(e.target.checked)}
                  />
                  Grant lifetime premium
                </label>
                <label className="block text-sm font-medium mb-2">Valid Until</label>
                <input
                  type="date"
                  value={premiumDate}
                  onChange={e => setPremiumDate(e.target.value)}
                  className="w-full border rounded-lg p-2"
                  disabled={grantLifetimePremium}
                />
                {grantLifetimePremium && (
                  <p className="mt-2 text-xs text-emerald-700">
                    Lifetime premium will be set with no expiry date.
                  </p>
                )}
                <label className="block text-sm font-medium mt-3 mb-2">Reason</label>
                <textarea
                  value={premiumReason}
                  onChange={e => setPremiumReason(e.target.value)}
                  className="w-full border rounded-lg p-2 min-h-[84px]"
                  placeholder="Why are you granting premium to this user?"
                />
              </div>
            )}

            {action === 'unlock' && (
              <div className="mb-4 p-3 bg-yellow-50 rounded text-sm text-yellow-800">
                <p>This will unlock the account immediately.</p>
                {selectedUser.locked_until && (
                  <p className="text-xs mt-1">
                    Originally locked until: {isLifetimeLock(selectedUser.locked_until) ? 'Lifetime (manual unlock required)' : new Date(selectedUser.locked_until).toLocaleDateString('en-IN')}
                  </p>
                )}
              </div>
            )}

            {action === 'lock' && (
              <div className="mb-4">
                <div className="p-3 bg-red-50 rounded text-sm text-red-800">
                  <p>This will lock the account and block all access.</p>
                </div>
                <div className="mt-3 space-y-3">
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="lockType"
                      value="60d"
                      checked={lockType === '60d'}
                      onChange={() => setLockType('60d')}
                    />
                    <div>
                      <span className="text-sm font-medium">Lock for 60 days</span>
                      <p className="text-xs text-slate-500">Default lock period</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="lockType"
                      value="custom"
                      checked={lockType === 'custom'}
                      onChange={() => setLockType('custom')}
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium">Lock for custom days</span>
                      {lockType === 'custom' && (
                        <input
                          type="number"
                          min="1"
                          value={lockCustomDays}
                          onChange={e => setLockCustomDays(e.target.value)}
                          className="mt-2 w-full border rounded-lg p-2 text-sm"
                          placeholder="Enter number of days"
                        />
                      )}
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="lockType"
                      value="lifetime"
                      checked={lockType === 'lifetime'}
                      onChange={() => setLockType('lifetime')}
                    />
                    <div>
                      <span className="text-sm font-medium">Lock until manual unlock</span>
                      <p className="text-xs text-slate-500">Account stays locked until admin unlocks it</p>
                    </div>
                  </label>
                </div>
                <textarea
                  value={actionReason}
                  onChange={e => setActionReason(e.target.value)}
                  className="mt-3 w-full border rounded-lg p-2 min-h-[84px] text-slate-700"
                  placeholder="Optional reason shown to the user"
                />
              </div>
            )}

            {action === 'revoke-premium' && (
              <div className="mb-4 p-3 bg-red-50 rounded text-sm text-red-800">
                This will immediately revoke premium access.
              </div>
            )}

            {action === 'disable' && (
              <div className="mb-4 p-3 bg-orange-50 rounded text-sm text-orange-800">
                <p className="font-medium">This account will be disabled.</p>
                <p className="text-xs mt-1">The user cannot login until you enable it again.</p>
                <textarea
                  value={actionReason}
                  onChange={e => setActionReason(e.target.value)}
                  className="mt-3 w-full border rounded-lg p-2 min-h-[84px] bg-white text-slate-700"
                  placeholder="Optional reason shown to the user"
                />
              </div>
            )}

            {action === 'enable' && (
              <div className="mb-4 p-3 bg-blue-50 rounded text-sm text-blue-800">
                <p>This will enable the account and allow login access.</p>
              </div>
            )}

            {action === 'delete' && (
              <div className="mb-4">
                <div className="p-3 bg-red-50 rounded text-sm text-red-800 mb-4">
                  <p className="font-bold text-red-900">⚠️ WARNING: This action is permanent!</p>
                  <p className="text-xs mt-2">This will permanently delete the account and all associated data. This cannot be undone.</p>
                </div>
                <label className="block text-sm font-medium mb-2 text-slate-700">
                  Type the user's name to confirm deletion:
                </label>
                <input
                  type="text"
                  placeholder={selectedUser.full_name}
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-red-400 outline-none"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Must match: <strong>{selectedUser.full_name}</strong>
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  setDeleteConfirm('');
                  setPremiumDate('');
                  setPremiumReason('');
                  setActionReason('');
                  setGrantLifetimePremium(false);
                  setLockCustomDays('');
                  setLockType('60d');
                }}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={executeAction}
                disabled={loading || (action === 'grant-premium' && ((!grantLifetimePremium && !premiumDate) || !premiumReason.trim())) || (action === 'delete' && deleteConfirm !== selectedUser.full_name)}
                className={`flex-1 px-4 py-2 rounded-lg text-white font-medium ${
                  action === 'delete' 
                    ? 'bg-red-600 hover:bg-red-700 disabled:opacity-50' 
                    : 'bg-nani-dark hover:bg-nani-dark/90 disabled:opacity-50'
                }`}
              >
                {loading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
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

export default AccountManagement;



