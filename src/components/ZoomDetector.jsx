import React, { useState, useEffect } from 'react';
import { ZoomIn, X } from 'lucide-react';

let defaultDPR = typeof window !== 'undefined' ? window.devicePixelRatio : 1;

const getZoomPercent = () => {
  try {
    if (typeof window === 'undefined') return 100;
    if (window.visualViewport && typeof window.visualViewport.scale === 'number' && window.visualViewport.scale > 0) {
      const scale = window.visualViewport.scale;
      if (Math.abs(scale - 1) > 0.02) {
        return Math.round(scale * 100);
      }
    }
    return Math.round((window.devicePixelRatio / defaultDPR) * 100);
  } catch {
    return 100;
  }
};

const ZoomDetector = () => {
  const [zoom, setZoom] = useState(getZoomPercent);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const check = () => {
      setZoom(getZoomPercent());
    };
    check();
    window.addEventListener('resize', check);
    const interval = setInterval(check, 2000);
    return () => {
      window.removeEventListener('resize', check);
      clearInterval(interval);
    };
  }, []);

  if (dismissed || zoom >= 85) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-50 border-b-2 border-amber-400 px-4 py-2.5 shadow-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="bg-amber-100 p-1.5 rounded-full">
            <ZoomIn size={16} className="text-amber-700" />
          </div>
          <div>
            <span className="text-sm font-semibold text-amber-900">
              Current zoom: <span className="text-amber-700">{zoom}%</span>
            </span>
            <span className="text-sm text-amber-700 ml-2">
              For best experience, set zoom to 85% or lower.
            </span>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-500 hover:text-amber-700 p-1 rounded-full hover:bg-amber-100 transition-colors shrink-0"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default ZoomDetector;
