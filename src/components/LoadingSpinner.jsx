import React from 'react';

const LoadingSpinner = ({ message = 'Loading...', fullPage = true }) => {
  if (fullPage) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center z-50">
        <div className="text-center space-y-6">
          {/* Animated Logo/Spinner */}
          <div className="flex justify-center">
            <div className="relative w-24 h-24">
              {/* Outer spinning ring */}
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-gold-400 border-r-gold-400 animate-spin"></div>
              
              {/* Middle spinning ring */}
              <div className="absolute inset-3 rounded-full border-4 border-transparent border-b-blue-400 border-l-blue-400 animate-spin" style={{ animationDirection: 'reverse' }}></div>
              
              {/* Inner pulsing circle */}
              <div className="absolute inset-6 rounded-full bg-gradient-to-br from-gold-400 to-blue-400 animate-pulse"></div>
              
              {/* Center icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center">
                  <span className="text-gold-400 text-xl font-bold">S</span>
                </div>
              </div>
            </div>
          </div>

          {/* Text */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">{message}</h2>
            <div className="flex justify-center gap-1">
              <span className="w-2 h-2 bg-gold-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
              <span className="w-2 h-2 bg-gold-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
              <span className="w-2 h-2 bg-gold-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-64 h-1 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-gold-400 to-blue-400 rounded-full animate-pulse" style={{
              width: '40%',
              animation: 'slide 2s infinite'
            }}></div>
          </div>
        </div>

        <style>{`
          @keyframes slide {
            0% { width: 20%; }
            50% { width: 80%; }
            100% { width: 20%; }
          }
        `}</style>
      </div>
    );
  }

  // Inline loading
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-gold-400 border-r-gold-400 animate-spin"></div>
        <div className="absolute inset-2 rounded-full border-4 border-transparent border-b-blue-400 border-l-blue-400 animate-spin" style={{ animationDirection: 'reverse' }}></div>
      </div>
      <p className="text-slate-600 font-semibold">{message}</p>
    </div>
  );
};

export default LoadingSpinner;
