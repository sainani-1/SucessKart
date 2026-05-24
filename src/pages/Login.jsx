import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, MailCheck, ShieldCheck, UserRoundCheck } from 'lucide-react';
import AlertModal from '../components/AlertModal';
import Toast from '../components/Toast';
import LoadingSpinner from '../components/LoadingSpinner';
import AuthShell from '../components/AuthShell';
import { claimSingleSession, takeSingleSessionNotice } from '../utils/singleSession';
import { attachPendingReferral } from '../utils/referrals';
import { useAuth } from '../context/AuthContext';
import { clearAdminVerificationState } from '../utils/adminPasskey';
import { getPendingAvatarKey } from '../utils/avatarUpload';
import { reportMultiSessionViolation } from '../utils/sessionSecurity';
import { logError, logWarn } from '../utils/errorLogger';

const Login = () => {
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });
  const [loggingIn, setLoggingIn] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [otpChallenge, setOtpChallenge] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpSendCount, setOtpSendCount] = useState(0);
  const [otpResendSeconds, setOtpResendSeconds] = useState(0);
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [processingOAuth, setProcessingOAuth] = useState(false);
  const [restoringStoredSession, setRestoringStoredSession] = useState(true);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [takeoverModalOpen, setTakeoverModalOpen] = useState(false);
  const [inlineNotice, setInlineNotice] = useState('');
  const takeoverResolverRef = useRef(null);
  const otpInputRefs = useRef([]);
  const navigate = useNavigate();
  const currentDeviceLabel = 'Web Login';
  const loginOtpEndpoint = import.meta.env.VITE_LOGIN_OTP_ENDPOINT || '/api/login-otp';
  const otpResendCooldownSeconds = 60;

  const applyPendingAvatarIfAny = async (userId, userEmail) => {
    if (!userId || !userEmail) return null;
    const storageKey = getPendingAvatarKey(userEmail);
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.dataUrl) return null;

      const mime = parsed.mime || 'image/jpeg';
      const extension = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
      const filePath = `${userId}.${extension}`;

      const blob = await fetch(parsed.dataUrl).then((r) => r.blob());
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, { upsert: true, contentType: mime });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = data?.publicUrl || null;
      if (!publicUrl) return null;

      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (profileUpdateError) throw profileUpdateError;

      localStorage.removeItem(storageKey);
      return publicUrl;
    } catch (err) {
      logWarn({ message: 'Pending avatar apply failed:', source: 'Login', details: err.message || err })
      return null;
    }
  };

  useEffect(() => {
    // Always require fresh MFA verification when admin starts a new login flow.
    clearAdminVerificationState();

    const notice = takeSingleSessionNotice();
    if (notice) {
      if (typeof notice === 'string') {
        setInlineNotice(notice);
      } else {
        setInlineNotice(String(notice.inlineMessage || ''));
        setAlertModal({
          show: true,
          title: notice.title || 'Session Conflict Detected',
          message: notice.message || 'More than one active session was detected.',
          type: notice.type || 'warning'
        });
      }
    }

    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    const confirmedByQuery =
      params.get('confirmed') === 'true' ||
      params.get('email_confirmed') === 'true' ||
      params.get('type') === 'signup' ||
      params.get('message') === 'confirmed';
    const confirmedByHash = hashParams.get('type') === 'signup';
    if (confirmedByQuery || confirmedByHash) {
      setToast({
        show: true,
        message: 'Email confirmed. Now you can login.',
        type: 'success'
      });
      const cleanUrl = `${window.location.origin}/login`;
      window.history.replaceState({}, '', cleanUrl);
    }

  }, []);

  useEffect(() => {
    let mounted = true;
    const restoreBeforeShowingLogin = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted && data?.session?.user) {
          navigate('/app', { replace: true });
          return;
        }
      } finally {
        if (mounted) setRestoringStoredSession(false);
      }
    };

    restoreBeforeShowingLogin();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (!otpStep || otpResendSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setOtpResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpStep, otpResendSeconds]);

  const askTakeoverConfirmation = () =>
    new Promise((resolve) => {
      takeoverResolverRef.current = resolve;
      setTakeoverModalOpen(true);
    });

  const closeTakeoverModal = (accepted) => {
    setTakeoverModalOpen(false);
    const resolver = takeoverResolverRef.current;
    takeoverResolverRef.current = null;
    if (resolver) resolver(accepted);
  };

  const requestLoginOtp = async (targetEmail) => {
    const response = await fetch(loginOtpEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send', email: targetEmail }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.challenge) {
      throw new Error(payload?.error || 'Could not send login OTP.');
    }
    return payload.challenge;
  };

  const verifyLoginOtp = async ({ targetEmail, code, challenge }) => {
    const response = await fetch(loginOtpEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', email: targetEmail, otp: code, challenge }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || 'Invalid OTP.');
    }
  };

  const startEmailOtpStep = async (targetEmail) => {
    try {
      setOtpSending(true);
      await supabase.auth.signOut();
      const challenge = await requestLoginOtp(targetEmail);
      setOtpChallenge(challenge);
      setOtpCode(['', '', '', '', '', '']);
      setOtpSendCount(1);
      setOtpResendSeconds(otpResendCooldownSeconds);
      setOtpStep(true);
      setToast({
        show: true,
        message: 'OTP sent to your email.',
        type: 'success'
      });
    } catch (otpError) {
      await supabase.auth.signOut();
      setAlertModal({
        show: true,
        title: 'OTP Error',
        message: otpError.message || 'Could not send login OTP. Please try again.',
        type: 'error'
      });
    } finally {
      setOtpSending(false);
      setLoggingIn(false);
    }
  };

  const isLoginOtpEnabled = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'login_email_otp_enabled')
        .maybeSingle();
      if (error) throw error;
      return data?.value !== 'false';
    } catch (error) {
      logWarn({ message: 'Login OTP setting check failed, defaulting to enabled:', source: 'Login', details: error?.message || error })
      return true;
    }
  };

  const otpCodeValue = otpCode.join('');

  const focusOtpInput = (index) => {
    requestAnimationFrame(() => {
      const input = otpInputRefs.current[index];
      if (input) {
        input.focus();
        input.select();
      }
    });
  };

  const handleOtpDigitChange = (value, index) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) {
      const next = [...otpCode];
      next[index] = '';
      setOtpCode(next);
      return;
    }

    const next = [...otpCode];
    digits.slice(0, 6 - index).split('').forEach((digit, offset) => {
      next[index + offset] = digit;
    });
    setOtpCode(next);
    focusOtpInput(Math.min(index + digits.length, 5));
  };

  const handleOtpKeyDown = (event, index) => {
    if (event.key !== 'Backspace') return;
    if (otpCode[index]) {
      const next = [...otpCode];
      next[index] = '';
      setOtpCode(next);
      return;
    }
    if (index > 0) {
      const next = [...otpCode];
      next[index - 1] = '';
      setOtpCode(next);
      focusOtpInput(index - 1);
    }
  };

  const ensureSingleActiveSession = async (userId, userProfile = null) => {
    const initial = await claimSingleSession(userId, { forceTakeover: false, deviceLabel: currentDeviceLabel });
    if (initial.status === 'requires_takeover') {
      if (userProfile) {
        await reportMultiSessionViolation(userProfile, {
          existingDeviceLabel: initial.conflictingSession?.device_label,
          existingDeviceId: initial.conflictingSession?.device_id,
          existingUpdatedAt: initial.conflictingSession?.updated_at,
          incomingDeviceLabel: currentDeviceLabel,
        });
      }
      const ok = await askTakeoverConfirmation();
      if (!ok) {
        return {
          allowed: false,
          message: 'Login canceled. Account is active on another device.',
        };
      }

      const takeover = await claimSingleSession(userId, { forceTakeover: true, deviceLabel: currentDeviceLabel });
      if (takeover.status !== 'claimed') {
        return {
          allowed: false,
          message: 'Could not transfer active session. Please try again.'
        };
      }
      return {
        allowed: true,
        message: 'Previous device was logged out. Next time your account may be disabled if the same account is used in multiple places.',
      };
    }

    if (initial.status === 'claimed' || initial.status === 'unavailable') {
      // unavailable => DB feature not ready; allow login without blocking.
      return { allowed: true, message: '' };
    }

    return { allowed: false, message: 'Could not validate active session. Please try again.' };
  };

  const routeGoogleUser = async (oauthUser) => {
    let { data: profile } = await supabase
      .from('profiles')
      .select('id, role, is_disabled, is_locked, locked_until, lock_reason, disabled_reason, terms_accepted, google_profile_completed, auth_provider, full_name, email, phone, session_violation_count')
      .eq('id', oauthUser.id)
      .maybeSingle();

    if (!profile) {
      const meta = oauthUser.user_metadata || {};
      const bootstrapProfile = {
        id: oauthUser.id,
        auth_user_id: oauthUser.id,
        role: 'student',
        email: oauthUser.email || null,
        full_name: meta.full_name || meta.name || '',
        avatar_url: meta.avatar_url || meta.picture || null,
        auth_provider: 'google',
        terms_accepted: false,
        google_profile_completed: false,
        updated_at: new Date().toISOString()
      };
      const { error: upsertError } = await supabase.from('profiles').upsert(bootstrapProfile, { onConflict: 'id' });
      if (upsertError) throw upsertError;
      profile = bootstrapProfile;
    }

    if (!profile.terms_accepted || !profile.google_profile_completed) {
      navigate('/google-onboarding');
      return;
    }

    const sessionCheck = await ensureSingleActiveSession(oauthUser.id, profile);
    if (!sessionCheck.allowed) {
      await supabase.auth.signOut();
      setAlertModal({
        show: true,
        title: 'Login Blocked',
        message: sessionCheck.message,
        type: 'warning'
      });
      return;
    }

    navigate('/app');
  };

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if (event !== 'SIGNED_IN') return;
      const provider = session?.user?.app_metadata?.provider;
      if (provider === 'google' && session?.user) {
        setProcessingOAuth(true);
        try {
          await routeGoogleUser(session.user);
        } catch (err) {
          logError({ message: 'Google OAuth routing failed', source: 'Login', details: err?.message || err });
          setAlertModal({
            show: true,
            title: 'Login Error',
            message: err?.message || 'Could not complete Google sign-in. Please try again.',
            type: 'error',
          });
        } finally {
          setProcessingOAuth(false);
          setGoogleSigningIn(false);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    let renderInterval = null;

    const tryRender = () => {
      if (typeof window.google?.accounts?.id === 'undefined') return false;
      const container = document.getElementById('google-gsi-container');
      if (!container) return false;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          setProcessingOAuth(true);

          if (!response?.credential) {
            setProcessingOAuth(false);
            setGoogleSigningIn(false);
            setAlertModal({
              show: true,
              title: 'Google Sign-in Error',
              message: 'No credential returned from Google.',
              type: 'error',
            });
            return;
          }

          if (!supabase.auth.signInWithIdToken) {
            setProcessingOAuth(false);
            setGoogleSigningIn(false);
            setAlertModal({
              show: true,
              title: 'Google Sign-in Error',
              message: 'Sign-in with ID token is not supported. Please update @supabase/supabase-js.',
              type: 'error',
            });
            return;
          }

          const safetyTimeout = setTimeout(() => {
            setProcessingOAuth(false);
            setGoogleSigningIn(false);
          }, 25000);

          supabase.auth.signInWithIdToken({ provider: 'google', token: response.credential })
            .then(() => {
              clearTimeout(safetyTimeout);
              setTimeout(() => {
                setProcessingOAuth(false);
                setGoogleSigningIn(false);
              }, 4000);
            })
            .catch((err) => {
              clearTimeout(safetyTimeout);
              setProcessingOAuth(false);
              setGoogleSigningIn(false);
              setAlertModal({
                show: true,
                title: 'Google Sign-in Error',
                message: err.message || 'Authentication failed.',
                type: 'error',
              });
            });
        },
      });

      window.google.accounts.id.renderButton(container, {
        type: 'standard',
        shape: 'rectangular',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        width: container.offsetWidth || 400,
      });

      return true;
    };

    if (!tryRender()) {
      renderInterval = setInterval(() => {
        if (tryRender()) clearInterval(renderInterval);
      }, 200);
    }

    return () => {
      if (renderInterval) clearInterval(renderInterval);
    };
  }, []);

  const completePasswordLogin = async ({ requireEmailOtp = true } = {}) => {
    setInlineNotice('');
    setLoggingIn(true);
    try {
      // First, sign in
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError || !signInData?.user) {
        const signInMessage = signInError?.message || 'No user returned from sign in. Please try again.';
        setAlertModal({
          show: true,
          title: 'Login Error',
          message: signInMessage.includes('Email not confirmed')
            ? 'Email not verified. Please verify your email first, then login.'
            : signInMessage,
          type: 'error'
        });
        setLoggingIn(false);
        return;
      }

      const isEmailVerified = !!(signInData.user.email_confirmed_at || signInData.user.confirmed_at);
      if (!isEmailVerified) {
        await supabase.auth.signOut();
        setAlertModal({
          show: true,
          title: 'Email Not Verified',
          message: 'Please verify your email before logging in. Use "Resend verification email" if needed.',
          type: 'warning'
        });
        setLoggingIn(false);
        return;
      }

      if (requireEmailOtp && await isLoginOtpEnabled()) {
        await startEmailOtpStep(signInData.user.email || email.trim());
        return;
      }

      // Fetch user profile
      let { data: userProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, role, is_disabled, is_locked, locked_until, lock_reason, disabled_reason, deleted_at, deleted_reason, email, full_name, phone, avatar_url, education_level, study_stream, diploma_certificate, core_subject, session_violation_count')
        .eq('id', signInData.user.id)
        .single();

      if (profileError || !userProfile) {
        // If this account was deleted earlier, block profile recreation and login.
        const { data: deletedRecord } = await supabase
          .from('deleted_accounts')
          .select('id, reason, deleted_at')
          .eq('user_id', signInData.user.id)
          .order('deleted_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (deletedRecord) {
          await supabase.auth.signOut();
          setAlertModal({
            show: true,
            title: 'Account Deleted',
            message: deletedRecord.reason
              ? `Your account was deleted. Reason: ${deletedRecord.reason}`
              : 'Your account was deleted. Please contact support if needed.',
            type: 'error'
          });
          setLoggingIn(false);
          return;
        }

        // Create profile on first verified login using auth metadata
        const meta = signInData.user.user_metadata || {};
        const { error: createProfileError } = await supabase.from('profiles').upsert({
          id: signInData.user.id,
          auth_user_id: signInData.user.id,
          email: signInData.user.email || email.trim(),
          full_name: meta.full_name || 'Student',
          phone: meta.phone || null,
          avatar_url: meta.avatar_url || null,
          education_level: meta.education_level || null,
          study_stream: meta.study_stream || null,
          diploma_certificate: meta.diploma_certificate || null,
          core_subject: meta.core_subject || null,
          role: meta.role || 'student',
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

        if (createProfileError) {
          setAlertModal({
            show: true,
            title: 'Profile Error',
            message: createProfileError.message || 'Could not create user profile.',
            type: 'error'
          });
          setLoggingIn(false);
          return;
        }

        const profileFetchRetry = await supabase
          .from('profiles')
          .select('id, role, is_disabled, is_locked, locked_until, avatar_url')
          .eq('id', signInData.user.id)
          .single();
        userProfile = profileFetchRetry.data;
        profileError = profileFetchRetry.error;

        if (profileError || !userProfile) {
          setAlertModal({
            show: true,
            title: 'Profile Error',
            message: 'User profile not found or could not be loaded. Please contact support or try again.',
            type: 'error'
          });
          setLoggingIn(false);
          return;
        }
      } else {
        // Backfill missing profile fields from signup metadata so users don't re-enter details manually.
        const meta = signInData.user.user_metadata || {};
        const profilePatch = { updated_at: new Date().toISOString() };

        if (!userProfile.email && (signInData.user.email || email.trim())) {
          profilePatch.email = signInData.user.email || email.trim();
        }
        if (!userProfile.full_name && meta.full_name) {
          profilePatch.full_name = meta.full_name;
        }
        if (!userProfile.phone && meta.phone) {
          profilePatch.phone = meta.phone;
        }
        if (!userProfile.education_level && meta.education_level) {
          profilePatch.education_level = meta.education_level;
        }
        if (!userProfile.study_stream && meta.study_stream) {
          profilePatch.study_stream = meta.study_stream;
        }
        if (!userProfile.diploma_certificate && meta.diploma_certificate) {
          profilePatch.diploma_certificate = meta.diploma_certificate;
        }
        if (!userProfile.core_subject && meta.core_subject) {
          profilePatch.core_subject = meta.core_subject;
        }
        if (!userProfile.avatar_url && meta.avatar_url) {
          profilePatch.avatar_url = meta.avatar_url;
        }
        if (
          meta.role &&
          ['student', 'teacher', 'admin', 'instructor', 'verifier'].includes(meta.role) &&
          userProfile.role !== meta.role
        ) {
          profilePatch.role = meta.role;
        }

        if (Object.keys(profilePatch).length > 1) {
          const { error: backfillError } = await supabase
            .from('profiles')
            .update(profilePatch)
            .eq('id', signInData.user.id);

          if (backfillError) {
            setAlertModal({
              show: true,
              title: 'Profile Sync Error',
              message: backfillError.message || 'Could not sync registration details to profile.',
              type: 'error'
            });
            setLoggingIn(false);
            return;
          }
        }
      }

      // Apply cached registration photo on first verified login if avatar was not stored earlier.
      if (!userProfile?.avatar_url) {
        const restoredAvatar = await applyPendingAvatarIfAny(
          signInData.user.id,
          signInData.user.email || email
        );
        if (restoredAvatar) {
          userProfile = { ...userProfile, avatar_url: restoredAvatar };
        }
      }

      try {
        await attachPendingReferral(signInData.user.id, signInData.user.email || email.trim());
      } catch (referralError) {
        logWarn({ message: 'Referral attach failed after login:', source: 'Login', details: referralError.message || referralError })
      }

      // Check for admin role and MFA
      const sessionCheck = await ensureSingleActiveSession(signInData.user.id, userProfile);
      if (!sessionCheck.allowed) {
        await supabase.auth.signOut();
        setInlineNotice(sessionCheck.message || 'Login blocked. Account is active on another device.');
        setLoggingIn(false);
        return;
      }

      if (userProfile.role === 'admin') {
        clearAdminVerificationState();
        setLoggingIn(false);
        setToast({
          show: true,
          message: sessionCheck.message || 'Logged in successfully!',
          type: 'success'
        });
        navigate('/admin-auth-choice');
        return;
      }

      // Account is active, proceed to app
      setLoggingIn(false);
      setToast({
        show: true,
        message: sessionCheck.message || 'Logged in successfully!',
        type: 'success'
      });
      setInlineNotice('');
      navigate('/app');
    } catch (error) {
      logError({ message: 'Error during login:', source: 'Login', details: error })
      setAlertModal({
        show: true,
        title: 'Error',
        message: 'Failed to login. Please try again.',
        type: 'error'
      });
      setLoggingIn(false);
      await supabase.auth.signOut();
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    await completePasswordLogin({ requireEmailOtp: true });
  };

  const handleOtpVerify = async (e) => {
    e.preventDefault();
      const cleanCode = otpCodeValue.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setAlertModal({
        show: true,
        title: 'Invalid OTP',
        message: 'Enter the 6-digit OTP sent to your email.',
        type: 'warning'
      });
      return;
    }

    setOtpVerifying(true);
    try {
      await verifyLoginOtp({
        targetEmail: email.trim(),
        code: cleanCode,
        challenge: otpChallenge,
      });
      setOtpStep(false);
      setOtpChallenge('');
      setOtpCode(['', '', '', '', '', '']);
      await completePasswordLogin({ requireEmailOtp: false });
    } catch (error) {
      setAlertModal({
        show: true,
        title: 'OTP Verification Failed',
        message: error.message || 'Invalid or expired OTP. Please try again.',
        type: 'error'
      });
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpSendCount >= 3) {
      setAlertModal({
        show: true,
        title: 'Resend Limit Reached',
        message: 'You can send only 3 OTP emails per login attempt. Please change email or try again later.',
        type: 'warning'
      });
      return;
    }
    if (otpResendSeconds > 0) {
      setAlertModal({
        show: true,
        title: 'Please Wait',
        message: `You can resend OTP in ${otpResendSeconds} second${otpResendSeconds === 1 ? '' : 's'}.`,
        type: 'info'
      });
      return;
    }

    setOtpSending(true);
    try {
      const challenge = await requestLoginOtp(email.trim());
      setOtpChallenge(challenge);
      setOtpCode(['', '', '', '', '', '']);
      setOtpSendCount((count) => Math.min(count + 1, 3));
      setOtpResendSeconds(otpResendCooldownSeconds);
      setToast({ show: true, message: 'New OTP sent to your email.', type: 'success' });
    } catch (error) {
      setAlertModal({
        show: true,
        title: 'OTP Error',
        message: error.message || 'Could not resend OTP.',
        type: 'error'
      });
    } finally {
      setOtpSending(false);
    }
  };

  const handleGoogleLogin = () => {
    const container = document.getElementById('google-gsi-container');
    if (!container) {
      setAlertModal({
        show: true,
        title: 'Google Sign-in',
        message: 'Google Sign-In is loading. Please try again in a moment.',
        type: 'info',
      });
      return;
    }
    const btn = container.querySelector('button, div[role="button"]');
    if (!btn) {
      setAlertModal({
        show: true,
        title: 'Google Sign-in',
        message: 'Google Sign-In is not ready yet. Please try again.',
        type: 'info',
      });
      return;
    }
    setGoogleSigningIn(true);
    btn.click();
  };

  const handleOAuthReturnRef = useRef(false);
  useEffect(() => {
    if (handleOAuthReturnRef.current) return;
    handleOAuthReturnRef.current = true;
    let isMounted = true;
    const searchParams = new URLSearchParams(window.location.search);
    const hasOAuthError = !!searchParams.get('error');

    const handleOAuthReturn = async () => {
      try {
        if (hasOAuthError) {
          const description = searchParams.get('error_description') || searchParams.get('error');
          setAlertModal({
            show: true,
            title: 'Google Sign-in Error',
            message: decodeURIComponent(description || 'OAuth sign-in failed.'),
            type: 'error'
          });
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        const provider = session?.user?.app_metadata?.provider;
        if (!session?.user || provider !== 'google') return;
        await routeGoogleUser(session.user);
      } catch (error) {
        if (!isMounted) return;
        setAlertModal({
          show: true,
          title: 'Google Sign-in Error',
          message: error.message || 'Unable to complete Google sign-in.',
          type: 'error'
        });
      } finally {
        if (isMounted) setProcessingOAuth(false);
      }
    };

    handleOAuthReturn();

    return () => {
      isMounted = false;
    };
  }, []);

  if (authLoading || restoringStoredSession) {
    return <LoadingSpinner message="Checking session..." />;
  }

  if (processingOAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-amber-50">
        <div className="text-center px-6">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 shadow-lg shadow-emerald-200/50">
            <svg className="h-10 w-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-800">Successfully Authenticated</h2>
          <p className="mt-2 text-base text-slate-500">You are being logged in. Please wait...</p>
          <div className="mx-auto mt-8 h-1.5 w-48 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-full origin-left animate-[loading_1.5s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-amber-500 to-emerald-500" />
          </div>
        </div>
        <style>{`@keyframes loading{0%{transform:scaleX(0)}50%{transform:scaleX(1)}100%{transform:scaleX(0)}}`}</style>
      </div>
    );
  }

  if (user?.id && !loggingIn && !takeoverModalOpen && !otpStep) {
    return <Navigate to="/app" replace />;
  }

  return (
    <>
      <Toast
        show={toast.show}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ show: false, message: '', type: 'success' })}
      />
      <AuthShell
        title="Continue your SkillPro learning"
        subtitle="Sign in to access courses, exams, certificates, mentor support, and your full student dashboard."
        highlights={[
          { icon: UserRoundCheck, text: 'Resume your learning from the same account across courses and assessments.' },
          { icon: ShieldCheck, text: 'Protected login flow with session checks and account safety controls.' },
          { icon: KeyRound, text: 'Reset your password anytime if you lose access to your email login.' },
        ]}
        footerLabel="New to SkillPro?"
        footerLinkTo="/register"
        footerLinkText="Create your account"
        rightTitle="Welcome Back"
        rightSubtitle="Use your registered email and password to continue."
      >
        <AlertModal
          show={alertModal.show}
          title={alertModal.title}
          message={alertModal.message}
          type={alertModal.type}
          onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
        />
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60 sm:p-6">
          <div className="mb-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-amber-700 px-4 py-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Account Access</p>
            <p className="mt-2 text-sm text-slate-100">Use the same email you used during registration to open your dashboard.</p>
          </div>

          {otpStep ? (
            <form onSubmit={handleOtpVerify} className="space-y-5">
              <div className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-emerald-50 shadow-sm">
                <div className="flex items-start gap-4 px-4 py-5 sm:px-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-100">
                    <MailCheck size={24} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-extrabold text-slate-900">Check your email</p>
                    <p className="mt-1 break-words text-sm font-semibold text-emerald-800">{email}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">Enter the 6-digit code we sent. It expires in 5 minutes.</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-3 block text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Email OTP</label>
                <div className="grid grid-cols-6 gap-2 sm:gap-3">
                  {otpCode.map((digit, index) => (
                    <input
                      key={index}
                      ref={(element) => {
                        otpInputRefs.current[index] = element;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      aria-label={`OTP digit ${index + 1}`}
                      className={`aspect-square min-h-12 rounded-2xl border-2 text-center text-xl font-black text-slate-900 shadow-sm outline-none transition sm:text-2xl ${
                        digit
                          ? 'border-amber-500 bg-amber-50 shadow-amber-100'
                          : 'border-slate-200 bg-slate-50 hover:border-amber-200'
                      } focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100`}
                      value={digit}
                      onChange={e => handleOtpDigitChange(e.target.value, index)}
                      onKeyDown={e => handleOtpKeyDown(e, index)}
                    />
                  ))}
                </div>
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3.5 font-bold text-white shadow-lg shadow-amber-200/70 transition hover:from-amber-600 hover:to-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={otpVerifying || loggingIn || otpCodeValue.length !== 6}
              >
                {otpVerifying || loggingIn ? 'Verifying...' : 'Verify OTP and Login'}
              </button>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={otpSending || otpVerifying || loggingIn || otpSendCount >= 3 || otpResendSeconds > 0}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {otpSending
                    ? 'Sending...'
                    : otpSendCount >= 3
                      ? 'Resend Limit Reached'
                      : otpResendSeconds > 0
                        ? `Resend in ${otpResendSeconds}s`
                        : `Resend OTP (${Math.max(0, 3 - otpSendCount)} left)`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOtpStep(false);
                    setOtpChallenge('');
                    setOtpCode(['', '', '', '', '', '']);
                    setOtpSendCount(0);
                    setOtpResendSeconds(0);
                    void supabase.auth.signOut();
                  }}
                  disabled={otpVerifying || loggingIn}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Change email
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              {inlineNotice ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {inlineNotice}
                </div>
              ) : null}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Email</label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <label className="block text-xs font-semibold text-slate-600">Password</label>
                  <Link to="/reset-password" className="text-xs font-semibold text-amber-700 hover:text-amber-800">
                    Forgot password?
                  </Link>
                </div>
                <input
                  type="password"
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 font-bold text-white shadow-lg shadow-amber-200/70 transition hover:from-amber-600 hover:to-amber-700 disabled:opacity-60"
                disabled={loggingIn || otpSending}
              >
                {loggingIn || otpSending ? 'Checking...' : 'Sign In'}
              </button>
            </form>
          )}

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-slate-400">or continue with</span>
            </div>
          </div>

          <div id="google-gsi-container" style={{ display: 'none' }}></div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleSigningIn}
            className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {googleSigningIn ? 'Connecting...' : 'Continue with Google'}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Link
            to="/register"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800"
          >
            Create Account
          </Link>
          <Link
            to="/reset-password"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Reset Password
          </Link>
        </div>

        <div className="mt-4">
          <Link
            to="/"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft size={18} />
            Back to Home Page
          </Link>
        </div>
      </AuthShell>

      {takeoverModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-7 py-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
              <p className="text-xs uppercase tracking-widest font-semibold text-amber-100">Session Protection</p>
              <h3 className="text-2xl font-bold mt-1">Already Logged In</h3>
              <p className="text-sm text-amber-50 mt-1">This account is currently active on another device.</p>
            </div>
            <div className="px-7 py-6 space-y-5">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-slate-800 text-sm font-medium">
                  Logout there and login here?
                </p>
                <p className="text-xs text-slate-600 mt-2">
                  If you continue, the other device will be logged out immediately. This multi-session attempt is reported to admin. Next time your account may be disabled.
                </p>
              </div>
              <p className="text-xs text-slate-500">
                If this was not you, choose cancel and reset your password.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => closeTakeoverModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => closeTakeoverModal(true)}
                  className="px-4 py-2.5 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-700"
                >
                  Logout There and Login Here
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Login;
