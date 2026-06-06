import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import AlertModal from '../components/AlertModal';
import { UserPlus, Mail, Phone, User, Send, Trash2, Search, Lock, KeyRound, AlertTriangle } from 'lucide-react';
import { logAdminActivity } from '../utils/adminActivityLogger';

const AdminUserTools = () => {
  const [inviteForm, setInviteForm] = useState({
    email: '', fullName: '', phone: '', role: 'student'
  });
  const [addForm, setAddForm] = useState({
    email: '', fullName: '', phone: '', role: 'student', password: ''
  });
  const [removeEmail, setRemoveEmail] = useState('');
  const [foundUsers, setFoundUsers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(false);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!inviteForm.email.trim() || !inviteForm.fullName.trim() || !inviteForm.phone.trim()) {
      setAlertModal({ show: true, title: 'Validation Error', message: 'All fields are required.', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: inviteForm.email.trim().toLowerCase(),
          full_name: inviteForm.fullName.trim(),
          phone: inviteForm.phone.trim(),
          role: inviteForm.role,
          invite: true,
        },
      });
      if (fnError) throw new Error(fnError.message);
      if (!fnData?.success) throw new Error(fnData?.message || 'Failed to create user');

      const { data: { user: adminUser } } = await supabase.auth.getUser();
      await logAdminActivity({
        adminId: adminUser?.id, eventType: 'action', action: 'Invited user',
        target: inviteForm.email.trim().toLowerCase(), details: { module: 'admin-user-tools', role: inviteForm.role },
      });

      setAlertModal({
        show: true, title: 'Invitation Sent',
        message: `Invitation email sent to ${inviteForm.email.trim().toLowerCase()}. They will receive a confirmation email to set up their account.`,
        type: 'success',
      });
      setInviteForm({ email: '', fullName: '', phone: '', role: 'student' });
    } catch (err) {
      setAlertModal({ show: true, title: 'Error', message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddDirectly = async (e) => {
    e.preventDefault();
    if (!addForm.email.trim() || !addForm.fullName.trim() || !addForm.phone.trim() || !addForm.password.trim()) {
      setAlertModal({ show: true, title: 'Validation Error', message: 'All fields including password are required.', type: 'error' });
      return;
    }
    if (addForm.password.length < 6) {
      setAlertModal({ show: true, title: 'Validation Error', message: 'Password must be at least 6 characters.', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: addForm.email.trim().toLowerCase(),
          password: addForm.password,
          full_name: addForm.fullName.trim(),
          phone: addForm.phone.trim(),
          role: addForm.role,
        },
      });
      if (fnError) throw new Error(fnError.message);
      if (!fnData?.success) throw new Error(fnData?.message || 'Failed to create user');

      const { data: { user: adminUser } } = await supabase.auth.getUser();
      await logAdminActivity({
        adminId: adminUser?.id, eventType: 'action', action: 'Added user directly',
        target: addForm.email.trim().toLowerCase(), details: { module: 'admin-user-tools', role: addForm.role },
      });

      setAlertModal({
        show: true, title: 'User Created',
        message: `User ${addForm.email.trim().toLowerCase()} was created and can log in immediately.`,
        type: 'success',
      });
      setAddForm({ email: '', fullName: '', phone: '', role: 'student', password: '' });
    } catch (err) {
      setAlertModal({ show: true, title: 'Error', message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSearchUser = async () => {
    const email = removeEmail.trim().toLowerCase();
    if (!email) {
      setAlertModal({ show: true, title: 'Validation Error', message: 'Enter an email to search.', type: 'error' });
      return;
    }
    setSearching(true);
    setFoundUsers([]);
    setDeleteTarget(null);
    try {
      const { data, error } = await supabase.functions.invoke('lookup-user', {
        body: { email },
      });
      if (error) throw new Error(error.message);
      if (!data?.users?.length) {
        setAlertModal({ show: true, title: 'Not Found', message: 'No users found with that email.', type: 'info' });
        return;
      }
      setFoundUsers(data.users);
    } catch (err) {
      setAlertModal({ show: true, title: 'Error', message: err.message, type: 'error' });
    } finally {
      setSearching(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setLoading(true);
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-delete-user', {
        body: {
          user_id: deleteTarget.auth_user_id || deleteTarget.id,
          reason: `Deleted by admin from Add/Remove page`,
        },
      });
      if (fnError) throw new Error(fnError.message);
      if (!fnData?.success) throw new Error(fnData?.message || 'Failed to delete user');

      const { data: { user: adminUser } } = await supabase.auth.getUser();
      await logAdminActivity({
        adminId: adminUser?.id, eventType: 'action', action: 'Deleted user',
        target: deleteTarget.email, details: { module: 'admin-user-tools', reason: 'Deleted from Add/Remove' },
      });

      setAlertModal({
        show: true, title: 'User Deleted',
        message: `User ${deleteTarget.email} has been deleted.`,
        type: 'success',
      });
      setFoundUsers([]);
      setDeleteTarget(null);
      setRemoveEmail('');
    } catch (err) {
      setAlertModal({ show: true, title: 'Error', message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UserPlus className="text-blue-500" size={28} />
            Add / Remove
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage users — send invitations, add directly, or remove users.</p>
        </div>

      {/* Send Invitation */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Send size={20} className="text-blue-500" /> Send Invitation
        </h2>
        <p className="text-xs text-slate-500 mb-4">User receives a confirmation email to set their own password.</p>
        <form onSubmit={handleSendInvite} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={inviteForm.fullName} onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-nani-light focus:border-transparent outline-none text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-nani-light focus:border-transparent outline-none text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Phone</label>
            <div className="relative">
              <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={inviteForm.phone} onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-nani-light focus:border-transparent outline-none text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Role</label>
            <select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-nani-light focus:border-transparent outline-none text-sm bg-white">
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="instructor">Instructor</option>
              <option value="verifier">Verifier</option>
            </select>
          </div>
          <div className="lg:col-span-4">
            <button type="submit" disabled={loading}
              className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? 'Sending...' : <><Send size={16} /> Send Invitation Email</>}
            </button>
          </div>
        </form>
      </div>

      {/* Add User Directly */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <UserPlus size={20} className="text-green-500" /> Add User Directly
        </h2>
        <p className="text-xs text-slate-500 mb-4">Create user with a password immediately. They can log in right away.</p>
        <form onSubmit={handleAddDirectly} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={addForm.fullName} onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-nani-light focus:border-transparent outline-none text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-nani-light focus:border-transparent outline-none text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Phone</label>
            <div className="relative">
              <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-nani-light focus:border-transparent outline-none text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Role</label>
            <select value={addForm.role} onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-nani-light focus:border-transparent outline-none text-sm bg-white">
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="instructor">Instructor</option>
              <option value="verifier">Verifier</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
            <div className="relative">
              <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                placeholder="Min 6 chars"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-nani-light focus:border-transparent outline-none text-sm" />
            </div>
          </div>
          <div className="lg:col-span-5">
            <button type="submit" disabled={loading}
              className="w-full sm:w-auto px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? 'Creating...' : <><UserPlus size={16} /> Create User</>}
            </button>
          </div>
        </form>
      </div>

      {/* Remove User */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Trash2 size={20} className="text-red-500" /> Remove User
        </h2>
        <p className="text-xs text-slate-500 mb-4">Search for a user by email and delete their account permanently.</p>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="email" value={removeEmail} onChange={(e) => setRemoveEmail(e.target.value)}
              placeholder="Search by email..."
              className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-nani-light focus:border-transparent outline-none text-sm" />
          </div>
          <button onClick={handleSearchUser} disabled={searching}
            className="px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
            <Search size={16} /> {searching ? 'Searching...' : 'Find'}
          </button>
        </div>

        {foundUsers.length > 0 && (
          <div className="space-y-3">
            {foundUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{u.full_name || 'No name'}</p>
                  <p className="text-xs text-slate-500 truncate">{u.email}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="inline-block px-2 py-0.5 bg-slate-100 text-xs text-slate-600 rounded-full capitalize">{u.role}</span>
                    {u.phone && <span className="inline-block px-2 py-0.5 bg-slate-100 text-xs text-slate-600 rounded-full">{u.phone}</span>}
                    {(u.is_disabled || u.is_locked) && (
                      <span className="inline-block px-2 py-0.5 bg-red-50 text-xs text-red-600 rounded-full flex items-center gap-1">
                        <AlertTriangle size={10} /> {u.is_disabled ? 'Disabled' : 'Locked'}
                      </span>
                    )}
                  </div>
                </div>
                {deleteTarget?.id === u.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600 font-semibold">Confirm delete?</span>
                    <button onClick={handleDeleteUser} disabled={loading}
                      className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50">
                      {loading ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                    <button onClick={() => setDeleteTarget(null)}
                      className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs rounded-lg hover:bg-slate-300">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteTarget(u)}
                    className="px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1">
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertModal show={alertModal.show} title={alertModal.title} message={alertModal.message}
        type={alertModal.type} onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })} />
    </>
  );
};

export default AdminUserTools;
