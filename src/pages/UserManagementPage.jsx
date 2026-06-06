import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import { Plus, Users, X } from 'lucide-react';
import AvatarImage from '../components/AvatarImage';
import usePopup from '../hooks/usePopup.jsx';
import { logAdminActivity } from '../utils/adminActivityLogger';
import { deleteUserFromAdmin } from '../utils/adminUserDeletion';
import { ensureUsernameForUser, ensureUsernamesForUsers, updateUsernameForUser } from '../utils/usernames';

const UserManagementPage = () => {
    const { openPopup, popupNode } = usePopup();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [showAddUserModal, setShowAddUserModal] = useState(false);
    const [changingRole, setChangingRole] = useState(null);
    const [deletingUserId, setDeletingUserId] = useState(null);
    const [updatingUsernameId, setUpdatingUsernameId] = useState(null);

    useEffect(() => { loadUsers(); }, []);

    const loadUsers = async () => {
        setLoading(true);
        const { data } = await supabase
          .from('profiles')
          .select('id, auth_user_id, full_name, email, role, phone, premium_until, is_locked, locked_until, avatar_url, core_subject, education_level, study_stream, diploma_certificate, created_at')
          .is('deleted_at', null)
          .order('created_at', { ascending: false });
        const withUsernames = await ensureUsernamesForUsers(data || []);
        setUsers(withUsernames);
        setLoading(false);
    };

    const filtered = users.filter(u => {
      const matchesSearch = u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
                           u.email?.toLowerCase().includes(search.toLowerCase()) ||
                           u.username?.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
    const recentUsersCount = users.filter((u) => {
      if (!u.created_at) return false;
      return Date.now() - new Date(u.created_at).getTime() <= 24 * 60 * 60 * 1000;
    }).length;

    const changeUserRole = async (userId, newRole) => {
      if (changingRole) return;
      
      setChangingRole(userId);
      try {
        const previousRole = users.find((u) => u.id === userId)?.role || null;
        const {
          data: { user: adminUser },
        } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('profiles')
          .update({ role: newRole, updated_at: new Date().toISOString() })
          .eq('id', userId);
        
        if (error) throw error;
        await logAdminActivity({
          adminId: adminUser?.id,
          eventType: 'action',
          action: 'Changed user role',
          target: userId,
          details: {
            module: 'user-management',
            previous_role: previousRole,
            new_role: newRole,
          },
        });
        
        // Refresh users list
        loadUsers();
      } catch (error) {
        openPopup('Error', 'Error changing role: ' + error.message, 'error');
      } finally {
        setChangingRole(null);
      }
    };

    const removeFakeUser = async (user) => {
      const isFake = !user?.auth_user_id;
      if (!isFake) {
        openPopup('Not Allowed', 'This user is linked to authentication and cannot be removed as fake user.', 'warning');
        return;
      }
      const ok = window.confirm(`Remove fake user "${user.full_name || user.email}"?`);
      if (!ok) return;
      try {
        const {
          data: { user: adminUser },
        } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('profiles')
          .delete()
          .eq('id', user.id);
        if (error) throw error;
        await logAdminActivity({
          adminId: adminUser?.id,
          eventType: 'action',
          action: 'Removed fake user profile',
          target: user.id,
          details: {
            module: 'user-management',
            user_email: user.email || null,
            user_name: user.full_name || null,
          },
        });
        openPopup('Removed', 'Fake user removed successfully.', 'success');
        loadUsers();
      } catch (error) {
        openPopup('Error', error.message || 'Failed to remove fake user.', 'error');
      }
    };

    const deleteManagedUser = async (user) => {
      if (deletingUserId) return;

      const confirmName = window.prompt(
        `Type "${user.full_name}" to permanently delete this user from the admin panel.`
      );
      if (confirmName !== user.full_name) {
        if (confirmName !== null) {
          openPopup('Cancelled', 'Entered name did not match. User was not deleted.', 'warning');
        }
        return;
      }

      setDeletingUserId(user.id);
      try {
        const {
          data: { user: adminUser },
        } = await supabase.auth.getUser();

        const result = await deleteUserFromAdmin({
          user,
          adminUser,
          sourceLabel: 'User Management',
        });

        await logAdminActivity({
          adminId: adminUser?.id,
          eventType: 'action',
          action: result?.deleted ? 'Deleted user account' : 'Attempted user deletion (partial)',
          target: user.id,
          details: {
            module: 'user-management',
            user_email: user.email || null,
            response_message: result?.message || null,
          },
        });

        openPopup(
          result?.deleted ? 'Deleted' : 'Partial Success',
          result?.message || 'User deletion completed.',
          result?.deleted ? 'success' : 'warning'
        );
        await loadUsers();
      } catch (error) {
        openPopup('Error', error.message || 'Failed to delete user.', 'error');
      } finally {
        setDeletingUserId(null);
      }
    };

    const editUsername = async (user) => {
      if (!user?.id || updatingUsernameId) return;
      const nextUsername = window.prompt('Edit username', user.username || '');
      if (nextUsername === null) return;

      setUpdatingUsernameId(user.id);
      try {
        const {
          data: { user: adminUser },
        } = await supabase.auth.getUser();
        const savedUsername = await updateUsernameForUser({
          userId: user.id,
          username: nextUsername,
        });
        await logAdminActivity({
          adminId: adminUser?.id,
          eventType: 'action',
          action: 'Updated username',
          target: user.id,
          details: {
            module: 'user-management',
            previous_username: user.username || null,
            new_username: savedUsername,
          },
        });
        openPopup('Updated', 'Username updated successfully.', 'success');
        await loadUsers();
      } catch (error) {
        openPopup('Error', error.message || 'Failed to update username.', 'error');
      } finally {
        setUpdatingUsernameId(null);
      }
    };

    return (
      <div className="space-y-6">
        {popupNode}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 rounded-xl text-white">
          <h1 className="text-2xl font-bold mb-1">User Management</h1>
          <p className="text-blue-100">
            Students, teachers, and admins with status, premium, and lock info.
            {recentUsersCount > 0 ? ` ${recentUsersCount} new user${recentUsersCount === 1 ? '' : 's'} joined in the last 24 hours.` : ''}
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm space-y-4">
          <div className="flex flex-col gap-4">
            <div className="flex gap-2 flex-wrap items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setRoleFilter('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    roleFilter === 'all' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  All Users ({users.length})
                </button>
                <button
                  onClick={() => setRoleFilter('student')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    roleFilter === 'student' 
                      ? 'bg-green-600 text-white' 
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Students ({users.filter(u => u.role === 'student').length})
                </button>
                <button
                  onClick={() => setRoleFilter('teacher')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    roleFilter === 'teacher' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Teachers ({users.filter(u => u.role === 'teacher').length})
                </button>
                <button
                  onClick={() => setRoleFilter('instructor')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    roleFilter === 'instructor' 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Instructors ({users.filter(u => u.role === 'instructor').length})
                </button>
                <button
                  onClick={() => setRoleFilter('verifier')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    roleFilter === 'verifier'
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Verifiers ({users.filter(u => u.role === 'verifier').length})
                </button>
                <button
                  onClick={() => setRoleFilter('admin')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    roleFilter === 'admin' 
                      ? 'bg-red-600 text-white' 
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Admins ({users.filter(u => u.role === 'admin').length})
                </button>
              </div>
              <button
                onClick={() => setShowAddUserModal(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <Plus size={16} />
                Add User Directly
              </button>
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, or username"
              className="px-3 py-2 border rounded-lg w-full md:w-64"
            />
          </div>
        </div>

        {showAddUserModal && (
          <AddUserModal 
            onClose={() => setShowAddUserModal(false)} 
            onSuccess={() => {
              setShowAddUserModal(false);
              loadUsers();
            }}
          />
        )}

        <AddTeacherForm />

        <div className="border border-slate-200 rounded-xl overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Username</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Phone</th>
                <th className="px-4 py-3 text-left">Subject</th>
                <th className="px-4 py-3 text-left">Education</th>
                <th className="px-4 py-3 text-left">Premium</th>
                <th className="px-4 py-3 text-left">Lock</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-6 text-center"><LoadingSpinner fullPage={false} message="Loading users..." /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-500">No users found</td></tr>
              ) : (
                filtered.map(u => {
                  const premiumActive = u.premium_until && new Date(u.premium_until) > new Date();
                  return (
                    <tr key={u.id} className="border-t">
                      <td className="px-4 py-3 flex items-center gap-2">
                        <AvatarImage
                          userId={u.id}
                          avatarUrl={u.avatar_url}
                          alt={u.full_name}
                          fallbackName={u.full_name || 'User'}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-800">{u.full_name}</span>
                          {u.created_at && Date.now() - new Date(u.created_at).getTime() <= 24 * 60 * 60 * 1000 ? (
                            <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              New
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="space-y-2">
                          <p className="font-mono text-xs text-slate-700">{u.username || '-'}</p>
                          <button
                            type="button"
                            onClick={() => editUsername(u)}
                            disabled={updatingUsernameId === u.id}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
                          >
                            {updatingUsernameId === u.id ? 'Updating...' : 'Edit Username'}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          u.role === 'admin' ? 'bg-red-100 text-red-700' :
                          u.role === 'verifier' ? 'bg-violet-100 text-violet-700' :
                          u.role === 'instructor' ? 'bg-indigo-100 text-indigo-700' :
                          u.role === 'teacher' ? 'bg-blue-100 text-blue-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {u.role === 'admin' ? 'Nani' : u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{u.phone || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{u.core_subject || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {u.education_level ? (
                          <div className="leading-tight">
                            <p>{u.education_level}</p>
                            {u.study_stream ? <p className="text-xs text-slate-500">{u.study_stream}</p> : null}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        {premiumActive ? (
                          <span className="text-xs text-gold-600 font-semibold">Until {new Date(u.premium_until).toLocaleDateString()}</span>
                        ) : (
                          <span className="text-xs text-slate-500">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const effectivelyLocked = u.is_locked && u.locked_until && (new Date(u.locked_until) > new Date() || u.locked_until >= '9999-12-31');
                          return effectivelyLocked ? (
                            <span className="text-xs text-red-600 font-semibold">Locked until {new Date(u.locked_until).toLocaleDateString()}</span>
                          ) : (
                            <span className="text-xs text-green-600 font-semibold">Active</span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {!u.auth_user_id ? (
                          <button
                            type="button"
                            onClick={() => removeFakeUser(u)}
                            className="px-2 py-1 mr-2 bg-red-100 text-red-700 rounded text-xs font-semibold hover:bg-red-200"
                          >
                            Remove Fake
                          </button>
                        ) : null}
                        <select
                          value={u.role}
                          onChange={(e) => changeUserRole(u.id, e.target.value)}
                          disabled={changingRole === u.id || deletingUserId === u.id}
                          className="px-2 py-1 border rounded text-xs font-medium disabled:opacity-50"
                        >
                          <option value="student">Student</option>
                          <option value="teacher">Teacher</option>
                          <option value="instructor">Instructor</option>
                          <option value="verifier">Verifier</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => deleteManagedUser(u)}
                          disabled={deletingUserId === u.id}
                          className="px-2 py-1 ml-2 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
                        >
                          {deletingUserId === u.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
};

const AddUserModal = ({ onClose, onSuccess }) => {
    const [form, setForm] = useState({
        email: '',
        password: '',
        fullName: '',
        phone: '',
        role: 'student',
        coreSubject: 'Computer Science'
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });
    const endpoint = import.meta.env.VITE_ADMIN_CREATE_USER_ENDPOINT || '/api/admin/create-user';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage({ text: '', type: '' });

        if (!form.email.trim() || !form.password.trim() || !form.fullName.trim() || !form.phone.trim()) {
            setMessage({ text: 'Please fill all required fields', type: 'error' });
            return;
        }
        if (form.password.length < 6) {
            setMessage({ text: 'Password must be at least 6 characters', type: 'error' });
            return;
        }

        setLoading(true);
        try {
            const payload = {
                email: form.email.trim().toLowerCase(),
                password: form.password,
                full_name: form.fullName.trim(),
                phone: form.phone.trim(),
                role: form.role,
                core_subject: form.role === 'teacher' ? form.coreSubject : null,
            };

            let invokeError = null;
            const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-create-user', {
                body: payload
            });
            if (!fnError && fnData?.success) {
                if (fnData?.user_id) {
                    await ensureUsernameForUser({
                        id: fnData.user_id,
                        full_name: payload.full_name,
                        created_at: new Date().toISOString(),
                    });
                }
                const {
                    data: { user: adminUser },
                } = await supabase.auth.getUser();
                await logAdminActivity({
                    adminId: adminUser?.id,
                    eventType: 'action',
                    action: 'Created user account',
                    target: payload.email,
                    details: {
                        module: 'user-management',
                        role: payload.role,
                        full_name: payload.full_name,
                    },
                });
                setMessage({ text: 'User created successfully. They can login with the provided email/password.', type: 'success' });
                setTimeout(() => {
                    setForm({ email: '', password: '', fullName: '', phone: '', role: 'student', coreSubject: 'Computer Science' });
                    onSuccess();
                }, 1500);
                return;
            }
            invokeError = fnError?.message || fnData?.message || null;

            // Optional compatibility fallback for projects using custom backend route.
            if (import.meta.env.VITE_ADMIN_CREATE_USER_ENDPOINT) {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const raw = await res.text();
                    throw new Error(raw || invokeError || 'Failed to create user');
                }

                const {
                    data: { user: adminUser },
                } = await supabase.auth.getUser();
                await logAdminActivity({
                    adminId: adminUser?.id,
                    eventType: 'action',
                    action: 'Created user account (custom endpoint)',
                    target: payload.email,
                    details: {
                        module: 'user-management',
                        role: payload.role,
                        full_name: payload.full_name,
                    },
                });
                setMessage({ text: 'User created successfully. They can login with the provided email/password.', type: 'success' });
                setTimeout(() => {
                    setForm({ email: '', password: '', fullName: '', phone: '', role: 'student', coreSubject: 'Computer Science' });
                    onSuccess();
                }, 1500);
                return;
            }

            throw new Error(
                invokeError ||
                'Failed to create user. Deploy Supabase function "admin-create-user" or configure VITE_ADMIN_CREATE_USER_ENDPOINT.'
            );
        } catch (error) {
            setMessage({ text: error.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-bold">Add User Directly</h2>
                    <button
                        onClick={onClose}
                        className="text-slate-500 hover:text-slate-700 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <p className="text-xs text-slate-500">
                        Creates both Auth account and profile via Supabase function `admin-create-user`.
                    </p>
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Email *</label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                            placeholder="user@example.com"
                            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Password *</label>
                        <input
                            type="password"
                            value={form.password}
                            onChange={e => setForm({ ...form, password: e.target.value })}
                            placeholder="Minimum 6 characters"
                            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name *</label>
                        <input
                            type="text"
                            value={form.fullName}
                            onChange={e => setForm({ ...form, fullName: e.target.value })}
                            placeholder="John Doe"
                            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Phone *</label>
                        <input
                            type="tel"
                            value={form.phone}
                            onChange={e => setForm({ ...form, phone: e.target.value })}
                            placeholder="+1234567890"
                            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Role *</label>
                        <select
                            value={form.role}
                            onChange={e => setForm({ ...form, role: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="student">Student</option>
                            <option value="teacher">Teacher</option>
                            <option value="instructor">Instructor</option>
                            <option value="verifier">Verifier</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>

                    {form.role === 'teacher' && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Core Subject</label>
                            <select
                                value={form.coreSubject}
                                onChange={e => setForm({ ...form, coreSubject: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option>Computer Science</option>
                                <option>Information Technology</option>
                                <option>Electronics</option>
                                <option>Mechanical</option>
                                <option>Civil</option>
                                <option>Business</option>
                                <option>Design</option>
                            </select>
                        </div>
                    )}

                    {message.text && (
                        <div className={`px-3 py-2 rounded-lg text-sm ${
                            message.type === 'error' 
                                ? 'bg-red-100 text-red-700' 
                                : 'bg-green-100 text-green-700'
                        }`}>
                            {message.text}
                        </div>
                    )}

                    <div className="flex gap-2 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-60"
                        >
                            {loading ? 'Adding...' : 'Add User'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const AddTeacherForm = () => {
    const [form, setForm] = useState({ email: '', password: '', fullName: '', coreSubject: 'Computer Science' });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const endpoint = import.meta.env.VITE_ADMIN_CREATE_TEACHER_ENDPOINT || '/api/admin/create-teacher';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        setLoading(true);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: form.email,
                    password: form.password,
                    full_name: form.fullName,
                    core_subject: form.coreSubject,
                })
            });

            if (!res.ok) {
                const err = await res.text();
                throw new Error(err || 'Failed to create teacher');
            }

            setMessage('Teacher created. Refresh the list after your backend updates profiles.');
            setForm({ email: '', password: '', fullName: '', coreSubject: 'Computer Science' });
        } catch (error) {
            setMessage(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-slate-200 rounded-xl p-4">
            <div className="col-span-full flex items-center gap-2 text-sm text-slate-500">
                <Plus size={14} />
                <span>Calls {endpoint}. Replace with your secured admin endpoint that uses the Supabase service role.</span>
            </div>
            <input className="p-3 border rounded-lg" placeholder="Teacher email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
            <input className="p-3 border rounded-lg" placeholder="Temp password" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
            <input className="p-3 border rounded-lg" placeholder="Full name" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} required />
            <select className="p-3 border rounded-lg" value={form.coreSubject} onChange={e => setForm({ ...form, coreSubject: e.target.value })}>
                <option>Computer Science</option>
                <option>Information Technology</option>
                <option>Electronics</option>
                <option>Mechanical</option>
                <option>Civil</option>
                <option>Business</option>
                <option>Design</option>
            </select>
            <div className="col-span-full flex items-center gap-3">
                <button disabled={loading} className="bg-nani-dark text-white px-4 py-2 rounded-lg text-sm hover:bg-nani-accent transition-colors disabled:opacity-60">
                    {loading ? 'Creating...' : 'Create Teacher'}
                </button>
                {message && <span className="text-xs text-slate-600">{message}</span>}
            </div>
        </form>
    );
};

export default UserManagementPage;
