import { supabase } from '../supabaseClient';

const PENDING_REFERRAL_KEY = 'SucessKart_pending_referral_code';

const sanitizeCode = (value) =>
  String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16);

const generateReferralCode = (fullName, userId) => {
  const nameSeed = String(fullName || 'SucessKart')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 5)
    .padEnd(5, 'X');
  const idSeed = String(userId || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(-6)
    .padStart(6, '0');
  return `${nameSeed}${idSeed}`;
};

export const savePendingReferralCode = (code) => {
  const nextCode = sanitizeCode(code);
  if (!nextCode) return;
  try {
    localStorage.setItem(PENDING_REFERRAL_KEY, nextCode);
  } catch {
    // ignore
  }
};

export const readPendingReferralCode = () => {
  try {
    return sanitizeCode(localStorage.getItem(PENDING_REFERRAL_KEY));
  } catch {
    return '';
  }
};

export const clearPendingReferralCode = () => {
  try {
    localStorage.removeItem(PENDING_REFERRAL_KEY);
  } catch {
    // ignore
  }
};

export const ensureReferralCode = async (userId, fullName) => {
  if (!userId) return null;
  const { data: existing, error: existingError } = await supabase
    .from('referral_codes')
    .select('code')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.code) return existing.code;

  const code = generateReferralCode(fullName, userId);
  const { error } = await supabase
    .from('referral_codes')
    .upsert({
      user_id: userId,
      code,
      is_active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

  if (error) throw error;
  return code;
};

export const attachPendingReferral = async (referredUserId, referredEmail) => {
  const referralCode = readPendingReferralCode();
  if (!referredUserId || !referralCode) return false;

  const { data: refCodeRow, error: codeError } = await supabase
    .from('referral_codes')
    .select('user_id, code, is_active')
    .eq('code', referralCode)
    .maybeSingle();

  if (codeError) throw codeError;
  if (!refCodeRow?.user_id || refCodeRow.user_id === referredUserId || refCodeRow.is_active === false) {
    return false;
  }

  const payload = {
    referrer_user_id: refCodeRow.user_id,
    referred_user_id: referredUserId,
    referred_email: referredEmail || null,
    referral_code: referralCode,
    status: 'joined',
    reward_type: 'premium_days',
    reward_days: 7,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('referrals')
    .upsert(payload, { onConflict: 'referrer_user_id,referred_user_id' });

  if (error) throw error;
  clearPendingReferralCode();
  return true;
};
