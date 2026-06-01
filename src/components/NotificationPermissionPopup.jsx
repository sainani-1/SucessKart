import React from 'react';
import { BellRing, X } from 'lucide-react';

const NotificationPermissionPopup = ({
  open,
  permissionStatus = 'default',
  onAllow,
  onSkip,
}) => {
  if (!open) return null;

  const isBlocked = permissionStatus === 'denied';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="bg-slate-950 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gold-400 text-slate-950">
                <BellRing size={22} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">Notification Permission</p>
                <h2 className="text-lg font-bold">Allow notifications?</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Close notification permission popup"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-sm leading-6 text-slate-600">
            SucessKart can send updates for classes, exams, certificates, messages, and account activity.
          </p>
          <div className={`rounded-lg border px-4 py-3 text-sm ${isBlocked ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            {isBlocked
              ? 'Notifications are currently blocked in this browser. Allow them from site settings, then try again.'
              : 'If notifications are not allowed, this reminder appears again when you move between sidebar pages.'}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Not Now
          </button>
          <button
            type="button"
            onClick={onAllow}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-gold-300"
          >
            Allow Notifications
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationPermissionPopup;
