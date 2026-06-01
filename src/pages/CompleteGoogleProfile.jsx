import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import AlertModal from '../components/AlertModal';
import { useAuth } from '../context/AuthContext';
import { attachPendingReferral } from '../utils/referrals';
import { uploadAvatarForUser } from '../utils/avatarUpload';
import { detectFace } from '../utils/detectFace';
import { updateUsernameForUser } from '../utils/usernames';
import { isProfileComplete } from '../utils/profileCompletion';
import { countryPhoneOptions, digitsOnly, formatPhone, getCountryPhoneOption, parseStoredPhone, validatePhoneNumber } from '../utils/phoneValidation';
import { logError } from '../utils/errorLogger';

const streamOptions = {
  'B.Tech': ['Computer Science', 'Information Technology', 'Electronics', 'Mechanical', 'Civil', 'Others'],
  '12th': ['MPC', 'BIPC', 'MBIPC', 'Others'],
  '10th': ['State', 'CBSE', 'ICSE', 'Others'],
  Intermediate: ['MPC', 'BIPC', 'MBIPC', 'Others']
};

const CompleteGoogleProfile = () => {
  const { user, profile: authProfile, fetchProfile } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [profileRole, setProfileRole] = useState('student');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState('');
  const [faceChecking, setFaceChecking] = useState(false);
  const [faceStatus, setFaceStatus] = useState({ state: 'idle', message: '' });
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });
  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    phone: '',
    phoneCountry: '+91',
    password: '',
    confirmPassword: '',
    educationLevel: '',
    studyStream: '',
    customStudyStream: '',
    diploma: '',
    termsAccepted: false
  });
  const [errors, setErrors] = useState({});
  const selectedPhoneCountry = getCountryPhoneOption(formData.phoneCountry);

  useEffect(() => {
    if (!file) {
      setFilePreview('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const clearProfilePhoto = () => {
    setFile(null);
    setFaceStatus({ state: 'idle', message: '' });
    setErrors((prev) => ({ ...prev, file: '' }));
  };

  const handleProfilePhotoChange = async (event) => {
    const nextFile = event.target.files?.[0] || null;
    event.target.value = '';
    if (!nextFile) return;

    if (!nextFile.type?.startsWith('image/')) {
      setFile(nextFile);
      setFaceStatus({ state: 'invalid', message: 'Upload an image file with a clear face.' });
      setErrors((prev) => ({ ...prev, file: 'Upload an image file with a clear face.' }));
      return;
    }

    setFile(nextFile);
    setFaceChecking(true);
    setFaceStatus({ state: 'checking', message: 'Checking photo for a clear face...' });
    setErrors((prev) => ({ ...prev, file: '' }));
    try {
      const result = await detectFace(nextFile);
      if (!result.detected) {
        const message = result.error || 'No clear face detected. Upload another photo where the face is visible.';
        setFaceStatus({ state: 'invalid', message });
        setErrors((prev) => ({ ...prev, file: message }));
        return;
      }
      setFaceStatus({ state: 'valid', message: 'Face detected. Photo approved.' });
    } finally {
      setFaceChecking(false);
    }
  };

  useEffect(() => {
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.replaceState({ completeProfile: true }, '', currentUrl);
    window.history.pushState({ completeProfile: true }, '', currentUrl);

    const keepUserOnCompletion = () => {
      window.history.pushState({ completeProfile: true }, '', currentUrl);
      navigate('/complete-profile', { replace: true });
    };

    window.addEventListener('popstate', keepUserOnCompletion);
    return () => {
      window.removeEventListener('popstate', keepUserOnCompletion);
    };
  }, [navigate]);

  useEffect(() => {
    const hydrateFromSession = async () => {
      const currentUser = user || (await supabase.auth.getUser()).data.user;
      if (!currentUser) {
        navigate('/login', { replace: true });
        return;
      }
      const meta = currentUser.user_metadata || {};
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (profile && isProfileComplete(profile)) {
        navigate('/app', { replace: true });
        return;
      }
      setProfileRole(profile?.role || meta.role || 'student');
      const parsedPhone = parseStoredPhone(profile?.phone || meta.phone || '');

      setFormData((prev) => ({
        ...prev,
        username: prev.username || authProfile?.username || '',
        fullName: prev.fullName || profile?.full_name || meta.full_name || meta.name || '',
        phoneCountry: prev.phone ? prev.phoneCountry : parsedPhone.countryCode,
        phone: prev.phone || parsedPhone.phone,
        educationLevel: prev.educationLevel || profile?.education_level || meta.education_level || '',
        studyStream: prev.studyStream || profile?.study_stream || meta.study_stream || '',
        diploma: prev.diploma || profile?.diploma_certificate || meta.diploma_certificate || '',
        termsAccepted: prev.termsAccepted || Boolean(profile?.terms_accepted || meta.terms_accepted)
      }));
    };
    hydrateFromSession();
  }, [user, authProfile?.username, navigate]);

  const resolvedStudyStream = useMemo(() => {
    if (formData.studyStream === 'Others') return formData.customStudyStream.trim();
    return formData.studyStream;
  }, [formData.studyStream, formData.customStudyStream]);

  const validate = () => {
    const next = {};
    if (!formData.username.trim()) next.username = 'Username is required';
    else if (formData.username.trim().length < 6) next.username = 'Username must be at least 6 characters';
    if (!formData.fullName.trim()) next.fullName = 'Full name is required';
    const phoneError = validatePhoneNumber({ countryCode: formData.phoneCountry, phone: formData.phone });
    if (phoneError) next.phone = phoneError;
    if (!formData.password) next.password = 'Password is required';
    else if (formData.password.length < 6) next.password = 'Password must be at least 6 characters';
    if (formData.password !== formData.confirmPassword) next.confirmPassword = 'Passwords do not match';
    if (profileRole === 'student' && !formData.educationLevel) next.educationLevel = 'Education level is required';
    if (profileRole === 'student' && !formData.studyStream) next.studyStream = 'Please select stream/branch';
    if (profileRole === 'student' && formData.studyStream === 'Others' && !formData.customStudyStream.trim()) {
      next.customStudyStream = 'Please enter your stream/branch';
    }
    if (file && faceStatus.state !== 'valid') {
      next.file = faceStatus.message || 'Upload a clear face photo or remove this photo.';
    }
    if (!formData.termsAccepted) next.termsAccepted = 'You must accept Terms and Conditions';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { data: userResp } = await supabase.auth.getUser();
    const currentUser = userResp?.user || user;
    if (!currentUser) {
      navigate('/login', { replace: true });
      return;
    }
    if (!validate()) return;

    setLoading(true);
    try {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, role, auth_provider, education_level, study_stream, diploma_certificate, core_subject, avatar_url')
        .eq('id', currentUser.id)
        .maybeSingle();
      let avatarUrl = existingProfile?.avatar_url || currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || null;
      if (file && faceStatus.state === 'valid') {
        avatarUrl = await uploadAvatarForUser(supabase, currentUser.id, file);
      }

      const formattedPhone = formatPhone({ countryCode: formData.phoneCountry, phone: formData.phone });
      const payload = {
        id: currentUser.id,
        auth_user_id: currentUser.id,
        role: existingProfile?.role || currentUser.user_metadata?.role || profileRole || 'student',
        email: currentUser.email || null,
        full_name: formData.fullName.trim(),
        phone: formattedPhone,
        education_level: profileRole === 'student' ? formData.educationLevel : existingProfile?.education_level || null,
        study_stream: profileRole === 'student' ? resolvedStudyStream : existingProfile?.study_stream || null,
        diploma_certificate: profileRole === 'student' ? (formData.diploma.trim() || null) : existingProfile?.diploma_certificate || null,
        core_subject: profileRole === 'student' ? (resolvedStudyStream || null) : existingProfile?.core_subject || null,
        avatar_url: avatarUrl,
        auth_provider: existingProfile?.auth_provider || 'google',
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
        google_profile_completed: false,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
      const { error: passwordError } = await supabase.auth.updateUser({
        password: formData.password,
        data: {
          full_name: formData.fullName.trim(),
          phone: formattedPhone,
          avatar_url: avatarUrl,
          role: payload.role,
        },
      });
      if (passwordError) throw passwordError;
      await updateUsernameForUser({ userId: currentUser.id, username: formData.username.trim() });
      const { error: completeError } = await supabase
        .from('profiles')
        .update({ google_profile_completed: true, updated_at: new Date().toISOString() })
        .eq('id', currentUser.id);
      if (completeError) throw completeError;

      try {
        await attachPendingReferral(currentUser.id, currentUser.email || null);
      } catch (referralError) {
        logError({ message: 'Referral attach failed:', source: 'CompleteGoogleProfile', details: referralError.message || referralError });
      }

      await fetchProfile(currentUser.id);
      navigate('/app', { replace: true });
    } catch (error) {
      setAlertModal({
        show: true,
        title: 'Profile Error',
        message: error.message || 'Could not save your profile details.',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-slate-900">Complete Your Profile</h1>
        <p className="text-sm text-slate-500 text-center mt-1 mb-6">
          Google sign-in is complete. Add your details to continue.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              className={`w-full p-3 border rounded-lg bg-slate-50 ${errors.username ? 'border-red-500' : ''}`}
              placeholder="Username *"
              value={formData.username}
              onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
            />
            {errors.username && <p className="text-red-500 text-xs mt-1">{errors.username}</p>}
          </div>

          <div>
            <input
              className={`w-full p-3 border rounded-lg bg-slate-50 ${errors.fullName ? 'border-red-500' : ''}`}
              placeholder="Full Name"
              value={formData.fullName}
              onChange={(e) => setFormData((prev) => ({ ...prev, fullName: e.target.value }))}
            />
            {errors.fullName && <p className="text-red-500 text-xs mt-1">{errors.fullName}</p>}
          </div>

          <div>
            <div className="flex gap-2">
              <select
                className="w-32 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
                value={formData.phoneCountry}
                onChange={(e) => {
                  const nextCountry = getCountryPhoneOption(e.target.value);
                  setFormData((prev) => ({
                    ...prev,
                    phoneCountry: nextCountry.code,
                    phone: digitsOnly(prev.phone).slice(0, nextCountry.max),
                  }));
                  if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
                }}
              >
                {countryPhoneOptions.map((option) => (
                  <option key={`${option.code}-${option.country}`} value={option.code}>
                    {option.code} {option.country}
                  </option>
                ))}
              </select>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                className={`w-full p-3 border rounded-lg bg-slate-50 ${errors.phone ? 'border-red-500' : ''}`}
                placeholder={`${selectedPhoneCountry.max} digit number`}
                value={formData.phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone: digitsOnly(e.target.value).slice(0, selectedPhoneCountry.max) }))}
              />
            </div>
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
          </div>

          <div>
            <input
              type="password"
              className={`w-full p-3 border rounded-lg bg-slate-50 ${errors.password ? 'border-red-500' : ''}`}
              placeholder="Create Password *"
              value={formData.password}
              onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
            />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
          </div>

          <div>
            <input
              type="password"
              className={`w-full p-3 border rounded-lg bg-slate-50 ${errors.confirmPassword ? 'border-red-500' : ''}`}
              placeholder="Confirm Password *"
              value={formData.confirmPassword}
              onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
            />
            {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1 font-medium">Profile Photo (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleProfilePhotoChange}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm"
            />
            {filePreview && (
              <div className={`mt-3 rounded-xl border p-3 ${faceStatus.state === 'invalid' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-start gap-3">
                  <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <img src={filePreview} alt="Selected profile preview" className="h-full w-full object-cover" />
                    {faceStatus.state === 'invalid' ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-red-950/55">
                        <X size={34} className="text-white" strokeWidth={3} />
                      </div>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-800">{file?.name}</p>
                    <p className={`mt-1 text-xs ${faceStatus.state === 'valid' ? 'text-emerald-600' : faceStatus.state === 'invalid' ? 'text-red-600' : 'text-slate-500'}`}>
                      {faceStatus.message || 'Photo selected.'}
                    </p>
                    <button
                      type="button"
                      onClick={clearProfilePhoto}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-white"
                    >
                      <X size={13} /> Clear photo
                    </button>
                  </div>
                </div>
              </div>
            )}
            {faceChecking && <p className="mt-1 text-xs text-slate-500">Checking face...</p>}
            {errors.file && <p className="text-red-500 text-xs mt-1">{errors.file}</p>}
          </div>

          {profileRole === 'student' && (
            <>
              <div>
                <label className="block text-sm text-slate-600 mb-1 font-medium">Education Level *</label>
                <select
                  className={`w-full p-3 border rounded-lg bg-slate-50 ${errors.educationLevel ? 'border-red-500' : ''}`}
                  value={formData.educationLevel}
                  onChange={(e) => setFormData((prev) => ({ ...prev, educationLevel: e.target.value, studyStream: '', customStudyStream: '' }))}
                >
                  <option value="">Select education level</option>
                  <option value="B.Tech">B.Tech</option>
                  <option value="12th">12th Grade</option>
                  <option value="10th">10th Grade</option>
                  <option value="Intermediate">Intermediate</option>
                </select>
                {errors.educationLevel && <p className="text-red-500 text-xs mt-1">{errors.educationLevel}</p>}
              </div>

              {formData.educationLevel && (
                <div>
                  <label className="block text-sm text-slate-600 mb-1 font-medium">
                    {formData.educationLevel === 'B.Tech' ? 'Branch' : 'Stream'} *
                  </label>
                  <select
                    className={`w-full p-3 border rounded-lg bg-slate-50 ${errors.studyStream ? 'border-red-500' : ''}`}
                    value={formData.studyStream}
                    onChange={(e) => setFormData((prev) => ({ ...prev, studyStream: e.target.value, customStudyStream: e.target.value === 'Others' ? prev.customStudyStream : '' }))}
                  >
                    <option value="">Select {formData.educationLevel === 'B.Tech' ? 'branch' : 'stream'}</option>
                    {streamOptions[formData.educationLevel]?.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  {errors.studyStream && <p className="text-red-500 text-xs mt-1">{errors.studyStream}</p>}
                </div>
              )}

              {formData.studyStream === 'Others' && (
                <div>
                  <input
                    className={`w-full p-3 border rounded-lg bg-slate-50 ${errors.customStudyStream ? 'border-red-500' : ''}`}
                    placeholder="Enter your stream/branch"
                    value={formData.customStudyStream}
                    onChange={(e) => setFormData((prev) => ({ ...prev, customStudyStream: e.target.value }))}
                  />
                  {errors.customStudyStream && <p className="text-red-500 text-xs mt-1">{errors.customStudyStream}</p>}
                </div>
              )}

              {formData.educationLevel === '12th' && (
                <textarea
                  className="w-full p-3 border rounded-lg bg-slate-50 resize-none"
                  placeholder="Diploma / Board details (optional)"
                  rows={3}
                  value={formData.diploma}
                  onChange={(e) => setFormData((prev) => ({ ...prev, diploma: e.target.value }))}
                />
              )}
            </>
          )}

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={formData.termsAccepted}
              onChange={(e) => setFormData((prev) => ({ ...prev, termsAccepted: e.target.checked }))}
            />
            <span>
              I agree to the{' '}
              <Link to="/terms-and-conditions" target="_blank" className="text-blue-600 font-semibold underline">
                Terms and Conditions
              </Link>.
            </span>
          </label>
          {errors.termsAccepted && <p className="text-red-500 text-xs -mt-2">{errors.termsAccepted}</p>}

          <button disabled={loading || faceChecking} className="w-full btn-primary py-3 font-bold disabled:opacity-60">
            {faceChecking ? 'Checking Photo...' : loading ? 'Saving...' : 'Continue to App'}
          </button>
        </form>

      </div>

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

export default CompleteGoogleProfile;
