import React, { useState, useEffect } from 'react';
import { ZoomIn } from 'lucide-react';

const getZoomPercent = () => {
  try {
    if (typeof window === 'undefined') return 100;

    if (window.visualViewport && typeof window.visualViewport.scale === 'number' && window.visualViewport.scale > 0) {
      const scale = window.visualViewport.scale;
      if (Math.abs(scale - 1) > 0.02) {
        return Math.round(scale * 100);
      }
    }

    const viewportEstimate =
      window.outerWidth && window.innerWidth
        ? Math.round((window.outerWidth / window.innerWidth) * 100)
        : null;
    const dpr = Number(window.devicePixelRatio || 1);
    const commonDeviceScale = dpr > 2 ? 2 : dpr > 1.5 ? 1.5 : dpr > 1.25 ? 1.25 : 1;
    const dprEstimate = Math.round((dpr / commonDeviceScale) * 100);
    const estimates = [viewportEstimate, dprEstimate].filter((value) => Number.isFinite(value) && value > 30 && value < 300);
    if (!estimates.length) return 100;
    return Math.min(...estimates);
  } catch {
    return 100;
  }
};

const STORAGE_KEY = 'sucesskart_zoom_detector_dismissed';

const ZoomDetector = () => {
  const [zoom, setZoom] = useState(getZoomPercent);
  const [stableHighCount, setStableHighCount] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const check = () => {
      const nextZoom = getZoomPercent();
      setZoom(nextZoom);
      setStableHighCount((count) => (nextZoom > 80 ? Math.min(count + 1, 3) : 0));
    };
    check();
    window.addEventListener('resize', check);
    const interval = setInterval(check, 2000);
    return () => {
      window.removeEventListener('resize', check);
      clearInterval(interval);
    };
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {}
  };

  if (dismissed || zoom <= 80 || stableHighCount < 2) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 text-center space-y-5 pointer-events-auto">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <ZoomIn size={32} className="text-red-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Zoom Too High</h2>
          <p className="mt-2 text-sm text-slate-500">
            Current zoom: <span className="font-semibold text-red-600">{zoom}%</span>. For best experience, set zoom to 80% or lower.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="w-full rounded-xl bg-red-600 py-3 font-bold text-white hover:bg-red-700 transition"
        >
          OK
        </button>
      </div>
    </div>
  );
};

export default ZoomDetector;
