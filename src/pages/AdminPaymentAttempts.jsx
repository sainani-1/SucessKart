import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, RefreshCw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import AlertModal from '../components/AlertModal';
import LoadingSpinner from '../components/LoadingSpinner';

const STATUS_OPTIONS = ['all', 'created', 'success', 'failed'];

const AdminPaymentAttempts = () => {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [attempts, setAttempts] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

  const loadAttempts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('list-payment-attempts', {
        body: {},
      });

      if (error) throw error;

      setAttempts(data?.payments || []);
      setProfilesById(data?.profilesById || {});
    } catch (error) {
      setAlertModal({
        show: true,
        title: 'Load Failed',
        message: error.message || 'Unable to load payment attempts.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttempts();
  }, []);

  const filteredAttempts = useMemo(() => {
    if (statusFilter === 'all') return attempts;
    return attempts.filter((attempt) => attempt.status === statusFilter);
  }, [attempts, statusFilter]);

  const reviewPayment = async (paymentId, action) => {
    setSavingId(paymentId);
    try {
      const { data, error } = await supabase.functions.invoke('admin-review-payment', {
        body: {
          payment_id: paymentId,
          action,
        },
      });

      if (error) throw new Error(error.message || 'Unable to review payment.');

      setAlertModal({
        show: true,
        title: action === 'approve' ? 'Payment Approved' : 'Payment Rejected',
        message: action === 'approve'
          ? `Payment ${data?.payment_id || paymentId} has been marked successful.`
          : `Payment ${paymentId} has been rejected.`,
        type: action === 'approve' ? 'success' : 'warning',
      });
      await loadAttempts();
    } catch (error) {
      setAlertModal({
        show: true,
        title: 'Review Failed',
        message: error.message || 'Unable to review this payment attempt.',
        type: 'error',
      });
    } finally {
      setSavingId('');
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading payment attempts..." />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 p-6 text-white">
        <h1 className="text-2xl font-bold">Payment Attempts</h1>
        <p className="mt-1 text-sm text-slate-200">View all payment tries, including SucessKart UPI requests and successful payments.</p>
      </div>

      <div className="rounded-xl border bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStatusFilter(option)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  statusFilter === option ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {option === 'all' ? 'All Statuses' : option}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={loadAttempts}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {filteredAttempts.length === 0 ? (
          <div className="rounded-xl border bg-white p-6 text-sm text-slate-500">No payment attempts found for this filter.</div>
        ) : (
          filteredAttempts.map((attempt) => {
            const user = profilesById[attempt.user_id] || {};
            const isSucessKartUpi = attempt.metadata?.payment_method === 'skillpro_upi';
            const canReview = isSucessKartUpi && !['success', 'failed'].includes(attempt.status);

            return (
              <div key={attempt.id} className="rounded-xl border bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-slate-900">
                      <CreditCard size={18} className="text-blue-600" />
                      <p className="font-semibold">{attempt.metadata?.plan_label || attempt.plan_code || 'Premium Payment'}</p>
                    </div>
                    <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                      <p><span className="font-semibold text-slate-800">User:</span> {user.full_name || 'Unknown user'}</p>
                      <p><span className="font-semibold text-slate-800">Email:</span> {user.email || '-'}</p>
                      <p><span className="font-semibold text-slate-800">Phone:</span> {user.phone || '-'}</p>
                      <p><span className="font-semibold text-slate-800">Gateway:</span> {attempt.metadata?.payment_method || attempt.gateway}</p>
                      <p><span className="font-semibold text-slate-800">Base Amount:</span> Rs {attempt.base_amount ?? attempt.amount ?? 0}</p>
                      <p><span className="font-semibold text-slate-800">Coupon Discount:</span> Rs {attempt.discount_amount ?? 0}</p>
                      <p><span className="font-semibold text-slate-800">Paid Amount:</span> Rs {attempt.final_amount ?? attempt.amount ?? 0}</p>
                      <p><span className="font-semibold text-slate-800">Status:</span> {attempt.metadata?.payment_request_state || attempt.status}</p>
                      <p><span className="font-semibold text-slate-800">Created:</span> {attempt.created_at ? new Date(attempt.created_at).toLocaleString('en-IN') : '-'}</p>
                      <p><span className="font-semibold text-slate-800">Paid At:</span> {attempt.paid_at ? new Date(attempt.paid_at).toLocaleString('en-IN') : '-'}</p>
                      <p><span className="font-semibold text-slate-800">Payment ID:</span> {attempt.id}</p>
                      <p><span className="font-semibold text-slate-800">Coupon Code:</span> {attempt.coupon_code || attempt.metadata?.coupon_code || '-'}</p>
                      <p><span className="font-semibold text-slate-800">Payment App:</span> {attempt.metadata?.payment_app || '-'}</p>
                      <p><span className="font-semibold text-slate-800">Payment Tag:</span> {attempt.metadata?.payment_tag || '-'}</p>
                      <p><span className="font-semibold text-slate-800">User UPI ID:</span> {attempt.metadata?.user_upi_id || attempt.gateway_ref || '-'}</p>
                      <p><span className="font-semibold text-slate-800">User UPI Name:</span> {attempt.metadata?.user_upi_name || '-'}</p>
                      <p className="md:col-span-2"><span className="font-semibold text-slate-800">Payment Note:</span> {attempt.metadata?.payment_note || '-'}</p>
                      {attempt.failure_reason ? (
                        <p className="md:col-span-2 text-rose-700"><span className="font-semibold">Failure Reason:</span> {attempt.failure_reason}</p>
                      ) : null}
                    </div>
                  </div>

                  {canReview ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => reviewPayment(attempt.id, 'approve')}
                        disabled={savingId === attempt.id}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {savingId === attempt.id ? 'Working...' : 'Approve Paid'}
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewPayment(attempt.id, 'reject')}
                        disabled={savingId === attempt.id}
                        className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
    </div>
  );
};

export default AdminPaymentAttempts;
