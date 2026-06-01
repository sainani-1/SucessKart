import React, { useEffect, useRef, useState } from 'react';
import { Camera, ShieldCheck } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { extractFaceDescriptorFromVideo, getFaceAuthSettings, isFaceDescriptorMatch, markFaceMfaVerified } from '../utils/faceAuth';

const FaceMfaVerify = () => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [message, setMessage] = useState('');

  const nextPath = location.state?.next || '/app';
  const settings = getFaceAuthSettings(profile);

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

  const verifyFace = async () => {
    if (!cameraReady) {
      setErrorMsg('Start camera first.');
      return;
    }
    setChecking(true);
    setErrorMsg('');
    setMessage('Checking for a live face...');
    try {
      const result = await extractFaceDescriptorFromVideo(videoRef.current);
      if (!isFaceDescriptorMatch(result.descriptor, settings.descriptor)) {
        setMessage('');
        setErrorMsg('Face did not match this account. Please try again with the registered person.');
        return;
      }
      markFaceMfaVerified(profile.id);
      stopCamera();
      navigate(nextPath, { replace: true });
    } catch (error) {
      setMessage('');
      setErrorMsg(error?.message || 'Face verification failed. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading face verification..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return <LoadingSpinner message="Loading profile..." />;
  if (!settings.mfaEnabled || !settings.descriptor) return <Navigate to={nextPath} replace />;

  return (
    <div className="min-h-screen bg-slate-100 p-4 flex items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Face MFA</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900">Verify Your Face</h1>
          <p className="mt-2 text-sm text-slate-500">A live face check is required before opening your dashboard.</p>
        </div>

        <div className="overflow-hidden rounded-xl bg-slate-950">
          <video ref={videoRef} autoPlay muted playsInline className="h-80 w-full object-cover" />
        </div>

        {errorMsg ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{errorMsg}</div> : null}
        {message ? <div className="mt-4 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold text-cyan-700">{message}</div> : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={startCamera}
            disabled={cameraLoading || checking}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Camera size={16} />
            {cameraLoading ? 'Starting...' : cameraReady ? 'Restart Camera' : 'Start Camera'}
          </button>
          <button
            type="button"
            onClick={verifyFace}
            disabled={!cameraReady || checking}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            <ShieldCheck size={16} />
            {checking ? 'Verifying...' : 'Verify Face'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FaceMfaVerify;
