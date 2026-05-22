import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Image, QrCode, Save } from 'lucide-react';
import AlertModal from '../components/AlertModal';
import LoadingSpinner from '../components/LoadingSpinner';

const AdminPaymentQR = () => {
  const [premiumQr, setPremiumQr] = useState('');
  const [premiumPlusQr, setPremiumPlusQr] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });
  const premiumInputRef = useRef(null);
  const premiumPlusInputRef = useRef(null);

  useEffect(() => {
    loadQrCodes();
  }, []);

  const loadQrCodes = async () => {
    try {
      const { data } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['manual_payment_qr_premium', 'manual_payment_qr_plus']);
      (data || []).forEach((setting) => {
        if (setting.key === 'manual_payment_qr_premium') setPremiumQr(setting.value || '');
        if (setting.key === 'manual_payment_qr_plus') setPremiumPlusQr(setting.value || '');
      });
    } catch (error) {
      console.error('Error loading QR codes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (file, setter) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setter(e.target.result);
    reader.readAsDataURL(file);
  };

  const saveQrCode = async (key, value) => {
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' });
    if (error) throw error;
  };

  const handleSave = async () => {
    if (!premiumQr && !premiumPlusQr) {
      setAlertModal({
        show: true, title: 'No QR Codes',
        message: 'Please upload at least one QR code before saving.',
        type: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      if (premiumQr) await saveQrCode('manual_payment_qr_premium', premiumQr);
      if (premiumPlusQr) await saveQrCode('manual_payment_qr_plus', premiumPlusQr);
      setAlertModal({
        show: true, title: 'Saved',
        message: 'QR codes saved successfully.',
        type: 'success',
      });
    } catch (error) {
      setAlertModal({
        show: true, title: 'Error',
        message: `Failed to save: ${error.message}`,
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading QR codes..." />;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 to-slate-700 p-6 rounded-xl text-white">
        <h1 className="text-2xl font-bold mb-1">Payment QR Codes</h1>
        <p className="text-slate-200">Upload QR code images for Premium and Premium Plus manual payments.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <QrCode size={20} className="text-amber-600" />
            Premium QR Code
          </h2>
          {premiumQr ? (
            <div className="mb-4">
              <img src={premiumQr} alt="Premium QR" className="max-w-[200px] mx-auto rounded-lg border" />
            </div>
          ) : (
            <div className="mb-4 p-8 bg-slate-50 rounded-lg border-2 border-dashed text-center text-slate-400">
              No QR code uploaded yet
            </div>
          )}
          <input
            ref={premiumInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files[0], setPremiumQr)}
          />
          <button
            type="button"
            onClick={() => premiumInputRef.current?.click()}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700"
          >
            <Image size={16} />
            {premiumQr ? 'Change QR Code' : 'Upload QR Code'}
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <QrCode size={20} className="text-indigo-600" />
            Premium Plus QR Code
          </h2>
          {premiumPlusQr ? (
            <div className="mb-4">
              <img src={premiumPlusQr} alt="Premium Plus QR" className="max-w-[200px] mx-auto rounded-lg border" />
            </div>
          ) : (
            <div className="mb-4 p-8 bg-slate-50 rounded-lg border-2 border-dashed text-center text-slate-400">
              No QR code uploaded yet
            </div>
          )}
          <input
            ref={premiumPlusInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files[0], setPremiumPlusQr)}
          />
          <button
            type="button"
            onClick={() => premiumPlusInputRef.current?.click()}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
          >
            <Image size={16} />
            {premiumPlusQr ? 'Change QR Code' : 'Upload QR Code'}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
      >
        <Save size={16} />
        {saving ? 'Saving...' : 'Save QR Codes'}
      </button>

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

export default AdminPaymentQR;
