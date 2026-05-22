import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, Check, Clock3, CreditCard, Gift, Sparkles, Ticket } from 'lucide-react';
import AlertModal from '../components/AlertModal';
import LoadingSpinner from '../components/LoadingSpinner';
import { trackPremiumEvent } from '../utils/growth';
import { normalizeCheckoutPlanTier } from '../utils/planCheckout';
import { logError } from '../utils/errorLogger';

const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || '';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const DEFAULT_URGENCY_DATE = '2026-04-15';
const DEFAULT_URGENCY_LABEL = 'April 15, 2026';
const createPaymentTag = () => `SP${Date.now().toString().slice(-8)}`;

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const normalizePlan = (plan, fallbackCost = 199, fallbackTierCosts = {}) => {
  const tier = plan?.tier === 'premium_plus' ? 'premium_plus' : 'premium';
  const tierFallbackCost = Number(fallbackTierCosts?.[tier] ?? fallbackCost) || fallbackCost;
  return {
    id: plan?.id || `plan_${plan?.tier || 'premium'}`,
    name: plan?.name || (plan?.tier === 'premium_plus' ? 'Premium Plus' : 'Premium'),
    tier,
    cost: Number(plan?.cost ?? tierFallbackCost) || tierFallbackCost,
    periodMonths: Number(plan?.periodMonths || 6) || 6,
    description: plan?.description || '',
    features: Array.isArray(plan?.features) ? plan.features.filter(Boolean) : [],
    isActive: plan?.isActive !== false,
    createdAt: plan?.createdAt || null,
  };
};

const pickLatestPlansByTier = (planList = []) => {
  const bestByTier = new Map();

  planList.forEach((plan) => {
    if (!plan?.isActive) return;
    const tier = plan.tier === 'premium_plus' ? 'premium_plus' : 'premium';
    const current = bestByTier.get(tier);
    const planTime = new Date(plan.createdAt || 0).getTime();
    const currentTime = new Date(current?.createdAt || 0).getTime();
    if (!current || planTime >= currentTime) {
      bestByTier.set(tier, plan);
    }
  });

  return Array.from(bestByTier.values()).sort((a, b) => {
    if (a.tier === b.tier) return 0;
    return a.tier === 'premium' ? -1 : 1;
  });
};

const buildPricing = (baseAmount, offer) => {
  if (!offer) {
    return {
      discountAmount: 0,
      finalAmount: roundMoney(baseAmount),
      isLifetimeFree: false,
    };
  }

  if (offer.is_lifetime_free || offer.discount_type === 'lifetime_free') {
    return {
      discountAmount: roundMoney(baseAmount),
      finalAmount: 0,
      isLifetimeFree: true,
    };
  }

  const rawValue = Number(offer.discount_value || 0);
  const discountAmount = offer.discount_type === 'percent'
    ? roundMoney((baseAmount * Math.min(Math.max(rawValue, 0), 100)) / 100)
    : roundMoney(Math.min(Math.max(rawValue, 0), baseAmount));

  return {
    discountAmount,
    finalAmount: roundMoney(Math.max(0, baseAmount - discountAmount)),
    isLifetimeFree: false,
  };
};

const getOfferLabel = (offer) => {
  if (!offer) return '';
  if (offer.is_lifetime_free || offer.discount_type === 'lifetime_free') return 'Lifetime Free';
  if (offer.discount_type === 'percent') return `${offer.discount_value}% off`;
  return `₹${offer.discount_value} off`;
};

const getOfferCode = (offer) =>
  String(offer?.coupon_code || offer?.title || offer?.coupon_name || '').trim();

const getOfferDisplayName = (offer) =>
  offer?.coupon_name || offer?.title || offer?.coupon_code || 'Coupon';

const getOfferApplicablePlan = (offer) => {
  const value = String(offer?.applicable_plan || 'both').trim();
  return value === 'premium' || value === 'premium_plus' ? value : 'both';
};

const isOfferApplicableToPlan = (offer, planTier) => {
  const applicablePlan = getOfferApplicablePlan(offer);
  return applicablePlan === 'both' || applicablePlan === normalizeCheckoutPlanTier(planTier);
};

const isOfferListed = (offer) => offer?.is_listed !== false;

const getOfferApplicablePlanLabel = (offer) => {
  const applicablePlan = getOfferApplicablePlan(offer);
  if (applicablePlan === 'premium') return 'Premium only';
  if (applicablePlan === 'premium_plus') return 'Premium Plus only';
  return 'Premium + Premium Plus';
};

const isOfferExpired = (offer) =>
  offer?.status === 'expired' || (offer?.valid_until && new Date(offer.valid_until) < new Date());
const escapeCouponSearchValue = (value) => String(value || '').replace(/[,%]/g, '');
const PLAN_FEATURES = {
  premium: [
    'Courses',
    'Write Test',
    'Certificates',
    'Resume Builder',
    'Live Classes',
    'Normal Support',
  ],
  premium_plus: [
    'Everything in Premium',
    'Ask a Doubt',
    'Mentoring Session Request',
    'Notes Library',
    'Priority Support',
    '2 Resume Reviews per Cycle',
    '1 Mock Interview per Month',
    'Monthly Personal Roadmap Update',
  ],
};
const getPlanFeatureList = (tier) =>
  tier === 'premium_plus' ? PLAN_FEATURES.premium_plus : PLAN_FEATURES.premium;

const UPI_APPS = [
  { id: 'gpay', label: 'Google Pay', packageName: 'com.google.android.apps.nbu.paisa.user' },
  { id: 'phonepe', label: 'PhonePe', packageName: 'com.phonepe.app' },
  { id: 'paytm', label: 'Paytm', packageName: 'net.one97.paytm' },
  { id: 'generic', label: 'Other UPI App', packageName: '' },
];

const getFunctionsErrorMessage = async (error, fallbackMessage) => {
  const baseMessage = error?.message || fallbackMessage;
  const response = error?.context;
  if (!response || typeof response.clone !== 'function') {
    return baseMessage;
  }

  try {
    const payload = await response.clone().json();
    if (payload?.error) return payload.error;
    if (payload?.message) return payload.message;
  } catch {
    try {
      const text = await response.clone().text();
      if (text) return text;
    } catch {
      return baseMessage;
    }
  }

  return baseMessage;
};

const callEdgeFunction = async (functionName, accessToken, body) => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    },
    body: JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Edge Function ${functionName} failed.`);
  }

  return payload;
};

const getFreshAccessToken = async () => {
  const { data: currentSessionData } = await supabase.auth.getSession();
  const currentToken = currentSessionData?.session?.access_token || '';
  const currentUserId = currentSessionData?.session?.user?.id || '';
  if (currentToken && currentUserId) {
    return currentToken;
  }

  try {
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshedData?.session?.access_token && refreshedData?.session?.user?.id) {
      return refreshedData.session.access_token;
    }
  } catch (error) {
    logError({ message: 'Session refresh failed during payment flow:', source: 'Payment', details: error })
  }

  throw new Error('Your login session has expired. Please log in again and retry payment.');
};

const Payment = () => {
  const { profile, fetchProfile, getPlanTier } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [premiumCost, setPremiumCost] = useState(null);
  const [premiumPlusCost, setPremiumPlusCost] = useState(null);
  const [plans, setPlans] = useState([]);
  const [selectedPlanTier, setSelectedPlanTier] = useState(() => normalizeCheckoutPlanTier(searchParams.get('plan')));
  const [urgencyBanner, setUrgencyBanner] = useState({
    effectiveDate: DEFAULT_URGENCY_DATE,
    label: DEFAULT_URGENCY_LABEL,
  });
  const [paymentGatewayMode, setPaymentGatewayMode] = useState('razorpay');
  const [pricingLoading, setPricingLoading] = useState(true);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offers, setOffers] = useState([]);
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [manualCouponCode, setManualCouponCode] = useState('');
  const [manualAppliedOffer, setManualAppliedOffer] = useState(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [successMessage, setSuccessMessage] = useState('Your premium access is now active.');
  const [paymentTag] = useState(() => createPaymentTag());
  const [manualRequestSummary, setManualRequestSummary] = useState(null);
  const [showUpiAppPicker, setShowUpiAppPicker] = useState(false);
  const [manualGatewayMode, setManualGatewayMode] = useState(false);
  const [premiumQr, setPremiumQr] = useState('');
  const [premiumPlusQr, setPremiumPlusQr] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);
  const [manualSubmitted, setManualSubmitted] = useState(false);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });
  const razorpayInstanceRef = useRef(null);
  const paymentAttemptRef = useRef({ paymentId: null, finalizing: false, finalized: false });
  const screenshotInputRef = useRef(null);

  const activePlans = useMemo(() => {
    if (plans.length > 0) return pickLatestPlansByTier(plans);
    return [
      normalizePlan({
        id: 'default_premium',
        name: 'Premium',
        tier: 'premium',
        cost: premiumCost || 199,
        periodMonths: 6,
        description: 'Courses, tests, certificates, resume builder, live classes, and normal support.',
        features: PLAN_FEATURES.premium,
      }, premiumCost || 199, {
        premium: premiumCost || 199,
        premium_plus: Math.max((premiumCost || 199) + 100, 299),
      }),
      normalizePlan({
        id: 'default_premium_plus',
        name: 'Premium Plus',
        tier: 'premium_plus',
        cost: premiumPlusCost || Math.max((premiumCost || 199) + 100, 299),
        periodMonths: 6,
        description: 'Add ask-a-doubt chat, mentoring requests, the separate notes library, and higher-touch support on top of Premium.',
        features: PLAN_FEATURES.premium_plus,
      }, premiumPlusCost || Math.max((premiumCost || 199) + 100, 299), {
        premium: premiumCost || 199,
        premium_plus: premiumPlusCost || Math.max((premiumCost || 199) + 100, 299),
      }),
    ];
  }, [plans, premiumCost, premiumPlusCost]);

  const selectedPlan = useMemo(
    () => activePlans.find((plan) => plan.tier === selectedPlanTier) || activePlans[0] || null,
    [activePlans, selectedPlanTier]
  );

  const selectedOffer = offers.find((offer) => offer.id === selectedOfferId) || manualAppliedOffer || null;
  const skillproBaseAmount = selectedPlanTier === 'premium_plus'
    ? (premiumPlusCost || Math.max((premiumCost || 199) + 100, 299))
    : (premiumCost || 199);
  const displayBaseAmount = paymentGatewayMode === 'skillpro_upi'
    ? skillproBaseAmount
    : (selectedPlan?.cost || premiumCost || 0);
  const pricing = buildPricing(displayBaseAmount, selectedOffer);
  const appliedCouponCode = getOfferCode(selectedOffer);
  const appliedCouponName = getOfferDisplayName(selectedOffer);
  const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent || '' : '';
  const hasTouchPoints = typeof window !== 'undefined' ? Number(window.navigator.maxTouchPoints || 0) > 1 : false;
  const isAndroidDevice = /android/i.test(userAgent);
  const isProbablyMobileDevice = typeof window !== 'undefined'
    ? /android|iphone|ipad|ipod|mobile/i.test(userAgent) || hasTouchPoints
    : false;
  const isDesktopDevice = !isProbablyMobileDevice;
  const currentPlanTier = getPlanTier(profile);
  const checkoutHeading =
    selectedPlanTier === 'premium_plus'
      ? currentPlanTier === 'premium'
        ? 'Upgrade to Premium Plus'
        : 'Buy Premium Plus'
      : currentPlanTier === 'free'
        ? 'Buy Premium'
        : 'Renew Premium';
  const checkoutSubheading =
    selectedPlanTier === 'premium_plus'
      ? currentPlanTier === 'premium'
        ? 'You already have Premium. Upgrade now to unlock Premium Plus support features.'
        : 'Choose Premium Plus to unlock limited high-value support.'
      : 'Choose your Premium plan, apply one coupon, and pay only the final amount.';

  useEffect(() => {
    const loadPricingConfig = async () => {
      try {
        const { data } = await supabase
          .from('settings')
          .select('key, value')
          .in('key', ['premium_cost', 'premium_plus_cost', 'public_plans', 'payment_urgency_banner', 'payment_gateway_mode']);

        const settingsMap = Object.fromEntries((data || []).map((item) => [item.key, item.value]));
        const parsedCost = parseInt(settingsMap.premium_cost, 10);
        const fallbackPremiumCost = Number.isFinite(parsedCost) ? parsedCost : 199;
        const parsedPremiumPlusCost = parseInt(settingsMap.premium_plus_cost, 10);
        const fallbackPremiumPlusCost = Number.isFinite(parsedPremiumPlusCost) ? parsedPremiumPlusCost : Math.max(fallbackPremiumCost + 100, 299);
        setPremiumCost(fallbackPremiumCost);
        setPremiumPlusCost(fallbackPremiumPlusCost);
        const mode = settingsMap.payment_gateway_mode === 'skillpro_upi' ? 'skillpro_upi' : settingsMap.payment_gateway_mode === 'manual' ? 'manual' : 'razorpay';
        setPaymentGatewayMode(mode);
        setManualGatewayMode(mode === 'manual');
        const tierCostMap = {
          premium: fallbackPremiumCost,
          premium_plus: fallbackPremiumPlusCost,
        };

        try {
          const parsedPlans = settingsMap.public_plans ? JSON.parse(settingsMap.public_plans) : [];
          const normalizedPlans = Array.isArray(parsedPlans)
            ? parsedPlans
                .filter((plan) => plan?.isActive)
                .map((plan) => normalizePlan(
                  {
                    ...plan,
                    cost: tierCostMap[plan?.tier === 'premium_plus' ? 'premium_plus' : 'premium'],
                  },
                  fallbackPremiumCost,
                  tierCostMap
                ))
            : [];
          setPlans(pickLatestPlansByTier(normalizedPlans));
        } catch {
          setPlans([]);
        }

        if (!settingsMap.public_plans) {
          setPlans([
            normalizePlan({
              id: 'default_premium',
              name: 'Premium',
              tier: 'premium',
              cost: fallbackPremiumCost,
              periodMonths: 6,
              description: 'Courses, tests, certificates, resume builder, live classes, and normal support.',
              features: PLAN_FEATURES.premium,
            }, fallbackPremiumCost, tierCostMap),
            normalizePlan({
              id: 'default_premium_plus',
              name: 'Premium Plus',
              tier: 'premium_plus',
              cost: fallbackPremiumPlusCost,
              periodMonths: 6,
              description: 'Add mentoring requests, the separate notes library, and higher-touch support on top of Premium.',
              features: PLAN_FEATURES.premium_plus,
            }, fallbackPremiumPlusCost, tierCostMap),
          ]);
        }

        try {
          const parsedBanner = settingsMap.payment_urgency_banner ? JSON.parse(settingsMap.payment_urgency_banner) : null;
          const effectiveDate = parsedBanner?.effectiveDate || DEFAULT_URGENCY_DATE;
          setUrgencyBanner({
            effectiveDate,
            label: parsedBanner?.label || new Date(effectiveDate).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }),
          });
        } catch {
          setUrgencyBanner({
            effectiveDate: DEFAULT_URGENCY_DATE,
            label: DEFAULT_URGENCY_LABEL,
          });
        }
      } catch (error) {
        logError({ message: 'Error loading payment pricing:', source: 'Payment', details: error })
        setPremiumCost(199);
        setPremiumPlusCost(299);
        setPlans([]);
      } finally {
        setPricingLoading(false);
      }
    };

    loadPricingConfig();
  }, []);

  useEffect(() => {
    if (paymentGatewayMode === 'manual') {
      const loadManualConfig = async () => {
        const { data } = await supabase
          .from('settings')
          .select('key, value')
          .in('key', ['manual_payment_qr_premium', 'manual_payment_qr_plus']);
        (data || []).forEach((setting) => {
          if (setting.key === 'manual_payment_qr_premium') setPremiumQr(setting.value || '');
          if (setting.key === 'manual_payment_qr_plus') setPremiumPlusQr(setting.value || '');
        });
      };
      loadManualConfig();
    }
  }, [paymentGatewayMode]);

  useEffect(() => {
    if (!selectedPlan && activePlans[0]) {
      setSelectedPlanTier(activePlans[0].tier);
    }
  }, [activePlans, selectedPlan]);

  useEffect(() => {
    setSelectedPlanTier(normalizeCheckoutPlanTier(searchParams.get('plan')));
  }, [searchParams]);

  useEffect(() => {
    if (!profile?.id || paymentGatewayMode !== 'manual') return;
    const checkManualPaymentStatus = async () => {
      const { data } = await supabase
        .from('payments')
        .select('status')
        .eq('user_id', profile.id)
        .eq('gateway', 'manual')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) {
        setManualSubmitted(false);
      } else if (data.status === 'pending') {
        setManualSubmitted(true);
      } else if (data.status === 'success' || data.status === 'failed') {
        setManualSubmitted(false);
      }
    };
    checkManualPaymentStatus();
  }, [profile?.id, paymentGatewayMode]);

  useEffect(() => {
    if (!profile?.id) return;
    trackPremiumEvent('payment_page_viewed', 'payment_page', {
      offerId: searchParams.get('offer') || null,
      planTier: selectedPlanTier,
      gatewayMode: paymentGatewayMode,
    }, profile.id);
  }, [profile?.id, searchParams, selectedPlanTier, paymentGatewayMode]);

  useEffect(() => {
    if (!profile?.id) return;

    const loadOffers = async () => {
      setOffersLoading(true);
      try {
        const [{ data: assignments }, { data: globalOffers }, { data: redemptions }] = await Promise.all([
          supabase
            .from('offer_assignments')
            .select('offers(*)')
            .eq('user_id', profile.id),
          supabase
            .from('offers')
            .select('*')
            .eq('applies_to_all', true),
          supabase
            .from('offer_redemptions')
            .select('offer_id, status')
            .eq('user_id', profile.id),
        ]);

        const assignedOffers = (assignments || []).map((entry) => entry.offers).filter(Boolean);
        const redeemedOfferIds = new Set(
          (redemptions || [])
            .filter((entry) => entry.status === 'redeemed')
            .map((entry) => entry.offer_id)
        );

        const deduped = [...assignedOffers, ...(globalOffers || [])].filter((offer, index, source) => {
          if (!offer) return false;
          return source.findIndex((candidate) => candidate?.id === offer.id) === index;
        });

        const activeOffers = deduped.filter((offer) => {
          const expired = offer.status === 'expired' || (offer.valid_until && new Date(offer.valid_until) < new Date());
          return !expired
            && !redeemedOfferIds.has(offer.id)
            && isOfferApplicableToPlan(offer, selectedPlanTier)
            && isOfferListed(offer);
        });

        setOffers(activeOffers);

        // Keep offers visible, but do not auto-apply them from the URL.
        // Users should explicitly choose a coupon before it affects the final payable amount.
      } catch (error) {
        logError({ message: 'Error loading offers:', source: 'Payment', details: error })
      } finally {
        setOffersLoading(false);
      }
    };

    loadOffers();
  }, [profile?.id, searchParams, selectedPlanTier]);

  useEffect(() => {
    const requestedOfferId = searchParams.get('offer');
    if (!requestedOfferId || offers.length === 0) return;

    const requestedOffer = offers.find((offer) => offer.id === requestedOfferId);
    if (!requestedOffer) return;

    setSelectedOfferId(requestedOffer.id);
    setManualAppliedOffer(null);
    setManualCouponCode(getOfferCode(requestedOffer));
  }, [offers, searchParams]);

  const applyManualCoupon = async () => {
    const normalizedCode = manualCouponCode.trim();
    if (!normalizedCode) {
      setAlertModal({
        show: true,
        title: 'Coupon Required',
        message: 'Enter a coupon code to apply it.',
        type: 'warning',
      });
      return;
    }

    const existingOffer = offers.find((offer) => {
      const codes = [offer?.coupon_code, offer?.title, offer?.coupon_name]
        .filter(Boolean)
        .map((value) => String(value).trim().toLowerCase());
      return codes.includes(normalizedCode.toLowerCase());
    });

    if (existingOffer) {
      setSelectedOfferId(existingOffer.id);
      setManualAppliedOffer(null);
      setManualCouponCode(getOfferCode(existingOffer) || normalizedCode);
      return;
    }

    setApplyingCoupon(true);
    try {
      const safeCode = escapeCouponSearchValue(normalizedCode);
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .or(`coupon_code.ilike.${safeCode},title.ilike.${safeCode},coupon_name.ilike.${safeCode}`)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data || isOfferExpired(data)) {
        throw new Error('Coupon not found or expired.');
      }
      if (!isOfferApplicableToPlan(data, selectedPlanTier)) {
        throw new Error(`This coupon is only valid for ${getOfferApplicablePlanLabel(data)}.`);
      }

      if (!data.applies_to_all) {
        const { data: assignment } = await supabase
          .from('offer_assignments')
          .select('offer_id')
          .eq('offer_id', data.id)
          .eq('user_id', profile.id)
          .maybeSingle();

        if (!assignment) {
          throw new Error('This coupon is not assigned to your account.');
        }
      }

      const { data: redemption } = await supabase
        .from('offer_redemptions')
        .select('id, status')
        .eq('offer_id', data.id)
        .eq('user_id', profile.id)
        .maybeSingle();

      if (redemption?.status === 'redeemed') {
        throw new Error('This coupon has already been redeemed.');
      }

      setSelectedOfferId('');
      setManualAppliedOffer(data);
      setManualCouponCode(getOfferCode(data) || normalizedCode);
      setAlertModal({
        show: true,
        title: 'Coupon Applied',
        message: `${getOfferDisplayName(data)} has been applied to this payment.`,
        type: 'success',
      });
    } catch (error) {
      setManualAppliedOffer(null);
      setAlertModal({
        show: true,
        title: 'Coupon Invalid',
        message: error.message || 'This coupon code could not be applied.',
        type: 'error',
      });
    } finally {
      setApplyingCoupon(false);
    }
  };

  const clearAppliedCoupon = () => {
    setSelectedOfferId('');
    setManualAppliedOffer(null);
    setManualCouponCode('');
  };

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const resetAttemptState = () => {
    paymentAttemptRef.current = { paymentId: null, finalizing: false, finalized: false };
  };

  const openDirectUpiApp = async (app) => {
    const directUpiLink = manualRequestSummary?.upi_link || '';
    if (!directUpiLink) return;
    const paymentId = manualRequestSummary?.payment_id;
    const paymentAppLabel = app?.label || app?.id || 'Other UPI App';
    if (paymentId) {
      getFreshAccessToken()
        .then((accessToken) =>
          callEdgeFunction('update-payment-request', accessToken, {
            payment_id: paymentId,
            payment_app: paymentAppLabel,
          })
        )
        .catch((error) => {
          logError({ message: 'Failed to save payment app selection:', source: 'Payment', details: error })
        });
    }
    if (isAndroidDevice && app?.packageName) {
      const intentUrl = `intent://${directUpiLink.replace(/^upi:\/\//, '')}#Intent;scheme=upi;package=${app.packageName};end`;
      window.location.href = intentUrl;
    } else {
      window.location.href = directUpiLink;
    }
    setShowUpiAppPicker(false);
  };

  const finalizePayment = async (payload, fallbackFailureMessage) => {
    if (!paymentAttemptRef.current.paymentId || paymentAttemptRef.current.finalizing || paymentAttemptRef.current.finalized) {
      return null;
    }

    paymentAttemptRef.current.finalizing = true;

    try {
      const accessToken = await getFreshAccessToken();

      const data = await callEdgeFunction('verify-payment', accessToken, {
        payment_id: paymentAttemptRef.current.paymentId,
        ...payload,
      });

      paymentAttemptRef.current.finalized = true;
      if (payload.status === 'success') {
        await fetchProfile(profile.id, { background: true });
      }
      return data;
    } catch (error) {
      logError({ message: 'Payment finalization failed:', source: 'Payment', details: error })
      if (payload.status === 'success') {
        setAlertModal({
          show: true,
          title: 'Payment Verification Failed',
          message: error.message || 'Payment was completed but verification failed. Please contact support.',
          type: 'error',
        });
      } else {
        setAlertModal({
          show: true,
          title: 'Payment Failed',
          message: fallbackFailureMessage || error.message || 'Your payment did not complete. Please try again.',
          type: 'error',
        });
      }
      return null;
    } finally {
      paymentAttemptRef.current.finalizing = false;
      setLoading(false);
      document.body.style.overflow = 'auto';
    }
  };

  const handleDirectActivationSuccess = async (data) => {
    await fetchProfile(profile.id, { background: true });
    setSuccessMessage(
      data?.is_lifetime_free
        ? `Your lifetime ${selectedPlan?.name || 'Premium'} access is active. No Razorpay payment was needed.`
        : `Your coupon covered the full amount. ${selectedPlan?.name || 'Premium'} is active now.`
    );
    setSuccess(true);
    setLoading(false);
    setSelectedOfferId('');
    setManualAppliedOffer(null);
    setManualCouponCode('');
    resetAttemptState();
  };

  const handleGatewaySuccess = async (response) => {
    const result = await finalizePayment(
      {
        status: 'success',
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      },
      'Payment verification failed.'
    );

    if (!result) return;

    setSuccessMessage(`Payment successful. ${selectedPlan?.name || 'Premium'} access is active now.`);
    setSuccess(true);
    setSelectedOfferId('');
    setManualAppliedOffer(null);
    setManualCouponCode('');
    resetAttemptState();
  };

  const handleGatewayFailure = async (error, defaultMessage = 'Your payment did not complete. Please try again.') => {
    const failureMessage = error?.description || error?.reason || error?.step || defaultMessage;

    await finalizePayment(
      {
        status: 'failed',
        razorpay_payment_id: error?.metadata?.payment_id || null,
        failure_reason: failureMessage,
      },
      failureMessage
    );

    resetAttemptState();
  };

  const handlePayment = async () => {
    if (paymentGatewayMode === 'manual' && pricing.finalAmount > 0) {
      if (manualSubmitted) {
        setAlertModal({ show: true, title: 'Already Submitted', message: 'Your payment request is already being verified by the SkillPro team.', type: 'info' });
        return;
      }
      setShowManualForm(true);
      return;
    }
    setLoading(true);

    try {
      const accessToken = await getFreshAccessToken();

      if (paymentGatewayMode === 'skillpro_upi' && isDesktopDevice) {
        setAlertModal({
          show: true,
          title: 'Pay On Mobile',
          message: 'UPI payment is available only on mobile. Please open this same account on your mobile and complete the payment there.',
          type: 'info',
        });
        setLoading(false);
        return;
      }

      const data = await callEdgeFunction('create-payment-order', accessToken, {
        offer_id: selectedOffer?.id || null,
        coupon_code: manualAppliedOffer && !selectedOfferId ? manualCouponCode.trim() || null : null,
        plan_tier: selectedPlanTier,
        payment_tag: paymentGatewayMode === 'skillpro_upi' ? paymentTag : null,
      });

      if (!data?.payment_id) {
        throw new Error('Payment record was not created.');
      }

      paymentAttemptRef.current = {
        paymentId: data.payment_id,
        finalizing: false,
        finalized: false,
      };

      if (data.mode === 'skillpro_upi') {
        setManualRequestSummary(data);
        setLoading(false);
        resetAttemptState();
        if (!isDesktopDevice) {
          setShowUpiAppPicker(true);
        }
        if (isDesktopDevice) {
          setAlertModal({
            show: true,
            title: 'Waiting for Admin Approval',
            message: `Your payment request for Rs ${data.amount} was recorded. Open this same account on your mobile and complete the UPI payment there. Premium will activate only after admin verifies and approves the payment.`,
            type: 'success',
          });
        }
        return;
      }

      if (data.mode === 'coupon' || Number(data.final_amount || 0) <= 0) {
        await handleDirectActivationSuccess(data);
        return;
      }

      const effectiveKeyId = data.key_id || RAZORPAY_KEY_ID;
      if (!effectiveKeyId) {
        throw new Error('Razorpay API key is missing.');
      }

      const options = {
        key: effectiveKeyId,
        amount: data.amount,
        currency: data.currency || 'INR',
        name: 'SkillPro',
        description: `${selectedPlan?.name || 'Premium'} Access - ${selectedPlan?.periodMonths || 6} Months`,
        image: '/skillpro-logo.png',
        order_id: data.order_id,
        handler: handleGatewaySuccess,
        prefill: {
          name: profile?.full_name || '',
          email: profile?.email || '',
          contact: profile?.phone || '',
        },
        notes: {
          user_id: profile?.id,
          local_payment_id: data.payment_id,
          coupon_code: data.coupon_code || '',
          plan_tier: selectedPlanTier,
        },
        theme: {
          color: '#2563eb',
        },
        modal: {
          escape: true,
          handleback: true,
          confirm_close: false,
          ondismiss: () => {
            handleGatewayFailure(null, 'Payment window was closed before completion.');
          },
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpayInstanceRef.current = razorpay;
      razorpay.on('payment.failed', (response) => {
        razorpayInstanceRef.current = null;
        handleGatewayFailure(response?.error, 'Razorpay reported a failed payment.');
      });
      razorpay.open();
    } catch (error) {
      logError({ message: 'Payment initialization error:', source: 'Payment', details: error })
      const baseMessage = error.message || 'Failed to initialize payment. Please try again.';
      const message = baseMessage.includes('Failed to send a request to the Edge Function')
          ? 'Payment service is not reachable right now. This usually means the Supabase Edge Functions are not deployed or the project connection is failing. Check and deploy `create-payment-order` and `verify-payment`, then try again.'
          : baseMessage;
      setAlertModal({
        show: true,
        title: 'Payment Error',
        message,
        type: 'error',
      });
      setLoading(false);
      resetAttemptState();
    }
  };

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="w-full max-w-3xl rounded-[2rem] border border-green-200 bg-[radial-gradient(circle_at_top,#dcfce7_0%,#ffffff_45%,#f8fafc_100%)] p-8 md:p-10 text-center shadow-2xl space-y-6">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto shadow-lg">
            <Check className="text-green-600" size={48} />
          </div>
          <div className="space-y-3">
            <p className="inline-flex items-center gap-2 rounded-full bg-green-100 px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-green-700">
              <Sparkles size={14} />
              Plan activated
            </p>
            <h1 className="text-4xl md:text-5xl font-bold text-green-800">Welcome to {selectedPlan?.name || 'Premium'}!</h1>
            <p className="text-slate-600 text-lg">{successMessage}</p>
            <p className="text-slate-500">Your selected plan is ready to use.</p>
          </div>
        </div>
      </div>
    );
  }

  if (pricingLoading || premiumCost === null || offersLoading) {
    return <LoadingSpinner message="Loading payment details..." />;
  }

  const buttonLabel = loading
    ? 'Processing...'
    : pricing.finalAmount > 0
      ? paymentGatewayMode === 'skillpro_upi'
        ? isDesktopDevice
          ? 'Pay On Mobile'
          : `Pay Rs ${pricing.finalAmount} via UPI`
        : paymentGatewayMode === 'manual'
          ? `Pay Rs ${pricing.finalAmount} via QR`
          : `Pay Rs ${pricing.finalAmount} for ${selectedPlan?.name || 'Premium'}`
      : `Activate ${selectedPlan?.name || 'Premium'} Now`;

  const handleManualPaymentSubmit = async () => {
    if (!transactionId.trim()) {
      setAlertModal({ show: true, title: 'Required', message: 'Please enter your UPI transaction ID.', type: 'warning' });
      return;
    }

    if (!screenshotFile) {
      setAlertModal({ show: true, title: 'Required', message: 'Please upload a payment screenshot.', type: 'warning' });
      return;
    }

    setSubmittingManual(true);
    try {
      const accessToken = await getFreshAccessToken();

      let screenshotUrl = '';
      const fileExt = screenshotFile.name.split('.').pop();
      const fileName = `manual_payment_${profile?.id}_${Date.now()}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('payment-screenshots')
        .upload(fileName, screenshotFile, {
          cacheControl: '3600',
          upsert: false,
        });
      if (uploadError) {
        logError({ message: 'Screenshot upload error:', source: 'Payment', details: uploadError })
        screenshotUrl = screenshotPreview;
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('payment-screenshots')
          .getPublicUrl(fileName);
        screenshotUrl = publicUrl;
      }

      const planCode = selectedPlanTier === 'premium_plus' ? 'premium_plus' : 'premium';
      const months = selectedPlan?.periodMonths || 6;

      let adminEmail = '';
      const { data: adminEmailData } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'manual_payment_admin_email')
        .maybeSingle();
      if (adminEmailData?.value) {
        adminEmail = adminEmailData.value;
      }

      const result = await callEdgeFunction('create-manual-payment', accessToken, {
        plan_code: `${planCode}_${months}months`,
        base_amount: displayBaseAmount,
        discount_amount: pricing.discountAmount,
        final_amount: pricing.finalAmount,
        currency: 'INR',
        coupon_offer_id: selectedOffer?.id || null,
        coupon_code: appliedCouponCode || null,
        metadata: {
          transaction_id: transactionId.trim(),
          screenshot_url: screenshotUrl,
          plan_label: selectedPlan?.name || (selectedPlanTier === 'premium_plus' ? 'Premium Plus' : 'Premium'),
          plan_tier: planCode,
          plan_months: months,
          coupon_name: appliedCouponName || '',
          coupon_code: appliedCouponCode || '',
          admin_email: adminEmail,
        },
      });

      setManualSubmitted(true);
      setAlertModal({
        show: true,
        title: 'Payment Submitted',
        message: 'Your manual payment response has been submitted. The SkillPro team is verifying your request. You will be notified once your payment is confirmed.',
        type: 'success',
      });

      setTransactionId('');
      setScreenshotFile(null);
      setScreenshotPreview('');
      setShowManualForm(false);
      setShowUpiAppPicker(false);
      fetchProfile();
    } catch (error) {
      setAlertModal({
        show: true, title: 'Submission Failed',
        message: error.message || 'Failed to submit payment response. Please try again.',
        type: 'error',
      });
    } finally {
      setSubmittingManual(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{checkoutHeading}</h1>
        <p className="text-slate-500">{checkoutSubheading}</p>
      </div>

      {manualSubmitted && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
          <Clock3 className="mx-auto text-amber-600" size={48} />
          <h2 className="mt-4 text-xl font-bold text-amber-800">Request Submitted</h2>
          <p className="mt-2 text-amber-700">
            Your payment request has been submitted. The SkillPro team will contact you soon.
          </p>
          <p className="mt-2 text-sm text-amber-600">
            You already have a pending application. A new submission is not allowed until the current one is resolved.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
        <div className="flex items-start gap-3">
          <Clock3 className="mt-0.5 text-rose-600" size={18} />
          <div>
            <p className="font-semibold">Price update notice</p>
            <p className="text-sm mt-1">
              Current launch pricing is live now. Plan prices change on {urgencyBanner.label}, so booking before that date locks the lower rate.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
        <div className="grid gap-4 md:grid-cols-2">
          {activePlans.map((plan) => {
            const isSelected = selectedPlan?.tier === plan.tier;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanTier(plan.tier)}
                className={`rounded-2xl border p-6 text-left transition-all ${
                  isSelected
                    ? plan.tier === 'premium_plus'
                      ? 'border-indigo-500 bg-gradient-to-br from-indigo-600 to-slate-900 text-white shadow-xl'
                      : 'border-amber-400 bg-gradient-to-br from-gold-400 to-gold-600 text-white shadow-xl'
                    : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                      {plan.tier === 'premium_plus' ? 'Advanced Access' : 'Core Access'}
                    </p>
                    <h2 className="mt-2 text-2xl font-bold">{plan.name}</h2>
                    <p className={`mt-2 text-sm ${isSelected ? 'text-white/80' : 'text-slate-600'}`}>
                      {plan.tier === 'premium_plus'
                        ? 'Add ask-a-doubt chat, mentoring requests, the separate notes library, and higher-touch support on top of Premium.'
                        : 'Courses, tests, certificates, resume builder preview, live classes, and normal support.'}
                    </p>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-xs font-semibold ${isSelected ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    {isSelected ? 'Selected' : 'Choose'}
                  </div>
                </div>
                <div className="mt-6">
                  <div className="text-4xl font-bold">₹{plan.cost}</div>
                  <p className={`mt-1 text-sm ${isSelected ? 'text-white/75' : 'text-slate-500'}`}>
                    {plan.periodMonths || 6} months access
                  </p>
                </div>
                <div className="mt-6 space-y-2">
                  {getPlanFeatureList(plan.tier).map((feature, index) => (
                    <FeatureItem key={`${plan.id}-${index}`} text={feature} dim={!isSelected} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Selected Plan</h3>
            <p className="mt-2 text-2xl font-bold text-slate-900">{selectedPlan?.name || 'Premium'}</p>
            <p className="mt-1 text-sm text-slate-500">
              {selectedPlan?.tier === 'premium_plus'
                ? 'Includes Premium plus ask-a-doubt chat, mentoring requests, the separate notes library, and higher-touch support.'
                : 'Includes courses, tests, certificates, resume builder preview, live classes, and normal support.'}
            </p>
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-500">Base price</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Gateway: {paymentGatewayMode === 'skillpro_upi' ? 'SkillPro UPI' : paymentGatewayMode === 'manual' ? 'Manual' : 'Razorpay'}
              </p>
              <p className="text-3xl font-bold text-slate-900">₹{displayBaseAmount}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center gap-2 text-emerald-800 font-semibold">
              <Gift size={18} />
              Referral reward
            </div>
            <p className="mt-2 text-sm text-emerald-900">
              Refer one paying friend and get 7 premium days automatically after their payment succeeds.
            </p>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-center gap-2 text-blue-800 font-semibold">
              <Sparkles size={18} />
              Upgrade advantage
            </div>
            <p className="mt-2 text-sm text-blue-900">
              Premium covers the core learning flow. Premium Plus adds ask-a-doubt chat, mentoring requests, the separate notes library, and higher-touch support.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border space-y-4">
        <div className="flex items-center gap-2">
          <Ticket className="text-pink-600" size={20} />
          <h3 className="text-lg font-bold text-slate-900">Coupon Selection</h3>
        </div>
        <p className="text-sm text-slate-500">Only one coupon can be used in a payment.</p>

        <label className="flex items-center gap-3 rounded-lg border p-4 cursor-pointer">
          <input
            type="radio"
            name="coupon"
            checked={!selectedOfferId && !manualAppliedOffer}
            onChange={clearAppliedCoupon}
          />
          <div>
            <p className="font-semibold text-slate-900">No coupon</p>
            <p className="text-sm text-slate-500">Pay the full selected plan amount.</p>
          </div>
        </label>

        <div className="rounded-lg border border-slate-200 p-4">
          <p className="font-semibold text-slate-900">Have a coupon code?</p>
          <p className="mt-1 text-sm text-slate-500">Enter it manually and apply the matching discount.</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={manualCouponCode}
              onChange={(event) => {
                setManualCouponCode(event.target.value);
                if (manualAppliedOffer) setManualAppliedOffer(null);
                if (selectedOfferId) setSelectedOfferId('');
              }}
              placeholder="Enter coupon code"
              className="flex-1 rounded-lg border border-slate-300 px-4 py-3"
            />
            <button
              type="button"
              onClick={applyManualCoupon}
              disabled={applyingCoupon}
              className="rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {applyingCoupon ? 'Applying...' : 'Apply Coupon'}
            </button>
          </div>
          {manualAppliedOffer ? (
            <p className="mt-3 text-sm text-emerald-700">
              Applied: {manualAppliedOffer.coupon_name || manualAppliedOffer.title} ({getOfferLabel(manualAppliedOffer)})
            </p>
          ) : null}
        </div>

        {offers.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
            No active coupons are listed for your account right now. You can still try a coupon code above.
          </div>
        ) : (
          <div className="space-y-3">
            {offers.map((offer) => (
              <label key={offer.id} className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:border-pink-300">
                <input
                  type="radio"
                  name="coupon"
                  checked={selectedOfferId === offer.id}
                  onChange={() => {
                    setSelectedOfferId(offer.id);
                    setManualAppliedOffer(null);
                    setManualCouponCode(getOfferCode(offer));
                  }}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{getOfferDisplayName(offer)}</p>
                    <span className="rounded-full bg-pink-100 px-3 py-1 text-xs font-semibold text-pink-700">
                      {getOfferLabel(offer)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{offer.description || 'Coupon discount applied at checkout.'}</p>
                  <p className="mt-2 text-xs font-medium text-slate-500">
                    Valid for: {getOfferApplicablePlanLabel(offer)}
                  </p>
                  <p className="mt-2 inline-flex max-w-full items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 break-all">
                    Coupon code: {getOfferCode(offer) || 'Unavailable'}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">
                    {offer.valid_until ? `Valid till ${new Date(offer.valid_until).toLocaleDateString('en-IN')}` : 'No expiry date'}
                  </p>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl p-6 border">
        <h3 className="text-lg font-bold mb-4">Payable Summary</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between text-slate-600">
            <span>{selectedPlan?.name || 'Premium'} amount</span>
            <span>₹{roundMoney(displayBaseAmount)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>Coupon discount</span>
            <span>- Rs {pricing.discountAmount}</span>
          </div>
          {selectedOffer ? (
            <div className="rounded-lg border border-pink-200 bg-pink-50 p-3 text-sm text-pink-900">
              <p className="font-semibold">Applied coupon: {appliedCouponName}</p>
              <p className="mt-1 break-all text-xs text-pink-800">Code: {appliedCouponCode || 'Unavailable'}</p>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t pt-3 text-lg font-bold text-slate-900">
            <span>Final payable amount</span>
            <span>₹{pricing.finalAmount}</span>
          </div>
          {pricing.isLifetimeFree && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
              This coupon gives lifetime premium. Online payment will be skipped and access will activate immediately.
            </div>
          )}
          {!pricing.isLifetimeFree && pricing.finalAmount <= 0 && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
              Your coupon covers the full amount. No online payment is required.
            </div>
          )}
          {paymentGatewayMode === 'skillpro_upi' ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Premium stays pending after the request is created. It will activate only after admin verifies the payment and approves it.
            </div>
          ) : null}
          {paymentGatewayMode === 'manual' ? (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900">
              Scan the QR code and make the payment. After paying, submit your transaction ID and screenshot. Premium will activate after admin verification.
            </div>
          ) : null}
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <CreditCard className="text-blue-600" size={20} />
          Payment Processing
        </h3>

        {paymentGatewayMode === 'razorpay' && !RAZORPAY_KEY_ID && pricing.finalAmount > 0 && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-yellow-800">
              Razorpay client key is missing. Add <code className="bg-yellow-100 px-1 rounded">VITE_RAZORPAY_KEY_ID</code> to enable paid checkouts.
            </p>
          </div>
        )}

        <div className="mb-4 space-y-2 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <Check className="text-green-600" size={16} />
            <span>
              {paymentGatewayMode === 'skillpro_upi'
                ? 'The amount is fixed by admin for the selected plan and cannot be edited'
                : paymentGatewayMode === 'manual'
                  ? 'Pay the exact amount via UPI QR code'
                  : 'Only the final discounted amount is sent to Razorpay'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="text-green-600" size={16} />
            <span>Successful and failed payment attempts are both stored</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="text-green-600" size={16} />
            <span>Redeemed coupons cannot be used again</span>
          </div>
          {paymentGatewayMode === 'skillpro_upi' ? (
            <div className="flex items-center gap-2">
              <Clock3 className="text-amber-600" size={16} />
              <span>SkillPro UPI requests stay in waiting for admin approval until admin verifies the payment</span>
            </div>
          ) : null}
        </div>

        {paymentGatewayMode === 'skillpro_upi' && pricing.finalAmount > 0 && (
        <div className="mb-4 space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-emerald-900">Amount</label>
                <input
                  type="text"
                  value={`Rs ${pricing.finalAmount}`}
                  readOnly
                  className="w-full rounded-lg border border-emerald-300 bg-white px-4 py-3 text-slate-900"
                />
              </div>
              <div className="rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-900">
                <p className="font-semibold">Private payment launch</p>
                <p className="mt-1">Receiver number and other identifiers stay hidden in this panel.</p>
              </div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-900">
              <p><span className="font-semibold">Payment Tag:</span> {paymentTag}</p>
            </div>
            {isDesktopDevice ? (
              <div className="rounded-lg border border-emerald-200 bg-white px-4 py-4 text-sm text-emerald-900">
                Open this same account on your mobile and use the UPI app there. Desktop does not create the payment request.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-900">
                  Mobile flow opens your UPI app with the exact admin-set amount while keeping receiver details private in this panel.
                </div>
              </div>
            )}
            {manualRequestSummary ? null : null}
          </div>
        )}

        {paymentGatewayMode === 'manual' && pricing.finalAmount > 0 && !showManualForm && !manualSubmitted && (
          <div className="mb-4 space-y-4 rounded-xl border border-purple-200 bg-purple-50 p-4">
            <h4 className="font-bold text-purple-900 text-lg">Pay via QR Code</h4>

            <div className="flex justify-center">
              {selectedPlanTier === 'premium_plus' && premiumPlusQr ? (
                <img src={premiumPlusQr} alt="Premium Plus QR" className="max-w-[250px] rounded-lg border bg-white p-2" />
              ) : selectedPlanTier === 'premium' && premiumQr ? (
                <img src={premiumQr} alt="Premium QR" className="max-w-[250px] rounded-lg border bg-white p-2" />
              ) : (
                <div className="p-8 bg-white rounded-lg border-2 border-dashed text-center text-slate-400">
                  QR code not configured. Please contact support.
                </div>
              )}
            </div>

            {selectedOffer ? (
              <div className="rounded-lg border border-pink-200 bg-pink-50 p-3 text-sm text-pink-900">
                <p className="font-semibold">Applied coupon: {appliedCouponName}</p>
                <p className="mt-1 break-all text-xs text-pink-800">Code: {appliedCouponCode || 'Unavailable'}</p>
              </div>
            ) : null}

            <div className="text-center">
              <p className="text-sm text-purple-700">Final Amount to Pay</p>
              <p className="text-3xl font-bold text-purple-900">₹{pricing.finalAmount}</p>
            </div>

            <button
              type="button"
              onClick={() => setShowManualForm(true)}
              className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 font-semibold"
            >
              Next
            </button>
          </div>
        )}

        {paymentGatewayMode === 'manual' && showManualForm && !manualSubmitted && (
          <div className="mb-4 space-y-4 rounded-xl border border-purple-200 bg-purple-50 p-4">
            <h4 className="font-bold text-purple-900 text-lg">Submit Payment Details</h4>
            <p className="text-sm text-purple-700">Enter your UPI transaction ID and upload a screenshot of the payment.</p>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">UPI Transaction ID <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="e.g. 123456789012"
                className="w-full p-3 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Payment Screenshot <span className="text-red-500">*</span></label>
              <input
                ref={screenshotInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setScreenshotFile(file);
                    const reader = new FileReader();
                    reader.onload = (ev) => setScreenshotPreview(ev.target.result);
                    reader.readAsDataURL(file);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => screenshotInputRef.current?.click()}
                className="w-full p-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-purple-400 hover:text-purple-600"
              >
                {screenshotPreview ? 'Change Screenshot' : 'Upload Screenshot'}
              </button>
              {screenshotPreview && (
                <div className="mt-2">
                  <img src={screenshotPreview} alt="Screenshot preview" className="max-w-[200px] rounded-lg border" />
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowManualForm(false); setTransactionId(''); setScreenshotFile(null); setScreenshotPreview(''); }}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleManualPaymentSubmit}
                disabled={submittingManual || !transactionId.trim() || !screenshotFile}
                className="flex-1 px-4 py-2.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-60"
              >
                {submittingManual ? 'Submitting...' : 'Submit Payment Response'}
              </button>
            </div>
          </div>
        )}

        {paymentGatewayMode === 'manual' && pricing.finalAmount <= 0 && !manualSubmitted && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-700">
            <p className="font-semibold">Coupon covers the full amount.</p>
            <p className="mt-1">Your coupon covers the entire plan cost. No QR payment needed.</p>
          </div>
        )}

        {paymentGatewayMode !== 'manual' ? (
        <button
          onClick={handlePayment}
          disabled={loading || (paymentGatewayMode === 'razorpay' && pricing.finalAmount > 0 && !RAZORPAY_KEY_ID)}
          onMouseDown={() => trackPremiumEvent('payment_attempt_started', 'payment_page', {
            finalAmount: pricing.finalAmount,
            offerId: selectedOfferId || null,
            planTier: selectedPlanTier,
            gatewayMode: paymentGatewayMode,
          }, profile?.id || null)}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold transition-all"
        >
          {buttonLabel}
        </button>
        ) : null}
      </div>

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => {
          setAlertModal({ show: false, title: '', message: '', type: 'info' });
          setLoading(false);
        }}
      />

      {showUpiAppPicker ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 sm:p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">Choose UPI App</h3>
            <p className="mt-2 text-sm text-slate-600">
              Amount is locked by admin and receiver details stay private in this flow.
            </p>
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 sm:p-4 text-sm text-emerald-900">
              <p><span className="font-semibold">Amount:</span> Rs {pricing.finalAmount}</p>
              <p>Receiver details are sent privately to the selected UPI app.</p>
            </div>
            <div className="mt-5 space-y-3">
              {UPI_APPS.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => openDirectUpiApp(app)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-left font-semibold text-slate-900 hover:bg-slate-50"
                >
                  {app.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowUpiAppPicker(false)}
              className="mt-4 w-full rounded-lg bg-slate-100 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

  const FeatureItem = ({ text, dim = false }) => (
  <div className="flex items-center gap-2">
    <Check className={dim ? 'text-slate-500' : 'text-gold-100'} size={18} />
    <span className={dim ? 'text-slate-700' : 'text-white'}>{text}</span>
  </div>
);

export default Payment;


