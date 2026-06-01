import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import {
  ADMIN_SENSITIVE_MFA_SETTINGS_KEY,
  normalizeAdminSensitivePaths,
  isAdminPathProtectedBySensitiveMFA,
} from '../utils/adminSensitiveRoutes';

const SENSITIVE_MFA_TTL_MS = 10 * 60 * 1000;

const RequireConfiguredSensitiveAdminMFA = ({ children }) => {
  const { realProfile, loading } = useAuth();
  const location = useLocation();
  const [configLoading, setConfigLoading] = useState(true);
  const [protectedPaths, setProtectedPaths] = useState(() => normalizeAdminSensitivePaths());

  useEffect(() => {
    let active = true;

    const loadProtectedPaths = async () => {
      if (realProfile?.role !== 'admin') {
        setConfigLoading(false);
        return;
      }

      try {
        setConfigLoading(true);
        const { data, error } = await supabase
          .from('settings')
          .select('value')
          .eq('key', ADMIN_SENSITIVE_MFA_SETTINGS_KEY)
          .maybeSingle();

        if (!active) return;
        if (error) throw error;
        setProtectedPaths(normalizeAdminSensitivePaths(data?.value));
      } catch {
        if (!active) return;
        setProtectedPaths(normalizeAdminSensitivePaths());
      } finally {
        if (active) setConfigLoading(false);
      }
    };

    void loadProtectedPaths();
    return () => {
      active = false;
    };
  }, [realProfile?.role, location.pathname]);

  if (loading || configLoading) return children;

  if (realProfile?.role !== 'admin') {
    return children;
  }

  const currentTarget = `${location.pathname}${location.search}`;
  const requiresSensitiveMFA = isAdminPathProtectedBySensitiveMFA(location.pathname, protectedPaths);

  if (!requiresSensitiveMFA) {
    return children;
  }

  const verifiedAt = Number(sessionStorage.getItem('admin_sensitive_mfa_verified_at') || 0);
  const verifiedUser = sessionStorage.getItem('admin_sensitive_mfa_verified_user');
  const verifiedTarget = sessionStorage.getItem('admin_sensitive_mfa_verified_target') || '';
  const isFresh = verifiedAt > 0 && Date.now() - verifiedAt < SENSITIVE_MFA_TTL_MS;

  if (!isFresh || verifiedUser !== realProfile?.id || verifiedTarget !== currentTarget) {
    const next = encodeURIComponent(currentTarget);
    return <Navigate to={`/admin-mfa-verify?scope=sensitive-passwords&next=${next}`} replace />;
  }

  return children;
};

export default RequireConfiguredSensitiveAdminMFA;
