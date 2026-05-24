import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

const OfflineBanner = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center">
      <div className="text-center px-6 max-w-md">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
          <WifiOff size={40} className="text-red-600" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-800">You are offline</h2>
        <p className="mt-2 text-base text-slate-500">
          Please connect to the internet and try again.
        </p>
        <div className="mx-auto mt-8 h-1.5 w-48 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full w-full origin-left animate-pulse rounded-full bg-red-400" />
        </div>
      </div>
    </div>
  );
};

export default OfflineBanner;
