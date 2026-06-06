import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAdminPasskeyVerifiedForUser } from '../utils/adminPasskey';

const ADMIN_MFA_TTL_MS = 10 * 60 * 1000;

const RequireAdminMFA = ({ children }) => {
  const { profile, loading } = useAuth();

  if (loading) return children;

  if (profile?.role !== 'admin') {
    return children;
  }

  const mfaVerified = sessionStorage.getItem('admin_mfa_verified') === 'true';
  const mfaVerifiedUser = sessionStorage.getItem('admin_mfa_verified_user');
  const mfaVerifiedAt = Number(sessionStorage.getItem('admin_mfa_verified_at') || 0);
  const mfaFresh = mfaVerified && mfaVerifiedUser === profile?.id && (Date.now() - mfaVerifiedAt) < ADMIN_MFA_TTL_MS;
  const passkeyVerified = isAdminPasskeyVerifiedForUser(profile?.id);
  if (!mfaFresh && !passkeyVerified) {
    return <Navigate to="/admin-auth-choice" replace />;
  }

  return children;
};

export default RequireAdminMFA;
