import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { updateUsernameForUser } from '../utils/usernames';
import { uploadAvatarForUser } from '../utils/avatarUpload';
import { detectFace } from '../utils/detectFace';
import AlertModal from '../components/AlertModal';
import { logWarn } from '../utils/errorLogger';

const STORAGE_KEY = 'google_onboarding_state';
const steps = ['Username', 'Phone', 'Password', 'Photo'];

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

function clearState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

const GoogleOnboarding = () => {
  const { user, fetchProfile } = useAuth();
  const navigate = useNavigate();

  const saved = useRef(loadSavedState());

  const [currentStep, setCurrentStep] = useState(saved.current?.currentStep || 0);
  const [username, setUsername] = useState(saved.current?.username || '');
  const [phone, setPhone] = useState(saved.current?.phone || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [faceChecking, setFaceChecking] = useState(false);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

  const googleAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  useEffect(() => {
    if (!user) { navigate('/login', { replace: true }); return; }
    const check = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, google_profile_completed, terms_accepted')
        .eq('id', user.id)
        .maybeSingle();
      if (profile?.google_profile_completed && profile?.terms_accepted) {
        clearState();
        navigate('/app', { replace: true });
      }
    };
    check();
  }, [user, navigate]);

  useEffect(() => {
    saveState({ currentStep, username, phone });
  }, [currentStep, username, phone]);

  useEffect(() => {
    if (!file) { setFileUrl(null); return; }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const validateStep = (step) => {
    const next = {};
    if (step === 0) {
      if (!username.trim()) next.username = 'Username is required';
      else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) next.username = 'Only letters, numbers, and underscores allowed';
    }
    if (step === 1) {
      if (!phone.trim()) next.phone = 'Phone number is required';
      else if (!/^\d{10}$/.test(phone.trim())) next.phone = 'Must be exactly 10 digits';
    }
    if (step === 2) {
      if (!password) next.password = 'Password is required';
      else if (password.length < 6) next.password = 'At least 6 characters';
      if (password !== confirmPassword) next.confirmPassword = 'Passwords do not match';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleContinue = async () => {
    if (!validateStep(currentStep)) return;
    setLoading(true);
    try {
      if (currentStep === 0) {
        await updateUsernameForUser({ userId: user.id, username: username.trim() });
      }
      setCurrentStep((prev) => prev + 1);
    } catch (err) {
      const msg = err.message || '';
      if (msg === 'SESSION_LOST' || msg.includes('Session')) {
        setAlertModal({
          show: true,
          title: 'Session Expired',
          message: 'Your session is no longer valid. Please log in again.',
          type: 'warning'
        });
        return;
      }
      setErrors({ username: msg.includes('taken') ? 'This username is already taken' : msg });
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
    setErrors({});
  };

  const handleFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
    if (errors.face) setErrors((prev) => ({ ...prev, face: '' }));
  };

  const handleSubmit = async () => {
    if (file) {
      setFaceChecking(true);
      const result = await detectFace(file);
      setFaceChecking(false);
      if (!result.detected) {
        setErrors({
          face: result.error || 'No face detected in the photo. Please upload a clear photo of your face.'
        });
        return;
      }
    }

    setLoading(true);
    try {
      if (phone) {
        const { error: phoneErr } = await supabase
          .from('profiles')
          .update({ phone: phone.trim(), updated_at: new Date().toISOString() })
          .eq('id', user.id);
        if (phoneErr) throw phoneErr;
      }

      let avatarUrl = googleAvatar;
      if (file) {
        try {
          avatarUrl = await uploadAvatarForUser(supabase, user.id, file);
        } catch (photoErr) {
          logWarn({ message: 'Photo upload warning in onboarding:', source: 'GoogleOnboarding', details: photoErr.message });
        }
      }

      if (password) {
        const { error: pwdErr } = await supabase.auth.updateUser({ password });
        if (pwdErr) throw pwdErr;
      }

      const { error: completeErr } = await supabase
        .from('profiles')
        .update({
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString(),
          google_profile_completed: true,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
      if (completeErr) throw completeErr;

      clearState();
      await fetchProfile(user.id);
      navigate('/app', { replace: true });
    } catch (error) {
      const msg = error.message || '';
      setAlertModal({
        show: true,
        title: msg.includes('SESSION_LOST') || msg.includes('session') || msg.includes('Session') || msg.includes('expired') || msg.includes('Invalid') ? 'Session Expired' : 'Error',
        message: msg || 'Something went wrong. Please try again.',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Choose a Username</h2>
            <p className="text-sm text-slate-500">This will be your public profile URL.</p>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); if (errors.username) setErrors({}); }}
              className={`w-full p-3 border rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.username ? 'border-red-500' : 'border-slate-200'}`}
              autoFocus
            />
            {errors.username && <p className="text-red-500 text-xs mt-1">{errors.username}</p>}
          </div>
        );
      case 1:
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Phone Number</h2>
            <p className="text-sm text-slate-500">Enter your 10-digit phone number.</p>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="Phone Number"
              value={phone}
              onChange={(e) => { const val = e.target.value.replace(/\D/g, '').slice(0, 10); setPhone(val); if (errors.phone) setErrors({}); }}
              className={`w-full p-3 border rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.phone ? 'border-red-500' : 'border-slate-200'}`}
              autoFocus
            />
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Set a Password</h2>
            <p className="text-sm text-slate-500">Create a password so you can also log in with email.</p>
            <input
              type="password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors({}); }}
              className={`w-full p-3 border rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.password ? 'border-red-500' : 'border-slate-200'}`}
              autoFocus
            />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); if (errors.confirmPassword) setErrors({}); }}
              className={`w-full p-3 border rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.confirmPassword ? 'border-red-500' : 'border-slate-200'}`}
            />
            {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Profile Photo</h2>
            <p className="text-sm text-slate-500">Add a profile photo (optional).</p>
            <div className="flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-200 border-2 border-slate-300">
                {fileUrl ? (
                  <img src={fileUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : googleAvatar ? (
                  <img src={googleAvatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-3xl font-bold">?</div>
                )}
              </div>
              <label className="cursor-pointer text-sm text-blue-600 font-semibold hover:underline">
                {file ? 'Change photo' : 'Upload photo'}
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </label>
              {file && (
                <button type="button" onClick={() => { setFile(null); setErrors((prev) => ({ ...prev, face: '' })); }} className="text-xs text-red-500 hover:underline">
                  Remove photo
                </button>
              )}
              {errors.face && (
                <div className="w-full p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-xs font-semibold mb-1">No face detected</p>
                  <p className="text-red-500 text-xs">{errors.face}</p>
                  <p className="text-red-400 text-xs mt-1">Please upload a clear photo where your face is visible.</p>
                </div>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-center gap-1 mb-8">
          {steps.map((step, i) => (
            <React.Fragment key={step}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i <= currentStep ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}>
                {i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`h-1 w-8 rounded transition-colors ${i < currentStep ? 'bg-blue-600' : 'bg-slate-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {renderStep()}

        <div className="flex gap-3 mt-8">
          {currentStep > 0 && (
            <button
              type="button"
              onClick={handleBack}
              disabled={loading || faceChecking}
              className="flex-1 py-3 px-4 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition disabled:opacity-50"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={currentStep === steps.length - 1 ? handleSubmit : handleContinue}
            disabled={loading || faceChecking}
            className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading || faceChecking ? 'Checking...' : currentStep === steps.length - 1 ? 'Finish' : 'Continue'}
          </button>
        </div>
      </div>
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => {
          if (alertModal.title === 'Session Expired') {
            supabase.auth.signOut().finally(() => { window.location.assign('/login'); });
          } else {
            setAlertModal({ show: false, title: '', message: '', type: 'info' });
          }
        }}
      />
    </div>
  );
};

export default GoogleOnboarding;
