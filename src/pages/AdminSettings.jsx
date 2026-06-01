import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Save, Plus, Trash2 } from 'lucide-react';
import usePopup from '../hooks/usePopup';
import LoadingSpinner from '../components/LoadingSpinner';

const DEFAULT_PLAN_FORM = {
  name: '',
  tier: 'premium',
  cost: '',
  isLifetimeFree: false,
  periodMonths: '6',
  validUntil: '',
  description: '',
  features: '',
  isActive: true,
};

const AdminSettings = () => {
  const [examDuration, setExamDuration] = useState(60);
  const [minQuestions, setMinQuestions] = useState(25);
  const [premiumCost, setPremiumCost] = useState(199);
  const [premiumPlusCost, setPremiumPlusCost] = useState(299);
  const [paymentUrgencyDate, setPaymentUrgencyDate] = useState('2026-04-15');
  const [paymentUrgencyLabel, setPaymentUrgencyLabel] = useState('April 15, 2026');
  const [paymentGatewayMode, setPaymentGatewayMode] = useState('razorpay');
  const [SucessKartUpiId, setSucessKartUpiId] = useState('');
  const [manualPaymentAdminEmail, setManualPaymentAdminEmail] = useState('');
  const [paymentAdminPhone, setPaymentAdminPhone] = useState('');
  const [paymentAdminEmail, setPaymentAdminEmail] = useState('');
  const [paymentRequestAdminEmailEnabled, setPaymentRequestAdminEmailEnabled] = useState(true);
  const [resumeBuilderAccess, setResumeBuilderAccess] = useState('premium');
  const [supportContactEmail, setSupportContactEmail] = useState('');
  const [registrationPaused, setRegistrationPaused] = useState(false);
  const [plans, setPlans] = useState([]);
  const [planForm, setPlanForm] = useState(DEFAULT_PLAN_FORM);
  const [loading, setLoading] = useState(true);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingPlans, setSavingPlans] = useState(false);
  const { popupNode, openPopup } = usePopup();

  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    [plans]
  );

  useEffect(() => {
    loadSettings();
  }, []);

  const parsePlans = (raw) => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((p) => p && p.id && p.name)
        .map((plan) => ({
          ...plan,
          tier: plan.tier === 'premium_plus' ? 'premium_plus' : 'premium',
          features: Array.isArray(plan.features)
            ? plan.features.filter(Boolean)
            : String(plan.features || '')
                .split('\n')
                .map((item) => item.trim())
                .filter(Boolean),
        }));
    } catch {
      return [];
    }
  };

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['exam_duration', 'premium_cost', 'premium_plus_cost', 'payment_urgency_banner', 'payment_gateway_mode', 'skillpro_upi_id', 'payment_admin_phone', 'payment_admin_email', 'payment_request_admin_email_enabled', 'registration_paused', 'min_questions', 'public_plans', 'support_contact_email', 'resume_builder_access', 'manual_payment_admin_email']);

      if (error) throw error;

      (data || []).forEach((setting) => {
        if (setting.key === 'exam_duration') setExamDuration(parseInt(setting.value, 10) || 60);
        if (setting.key === 'premium_cost') setPremiumCost(parseInt(setting.value, 10) || 199);
        if (setting.key === 'premium_plus_cost') setPremiumPlusCost(parseInt(setting.value, 10) || 299);
        if (setting.key === 'registration_paused') setRegistrationPaused(setting.value === 'true');
        if (setting.key === 'min_questions') setMinQuestions(parseInt(setting.value, 10) || 25);
        if (setting.key === 'public_plans') setPlans(parsePlans(setting.value));
        if (setting.key === 'support_contact_email') setSupportContactEmail(setting.value || '');
        if (setting.key === 'payment_gateway_mode') setPaymentGatewayMode(setting.value === 'skillpro_upi' ? 'skillpro_upi' : setting.value === 'manual' ? 'manual' : 'razorpay');
        if (setting.key === 'skillpro_upi_id') setSucessKartUpiId(setting.value || '');
        if (setting.key === 'payment_admin_phone') setPaymentAdminPhone(setting.value || '');
        if (setting.key === 'payment_admin_email') setPaymentAdminEmail(setting.value || '');
        if (setting.key === 'payment_request_admin_email_enabled') setPaymentRequestAdminEmailEnabled(setting.value !== 'false');
        if (setting.key === 'resume_builder_access') setResumeBuilderAccess(setting.value === 'free' ? 'free' : 'premium');
        if (setting.key === 'manual_payment_admin_email') setManualPaymentAdminEmail(setting.value || '');
        if (setting.key === 'payment_urgency_banner') {
          try {
            const parsed = setting.value ? JSON.parse(setting.value) : null;
            if (parsed?.effectiveDate) setPaymentUrgencyDate(parsed.effectiveDate);
            if (parsed?.label) setPaymentUrgencyLabel(parsed.label);
          } catch {
            setPaymentUrgencyDate('2026-04-15');
            setPaymentUrgencyLabel('April 15, 2026');
          }
        }
      });
    } catch (error) {
      openPopup('Error', `Failed to load settings: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveSetting = async (key, value) => {
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value: String(value) }, { onConflict: 'key' });
    if (error) throw error;
  };

  const handleSaveGeneral = async () => {
    try {
      setSavingGeneral(true);
      await saveSetting('exam_duration', examDuration);
      await saveSetting('premium_cost', premiumCost);
      await saveSetting('premium_plus_cost', premiumPlusCost);
      await saveSetting('registration_paused', registrationPaused);
      await saveSetting('min_questions', minQuestions);
      await saveSetting('support_contact_email', supportContactEmail.trim());
      await saveSetting('payment_gateway_mode', paymentGatewayMode);
      await saveSetting('skillpro_upi_id', SucessKartUpiId.trim());
      await saveSetting('manual_payment_admin_email', manualPaymentAdminEmail.trim());
      await saveSetting('payment_admin_phone', paymentAdminPhone.trim());
      await saveSetting('payment_admin_email', paymentAdminEmail.trim());
      await saveSetting('payment_request_admin_email_enabled', paymentRequestAdminEmailEnabled);
      await saveSetting('resume_builder_access', resumeBuilderAccess);
      await saveSetting('payment_urgency_banner', JSON.stringify({
        effectiveDate: paymentUrgencyDate,
        label: paymentUrgencyLabel.trim() || new Date(paymentUrgencyDate).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      }));
      openPopup('Success', 'General settings saved successfully.', 'success');
    } catch (error) {
      openPopup('Error', `Failed to save settings: ${error.message}`, 'error');
    } finally {
      setSavingGeneral(false);
    }
  };

  const persistPlans = async (nextPlans) => {
    setSavingPlans(true);
    try {
      await saveSetting('public_plans', JSON.stringify(nextPlans));
      setPlans(nextPlans);
    } finally {
      setSavingPlans(false);
    }
  };

  const addPlan = async () => {
    if (!planForm.name.trim()) {
      openPopup('Missing Plan Name', 'Please enter a plan name.', 'warning');
      return;
    }
    if (!planForm.isLifetimeFree && (!planForm.cost || Number(planForm.cost) < 0)) {
      openPopup('Invalid Cost', 'Please enter a valid cost for this plan.', 'warning');
      return;
    }

    const newPlan = {
      id: `plan_${Date.now()}`,
      name: planForm.name.trim(),
      tier: planForm.tier === 'premium_plus' ? 'premium_plus' : 'premium',
      cost: planForm.isLifetimeFree ? 0 : Number(planForm.cost),
      isLifetimeFree: !!planForm.isLifetimeFree,
      periodMonths: planForm.periodMonths ? Number(planForm.periodMonths) : null,
      validUntil: planForm.validUntil || null,
      description: planForm.description.trim() || null,
      features: planForm.features
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
      isActive: !!planForm.isActive,
      createdAt: new Date().toISOString(),
    };

    const nextPlans = [newPlan, ...plans];
    try {
      await persistPlans(nextPlans);
      setPlanForm(DEFAULT_PLAN_FORM);
      openPopup('Success', 'Plan added successfully.', 'success');
    } catch (error) {
      openPopup('Error', `Failed to add plan: ${error.message}`, 'error');
    }
  };

  const togglePlanActive = async (id) => {
    const nextPlans = plans.map((p) => (p.id === id ? { ...p, isActive: !p.isActive } : p));
    try {
      await persistPlans(nextPlans);
    } catch (error) {
      openPopup('Error', `Failed to update plan: ${error.message}`, 'error');
    }
  };

  const removePlan = async (id) => {
    const nextPlans = plans.filter((p) => p.id !== id);
    try {
      await persistPlans(nextPlans);
      openPopup('Removed', 'Plan removed successfully.', 'success');
    } catch (error) {
      openPopup('Error', `Failed to remove plan: ${error.message}`, 'error');
    }
  };

  if (loading) return <LoadingSpinner message="Loading settings..." />;

  return (
    <div className="space-y-6">
      {popupNode}

      <div className="bg-gradient-to-r from-slate-900 to-slate-700 p-6 rounded-xl text-white">
        <h1 className="text-2xl font-bold mb-1">Platform Settings</h1>
        <p className="text-slate-200">Manage core settings and public pricing plans.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100">
        <h2 className="text-xl font-bold text-slate-900 mb-4">General Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Exam Duration (minutes)</label>
            <input
              type="number"
              min="15"
              className="w-full p-3 border border-slate-300 rounded-lg"
              value={examDuration}
              onChange={(e) => setExamDuration(parseInt(e.target.value, 10) || 60)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Minimum Questions</label>
            <input
              type="number"
              min="1"
              className="w-full p-3 border border-slate-300 rounded-lg"
              value={minQuestions}
              onChange={(e) => setMinQuestions(parseInt(e.target.value, 10) || 25)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Default Premium Cost (INR)</label>
            <input
              type="number"
              min="0"
              className="w-full p-3 border border-slate-300 rounded-lg"
              value={premiumCost}
              onChange={(e) => setPremiumCost(parseInt(e.target.value, 10) || 199)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Default Premium Plus Cost (INR)</label>
            <input
              type="number"
              min="0"
              className="w-full p-3 border border-slate-300 rounded-lg"
              value={premiumPlusCost}
              onChange={(e) => setPremiumPlusCost(parseInt(e.target.value, 10) || 299)}
            />
          </div>
          {paymentGatewayMode === 'manual' && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Manual Payment Admin Email</label>
            <input
              type="email"
              className="w-full p-3 border border-slate-300 rounded-lg"
              placeholder="admin@example.com"
              value={manualPaymentAdminEmail}
              onChange={(e) => setManualPaymentAdminEmail(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">Admin gets email notification when a user submits a manual payment response.</p>
          </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Support Contact Email</label>
            <input
              type="email"
              className="w-full p-3 border border-slate-300 rounded-lg"
              placeholder="support@yourdomain.com"
              value={supportContactEmail}
              onChange={(e) => setSupportContactEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Payment Admin Email</label>
            <input
              type="email"
              className="w-full p-3 border border-slate-300 rounded-lg"
              placeholder="payments@yourdomain.com"
              value={paymentAdminEmail}
              onChange={(e) => setPaymentAdminEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Payment UPI Number</label>
            <input
              type="text"
              className="w-full p-3 border border-slate-300 rounded-lg"
              placeholder="UPI-linked mobile number"
              value={paymentAdminPhone}
              onChange={(e) => setPaymentAdminPhone(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              If set, mobile checkout will prefer this UPI number instead of exposing the UPI ID in the user panel.
            </p>
          </div>
          <div className="md:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={paymentRequestAdminEmailEnabled}
                onChange={(e) => setPaymentRequestAdminEmailEnabled(e.target.checked)}
              />
              Send admin email when a user submits a payment request
            </label>
            <p className="mt-2 text-xs text-slate-500">
              When enabled, admin gets an email with user payment-request details as soon as the request is submitted.
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Payment Urgency Date</label>
            <input
              type="date"
              className="w-full p-3 border border-slate-300 rounded-lg"
              value={paymentUrgencyDate}
              onChange={(e) => setPaymentUrgencyDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Payment Gateway Mode</label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setPaymentGatewayMode('razorpay')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  paymentGatewayMode === 'razorpay'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                Razorpay
              </button>
              <button
                type="button"
                onClick={() => setPaymentGatewayMode('skillpro_upi')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  paymentGatewayMode === 'skillpro_upi'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                SucessKart UPI
              </button>
              <button
                type="button"
                onClick={() => setPaymentGatewayMode('manual')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  paymentGatewayMode === 'manual'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                Manual
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Razorpay uses the current checkout flow. SucessKart UPI creates fixed-amount UPI requests/manual review records. Manual shows admin-set QR codes on the payment page.
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">SucessKart UPI ID</label>
            <input
              type="text"
              className="w-full p-3 border border-slate-300 rounded-lg"
              placeholder="example@upi"
              value={SucessKartUpiId}
              onChange={(e) => setSucessKartUpiId(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              Used only when payment gateway mode is set to SucessKart UPI.
            </p>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Payment Urgency Banner Label</label>
            <input
              type="text"
              className="w-full p-3 border border-slate-300 rounded-lg"
              placeholder="April 15, 2026"
              value={paymentUrgencyLabel}
              onChange={(e) => setPaymentUrgencyLabel(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">This text appears on the payment page urgency banner.</p>
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={registrationPaused}
                onChange={(e) => setRegistrationPaused(e.target.checked)}
              />
              Pause New Registrations
            </label>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Resume Builder Access</label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setResumeBuilderAccess('free')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  resumeBuilderAccess === 'free'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                Free For Everyone
              </button>
              <button
                type="button"
                onClick={() => setResumeBuilderAccess('premium')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  resumeBuilderAccess === 'premium'
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                Premium Only
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              If set to free, every logged-in user can use Resume Builder. If set to premium, only premium users can access it.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSaveGeneral}
          disabled={savingGeneral}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-60"
        >
          <Save size={16} />
          {savingGeneral ? 'Saving...' : 'Save General Settings'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Plan Management</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Plan Name</label>
            <input
              type="text"
              className="w-full p-3 border border-slate-300 rounded-lg"
              placeholder="Example: Premium 6 Months"
              value={planForm.name}
              onChange={(e) => setPlanForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Plan Tier</label>
            <select
              className="w-full p-3 border border-slate-300 rounded-lg"
              value={planForm.tier}
              onChange={(e) => setPlanForm((p) => ({ ...p, tier: e.target.value }))}
            >
              <option value="premium">Premium</option>
              <option value="premium_plus">Premium Plus</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Cost (INR)</label>
            <input
              type="number"
              min="0"
              className="w-full p-3 border border-slate-300 rounded-lg"
              placeholder="199"
              value={planForm.cost}
              onChange={(e) => setPlanForm((p) => ({ ...p, cost: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Period (Months)</label>
            <input
              type="number"
              min="1"
              disabled={planForm.isLifetimeFree}
              className="w-full p-3 border border-slate-300 rounded-lg disabled:bg-slate-100"
              placeholder="6"
              value={planForm.periodMonths}
              onChange={(e) => setPlanForm((p) => ({ ...p, periodMonths: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Valid Until (optional)</label>
            <input
              type="date"
              className="w-full p-3 border border-slate-300 rounded-lg"
              value={planForm.validUntil}
              onChange={(e) => setPlanForm((p) => ({ ...p, validUntil: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              rows={2}
              className="w-full p-3 border border-slate-300 rounded-lg"
              placeholder="Plan details shown on home page..."
              value={planForm.description}
              onChange={(e) => setPlanForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Plan Features</label>
            <textarea
              rows={4}
              className="w-full p-3 border border-slate-300 rounded-lg"
              placeholder={`One feature per line\nAll classes\nRegular notes\nAdvanced notes`}
              value={planForm.features}
              onChange={(e) => setPlanForm((p) => ({ ...p, features: e.target.value }))}
            />
            <p className="mt-1 text-xs text-slate-500">Add one feature per line. This is useful for Premium and Premium Plus.</p>
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-6">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={planForm.isLifetimeFree}
                onChange={(e) =>
                  setPlanForm((p) => ({
                    ...p,
                    isLifetimeFree: e.target.checked,
                    periodMonths: e.target.checked ? '' : p.periodMonths || '6',
                  }))
                }
              />
              Lifetime Free
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={planForm.isActive}
                onChange={(e) => setPlanForm((p) => ({ ...p, isActive: e.target.checked }))}
              />
              Active
            </label>
          </div>
        </div>
        <button
          type="button"
          onClick={addPlan}
          disabled={savingPlans}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
        >
          <Plus size={16} />
          {savingPlans ? 'Adding...' : 'Add Plan'}
        </button>

        <div className="mt-6 space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">Current Plans</h3>
          {sortedPlans.length === 0 ? (
            <p className="text-slate-500 text-sm">No plans added yet.</p>
          ) : (
            sortedPlans.map((plan) => (
              <div key={plan.id} className="border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{plan.name}</p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {plan.tier === 'premium_plus' ? 'Premium Plus' : 'Premium'}
                  </p>
                  <p className="text-sm text-slate-600">
                    {plan.isLifetimeFree ? 'Lifetime Free' : `INR ${plan.cost || 0}`} | Period: {plan.periodMonths || '-'} month(s)
                    {plan.validUntil ? ` | Valid until: ${new Date(plan.validUntil).toLocaleDateString('en-IN')}` : ''}
                  </p>
                  {plan.description ? <p className="text-xs text-slate-500 mt-1">{plan.description}</p> : null}
                  {Array.isArray(plan.features) && plan.features.length > 0 ? (
                    <p className="text-xs text-slate-500 mt-1">{plan.features.join(' • ')}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => togglePlanActive(plan.id)}
                    className={`px-3 py-1.5 rounded text-sm font-semibold ${plan.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}
                  >
                    {plan.isActive ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removePlan(plan.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-semibold bg-red-100 text-red-700 hover:bg-red-200"
                  >
                    <Trash2 size={14} />
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
