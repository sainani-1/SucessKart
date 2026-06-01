import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import QRCode from 'qrcode.react';
import AlertModal from '../components/AlertModal';

// You need to install 'otplib' for TOTP generation and validation
// npm install otplib
import { authenticator } from 'otplib';

const AdminMFARegister = () => {
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

  // Generate MFA secret and QR
  const handleGenerate = () => {
    const newSecret = authenticator.generateSecret();
    setSecret(newSecret);
    const otpauth = authenticator.keyuri('admin', 'SucessKart', newSecret);
    setQr(otpauth);
  };

  // Register MFA secret in DB
  const handleRegister = async () => {
    if (!secret || !code) return;
    const isValid = authenticator.check(code, secret);
    if (!isValid) {
      setAlertModal({ show: true, title: 'Invalid Code', message: 'The code entered is not valid.', type: 'error' });
      return;
    }
    // Save secret to profile (add mfa_secret column in DB for admins)
    const { error } = await supabase
      .from('profiles')
      .update({ mfa_secret: secret })
      .eq('role', 'admin')
      .eq('email', supabase.auth.user().email);
    if (error) {
      setAlertModal({ show: true, title: 'Error', message: error.message, type: 'error' });
      return;
    }
    setAlertModal({ show: true, title: 'Success', message: 'MFA registered successfully.', type: 'success' });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <AlertModal {...alertModal} onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })} />
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-8">Admin MFA Registration</h1>
        {!secret ? (
          <button className="w-full btn-gold py-3 mb-4" onClick={handleGenerate}>Generate MFA Secret</button>
        ) : (
          <>
            <div className="flex flex-col items-center mb-4">
              <QRCode value={qr} />
              <p className="mt-2 text-sm">Scan this QR code in your authenticator app.</p>
            </div>
            <input
              type="text"
              className="w-full p-3 border rounded-lg bg-slate-50 mb-4"
              placeholder="Enter code from app"
              value={code}
              onChange={e => setCode(e.target.value)}
            />
            <button className="w-full btn-gold py-3" onClick={handleRegister}>Register MFA</button>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminMFARegister;
