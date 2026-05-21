import React from 'react';
import { usePresenceContext } from '../context/PresenceContext';
import { Wifi, WifiOff } from 'lucide-react';

const AdminOnline = () => {
  const { onlineProfiles, onlineUserIds } = usePresenceContext();

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <Wifi size={20} className="text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Online Users</h1>
            <p className="text-sm text-slate-500">
              {onlineUserIds.size} user{onlineUserIds.size !== 1 ? 's' : ''} currently online
            </p>
          </div>
        </div>
      </div>

      {onlineProfiles.length === 0 ? (
        <div className="p-12 text-center">
          <WifiOff size={48} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 font-medium">No users online</p>
          <p className="text-slate-400 text-sm mt-1">Users will appear here when they are active on the site</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {onlineProfiles.map(profile => (
                <tr key={profile.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white text-xs font-bold">
                        {(profile.full_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-slate-800">{profile.full_name || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">{profile.email || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      profile.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                      profile.role === 'teacher' ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {profile.role || 'student'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-sm text-green-600 font-medium">Online</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminOnline;
