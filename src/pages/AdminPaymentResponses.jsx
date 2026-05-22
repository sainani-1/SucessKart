import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Award, Calendar, Check, Clock, ExternalLink, Image, Mail, Phone, Search, User, X } from 'lucide-react';
import AlertModal from '../components/AlertModal';
import LoadingSpinner from '../components/LoadingSpinner';

const AdminPaymentResponses = () => {
  const { profile } = useAuth();
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });
  const [filterTab, setFilterTab] = useState('pending');
  const [grantModal, setGrantModal] = useState({ show: false, response: null });
  const [grantDuration, setGrantDuration] = useState('6');
  const [grantCustomDate, setGrantCustomDate] = useState('');
  const [granting, setGranting] = useState(false);
  const [rejectModal, setRejectModal] = useState({ show: false, response: null });
  const [rejectNote, setRejectNote] = useState('');
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    loadResponses();
  }, []);

  const loadResponses = async () => {
    setLoading(true);
    try {
      const { data: payments, error } = await supabase
        .from('payments')
        .select('*')
        .eq('gateway', 'manual')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const latestByUser = new Map();
      (payments || []).forEach((p) => {
        const existing = latestByUser.get(p.user_id);
        if (!existing || new Date(p.created_at) > new Date(existing.created_at)) {
          latestByUser.set(p.user_id, p);
        }
      });
      const deduped = Array.from(latestByUser.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      const userIds = [...new Set((deduped || []).map((p) => p.user_id).filter(Boolean))];
      let profileMap = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone, premium_until')
          .in('id', userIds);
        profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
      }

      const enriched = (deduped || []).map((p) => ({
        ...p,
        userProfile: profileMap[p.user_id] || null,
      }));
      setResponses(enriched);
    } catch (error) {
      setAlertModal({
        show: true, title: 'Error',
        message: `Failed to load responses: ${error.message}`,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredResponses = useMemo(() => {
    let list = responses;
    if (filterTab === 'pending') {
      list = list.filter((r) => r.status === 'pending');
    } else if (filterTab === 'resolved') {
      list = list.filter((r) => r.status === 'success' || r.status === 'failed');
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((r) => {
      const p = r.userProfile || {};
      return (
        (p.full_name || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q) ||
        (r.metadata?.transaction_id || '').toLowerCase().includes(q) ||
        (r.plan_code || '').toLowerCase().includes(q) ||
        (r.id || '').toLowerCase().includes(q)
      );
    });
  }, [responses, search, filterTab]);

  const openGrantModal = (response) => {
    setGrantDuration('6');
    setGrantCustomDate('');
    setGrantModal({ show: true, response });
  };

  const getPlanLabel = (planCode) => {
    if (!planCode) return 'Premium';
    const code = planCode.toLowerCase();
    if (code.includes('premium_plus') || code.includes('plus')) return 'Premium Plus';
    return 'Premium';
  };

  const getPlanTier = (planCode) => {
    const label = getPlanLabel(planCode);
    return label === 'Premium Plus' ? 'premium_plus' : 'premium';
  };

  const handleGrantPremium = async () => {
    const { response } = grantModal;
    if (!response) return;

    let validUntil, planMonths;
    if (grantDuration === 'custom' && grantCustomDate) {
      validUntil = new Date(grantCustomDate).toISOString();
      planMonths = undefined;
    } else {
      planMonths = parseInt(grantDuration, 10) || 6;
      validUntil = undefined;
    }

    setGranting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-review-payment', {
        body: {
          payment_id: response.id,
          action: 'approve',
          note: '',
          plan_months: planMonths,
          valid_until: validUntil,
        },
      });

      if (error) throw new Error(error.message || 'Failed to grant premium.');

      const label = getPlanLabel(response.plan_code);

      setAlertModal({
        show: true, title: 'Premium Granted',
        message: `${label} access has been granted successfully.`,
        type: 'success',
      });
      setGrantModal({ show: false, response: null });
      setResponses((prev) => prev.map((r) => r.id === response.id ? { ...r, status: 'success', paid_at: new Date().toISOString() } : r));
    } catch (error) {
      setAlertModal({
        show: true, title: 'Error',
        message: `Failed to grant premium: ${error.message}`,
        type: 'error',
      });
    } finally {
      setGranting(false);
    }
  };

  const handleRejectPayment = async () => {
    const { response } = rejectModal;
    if (!response) return;

    setRejecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-review-payment', {
        body: {
          payment_id: response.id,
          action: 'reject',
          note: rejectNote.trim() || 'Payment request rejected by admin.',
        },
      });

      if (error) throw new Error(error.message || 'Failed to reject payment.');

      const label = getPlanLabel(response.plan_code);

      setResponses((prev) => prev.map((r) => r.id === response.id ? { ...r, status: 'failed', failure_reason: rejectNote.trim() || 'Payment request rejected by admin.' } : r));

      setAlertModal({
        show: true, title: 'Payment Rejected',
        message: `${label} payment has been rejected.`,
        type: 'success',
      });
      setRejectModal({ show: false, response: null });
      setRejectNote('');
    } catch (error) {
      setAlertModal({
        show: true, title: 'Error',
        message: `Failed to reject payment: ${error.message}`,
        type: 'error',
      });
    } finally {
      setRejecting(false);
    }
  };

  const isPremiumOrPremiumPlus = (planCode) => {
    const label = getPlanLabel(planCode);
    return label === 'Premium' || label === 'Premium Plus';
  };

  if (loading) return <LoadingSpinner message="Loading payment responses..." />;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 to-slate-700 p-6 rounded-xl text-white">
        <h1 className="text-2xl font-bold mb-1">Payment Responses</h1>
        <p className="text-slate-200">View manual payment submissions and grant premium access.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by name, email, phone, transaction ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg"
          />
        </div>
      </div>

      <div className="flex gap-2 bg-white rounded-xl p-2 border border-slate-200">
        {['pending', 'resolved'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilterTab(tab)}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              filterTab === tab
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab === 'pending' ? 'Active' : 'Resolved'}
          </button>
        ))}
      </div>

      {filteredResponses.length === 0 ? (
        <div className="bg-white rounded-xl p-8 border text-center text-slate-500">
          {search ? 'No responses match your search.' : `No ${filterTab === 'pending' ? 'pending' : 'resolved'} manual payment responses.`}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredResponses.map((resp) => {
            const p = resp.userProfile || {};
            const metadata = resp.metadata || {};
            const planLabel = getPlanLabel(resp.plan_code);
            const planTier = getPlanTier(resp.plan_code);
            return (
              <div key={resp.id} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        planTier === 'premium_plus'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {planLabel}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        resp.status === 'success'
                          ? 'bg-green-100 text-green-800'
                          : resp.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {resp.status || 'pending'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(resp.created_at).toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="grid gap-2 text-sm text-slate-700">
                      <div className="flex items-center gap-2">
                        <User size="14" className="text-slate-400" />
                        <span className="font-semibold">{p.full_name || 'Unknown User'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail size="14" className="text-slate-400" />
                        <span>{p.email || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone size="14" className="text-slate-400" />
                        <span>{p.phone || '-'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <span>Amount: <strong>₹{resp.final_amount || resp.amount || 0}</strong></span>
                      {metadata.transaction_id && (
                        <span>TX ID: <strong>{metadata.transaction_id}</strong></span>
                      )}
                    </div>

                    {metadata.screenshot_url && (
                      <div>
                        <button
                          type="button"
                          onClick={() => window.open(metadata.screenshot_url, '_blank')}
                          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-semibold"
                        >
                          <Image size="14" />
                          View Screenshot
                          <ExternalLink size="12" />
                        </button>
                      </div>
                    )}

                    {resp.coupon_code && (
                      <div className="text-xs text-pink-600 bg-pink-50 rounded px-2 py-1 inline-block">
                        Coupon: {resp.coupon_code}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {isPremiumOrPremiumPlus(resp.plan_code) && resp.status !== 'success' && resp.status !== 'failed' && (
                      <>
                        {resp.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => openGrantModal(resp)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 text-sm"
                          >
                            <Award size="16" />
                            Grant {planLabel}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { setRejectNote(''); setRejectModal({ show: true, response: resp }); }}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 text-sm"
                        >
                          <X size="16" />
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />

      {grantModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-900">
                Grant {getPlanLabel(grantModal.response?.plan_code)}
              </h3>
              <button
                type="button"
                onClick={() => setGrantModal({ show: false, response: null })}
                className="p-1 rounded-lg hover:bg-slate-100"
              >
                <X size="20" />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              User: <span className="font-semibold">{grantModal.response?.userProfile?.full_name || 'Unknown'}</span>
            </p>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">Select Duration</p>
              <div className="flex gap-3">
                {['6', '12'].map((months) => (
                  <button
                    key={months}
                    type="button"
                    onClick={() => { setGrantDuration(months); setGrantCustomDate(''); }}
                    className={`flex-1 px-4 py-3 rounded-lg text-sm font-semibold border ${
                      grantDuration === months && !grantCustomDate
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {months} Months
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setGrantDuration('custom')}
                  className={`flex-1 px-4 py-3 rounded-lg text-sm font-semibold border ${
                    grantDuration === 'custom'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Calendar size="16" className="inline mr-1" />
                  Custom
                </button>
              </div>

              {grantDuration === 'custom' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Valid Until</label>
                  <input
                    type="date"
                    value={grantCustomDate}
                    onChange={(e) => setGrantCustomDate(e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              <div className="pt-2 text-sm text-slate-500">
                {grantDuration !== 'custom' ? (
                  <span>Premium will be valid for <strong>{grantDuration} months</strong> from now.</span>
                ) : grantCustomDate ? (
                  <span>Premium will be valid until <strong>{new Date(grantCustomDate).toLocaleDateString('en-IN')}</strong>.</span>
                ) : (
                  <span>Please select a custom date.</span>
                )}
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setGrantModal({ show: false, response: null })}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGrantPremium}
                disabled={granting || (grantDuration === 'custom' && !grantCustomDate)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
              >
                {granting ? 'Granting...' : (
                  <>
                    <Check size="16" />
                    Grant Access
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-900">
                Reject {getPlanLabel(rejectModal.response?.plan_code)} Payment
              </h3>
              <button
                type="button"
                onClick={() => setRejectModal({ show: false, response: null })}
                className="p-1 rounded-lg hover:bg-slate-100"
              >
                <X size="20" />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              User: <span className="font-semibold">{rejectModal.response?.userProfile?.full_name || 'Unknown'}</span>
            </p>

            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                Transaction ID: <strong>{rejectModal.response?.metadata?.transaction_id || 'N/A'}</strong>
              </p>
              <p className="text-sm text-slate-700">
                Amount: <strong>₹{rejectModal.response?.final_amount || rejectModal.response?.amount || 0}</strong>
              </p>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Rejection Reason (optional)</label>
                <textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  rows="3"
                  className="w-full p-3 border border-slate-300 rounded-lg resize-none"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setRejectModal({ show: false, response: null })}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectPayment}
                disabled={rejecting}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60"
              >
                {rejecting ? 'Rejecting...' : (
                  <>
                    <X size="16" />
                    Reject Payment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPaymentResponses;
