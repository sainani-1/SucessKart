import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  clearStoredSessionKey,
  fetchActiveSessionRecord,
  getOrCreateDeviceId,
  heartbeatSingleSession,
  isCurrentDeviceSessionOwner,
  releaseSingleSession,
  setSingleSessionNotice
} from '../utils/singleSession';
import { clearDailyLoginState, writeDailyLoginState } from '../utils/dailySession';
import { getPremiumPlanType, hasPremiumAccess } from '../utils/premium';
import { fetchUserPremiumPlanType } from '../utils/premiumPlanTypes';
import { clearTeacherAssignmentForStudent } from '../utils/teacherAssignment';
import { clearAdminVerificationState } from '../utils/adminPasskey';
import { ensureUsernameForUser } from '../utils/usernames';
import { clearSecureAuthStorage, readStoredAuthTokens, removeLegacyLocalAuthArtifacts } from '../utils/secureAuthStorage';
import { refreshSessionFromHttpOnlyCookie } from '../utils/authCookieBridge';
import { requestSessionFromOtherTabs } from '../utils/crossTabAuth';
import { logError } from '../utils/errorLogger';
import { clearFaceMfaVerified } from '../utils/faceAuth';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [impersonationProfile, setImpersonationProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const conflictStateRef = useRef({ strikes: 0, lastAt: 0 });
  const initialAuthRestoreRef = useRef(true);

  const PROFILE_CACHE_KEY = 'profile_cache';
  const IMPERSONATION_KEY = 'admin_impersonation_profile';

  const readProfileCache = () => {
    try {
      const stored = sessionStorage.getItem(PROFILE_CACHE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  };

  const writeProfileCache = (data) => {
    try {
      sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
      localStorage.removeItem(PROFILE_CACHE_KEY);
    } catch (error) {
      // Ignore cache write failures; app state remains source of truth.
    }
  };

  const clearProfileCache = () => {
    try {
      sessionStorage.removeItem(PROFILE_CACHE_KEY);
      localStorage.removeItem(PROFILE_CACHE_KEY);
    } catch (error) {
      // Ignore cache clear failures.
    }
  };

  const readImpersonation = () => {
    try {
      const stored = sessionStorage.getItem(IMPERSONATION_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  };

  const writeImpersonation = (data) => {
    try {
      sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify(data));
    } catch (error) {
      // Ignore storage failures.
    }
  };

  const clearImpersonation = () => {
    try {
      sessionStorage.removeItem(IMPERSONATION_KEY);
    } catch (error) {
      // Ignore storage failures.
    }
  };

  const forceClientLogout = async (userId, notice = null) => {
    if (notice) {
      setSingleSessionNotice(notice);
    }
    clearStoredSessionKey(userId);
    clearFaceMfaVerified(userId);
    setUser(null);
    setProfile(null);
    setProfileChecked(true);
    setImpersonationProfile(null);
    clearProfileCache();
    clearImpersonation();
    clearDailyLoginState();
    await supabase.auth.signOut();
    clearSecureAuthStorage();
  };

  const handleSingleSessionConflict = async (userId) => {
    const latestSession = await fetchActiveSessionRecord(userId);
    const oldDevice = latestSession?.device_label || latestSession?.device_id || 'Another active device';
    await forceClientLogout(userId, {
      title: 'Session Moved To Another Device',
      type: 'warning',
      inlineMessage: 'This account was opened somewhere else, so this device was logged out.',
      message: `This account is now active on another device.\n\nActive device: ${oldDevice}\nThis device: Current device\n\nYou have been logged out here automatically. Next time your account may be disabled if the same account is used in multiple places.`,
    });
  };

  const validateSessionOwnership = async (sessionUserId) => {
    if (!sessionUserId) return true;
    const localKey = sessionStorage.getItem(`single_session_key_${sessionUserId}`);
    if (!localKey) return true;

    const owned = await isCurrentDeviceSessionOwner(sessionUserId);
    if (owned === false) {
      await handleSingleSessionConflict(sessionUserId);
      return false;
    }
    if (owned === true) {
      await heartbeatSingleSession(sessionUserId);
    }
    return true;
  };

  const isPremium = (p) => {
    return hasPremiumAccess(p);
  };

  const getPlanTier = (p) => getPremiumPlanType(p);

  const isPremiumPlus = (p) => getPlanTier(p) === 'premium_plus';

  useEffect(() => {
    let isMounted = true;
    removeLegacyLocalAuthArtifacts();
    const cachedProfile = readProfileCache();
    const cachedImpersonation = readImpersonation();
    if (cachedProfile?.profile) {
      setProfile(cachedProfile.profile);
      setProfileChecked(true);
      setImpersonationProfile(cachedImpersonation);
    }

    const maxLoaderTimer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 1000);

    // Wait briefly for Supabase to restore the tab-scoped secure session.
    const restoreSession = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (isMounted) setLoading(false);
        if (isMounted) setProfileChecked(true);
        initialAuthRestoreRef.current = false;
        return;
      }
      try {
        let tries = 0;
        let session = null;
        while (tries < 5 && !session) {
          const { data } = await supabase.auth.getSession();
          session = data.session;
          if (session) break;
          await new Promise(res => setTimeout(res, 50));
          tries++;
        }
        if (!session) {
          const storedTokens = readStoredAuthTokens();
          if (storedTokens?.access_token && storedTokens?.refresh_token) {
            try {
              const { data } = await supabase.auth.setSession(storedTokens);
              session = data.session;
            } catch {
              session = null;
            }
          }
        }
        if (!session) {
          const restored = await refreshSessionFromHttpOnlyCookie();
          if (restored?.access_token && restored?.refresh_token) {
            const { data } = await supabase.auth.setSession(restored);
            session = data.session;
          }
        }
        if (!session) {
          const sharedSession = await requestSessionFromOtherTabs();
          if (sharedSession?.access_token && sharedSession?.refresh_token) {
            const { data } = await supabase.auth.setSession(sharedSession);
            session = data.session;
          }
        }
        if (!isMounted) return;
        if (session?.user) {
          const allowed = await validateSessionOwnership(session.user.id);
          if (!isMounted || !allowed) {
            setProfileChecked(true);
            setLoading(false);
            return;
          }
        }
        setUser(session?.user ?? null);
        if (session?.user) {
          setProfileChecked(false);
          fetchProfile(session.user.id, { background: true });
        } else {
          setProfile(null);
          setProfileChecked(true);
          setImpersonationProfile(null);
          clearProfileCache();
          clearImpersonation();
          setLoading(false);
        }
      } finally {
        clearTimeout(maxLoaderTimer);
        if (isMounted) setLoading(false);
        initialAuthRestoreRef.current = false;
      }
    };

    restoreSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        setUser(session?.user ?? null);
        return;
      }
      if (!session?.user && initialAuthRestoreRef.current) {
        return;
      }
      setUser(session?.user ?? null);
      if (session?.user) {
        setProfileChecked(false);
        fetchProfile(session.user.id, { background: true });
      }
      else {
        setProfile(null);
        setProfileChecked(true);
        setImpersonationProfile(null);
        clearProfileCache();
        clearImpersonation();
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(maxLoaderTimer);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let resuming = false;

    const restorePersistedSession = async () => {
      let session = null;
      const { data } = await supabase.auth.getSession();
      session = data?.session || null;

      if (!session) {
        const storedTokens = readStoredAuthTokens();
        if (storedTokens?.access_token && storedTokens?.refresh_token) {
          try {
            const { data: sessionData } = await supabase.auth.setSession(storedTokens);
            session = sessionData?.session || null;
          } catch {
            session = null;
          }
        }
      }

      if (!session) {
        const restored = await refreshSessionFromHttpOnlyCookie();
        if (restored?.access_token && restored?.refresh_token) {
          const { data: sessionData } = await supabase.auth.setSession(restored);
          session = sessionData?.session || null;
        }
      }

      if (!session) {
        const sharedSession = await requestSessionFromOtherTabs();
        if (sharedSession?.access_token && sharedSession?.refresh_token) {
          const { data: sessionData } = await supabase.auth.setSession(sharedSession);
          session = sessionData?.session || null;
        }
      }

      return session;
    };

    const resumeAuthState = async () => {
      if (resuming || !mounted) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      resuming = true;
      try {
        const session = await restorePersistedSession();
        if (!mounted || !session?.user) return;

        const allowed = await validateSessionOwnership(session.user.id);
        if (!mounted || !allowed) return;

        setUser(session.user);
        if (!profileChecked) {
          setProfileChecked(false);
          fetchProfile(session.user.id, { background: true });
        }
      } finally {
        resuming = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void resumeAuthState();
      }
    };

    window.addEventListener('focus', resumeAuthState);
    window.addEventListener('pageshow', resumeAuthState);
    window.addEventListener('online', resumeAuthState);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mounted = false;
      window.removeEventListener('focus', resumeAuthState);
      window.removeEventListener('pageshow', resumeAuthState);
      window.removeEventListener('online', resumeAuthState);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    let checking = false;
    conflictStateRef.current = { strikes: 0, lastAt: 0 };

    const validateAndHeartbeat = async () => {
      if (checking || cancelled) return;
      checking = true;
      try {
        const owned = await isCurrentDeviceSessionOwner(user.id);
        if (cancelled) return;
        if (owned === false) {
          const now = Date.now();
          const prev = conflictStateRef.current;
          const withinWindow = now - prev.lastAt < 15000;
          const nextStrikes = withinWindow ? prev.strikes + 1 : 1;
          conflictStateRef.current = { strikes: nextStrikes, lastAt: now };
          // Require repeated mismatches to reduce accidental logouts from transient/stale checks.
          if (nextStrikes >= 2) {
            await handleSingleSessionConflict(user.id);
          }
          return;
        }
        conflictStateRef.current = { strikes: 0, lastAt: 0 };
        if (owned === true) {
          await heartbeatSingleSession(user.id);
        }
      } finally {
        checking = false;
      }
    };

    validateAndHeartbeat();
    const interval = setInterval(validateAndHeartbeat, 5000);
    const onFocus = () => validateAndHeartbeat();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') validateAndHeartbeat();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    const channel = supabase
      .channel(`single-session-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'active_user_sessions', filter: `user_id=eq.${user.id}` },
        validateAndHeartbeat
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'active_user_sessions', filter: `user_id=eq.${user.id}` },
        validateAndHeartbeat
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const profileChannel = supabase
      .channel(`profile-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        () => fetchProfile(user.id, { background: true })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    let refreshing = false;

    const refreshProfileState = async () => {
      if (cancelled || refreshing) return;
      refreshing = true;
      try {
        await fetchProfile(user.id, { background: true });
      } finally {
        refreshing = false;
      }
    };

    refreshProfileState();
    const interval = setInterval(refreshProfileState, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user?.id]);

  const fetchProfile = async (userId, options = {}) => {
    const { background = false } = options;
    try {
      if (!background) setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) throw error;

      const premiumPlanType = await fetchUserPremiumPlanType(userId);
      const baseProfile = {
        ...data,
        premium_plan_type: premiumPlanType,
      };
      let hydratedProfile = baseProfile;
      try {
        hydratedProfile = await ensureUsernameForUser(baseProfile);
      } catch (usernameError) {
        logError({ message: 'Profile loaded without username hydration', source: 'AuthContext', details: usernameError });
      }

      if (
        hydratedProfile.role === 'student' &&
        hydratedProfile.assigned_teacher_id &&
        !hasPremiumAccess(hydratedProfile)
      ) {
        try {
          await clearTeacherAssignmentForStudent(supabase, userId);
          hydratedProfile.assigned_teacher_id = null;
        } catch (assignmentError) {
          logError({ message: 'Failed to clear expired teacher assignment', source: 'AuthContext', details: assignmentError });
        }
      }

      setProfile(hydratedProfile);
      setLoading(false);
      writeProfileCache({ userId: hydratedProfile.id, profile: hydratedProfile });
      setImpersonationProfile((prev) => {
        if (!prev) return null;
        if (prev.id === hydratedProfile.id) {
          clearImpersonation();
          return null;
        }
        return prev;
      });
      writeDailyLoginState({
        userId,
        email: hydratedProfile.email || '',
        role: hydratedProfile.role || '',
        fullName: hydratedProfile.full_name || ''
      });
    } catch (error) {
      if (!background) {
        setProfile(null);
        setImpersonationProfile(null);
      }
    } finally {
      setProfileChecked(true);
      if (!background) setLoading(false);
    }
  };

  const startImpersonation = (targetProfile) => {
    if (!targetProfile) return;
    setImpersonationProfile(targetProfile);
    writeImpersonation(targetProfile);
  };

  const stopImpersonation = () => {
    setImpersonationProfile(null);
    clearImpersonation();
  };

  const signOut = async () => {
    const currentUserId = user?.id || profile?.id;
    // Best effort: release active-session lock before auth token is cleared.
    try {
      await releaseSingleSession(currentUserId);
    } catch (error) {
      // Ignore release failures; local sign-out should still proceed.
    }
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setProfileChecked(true);
    setImpersonationProfile(null);
    clearProfileCache();
    clearImpersonation();
    clearStoredSessionKey(currentUserId);
    clearFaceMfaVerified(currentUserId);
    clearDailyLoginState();
    clearSecureAuthStorage();
    try {
      clearAdminVerificationState();
      sessionStorage.removeItem('admin_sensitive_mfa_verified_at');
      sessionStorage.removeItem('admin_sensitive_mfa_verified_user');
      sessionStorage.removeItem('admin_sensitive_mfa_verified_target');
    } catch (error) {
      // Ignore storage cleanup failures.
    }
    if (typeof window !== 'undefined') {
      window.location.assign('/login');
    }
  };

  const effectiveProfile = impersonationProfile || profile;
  const effectiveUser = impersonationProfile
    ? {
        ...(user || {}),
        id: impersonationProfile.id,
        email: impersonationProfile.email || user?.email || '',
      }
    : user;
  const isImpersonating = Boolean(impersonationProfile);

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        realUser: user,
        profile: effectiveProfile,
        realProfile: profile,
        profileChecked,
        impersonationProfile,
        isImpersonating,
        loading,
        signOut,
        fetchProfile,
        isPremium,
        isPremiumPlus,
        getPlanTier,
        startImpersonation,
        stopImpersonation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
