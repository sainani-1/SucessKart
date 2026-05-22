import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import AlertModal from '../components/AlertModal';
import { useAuth } from '../context/AuthContext';
import { attachPendingReferral } from '../utils/referrals';
import { logError } from '../utils/errorLogger';

const streamOptions = {
  'B.Tech': ['Computer Science', 'Information Technology', 'Electronics', 'Mechanical', 'Civil', 'Others'],
  '12th': ['MPC', 'BIPC', 'MBIPC', 'Others'],
  '10th': ['State', 'CBSE', 'ICSE', 'Others'],
  Intermediate: ['MPC', 'BIPC', 'MBIPC', 'Others']
};

const CompleteGoogleProfile = () => {
  const { user, fetchProfile } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    educationLevel: '',
    studyStream: '',
    customStudyStream: '',
    diploma: '',
    termsAccepted: false
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const hydrateFromSession = async () => {
      const currentUser = user || (await supabase.auth.getUser()).data.user;
      if (!currentUser) {
        navigate('/login', { replace: true });
        return;
      }
      const meta = currentUser.user_metadata || {};
      setFormData((prev) => ({
        ...prev,
        fullName: prev.fullName || meta.full_name || meta.name || ''
      }));
    };
    hydrateFromSession();
  }, [user, navigate]);

  const resolvedStudyStream = useMemo(() => {
    if (formData.studyStream === 'Others') return formData.customStudyStream.trim();
    return formData.studyStream;
  }, [formData.studyStream, formData.customStudyStream]);

  const validate = () => {
    const next = {};
    if (!formData.fullName.trim()) next.fullName = 'Full name is required';
    if (!formData.phone.trim()) next.phone = 'Phone number is required';
    if (!formData.educationLevel) next.educationLevel = 'Education level is required';
    if (!formData.studyStream) next.studyStream = 'Please select stream/branch';
    if (formData.studyStream === 'Others' && !formData.customStudyStream.trim()) {
      next.customStudyStream = 'Please enter your stream/branch';
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
      const payload = {
        id: currentUser.id,
        auth_user_id: currentUser.id,
        role: 'student',
        email: currentUser.email || null,
        full_name: formData.fullName.trim(),
        phone: formData.phone.trim(),
        education_level: formData.educationLevel,
        study_stream: resolvedStudyStream,
        diploma_certificate: formData.diploma.trim() || null,
        core_subject: resolvedStudyStream || null,
        auth_provider: 'google',
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
        google_profile_completed: true,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
      if (error) throw error;

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
              className={`w-full p-3 border rounded-lg bg-slate-50 ${errors.fullName ? 'border-red-500' : ''}`}
              placeholder="Full Name"
              value={formData.fullName}
              onChange={(e) => setFormData((prev) => ({ ...prev, fullName: e.target.value }))}
            />
            {errors.fullName && <p className="text-red-500 text-xs mt-1">{errors.fullName}</p>}
          </div>

          <div>
            <input
              className={`w-full p-3 border rounded-lg bg-slate-50 ${errors.phone ? 'border-red-500' : ''}`}
              placeholder="Phone Number *"
              value={formData.phone}
              onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
            />
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
          </div>

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

          <button disabled={loading} className="w-full btn-primary py-3 font-bold">
            {loading ? 'Saving...' : 'Continue to App'}
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
