import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import PremiumGiftCelebration from '../components/PremiumGiftCelebration';

const AdminSendGift = () => {
  const { profile } = useAuth();
  const [recipientType, setRecipientType] = useState('all');
  const [selectedUser, setSelectedUser] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponName, setCouponName] = useState('');
  const [discountType, setDiscountType] = useState('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [applicablePlan, setApplicablePlan] = useState('both');
  const [isListed, setIsListed] = useState(true);
  const [redeemOncePerAccount, setRedeemOncePerAccount] = useState(true);
  const [isLifetimeFree, setIsLifetimeFree] = useState(false);
  const [validUntil, setValidUntil] = useState('');
  const [showAnimation, setShowAnimation] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [userOptions, setUserOptions] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [userLoading, setUserLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (recipientType === 'particular' && userSearch.length > 1) {
      setUserLoading(true);
      supabase
        .from('profiles')
        .select('id, full_name, email')
        .ilike('email', `%${userSearch}%`)
        .limit(5)
        .then(({ data }) => {
          setUserOptions(data || []);
          setUserLoading(false);
        });
    } else {
      setUserOptions([]);
    }
  }, [userSearch, recipientType]);

  const handleSendGift = async () => {
    setError('');
    if (!couponCode || !couponName || (!isLifetimeFree && !discountValue) || !validUntil) {
      setError('Please fill all fields.');
      return;
    }
    if (recipientType === 'particular' && !selectedUser) {
      setError('Please select a user.');
      return;
    }
    setShowConfirm(true);
  };

  const confirmSendGift = async () => {
    setShowConfirm(false);
    setSending(true);
    try {
      const admin = (await supabase.auth.getUser()).data.user;
      let recipients = [];
      if (recipientType === 'all') {
        const { data: users } = await supabase.from('profiles').select('id').eq('role', 'student');
        recipients = users?.map(u => u.id) || [];
      } else {
        recipients = [selectedUser];
      }
      // Insert into offers table
      // Convert validUntil to end of day timestamp
      let validUntilTimestamp = null;
      if (validUntil) {
        const date = new Date(validUntil);
        date.setHours(23, 59, 59, 999);
        validUntilTimestamp = date.toISOString();
      }
      const { data: offerData, error: offerError } = await supabase.from('offers').insert([
        {
          title: couponCode,
          coupon_code: couponCode,
          coupon_name: couponName,
          description: isLifetimeFree
            ? `Lifetime free access for ${applicablePlan === 'both' ? 'Premium and Premium Plus' : applicablePlan === 'premium_plus' ? 'Premium Plus' : 'Premium'}`
            : `${discountType === 'percent' ? discountValue + '% off' : 'Flat ' + discountValue + ' off'} for ${applicablePlan === 'both' ? 'Premium and Premium Plus' : applicablePlan === 'premium_plus' ? 'Premium Plus' : 'Premium'}`,
          discount_type: isLifetimeFree ? 'lifetime_free' : discountType,
          discount_value: isLifetimeFree ? null : discountValue,
          is_lifetime_free: isLifetimeFree,
          applicable_plan: applicablePlan,
          is_listed: isListed,
          applies_to_all: recipientType === 'all',
          redeem_once_per_account: redeemOncePerAccount,
          valid_until: validUntilTimestamp,
          created_by: admin.id
        }
      ]).select('id');
      if (offerError) throw offerError;
      const offerId = offerData[0]?.id;
      // Assign offer to users
      if (recipientType === 'all') {
        await supabase.from('offer_assignments').insert(
          recipients.map(uid => ({ offer_id: offerId, user_id: uid }))
        );
      } else {
        await supabase.from('offer_assignments').insert([{ offer_id: offerId, user_id: recipients[0] }]);
      }
      setShowAnimation(true);
      setSuccess(true);
    } catch (e) {
      setError('Failed to send gift: ' + (e?.message || JSON.stringify(e)));
      console.error('Supabase error:', e);
    }
    setSending(false);
  };

  return (
    <div className="max-w-xl mx-auto mt-12 p-8 bg-gradient-to-br from-pink-100 via-white to-yellow-100 rounded-2xl shadow-2xl border border-pink-200">
      <h2 className="text-4xl font-extrabold mb-8 flex items-center gap-3 text-pink-700 drop-shadow">
        <span role="img" aria-label="Gift" className="text-5xl">🎁</span> Send Gift Coupon
      </h2>
      <div className="mb-6">
        <label className="font-semibold text-pink-600">Send To:</label>
        <select value={recipientType} onChange={e => setRecipientType(e.target.value)} className="ml-2 border-2 border-pink-300 rounded-lg px-3 py-2 bg-white focus:border-pink-500 focus:ring-2 focus:ring-pink-200 transition-all">
          <option value="all">All Users</option>
          <option value="particular">Particular User</option>
        </select>
      </div>
      {recipientType === 'particular' && (
        <div className="mb-6">
          <label className="font-semibold text-pink-600">User:</label>
          <input type="text" value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search user email..." className="ml-2 border-2 border-pink-300 rounded-lg px-3 py-2 bg-white focus:border-pink-500 focus:ring-2 focus:ring-pink-200 transition-all" />
          {userLoading && <span className="ml-2 text-xs text-slate-400">Loading...</span>}
          {userOptions.length > 0 && (
            <div className="border-2 border-pink-200 rounded-lg bg-white shadow-lg p-2 mt-2 max-h-32 overflow-y-auto">
              {userOptions.map(u => (
                <div key={u.id} className={`p-2 hover:bg-pink-100 cursor-pointer rounded-lg ${selectedUser === u.id ? 'bg-pink-200' : ''}`} onClick={() => setSelectedUser(u.id)}>
                  <span className="font-semibold text-pink-700">{u.full_name}</span> <span className="text-xs text-slate-500">({u.email})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mb-6">
        <label className="font-semibold text-pink-600">Coupon Name:</label>
        <input type="text" value={couponName} onChange={e => setCouponName(e.target.value)} className="ml-2 border-2 border-pink-300 rounded-lg px-3 py-2 bg-white focus:border-pink-500 focus:ring-2 focus:ring-pink-200 transition-all" />
      </div>
      <div className="mb-6">
        <label className="font-semibold text-pink-600">Coupon Code:</label>
        <input type="text" value={couponCode} onChange={e => setCouponCode(e.target.value)} className="ml-2 border-2 border-pink-300 rounded-lg px-3 py-2 bg-white focus:border-pink-500 focus:ring-2 focus:ring-pink-200 transition-all" />
      </div>
      <div className="mb-6 flex items-center">
        <label className="font-semibold text-pink-600">Offer Type:</label>
        <select value={discountType} onChange={e => setDiscountType(e.target.value)} className="ml-2 border-2 border-pink-300 rounded-lg px-3 py-2 bg-white focus:border-pink-500 focus:ring-2 focus:ring-pink-200 transition-all" disabled={isLifetimeFree}>
          <option value="percent">% Percent</option>
          <option value="flat">Flat Amount</option>
        </select>
        <label className="ml-6 font-semibold text-pink-600">Lifetime Free:</label>
        <input type="checkbox" checked={isLifetimeFree} onChange={e => setIsLifetimeFree(e.target.checked)} className="ml-2 accent-pink-500 scale-125" />
      </div>
      <div className="mb-6">
        <label className="font-semibold text-pink-600">Valid For Plan:</label>
        <select value={applicablePlan} onChange={e => setApplicablePlan(e.target.value)} className="ml-2 border-2 border-pink-300 rounded-lg px-3 py-2 bg-white focus:border-pink-500 focus:ring-2 focus:ring-pink-200 transition-all">
          <option value="both">Premium + Premium Plus</option>
          <option value="premium">Premium Only</option>
          <option value="premium_plus">Premium Plus Only</option>
        </select>
      </div>
      <div className="mb-6 flex items-center">
        <label className="font-semibold text-pink-600">Show In Offers:</label>
        <input type="checkbox" checked={isListed} onChange={e => setIsListed(e.target.checked)} className="ml-3 accent-pink-500 scale-125" />
        <span className="ml-3 text-sm text-slate-500">
          {isListed ? 'Visible in Discounts & Offers pages' : 'Hidden coupon. Users must type the code manually.'}
        </span>
      </div>
      <div className="mb-6 flex items-center">
        <label className="font-semibold text-pink-600">Redeem Once Per Account:</label>
        <input type="checkbox" checked={redeemOncePerAccount} onChange={e => setRedeemOncePerAccount(e.target.checked)} className="ml-3 accent-pink-500 scale-125" />
        <span className="ml-3 text-sm text-slate-500">
          {redeemOncePerAccount ? 'Each account can use this coupon only once.' : 'Allow repeat use by the same account.'}
        </span>
      </div>
      {!isLifetimeFree && (
        <div className="mb-6">
          <label className="font-semibold text-pink-600">Discount Value:</label>
          <input type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)} className="ml-2 border-2 border-pink-300 rounded-lg px-3 py-2 bg-white focus:border-pink-500 focus:ring-2 focus:ring-pink-200 transition-all" />
        </div>
      )}
      <div className="mb-6">
        <label className="font-semibold text-pink-600">Valid Until:</label>
        <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="ml-2 border-2 border-pink-300 rounded-lg px-3 py-2 bg-white focus:border-pink-500 focus:ring-2 focus:ring-pink-200 transition-all" />
      </div>
      {error && <div className="mb-2 text-red-600 text-sm drop-shadow">{error}</div>}
      <button onClick={handleSendGift} disabled={sending} className="bg-gradient-to-r from-pink-500 via-pink-400 to-yellow-400 text-white px-8 py-3 rounded-xl font-bold text-xl hover:bg-pink-600 shadow-lg transition-all">
        {sending ? 'Sending...' : 'Send Gift'}
      </button>
      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-pink-100 via-white to-yellow-100 rounded-2xl p-10 shadow-2xl text-center max-w-xs mx-auto border border-pink-200">
            <h3 className="text-2xl font-extrabold mb-6 text-pink-700">Confirm Send Gift?</h3>
            <p className="mb-6 text-pink-600">Are you sure you want to send this gift {recipientType === 'all' ? 'to all users' : 'to this user'}?</p>
            <div className="flex gap-6 justify-center">
              <button className="bg-green-500 text-white px-6 py-2 rounded-xl font-semibold text-lg shadow-md hover:bg-green-600 transition-all" onClick={confirmSendGift}>Yes, Send</button>
              <button className="bg-slate-300 px-6 py-2 rounded-xl font-semibold text-lg shadow-md hover:bg-slate-400 transition-all" onClick={() => setShowConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* Only show animation if not admin (for students only) */}
      {showAnimation && profile?.role !== 'admin' && (
        <PremiumGiftCelebration couponCode={couponCode} discountType={discountType} discountValue={discountValue} validUntil={validUntil} />
      )}
      {success && <div className="mt-6 text-green-600 font-semibold text-xl drop-shadow">Gift sent successfully!</div>}
    </div>
  );
};

export default AdminSendGift;
