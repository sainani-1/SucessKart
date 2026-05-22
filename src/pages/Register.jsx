import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Link, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { BookOpenCheck, FileCheck, GraduationCap } from 'lucide-react';
import AlertModal from '../components/AlertModal';
import LoadingSpinner from '../components/LoadingSpinner';
import AuthShell from '../components/AuthShell';
import { cachePendingRegistrationAvatar, uploadAvatarForUser } from '../utils/avatarUpload';
import { attachPendingReferral, savePendingReferralCode } from '../utils/referrals';
import { useAuth } from '../context/AuthContext';
import { logWarn } from '../utils/errorLogger';

const Register = () => {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [registrationDone, setRegistrationDone] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    phone: '',
    coreSubject: 'Computer Science',
    educationLevel: '',
    studyStream: '',
    customStudyStream: '',
    diploma: ''
  });
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [registrationPaused, setRegistrationPaused] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [searchParams] = useSearchParams();

  // Stream options based on education level
  const streamOptions = {
    'B.Tech': ['Computer Science', 'Information Technology', 'Electronics', 'Mechanical', 'Civil', 'Others'],
    '12th': ['MPC', 'BIPC', 'MBIPC', 'Others'],
    '10th': ['State', 'CBSE', 'ICSE', 'Others'],
    'Intermediate': ['MPC', 'BIPC', 'MBIPC', 'Others']
  };
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });
  const navigate = useNavigate();
  const cachePendingAvatar = async (email, sourceFile) => {
    if (!email || !sourceFile) return;
    try {
      await cachePendingRegistrationAvatar(email, sourceFile);
    } catch (err) {
      // Ignore cache failures; registration should continue.
    }
  };

  // Check if registrations are paused
  useEffect(() => {
    const referralCode = searchParams.get('ref');
    if (referralCode) {
      savePendingReferralCode(referralCode);
    }
  }, [searchParams]);

  useEffect(() => {
    const checkRegistrationStatus = async () => {
      try {
        const { data } = await supabase
          .from('settings')
          .select('key, value')
          .eq('key', 'registration_paused')
          .single();

        if (data && data.value === 'true') {
          setRegistrationPaused(true);
        }
      } catch (error) {
}
    };

    checkRegistrationStatus();
  }, []);

  const validateStep = (step) => {
    const stepErrors = {};

    if (step === 1) {
      if (!formData.fullName.trim()) stepErrors.fullName = 'Full name is required';
      if (!formData.phone.trim()) stepErrors.phone = 'Phone number is required';
    }

    if (step === 2) {
      if (!formData.educationLevel) stepErrors.educationLevel = 'Education level is required';
      if (formData.educationLevel && !formData.studyStream) stepErrors.studyStream = 'Please select a stream/branch';
      if (formData.studyStream === 'Others' && !formData.customStudyStream.trim()) {
        stepErrors.customStudyStream = 'Please enter your stream/branch';
      }
    }

    if (step === 3) {
      if (!formData.email.trim()) {
        stepErrors.email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        stepErrors.email = 'Invalid email address';
      }
      if (!formData.password.trim()) {
        stepErrors.password = 'Password is required';
      } else if (formData.password.length < 6) {
        stepErrors.password = 'Password must be at least 6 characters';
      }
    }

    if (step === 4 && !termsAccepted) {
      stepErrors.termsAccepted = 'You must accept Terms and Conditions';
    }

    setErrors((prev) => ({ ...prev, ...stepErrors }));
    return Object.keys(stepErrors).length === 0;
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email address';
    }
    if (!formData.password.trim()) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    if (!formData.educationLevel) {
      newErrors.educationLevel = 'Education level is required';
    }
    if (formData.educationLevel && !formData.studyStream) {
      newErrors.studyStream = 'Please select a stream/branch';
    }
    if (formData.studyStream === 'Others' && !formData.customStudyStream.trim()) {
      newErrors.customStudyStream = 'Please enter your stream/branch';
    }
    if (!termsAccepted) {
      newErrors.termsAccepted = 'You must accept Terms and Conditions';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const goToNextStep = () => {
    if (!validateStep(currentStep)) return;
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const goToPreviousStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleResendVerification = async () => {
    const emailToUse = (registeredEmail || formData.email || '').trim();
    if (!emailToUse) {
      setAlertModal({
        show: true,
        title: 'Email Required',
        message: 'Please enter your email address first.',
        type: 'warning'
      });
      return;
    }

    setResendingVerification(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: emailToUse,
        options: {
          emailRedirectTo: `${window.location.origin}/login?confirmed=true`
        }
      });
      if (error) throw error;

      setAlertModal({
        show: true,
        title: 'Verification Sent',
        message: `Verification email resent to ${emailToUse}. Please check inbox/spam.`,
        type: 'success'
      });
    } catch (error) {
      setAlertModal({
        show: true,
        title: 'Resend Failed',
        message: error.message || 'Unable to resend verification email.',
        type: 'error'
      });
    } finally {
      setResendingVerification(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const formattedPhone = formData.phone.trim() || null;
      const resolvedStudyStream =
        formData.studyStream === 'Others'
          ? formData.customStudyStream.trim()
          : formData.studyStream;

      // 1. Sign up auth
      const { data: { user }, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/login?confirmed=true`,
          data: {
            full_name: formData.fullName.trim(),
            phone: formattedPhone,
            terms_accepted: true,
            terms_accepted_at: new Date().toISOString(),
            education_level: formData.educationLevel,
            study_stream: resolvedStudyStream,
            diploma_certificate: formData.diploma || null,
            core_subject: resolvedStudyStream || formData.coreSubject || null,
            auth_provider: 'email',
            role: 'student'
          }
        }
      });
      if (error) throw error;

      if (!user?.id) {
        throw new Error('Unable to create user account. Please try again.');
      }

      // 2. Upload Photo
      let avatarUrl = null;
      if (file) {
        try {
          avatarUrl = await uploadAvatarForUser(supabase, user.id, file);
          try {
            await supabase.auth.updateUser({
              data: {
                full_name: formData.fullName.trim(),
                phone: formattedPhone,
                avatar_url: avatarUrl,
                education_level: formData.educationLevel,
                study_stream: resolvedStudyStream,
                diploma_certificate: formData.diploma || null,
                core_subject: resolvedStudyStream || formData.coreSubject || null,
                role: 'student'
              }
            });
          } catch (metadataError) {
            logWarn({ message: 'Student metadata sync warning:', source: 'Register', details: metadataError.message || metadataError })
          }
        } catch (photoErr) {
          logWarn({ message: 'Photo upload warning:', source: 'Register', details: photoErr.message })
          // Cache avatar locally and apply on first successful login after email verification.
          await cachePendingAvatar(formData.email, file);
        }
      }

      // 3. Create/Update profile from registration details so user does not need to enter again.
      const { error: profileError } = await supabase.from('profiles').upsert([{
        id: user.id,
        auth_user_id: user.id,
        full_name: formData.fullName.trim(),
        email: formData.email.trim(),
        phone: formattedPhone,
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
        google_profile_completed: true,
        education_level: formData.educationLevel,
        study_stream: resolvedStudyStream,
        diploma_certificate: formData.diploma || null,
        avatar_url: avatarUrl,
        core_subject: resolvedStudyStream || formData.coreSubject || null,
        auth_provider: 'email',
        role: 'student',
        updated_at: new Date().toISOString(),
      }], { onConflict: 'id' });
      if (profileError && !String(profileError.message || '').toLowerCase().includes('row-level security')) {
        throw profileError;
      }

      try {
        await attachPendingReferral(user.id, formData.email.trim());
      } catch (referralError) {
        logWarn({ message: 'Referral attach failed:', source: 'Register', details: referralError.message || referralError })
      }

      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Registration successful! Please check your email to confirm your account.',
        type: 'success'
      });
      setRegisteredEmail(formData.email.trim());
      setRegistrationDone(true);
    } catch (error) {
      setAlertModal({
        show: true,
        title: 'Registration Error',
        message: error.message,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return <LoadingSpinner message="Checking session..." />;
  }

  if (user?.id) {
    return <Navigate to="/app" replace />;
  }

  return (
    <AuthShell
      title="Start your SkillPro journey"
      subtitle="Create your account to access classes, exams, certificates, and personalized learning updates."
      highlights={[
        { icon: GraduationCap, text: 'Education-specific setup so recommendations and assessments fit the learner profile.' },
        { icon: FileCheck, text: 'Profile and certificate details are captured during signup to reduce re-entry later.' },
        { icon: BookOpenCheck, text: 'Use one account for learning, exams, certificate verification, and mentor support.' },
      ]}
      footerLabel="Already have an account?"
      footerLinkTo="/login"
      footerLinkText="Login to continue"
      rightTitle="Create Account"
      rightSubtitle={`Step ${currentStep} of 4`}
      progress={!registrationPaused ? [1, 2, 3, 4].map((step) => step <= currentStep) : []}
      panelClassName=""
    >
      {registrationPaused ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
          <div className="mb-3 text-4xl">Registration Locked</div>
          <h3 className="mb-2 text-xl font-bold text-amber-900">Registrations Paused</h3>
          <p className="mb-5 text-amber-800">Registrations are temporarily paused. Please try again later.</p>
          <Link to="/login" className="inline-flex rounded-lg bg-amber-600 px-4 py-2 text-white transition-colors hover:bg-amber-700">
            Go Back to Login
          </Link>
        </div>
      ) : (
        <>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60 sm:p-6">
            <div className="mb-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-amber-700 px-4 py-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Registration Flow</p>
              <p className="mt-2 text-sm text-slate-100">
                Complete each step to create your SkillPro account with the right education details.
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
                  {currentStep === 1 && (
                    <>
                      <div>
                        <label className="block text-sm text-slate-600 mb-1 font-semibold">Full Name *</label>
                        <input
                          className={`w-full p-3 border rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 transition ${errors.fullName ? 'border-red-500' : 'border-slate-200'}`}
                          placeholder="Full Name"
                          value={formData.fullName}
                          onChange={e => {
                            setFormData({ ...formData, fullName: e.target.value });
                            if (errors.fullName) setErrors({ ...errors, fullName: '' });
                          }}
                        />
                        {errors.fullName && <p className="text-red-500 text-xs mt-1">{errors.fullName}</p>}
                      </div>

                      <div>
                        <label className="block text-sm text-slate-600 mb-1 font-semibold">Phone Number *</label>
                        <input
                          className={`w-full p-3 border rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 transition ${errors.phone ? 'border-red-500' : 'border-slate-200'}`}
                          placeholder="Phone Number"
                          value={formData.phone}
                          onChange={e => {
                            setFormData({ ...formData, phone: e.target.value });
                            if (errors.phone) setErrors({ ...errors, phone: '' });
                          }}
                        />
                        {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                      </div>
                    </>
                  )}

                  {currentStep === 2 && (
                    <>
                      <div>
                        <label className="block text-sm text-slate-600 mb-1 font-semibold">Education Level *</label>
                        <select
                          className={`w-full p-3 border rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 transition ${errors.educationLevel ? 'border-red-500' : 'border-slate-200'}`}
                          value={formData.educationLevel}
                          onChange={e => {
                            setFormData({ ...formData, educationLevel: e.target.value, studyStream: '', customStudyStream: '' });
                            if (errors.educationLevel) setErrors({ ...errors, educationLevel: '' });
                          }}
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
                          <label className="block text-sm text-slate-600 mb-1 font-semibold">
                            {formData.educationLevel === 'B.Tech' ? 'Branch' : 'Stream'} *
                          </label>
                          <select
                            className={`w-full p-3 border rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 transition ${errors.studyStream ? 'border-red-500' : 'border-slate-200'}`}
                            value={formData.studyStream}
                            onChange={e => {
                              const nextValue = e.target.value;
                              setFormData({
                                ...formData,
                                studyStream: nextValue,
                                customStudyStream: nextValue === 'Others' ? formData.customStudyStream : '',
                              });
                              if (errors.studyStream) setErrors({ ...errors, studyStream: '' });
                              if (errors.customStudyStream) setErrors({ ...errors, customStudyStream: '' });
                            }}
                          >
                            <option value="">Select {formData.educationLevel === 'B.Tech' ? 'branch' : 'stream'}</option>
                            {streamOptions[formData.educationLevel]?.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                          {errors.studyStream && <p className="text-red-500 text-xs mt-1">{errors.studyStream}</p>}
                          {formData.studyStream === 'Others' && (
                            <div className="mt-2">
                              <input
                                type="text"
                                className={`w-full p-3 border rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 transition ${errors.customStudyStream ? 'border-red-500' : 'border-slate-200'}`}
                                placeholder={`Enter your ${formData.educationLevel === 'B.Tech' ? 'branch' : 'stream'}`}
                                value={formData.customStudyStream}
                                onChange={e => {
                                  setFormData({ ...formData, customStudyStream: e.target.value });
                                  if (errors.customStudyStream) setErrors({ ...errors, customStudyStream: '' });
                                }}
                              />
                              {errors.customStudyStream && <p className="text-red-500 text-xs mt-1">{errors.customStudyStream}</p>}
                            </div>
                          )}
                        </div>
                      )}

                      {formData.educationLevel === '12th' && (
                        <div>
                          <label className="block text-sm text-slate-600 mb-1 font-semibold">Diploma / Board Details</label>
                          <textarea
                            className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 resize-none focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 transition"
                            placeholder="Enter your diploma or board details"
                            rows="3"
                            value={formData.diploma}
                            onChange={e => setFormData({ ...formData, diploma: e.target.value })}
                          />
                        </div>
                      )}
                    </>
                  )}

                  {currentStep === 3 && (
                    <>
                      <div>
                        <label className="block text-sm text-slate-600 mb-1 font-semibold">Email Address *</label>
                        <input
                          type="email"
                          className={`w-full p-3 border rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 transition ${errors.email ? 'border-red-500' : 'border-slate-200'}`}
                          placeholder="Email Address"
                          value={formData.email}
                          onChange={e => {
                            setFormData({ ...formData, email: e.target.value });
                            if (errors.email) setErrors({ ...errors, email: '' });
                          }}
                        />
                        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                      </div>

                      <div>
                        <label className="block text-sm text-slate-600 mb-1 font-semibold">Password *</label>
                        <input
                          type="password"
                          className={`w-full p-3 border rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 transition ${errors.password ? 'border-red-500' : 'border-slate-200'}`}
                          placeholder="Password"
                          value={formData.password}
                          onChange={e => {
                            setFormData({ ...formData, password: e.target.value });
                            if (errors.password) setErrors({ ...errors, password: '' });
                          }}
                        />
                        {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
                      </div>

                      <div>
                        <label className="block text-sm text-slate-600 mb-2 font-semibold">Profile Photo *</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => {
                            setFile(e.target.files?.[0] || null);
                            if (errors.file) setErrors({ ...errors, file: '' });
                          }}
                          className={`w-full text-sm border rounded-xl p-2 bg-slate-50 focus:outline-none ${errors.file ? 'border-red-500' : 'border-slate-200'}`}
                        />
                        {file && <p className="text-green-600 text-xs mt-1">Selected: {file.name}</p>}
                        {errors.file && <p className="text-red-500 text-xs mt-1">{errors.file}</p>}
                      </div>
                    </>
                  )}

                  {currentStep === 4 && (
                    <>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h3 className="text-sm font-bold text-slate-900 mb-2">Review</h3>
                        <p className="text-sm text-slate-700">Name: {formData.fullName || '-'}</p>
                        <p className="text-sm text-slate-700">Phone: {formData.phone || '-'}</p>
                        <p className="text-sm text-slate-700">Education: {formData.educationLevel || '-'}</p>
                        <p className="text-sm text-slate-700">
                          Stream: {formData.studyStream === 'Others' ? (formData.customStudyStream || '-') : (formData.studyStream || '-')}
                        </p>
                        <p className="text-sm text-slate-700">Email: {formData.email || '-'}</p>
                      </div>

                      <label className="flex items-start gap-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <input
                          type="checkbox"
                          className="mt-1 accent-amber-600"
                          checked={termsAccepted}
                          onChange={e => {
                            setTermsAccepted(e.target.checked);
                            if (errors.termsAccepted) setErrors({ ...errors, termsAccepted: '' });
                          }}
                        />
                        <span>
                          I agree to the{' '}
                          <Link to="/terms-and-conditions" target="_blank" className="text-amber-700 font-semibold underline">
                            Terms and Conditions
                          </Link>.
                        </span>
                      </label>
                      {errors.termsAccepted && <p className="text-red-500 text-xs -mt-2">{errors.termsAccepted}</p>}
                    </>
                  )}

                  <div className="flex gap-3 pt-2">
                    {currentStep > 1 && (
                      <button
                        type="button"
                        onClick={goToPreviousStep}
                        className="w-full py-3 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition"
                      >
                        Back
                      </button>
                    )}
                    {currentStep < 4 ? (
                      <button
                        type="button"
                        onClick={goToNextStep}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold shadow-lg shadow-amber-200/70 hover:from-amber-600 hover:to-amber-700 transition"
                      >
                        Next
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold shadow-lg shadow-amber-200/70 hover:from-amber-600 hover:to-amber-700 transition disabled:opacity-60"
                      >
                        {loading ? 'Creating Account...' : 'Register Now'}
                      </button>
                    )}
                  </div>
            </form>
          </div>
          <p className="mt-4 text-center text-sm text-slate-600">
            Already have an account? <Link to="/login" className="font-bold text-amber-700">Login</Link>
          </p>
          {registrationDone && (
            <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
              <p className="mb-2 text-xs text-cyan-900">
                Verification email sent to <span className="font-semibold">{registeredEmail}</span>
              </p>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resendingVerification}
                className="w-full rounded-xl bg-cyan-700 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:opacity-60"
              >
                {resendingVerification ? 'Sending...' : 'Resend verification email'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="mt-2 w-full rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Go to Login
              </button>
            </div>
          )}
        </>
      )}
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
    </AuthShell>
  );
};

export default Register;
