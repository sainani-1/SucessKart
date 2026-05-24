import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import AlertModal from '../components/AlertModal';
import { Lock, TrendingUp, Award, Upload } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import { prepareAvatarFile } from '../utils/imageUtils';
import { buildAvatarPublicUrl } from '../utils/avatarUtils';
import { detectFace } from '../utils/detectFace';
import AvatarImage from '../components/AvatarImage';
import { isLifetimePremium, formatPremiumLabel } from '../utils/premium';
import { getCertificateDisplayName } from '../utils/identityVerification';
import { updateUsernameForUser } from '../utils/usernames';

const Profile = () => {
  const { profile, user, fetchProfile } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [enrollments, setEnrollments] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

  const certificateCourseIds = new Set(certificates.map(c => c.course_id));
  const completedCount = enrollments.filter(e => e.completed || certificateCourseIds.has(e.course_id) || (Number(e.progress) || 0) >= 100).length;

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
      setUsername(profile.username || '');
      loadProgress();
    }
  }, [profile]);

  const loadProgress = async () => {
    const { data: enr } = await supabase
      .from('enrollments')
      .select('*, courses(title)')
      .eq('student_id', profile.id);
    setEnrollments(enr || []);

    // certificates table uses user_id FK
    const { data: certs } = await supabase
      .from('certificates')
      .select('*')
      .eq('user_id', profile.id);
    setCertificates(certs || []);
  };

  const changePassword = async () => {
    if (!currentPassword) {
      setAlertModal({
        show: true,
        title: 'Current Password Required',
        message: 'Please enter your current password first.',
        type: 'warning'
      });
      return;
    }
    if (!newPassword || newPassword !== confirmPassword) {
      setAlertModal({
        show: true,
        title: 'Password Mismatch',
        message: 'Passwords do not match!',
        type: 'warning'
      });
      return;
    }
    setLoading(true);
    const userEmail = profile?.email || user?.email;
    if (!userEmail) {
      setAlertModal({
        show: true,
        title: 'Error',
        message: 'Unable to validate current password. Please login again.',
        type: 'error'
      });
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword
    });
    if (verifyError) {
      setAlertModal({
        show: true,
        title: 'Invalid Current Password',
        message: 'Current password is incorrect.',
        type: 'error'
      });
      setLoading(false);
      return;
    }

    let error = null;
    if (profile?.role === 'admin') {
      const response = await supabase.functions.invoke('admin-reset-password', {
        body: {
          user_id: profile.id,
          email: userEmail,
          new_password: newPassword,
        }
      });
      error = response.error || null;
    } else {
      const updateResponse = await supabase.auth.updateUser({ password: newPassword });
      error = updateResponse.error || null;
    }

    if (error) {
      setAlertModal({
        show: true,
        title: 'Error',
        message: error.message,
        type: 'error'
      });
    } else {
      setAlertModal({
        show: true,
        title: 'Success',
        message: profile?.role === 'admin'
          ? 'Password changed successfully using admin secure reset.'
          : 'Password changed successfully!',
        type: 'success'
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
    setLoading(false);
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploading(true);

    const faceResult = await detectFace(file);
    if (!faceResult.detected) {
      setAlertModal({
        show: true,
        title: 'No Face Detected',
        message: (faceResult.error || 'No face found in this photo.') + ' Please upload a clear photo where your face is visible.',
        type: 'warning'
      });
      setUploading(false);
      e.target.value = '';
      return;
    }

    try {
      const safeFile = await prepareAvatarFile(file);
      const fileExt = safeFile?.name?.split('.').pop() || file.name.split('.').pop();
      const fileName = `${profile.id}.${fileExt}`;
      const filePath = fileName;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, safeFile, { upsert: true, contentType: safeFile?.type || file.type });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : buildAvatarPublicUrl(filePath);
      if (!publicUrl) throw new Error('Unable to get avatar URL');

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id);
      if (updateError) throw updateError;

      await fetchProfile(profile.id);
      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Profile photo updated successfully',
        type: 'success'
      });
    } catch (err) {
      setAlertModal({
        show: true,
        title: 'Error',
        message: err.message || 'Failed to upload avatar',
        type: 'error'
      });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const saveProfile = async () => {
    if (!profile) return;
    if (!fullName.trim()) {
      setAlertModal({
        show: true,
        title: 'Invalid Input',
        message: 'Name cannot be empty',
        type: 'warning'
      });
      return;
    }
    if (!username.trim()) {
      setAlertModal({
        show: true,
        title: 'Invalid Input',
        message: 'Username cannot be empty',
        type: 'warning'
      });
      return;
    }
    setSavingProfile(true);
    try {
      await updateUsernameForUser({
        userId: profile.id,
        username,
      });
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), phone: phone.trim() })
        .eq('id', profile.id);
      if (error) throw error;
      await fetchProfile(profile.id);
      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Profile updated',
        type: 'success'
      });
    } catch (err) {
      setAlertModal({
        show: true,
        title: 'Error',
        message: err.message || 'Failed to update profile',
        type: 'error'
      });
    } finally {
      setSavingProfile(false);
    }
  };

  if (!profile) return <div className="p-6">Loading profile...</div>;

  const premiumActive = profile.premium_until && new Date(profile.premium_until) > new Date();
  const certificateName = getCertificateDisplayName(profile);
  const verificationLabel = profile.identity_verification_status
    ? String(profile.identity_verification_status).replace('_', ' ')
    : 'not submitted';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-6">
        <div className="relative">
          <AvatarImage
            userId={profile.id}
            avatarUrl={profile.avatar_url}
            alt="Avatar"
            fallbackName={profile.full_name || 'User'}
            className="w-20 h-20 rounded-full object-cover border-2 border-gold-400"
          />
          <label className="absolute -right-2 -bottom-2 bg-white border border-slate-200 rounded-full p-2 cursor-pointer shadow hover:bg-slate-50" title="Change photo">
            <Upload size={16} className="text-nani-dark" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
              disabled={uploading}
            />
          </label>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{profile.full_name}</h1>
          <p className="text-xs font-mono text-slate-500">{profile.username || username || '-'}</p>
          <p className="text-slate-500 text-sm">{profile.role === 'admin' ? 'Nani' : (profile.role?.charAt(0).toUpperCase() + profile.role?.slice(1)) || 'Student'}</p>
          <p className="text-slate-500 text-sm">Core Subject: {profile.core_subject || 'Not set'}</p>
          {uploading && <p className="text-xs text-slate-500 mt-1">Uploading photo...</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfoCard label="Username" value={profile.username || username || '-'} />
        <InfoCard label="Email" value={profile.email || user?.email || '—'} />
        <InfoCard label="Phone" value={profile.phone || '—'} />
        <InfoCard label="Core Subject" value={profile.core_subject || 'Not set'} />
        <InfoCard label="Education Level" value={profile.education_level || 'Not set'} />
        <InfoCard label="Study Stream" value={profile.study_stream || 'Not set'} />
        <InfoCard label="Diploma / Board" value={profile.diploma_certificate || 'Not provided'} />
        <InfoCard label="Certificate Name" value={certificateName} />
        <InfoCard label="ID Verification" value={verificationLabel} />
        <InfoCard 
          label="Premium Status" 
          value={
            premiumActive
              ? isLifetimePremium(profile.premium_until)
                ? 'Lifetime Premium'
                : `Active until ${formatPremiumLabel(profile.premium_until)}`
              : 'Not Premium'
          }
        />
      </div>

      {profile.role === 'student' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="text-blue-600" size={20} />
              <span className="text-sm font-medium text-blue-900">Enrollments</span>
            </div>
            <p className="text-3xl font-bold text-blue-800">{enrollments.length}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-xl border border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <Award className="text-green-600" size={20} />
              <span className="text-sm font-medium text-green-900">Completed</span>
            </div>
            <p className="text-3xl font-bold text-green-800">
              {completedCount}
            </p>
          </div>
          <div className="bg-gold-50 p-4 rounded-xl border border-gold-200">
            <div className="flex items-center gap-2 mb-2">
              <Award className="text-gold-600" size={20} />
              <span className="text-sm font-medium text-gold-900">Certificates</span>
            </div>
            <p className="text-3xl font-bold text-gold-800">{certificates.length}</p>
          </div>
        </div>
      )}

      {profile.role === 'student' && enrollments.length > 0 && (
        <div className="bg-white rounded-xl p-6 border">
          <h2 className="text-lg font-bold mb-4">Course Progress</h2>
          <div className="space-y-3">
            {enrollments.map(enr => (
              <div key={enr.id} className="flex items-center justify-between">
                <span className="text-sm font-medium">{enr.courses?.title}</span>
                <div className="flex items-center gap-3">
                  {(() => {
                    const computedProgress = certificateCourseIds.has(enr.course_id)
                      ? 100
                      : Math.min(Math.max(Number(enr.progress) || 0, 0), 100);
                    return (
                      <>
                        <div className="w-32 bg-slate-200 rounded-full h-2">
                          <div 
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: `${computedProgress}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-600 w-12">{computedProgress}%</span>
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-6 border">
        <h2 className="text-lg font-bold mb-4">Edit Profile</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full border rounded-lg p-3"
              placeholder="Your username"
            />
            <p className="mt-1 text-xs text-slate-500">
              Unique username. Example: SkillPro-Name-A1B2-260418
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full border rounded-lg p-3"
              placeholder="Your full name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full border rounded-lg p-3"
              placeholder="Your phone number"
            />
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={saveProfile}
            disabled={savingProfile}
            className="bg-nani-dark text-white px-6 py-2 rounded-lg hover:bg-nani-dark/90 disabled:opacity-50"
          >
            {savingProfile ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Lock size={20} className="text-blue-600" />
          Change Password
        </h2>
        <div className="space-y-3 max-w-md">
          <div>
            <label className="block text-sm font-medium mb-2">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="w-full border rounded-lg p-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">New Password</label>
            <input 
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full border rounded-lg p-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Confirm Password</label>
            <input 
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full border rounded-lg p-2"
            />
          </div>
          <button 
            onClick={changePassword}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </div>

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal(prev => ({ ...prev, show: false }))}
      />
    </div>
  );
};

const InfoCard = ({ label, value }) => (
  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
    <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">{label}</p>
    <p className="text-slate-800 font-semibold">{value}</p>
  </div>
);

export default Profile;

