import React, { useEffect, useRef, useState } from 'react';
import { Camera, ShieldCheck, Trash2, UserCheck, RefreshCw, CheckCircle, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  captureVideoFrame,
  detectFaceFromVideo,
  extractFaceDescriptorFromImage,
  getFaceAuthSettings,
  saveFaceAuthSettings,
  uploadFaceAuthImage,
} from '../utils/faceAuth';
import LoadingSpinner from '../components/LoadingSpinner';

const FaceAuthSettings = () => {
  const { profile, fetchProfile } = useAuth();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [capturedFile, setCapturedFile] = useState(null);
  const [checking, setChecking] = useState(false);
  const [settings, setSettings] = useState(() => getFaceAuthSettings(profile));
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [successModal, setSuccessModal] = useState({ show: false, title: '', message: '' });

  useEffect(() => {
    setSettings(getFaceAuthSettings(profile));
  }, [profile]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  };

  useEffect(() => () => stopCamera(), []);

  const startCamera = async () => {
    setErrorMsg('');
    setMessage('');
    setCapturedImage(null);
    setCapturedFile(null);
    setCapturing(false);
    setCameraLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (error) {
      setErrorMsg(error?.message || 'Unable to access camera.');
    } finally {
      setCameraLoading(false);
    }
  };

  const captureFace = async () => {
    if (!cameraReady || !videoRef.current) return;
    setCapturing(true);
    setErrorMsg('');
    setMessage('Capturing face...');
    try {
      const result = await detectFaceFromVideo(videoRef.current);
      if (!result.detected) {
        setErrorMsg('No face detected. Make sure your face is clearly visible.');
        setMessage('');
        setCapturing(false);
        return;
      }
      const file = result.file;
      setCapturedFile(file);
      setCapturedImage(URL.createObjectURL(file));
      stopCamera();
      setMessage('Face captured clearly!');
    } catch (err) {
      setErrorMsg(err?.message || 'Could not capture face.');
      setMessage('');
    } finally {
      setCapturing(false);
    }
  };

  const registerFace = async () => {
    if (!profile?.id) {
      setErrorMsg('Profile is still loading. Please try again.');
      return;
    }
    if (!capturedFile) {
      setErrorMsg('Capture your face first.');
      return;
    }

    setChecking(true);
    setErrorMsg('');
    setMessage('Registering face...');
    try {
      let imageUrl = settings.imageUrl || '';
      try {
        imageUrl = await uploadFaceAuthImage(profile.id, capturedFile);
      } catch {
        imageUrl = settings.imageUrl || '';
      }

      const descriptorArr = await extractFaceDescriptorFromImage(capturedFile);

      const next = {
        enabled: true,
        mfaEnabled: settings.mfaEnabled,
        imageUrl,
        descriptor: descriptorArr,
        registeredAt: new Date().toISOString(),
      };
      const saved = await saveFaceAuthSettings(profile, next);
      setSettings(next);
      await fetchProfile(profile.id, { background: true });
      setCapturedImage(null);
      setCapturedFile(null);
      setSuccessModal({
        show: true,
        title: 'Face Registered!',
        message: saved.savedToSupabase
          ? 'Your face has been registered successfully. You can now use it to log in.'
          : 'Face registered on this browser. Run the face-auth migration to sync across devices.',
      });
    } catch (error) {
      setMessage('');
      setErrorMsg(error?.message || 'Could not register face.');
    } finally {
      setChecking(false);
    }
  };

  const toggleMfa = async () => {
    if (!settings.enabled) {
      setErrorMsg('Register face auth first, then enable face MFA.');
      return;
    }
    const next = { ...settings, mfaEnabled: !settings.mfaEnabled };
    try {
      const saved = await saveFaceAuthSettings(profile, next);
      setSettings(next);
      await fetchProfile(profile.id, { background: true });
      setMessage(saved.savedToSupabase ? 'Face MFA setting saved.' : 'Face MFA setting saved on this browser. Run the face-auth migration to sync across devices.');
      setErrorMsg('');
    } catch (error) {
      setErrorMsg(error?.message || 'Could not update face MFA setting.');
    }
  };

  const removeRegistration = async () => {
    const next = { enabled: false, mfaEnabled: false, imageUrl: '', registeredAt: null };
    try {
      const saved = await saveFaceAuthSettings(profile, next);
      setSettings(next);
      await fetchProfile(profile.id, { background: true });
      setSuccessModal({
        show: true,
        title: 'Face Auth Removed',
        message: saved.savedToSupabase ? 'Face authentication has been removed from your account.' : 'Face auth removed from this browser.',
      });
      setErrorMsg('');
    } catch (error) {
      setErrorMsg(error?.message || 'Could not remove face auth.');
    }
  };

  if (!profile) return <LoadingSpinner message="Loading face auth..." />;

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-slate-900 to-cyan-700 p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">Security</p>
        <h1 className="mt-2 text-2xl font-black">Face Auth</h1>
        <p className="mt-2 max-w-2xl text-sm text-cyan-50">
          Register a clear face photo once, then optionally require a live face check after email/password login.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {!capturedImage ? (
            <div className="overflow-hidden rounded-xl bg-slate-950">
              <video ref={videoRef} autoPlay muted playsInline className="h-80 w-full object-cover" />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-slate-950">
              <img
                src={capturedImage}
                alt="Captured face"
                className="h-80 w-full object-contain"
              />
            </div>
          )}

          {errorMsg ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{errorMsg}</div> : null}
          {message ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</div> : null}

          <div className="mt-4 flex flex-wrap gap-3">
            {!cameraReady && !capturedImage ? (
              <button
                type="button"
                onClick={startCamera}
                disabled={cameraLoading || checking}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <Camera size={16} />
                {cameraLoading ? 'Starting...' : 'Start Camera'}
              </button>
            ) : null}

            {cameraReady ? (
              <button
                type="button"
                onClick={captureFace}
                disabled={capturing || checking}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                <Camera size={16} />
                {capturing ? 'Capturing...' : 'Capture Face'}
              </button>
            ) : null}

            {capturedImage ? (
              <>
                <button
                  type="button"
                  onClick={registerFace}
                  disabled={checking}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <UserCheck size={16} />
                  {checking ? 'Registering...' : 'Register Face'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCapturedImage(null);
                    setCapturedFile(null);
                    startCamera();
                  }}
                  disabled={checking}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-600 px-4 py-2 font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                >
                  <RefreshCw size={16} />
                  Retake
                </button>
              </>
            ) : null}

            {!cameraReady && !capturedImage ? (
              <button
                type="button"
                onClick={removeRegistration}
                disabled={checking}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60"
              >
                <Trash2 size={16} />
                Remove
              </button>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className={settings.enabled ? 'text-emerald-600' : 'text-slate-400'} size={24} />
            <div>
              <p className="font-bold text-slate-900">{settings.enabled ? 'Face Registered' : 'Not Registered'}</p>
              <p className="text-xs text-slate-500">{settings.registeredAt ? new Date(settings.registeredAt).toLocaleString() : 'No face setup yet'}</p>
            </div>
          </div>

          {settings.imageUrl ? (
            <img src={settings.imageUrl} alt="Registered face" className="mt-4 h-36 w-36 rounded-xl border border-slate-200 object-cover" />
          ) : null}

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={settings.mfaEnabled}
                disabled={!settings.enabled}
                onChange={toggleMfa}
              />
              <span>
                <span className="block text-sm font-bold text-slate-900">Require face after password login</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  This adds a live face presence check after email/password login. It does not replace your password.
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>

      {successModal.show ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle className="text-emerald-600" size={22} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">{successModal.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSuccessModal({ show: false, title: '', message: '' })}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm leading-6 text-slate-600">{successModal.message}</p>
            </div>
            <div className="flex justify-end border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setSuccessModal({ show: false, title: '', message: '' })}
                className="rounded-lg bg-emerald-600 px-5 py-2 font-semibold text-white hover:bg-emerald-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default FaceAuthSettings;
