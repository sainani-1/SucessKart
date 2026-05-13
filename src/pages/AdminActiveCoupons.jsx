import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Gift } from 'lucide-react';

const AdminActiveCoupons = () => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCoupons = async () => {
      setLoading(true);
      // Fetch from offers table
      const { data } = await supabase
        .from('offers')
        .select('*')
        .order('created_at', { ascending: false });
      setCoupons(data || []);
      setLoading(false);
    };
    fetchCoupons();
  }, []);

  return (
    <div className="max-w-3xl mx-auto mt-10 p-6 bg-white rounded-xl shadow">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Gift className="text-pink-500" size={28} /> Active Coupons
      </h1>
      {loading ? (
        <div>Loading...</div>
      ) : coupons.length === 0 ? (
        <div className="text-slate-500">No active offers found.</div>
      ) : (
        <div className="space-y-4">
          {coupons.map(offer => (
            <div key={offer.id} className="bg-pink-50 border border-pink-200 rounded-lg p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Gift className="text-pink-500" size={20} />
                <span className="font-semibold text-pink-700">Offer: {offer.title}</span>
              </div>
              <div className="text-slate-700 text-sm">{offer.is_lifetime_free ? 'Lifetime Free' : offer.discount_type === 'percent' ? `${offer.discount_value}% Off` : `Flat ₹${offer.discount_value} Off`}</div>
              <div className="text-xs text-slate-500">Created: {offer.created_at ? new Date(offer.created_at).toLocaleDateString() : '—'}</div>
              <div className="text-xs text-slate-400">Applies To: {offer.applies_to_all ? 'All Users' : 'Specific Users'}</div>
              <div className="text-xs text-slate-400">Plan Scope: {offer.applicable_plan === 'premium' ? 'Premium Only' : offer.applicable_plan === 'premium_plus' ? 'Premium Plus Only' : 'Premium + Premium Plus'}</div>
              <div className="text-xs text-slate-400">Visibility: {offer.is_listed === false ? 'Unlisted / Admin Only' : 'Listed Publicly'}</div>
              <div className="text-xs text-slate-400">Redeem Limit: {offer.redeem_once_per_account === false ? 'Repeat use allowed' : 'Once per account'}</div>
              <button className="bg-red-500 text-white px-4 py-2 rounded font-semibold mt-2 w-max" onClick={async () => {
                await supabase.from('offers').delete().eq('id', offer.id);
                setCoupons(coupons.filter(o => o.id !== offer.id));
              }}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminActiveCoupons;
