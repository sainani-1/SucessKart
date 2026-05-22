import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { CreditCard, Calendar, Check, X, AlertCircle, Gift, TrendingUp, Lock, Unlock } from 'lucide-react';
import { Link } from 'react-router-dom';
import usePopup from '../hooks/usePopup';
import LoadingSpinner from '../components/LoadingSpinner';
import PremiumGiftCelebration from '../components/PremiumGiftCelebration';
import { getPremiumPlanType, hasPremiumAccess, isLifetimePremium, formatPremiumLabel, getPremiumDaysRemaining, isPremiumExpiringSoon } from '../utils/premium';
import { buildPlanCheckoutPath } from '../utils/planCheckout';
import { logError } from '../utils/errorLogger';

const PremiumStatus = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [premiumDetails, setPremiumDetails] = useState(null);
  const [gifts, setGifts] = useState([]);
  const [showGiftAnim, setShowGiftAnim] = useState(false);
  const [selectedGift, setSelectedGift] = useState(null);
  const [premiumCost, setPremiumCost] = useState(199);
  const [premiumPlusCost, setPremiumPlusCost] = useState(299);
  const [redeemedOfferIds, setRedeemedOfferIds] = useState(new Set());
  const { popupNode, openPopup } = usePopup();

  useEffect(() => {
    loadData();
  }, [profile?.id]);

  const loadData = async () => {
    if (!profile?.id) return;

    try {
      setLoading(true);

      const { data: settingsData, error: settingsError } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['premium_cost', 'premium_plus_cost']);

      if (!settingsError && settingsData) {
        const settingsMap = Object.fromEntries((settingsData || []).map((row) => [row.key, row.value]));
        setPremiumCost(parseInt(settingsMap.premium_cost, 10) || 199);
        setPremiumPlusCost(parseInt(settingsMap.premium_plus_cost, 10) || 299);
      }

      const { data: payments, error: paymentError } = await supabase
        .from('payments')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      const successfulPayments = (payments || []).filter((payment) => payment.status === 'success');

      if (!paymentError) {
        setPaymentHistory(payments || []);
      }

      const { data: assignments, error: assignmentsError } = await supabase
        .from('offer_assignments')
        .select('*, offers(*)')
        .eq('user_id', profile.id);

      if (assignmentsError) {
        logError({ message: 'Error loading assigned offers:', source: 'PremiumStatus', details: assignmentsError })
      }

      const assignedOffers = (assignments || []).map((assignment) => assignment.offers);

      const { data: globalOffers, error: globalOffersError } = await supabase
        .from('offers')
        .select('*')
        .eq('applies_to_all', true);

      if (globalOffersError) {
        logError({ message: 'Error loading global offers:', source: 'PremiumStatus', details: globalOffersError })
      }

      const { data: redemptions } = await supabase
        .from('offer_redemptions')
        .select('offer_id, status')
        .eq('user_id', profile.id);

      const allOffers = [...assignedOffers, ...(globalOffers || [])];
      const uniqueOffers = allOffers.filter((offer, idx, arr) =>
        offer && offer.is_listed !== false && arr.findIndex((item) => item.id === offer.id) === idx
      );

      setGifts(uniqueOffers);
      setRedeemedOfferIds(new Set((redemptions || []).filter((row) => row.status === 'redeemed').map((row) => row.offer_id)));

      const isPrem = hasPremiumAccess(profile);

      if (isPrem) {
        const lifetime = isLifetimePremium(profile.premium_until);
        const daysRemaining = getPremiumDaysRemaining(profile.premium_until);
        const planType = getPremiumPlanType(profile);

        setPremiumDetails({
          isActive: true,
          expiryDate: new Date(profile.premium_until),
          daysRemaining,
          isLifetime: lifetime,
          planType,
          grantedBy: successfulPayments.length > 0 ? 'paid' : (uniqueOffers.length > 0 ? 'gift' : 'admin'),
        });
      } else {
        setPremiumDetails({
          isActive: false,
          expiryDate: null,
          daysRemaining: 0,
          isLifetime: false,
          planType: 'free',
          grantedBy: null,
        });
      }
    } catch (error) {
      logError({ message: 'Error loading premium details:', source: 'PremiumStatus', details: error })
      openPopup('Error', 'Failed to load premium details', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {popupNode}

      <div className="bg-gradient-to-r from-purple-600 to-blue-700 p-6 rounded-xl text-white">
        <h1 className="text-2xl font-bold mb-1">Premium Membership</h1>
        <p className="text-purple-100">Manage your subscription and payment details</p>
      </div>

      <div
        className={`rounded-xl p-8 shadow-lg ${
          premiumDetails?.isActive
            ? 'bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-green-400'
            : 'bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-300'
        }`}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              {premiumDetails?.isActive ? 'Premium Active' : 'Free Plan'}
            </h2>
            <p className={`text-lg font-semibold ${premiumDetails?.isActive ? 'text-green-700' : 'text-slate-600'}`}>
              {premiumDetails?.isActive ? 'You have full access to all features' : 'Upgrade to unlock all features'}
            </p>
          </div>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${premiumDetails?.isActive ? 'bg-green-400' : 'bg-slate-400'}`}>
            {premiumDetails?.isActive ? <Unlock className="text-white" size={32} /> : <Lock className="text-white" size={32} />}
          </div>
        </div>

        {premiumDetails?.isActive && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4 border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="text-green-600" size={20} />
                  <span className="text-sm text-slate-600 font-semibold">EXPIRY DATE</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {premiumDetails.isLifetime ? 'Lifetime' : formatPremiumLabel(premiumDetails.expiryDate, 'en-IN')}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {premiumDetails.isLifetime ? 'No expiry' : `${premiumDetails.daysRemaining} days remaining`}
                </p>
              </div>

              <div className="bg-white rounded-lg p-4 border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="text-blue-600" size={20} />
                  <span className="text-sm text-slate-600 font-semibold">STATUS</span>
                </div>
                <p className="text-2xl font-bold text-blue-600">
                  {premiumDetails.isLifetime || !isPremiumExpiringSoon(premiumDetails.expiryDate, 5) ? 'Active' : 'Expiring Soon'}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {premiumDetails.isLifetime
                    ? 'Your lifetime membership is active'
                    : premiumDetails.daysRemaining > 0
                      ? 'Your membership is active'
                      : 'Membership expired'}
                </p>
              </div>

              <div className="bg-white rounded-lg p-4 border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  {premiumDetails.grantedBy === 'paid'
                    ? <CreditCard className="text-purple-600" size={20} />
                    : <Gift className="text-pink-600" size={20} />}
                  <span className="text-sm text-slate-600 font-semibold">GRANT TYPE</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {premiumDetails.grantedBy === 'paid' ? 'Paid' : 'By Admin'}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {premiumDetails.grantedBy === 'paid' ? 'Payment received' : 'Admin granted'}
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-700">
                  Plan: {premiumDetails.planType === 'premium_plus' ? 'Premium Plus' : 'Premium'}
                </p>
              </div>
            </div>

            {!premiumDetails.isLifetime && premiumDetails.daysRemaining !== null && premiumDetails.daysRemaining <= 5 && (
              <Link
                to={buildPlanCheckoutPath('premium_plus')}
                className="block mt-4 bg-blue-600 text-white py-3 rounded-lg font-semibold text-center hover:bg-blue-700 transition-colors"
              >
                {premiumDetails.planType === 'premium_plus'
                  ? `Renew Premium Plus for Rs ${premiumPlusCost}`
                  : `Upgrade to Premium Plus for Rs ${premiumPlusCost}`}
              </Link>
            )}
          </div>
        )}

        {!premiumDetails?.isActive && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg p-6 border border-slate-300">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Premium Features</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Check className="text-green-600" size={20} />
                  <span className="text-slate-700">Access to 50+ premium courses</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="text-green-600" size={20} />
                  <span className="text-slate-700">Download course materials</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="text-green-600" size={20} />
                  <span className="text-slate-700">Take certification exams</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="text-green-600" size={20} />
                  <span className="text-slate-700">Live classes (9-10 AM, 5-6 PM)</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="text-green-600" size={20} />
                  <span className="text-slate-700">Direct teacher support</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="text-green-600" size={20} />
                  <span className="text-slate-700">Career guidance sessions</span>
                </div>
              </div>
            </div>

            <Link
              to={buildPlanCheckoutPath('premium')}
              className="block bg-blue-600 text-white py-3 rounded-lg font-semibold text-center hover:bg-blue-700 transition-colors"
            >
              Buy Premium - Just Rs {premiumCost}
            </Link>
          </div>
        )}
      </div>

      {paymentHistory.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <h3 className="text-xl font-bold text-slate-900 mb-6">Payment History</h3>
          <div className="space-y-4">
            {paymentHistory.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${payment.status === 'success' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {payment.status === 'success'
                      ? <Check className="text-green-600" size={24} />
                      : <X className="text-red-600" size={24} />}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      Rs {payment.amount} - {payment.status === 'success' ? 'Successful' : 'Failed'}
                    </p>
                    <p className="text-sm text-slate-500">
                      {new Date(payment.created_at).toLocaleDateString()} at {new Date(payment.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-600">Valid until</p>
                  <p className="font-semibold text-slate-900">
                    {payment.valid_until ? new Date(payment.valid_until).toLocaleDateString() : '-'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {gifts.length > 0 && (
        <div className="bg-pink-50 border border-pink-200 rounded-lg p-6 mt-8">
          <h3 className="text-xl font-bold text-pink-700 mb-4 flex items-center gap-2">
            <Gift className="text-pink-600" size={24} />
            Received Gifts
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {gifts.map((gift) => (
              <div key={gift.id} className="bg-white rounded-lg border border-pink-200 p-4 shadow flex flex-col gap-2">
                <div className="flex items-center gap-2 mb-1">
                  <Gift className="text-pink-500" size={20} />
                  <span className="font-semibold text-pink-700">Coupon: {gift.coupon_code}</span>
                </div>
                <div className="text-slate-700 text-sm">
                  Discount: {gift.is_lifetime_free ? 'Lifetime Free' : (gift.discount_type === 'percent' ? `${gift.discount_value ?? 'N/A'}%` : (gift.discount_type === 'flat' ? `Rs ${gift.discount_value ?? 'N/A'}` : 'No discount'))}
                </div>
                <div className="text-xs text-slate-500">
                  Valid Until: {gift.valid_until ? new Date(gift.valid_until).toLocaleDateString() : '-'}
                </div>
                <div className={`text-xs font-semibold ${gift.status === 'expired' || (gift.valid_until && new Date(gift.valid_until) < new Date()) ? 'text-red-600' : 'text-green-600'}`}>
                  Status: {redeemedOfferIds.has(gift.id) ? 'Redeemed' : (gift.status === 'expired' || (gift.valid_until && new Date(gift.valid_until) < new Date()) ? 'Expired' : 'Active')}
                </div>
                <button
                  className="mt-2 bg-pink-500 text-white rounded px-3 py-1 font-semibold hover:bg-pink-600 transition-all"
                  onClick={() => {
                    setSelectedGift(gift);
                    setShowGiftAnim(true);
                  }}
                >
                  Show Animation
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {paymentHistory.length === 0 && premiumDetails?.isActive && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <Gift className="mx-auto text-blue-600 mb-3" size={32} />
          <p className="text-slate-600 font-semibold">Premium granted by administrator</p>
          <p className="text-sm text-slate-500 mt-1">No payment history available for this membership</p>
        </div>
      )}

      {paymentHistory.length === 0 && !premiumDetails?.isActive && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center">
          <AlertCircle className="mx-auto text-slate-600 mb-3" size={32} />
          <p className="text-slate-600 font-semibold">No payment history</p>
          <p className="text-sm text-slate-500 mt-1">Upgrade to premium to get started</p>
        </div>
      )}

      {showGiftAnim && selectedGift && (
        <PremiumGiftCelebration
          premiumDays={null}
          onClose={() => setShowGiftAnim(false)}
        />
      )}
    </div>
  );
};

export default PremiumStatus;
