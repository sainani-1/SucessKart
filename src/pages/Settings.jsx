import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Settings as SettingsIcon, User, Bell, Lock, Eye, EyeOff, Mail, Phone, MapPin, Briefcase, Calendar, Shield } from 'lucide-react';
import usePopup from '../hooks/usePopup.jsx';
import LoadingSpinner from '../components/LoadingSpinner';
import { updateUsernameForUser } from '../utils/usernames';

const Settings = () => {
  const { profile } = useAuth();
  const { popupNode, openPopup } = usePopup();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  // Profile Settings
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  // Password Settings
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Notification Settings
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [courseUpdates, setCourseUpdates] = useState(true);
  const [promotionalEmails, setPromotionalEmails] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState(true);

  // Privacy Settings
  const [profileVisibility, setProfileVisibility] = useState('public');
  const [showEmail, setShowEmail] = useState(false);
  const [showPhone, setShowPhone] = useState(false);

  const isMissingProfileColumnError = (err) => {
    const message = String(err?.message || '').toLowerCase();
    const details = String(err?.details || '').toLowerCase();
    return (
      message.includes('column') &&
      (message.includes('bio') || message.includes('location') || message.includes('date_of_birth')) ||
      details.includes('bio') ||
      details.includes('location') ||
      details.includes('date_of_birth')
    );
  };

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setUsername(profile.username || '');
      setEmail(profile.email || '');
      setPhone(profile.phone || '');
      setBio(profile.bio || '');
      setLocation(profile.location || '');
      setDateOfBirth(profile.date_of_birth || '');
    }
  }, [profile]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!profile?.id) {
      openPopup('Error', 'Profile not loaded. Please refresh and try again.', 'error');
      return;
    }
    setLoading(true);

    try {
      await updateUsernameForUser({
        userId: profile.id,
        username,
      });

      const basePayload = {
        full_name: fullName.trim(),
        phone: phone.trim()
      };
      const extendedPayload = {
        ...basePayload,
        bio: bio.trim(),
        location: location.trim(),
        date_of_birth: dateOfBirth || null
      };

      let { error } = await supabase
        .from('profiles')
        .update(extendedPayload)
        .eq('id', profile.id);

      if (error && isMissingProfileColumnError(error)) {
        const fallback = await supabase
          .from('profiles')
          .update(basePayload)
          .eq('id', profile.id);
        error = fallback.error;
      }

      if (error) throw error;

      openPopup('Success', 'Profile updated successfully!', 'success');
    } catch (error) {
      openPopup('Error', error.message || 'Failed to update profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();

    if (!currentPassword) {
      openPopup('Error', 'Current password is required', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      openPopup('Error', 'New passwords do not match', 'error');
      return;
    }

    if (newPassword.length < 6) {
      openPopup('Error', 'Password must be at least 6 characters', 'error');
      return;
    }

    setLoading(true);

    try {
      const userEmail = profile?.email || '';
      if (!userEmail) {
        throw new Error('Unable to validate current password. Please login again.');
      }

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword
      });
      if (verifyError) {
        throw new Error('Current password is incorrect.');
      }

      let error = null;
      if (profile?.role === 'admin') {
        const response = await supabase.functions.invoke('admin-reset-password', {
          body: {
            user_id: profile.id,
            email: userEmail,
            new_password: newPassword
          }
        });
        error = response.error || null;
      } else {
        const response = await supabase.auth.updateUser({
          password: newPassword
        });
        error = response.error || null;
      }

      if (error) throw error;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      openPopup(
        'Success',
        profile?.role === 'admin'
          ? 'Password changed successfully using admin secure reset.'
          : 'Password changed successfully!',
        'success'
      );
    } catch (error) {
      openPopup('Error', error.message || 'Failed to change password', 'error');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'password', label: 'Password', icon: Lock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'privacy', label: 'Privacy', icon: Shield },
  ];

  if (loading) return <LoadingSpinner message="Updating settings..." />;

  return (
    <div className="space-y-6">
      {popupNode}
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-500">Manage your account settings and preferences</p>
        </div>
        <SettingsIcon className="text-slate-400" size={32} />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-gold-400 border-b-2 border-gold-400'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-gold-400 focus:border-transparent"
                    required
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Unique username. Example: SucessKart-Name-A1B2-260418
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <User size={16} className="inline mr-2" />
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-gold-400 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <Mail size={16} className="inline mr-2" />
                    Email (Read-only)
                  </label>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <Phone size={16} className="inline mr-2" />
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-gold-400 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <Calendar size={16} className="inline mr-2" />
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-gold-400 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <MapPin size={16} className="inline mr-2" />
                    Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="City, Country"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-gold-400 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Briefcase size={16} className="inline mr-2" />
                  Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  placeholder="Tell us about yourself..."
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-gold-400 focus:border-transparent"
                />
              </div>

              <button
                type="submit"
                className="bg-gold-400 hover:bg-gold-300 text-nani-dark font-bold px-6 py-3 rounded-lg transition-colors"
              >
                Save Profile Changes
              </button>
            </form>
          )}

          {/* Password Tab */}
          {activeTab === 'password' && (
            <form onSubmit={handleChangePassword} className="space-y-6 max-w-md">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-gold-400 focus:border-transparent pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-gold-400 focus:border-transparent pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">Must be at least 6 characters</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-gold-400 focus:border-transparent"
                  required
                />
              </div>

              <button
                type="submit"
                className="bg-gold-400 hover:bg-gold-300 text-nani-dark font-bold px-6 py-3 rounded-lg transition-colors"
              >
                Change Password
              </button>
            </form>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between py-4 border-b border-slate-200">
                <div>
                  <h3 className="font-medium text-slate-900">Email Notifications</h3>
                  <p className="text-sm text-slate-500">Receive notifications via email</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailNotifications}
                    onChange={(e) => setEmailNotifications(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gold-400/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-400"></div>
                </label>
              </div>

              <div className="flex items-center justify-between py-4 border-b border-slate-200">
                <div>
                  <h3 className="font-medium text-slate-900">Course Updates</h3>
                  <p className="text-sm text-slate-500">Get notified about new courses and content</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={courseUpdates}
                    onChange={(e) => setCourseUpdates(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gold-400/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-400"></div>
                </label>
              </div>

              <div className="flex items-center justify-between py-4 border-b border-slate-200">
                <div>
                  <h3 className="font-medium text-slate-900">Promotional Emails</h3>
                  <p className="text-sm text-slate-500">Receive special offers and promotions</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={promotionalEmails}
                    onChange={(e) => setPromotionalEmails(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gold-400/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-400"></div>
                </label>
              </div>

              <div className="flex items-center justify-between py-4">
                <div>
                  <h3 className="font-medium text-slate-900">Weekly Digest</h3>
                  <p className="text-sm text-slate-500">Receive weekly summary of your activities</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={weeklyDigest}
                    onChange={(e) => setWeeklyDigest(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gold-400/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-400"></div>
                </label>
              </div>

              <button
                onClick={() => openPopup('Success', 'Notification preferences saved!', 'success')}
                className="bg-gold-400 hover:bg-gold-300 text-nani-dark font-bold px-6 py-3 rounded-lg transition-colors"
              >
                Save Notification Preferences
              </button>
            </div>
          )}

          {/* Privacy Tab */}
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  Profile Visibility
                </label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-3 p-3 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="visibility"
                      checked={profileVisibility === 'public'}
                      onChange={() => setProfileVisibility('public')}
                      className="text-gold-400 focus:ring-gold-400"
                    />
                    <div>
                      <div className="font-medium text-slate-900">Public</div>
                      <div className="text-sm text-slate-500">Anyone can see your profile</div>
                    </div>
                  </label>

                  <label className="flex items-center space-x-3 p-3 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="visibility"
                      checked={profileVisibility === 'students'}
                      onChange={() => setProfileVisibility('students')}
                      className="text-gold-400 focus:ring-gold-400"
                    />
                    <div>
                      <div className="font-medium text-slate-900">Students Only</div>
                      <div className="text-sm text-slate-500">Only other students can see your profile</div>
                    </div>
                  </label>

                  <label className="flex items-center space-x-3 p-3 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="visibility"
                      checked={profileVisibility === 'private'}
                      onChange={() => setProfileVisibility('private')}
                      className="text-gold-400 focus:ring-gold-400"
                    />
                    <div>
                      <div className="font-medium text-slate-900">Private</div>
                      <div className="text-sm text-slate-500">Only you can see your profile</div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between py-4 border-t border-slate-200">
                <div>
                  <h3 className="font-medium text-slate-900">Show Email Address</h3>
                  <p className="text-sm text-slate-500">Display your email on your profile</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showEmail}
                    onChange={(e) => setShowEmail(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gold-400/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-400"></div>
                </label>
              </div>

              <div className="flex items-center justify-between py-4 border-t border-slate-200">
                <div>
                  <h3 className="font-medium text-slate-900">Show Phone Number</h3>
                  <p className="text-sm text-slate-500">Display your phone number on your profile</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPhone}
                    onChange={(e) => setShowPhone(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gold-400/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-400"></div>
                </label>
              </div>

              <button
                onClick={() => openPopup('Success', 'Privacy settings saved!', 'success')}
                className="bg-gold-400 hover:bg-gold-300 text-nani-dark font-bold px-6 py-3 rounded-lg transition-colors"
              >
                Save Privacy Settings
              </button>
            </div>
          )}

          {/* Danger Zone Tab */}
          {activeTab === 'danger' && (
            <div className="space-y-6">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="font-bold text-red-900 mb-2">⚠️ Danger Zone</h3>
                <p className="text-sm text-red-700">
                  Once you delete your account, there is no going back. Please be certain.
                </p>
              </div>

              <div className="border border-red-300 rounded-lg p-6">
                <h3 className="font-bold text-slate-900 mb-2">Delete Account</h3>
                <p className="text-slate-600 mb-4">
                  This will permanently delete your account login and record your deletion reason for admin audit.
                </p>
                <ul className="list-disc list-inside text-slate-600 space-y-1 mb-6">
                  <li>You will be logged out immediately</li>
                  <li>You can register again later with the same email</li>
                  <li>Deletion reason is shown in admin panel</li>
                  <li>Certificates remain stored in Supabase</li>
                </ul>
                <button
                  onClick={handleDeleteAccount}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-lg transition-colors"
                >
                  Delete My Account
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
