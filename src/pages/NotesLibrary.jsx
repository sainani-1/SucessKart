import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Lock, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { getNotesLibrarySettingKey, getProtectedNotesPreview, parseNotesLibraryItems } from '../utils/notesLibrary';
import { buildPlanCheckoutPath } from '../utils/planCheckout';

const UpgradeCard = ({ title, message, ctaLabel, planTier }) => (
  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
    <Lock size={30} className="mx-auto text-amber-600" />
    <h2 className="mt-4 text-2xl font-bold text-amber-900">{title}</h2>
    <p className="mt-2 text-sm text-amber-800">{message}</p>
    <Link
      to={buildPlanCheckoutPath(planTier)}
      className="mt-5 inline-flex items-center justify-center rounded-lg bg-amber-600 px-5 py-3 font-semibold text-white hover:bg-amber-700"
    >
      {ctaLabel}
    </Link>
  </div>
);

const NotesLibrary = () => {
  const { profile, isPremium, isPremiumPlus } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [activeId, setActiveId] = useState(null);

  const premium = isPremium(profile);
  const premiumPlus = isPremiumPlus(profile);

  useEffect(() => {
    let mounted = true;

    const loadNotes = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('settings')
          .select('value')
          .eq('key', getNotesLibrarySettingKey())
          .maybeSingle();

        if (error) throw error;
        const parsed = parseNotesLibraryItems(data?.value).filter((item) => item.isActive);
        if (!mounted) return;
        setItems(parsed);
        setActiveId(parsed[0]?.id || null);
      } catch {
        if (mounted) {
          setItems([]);
          setActiveId(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadNotes();
    return () => {
      mounted = false;
    };
  }, []);

  const activeItem = useMemo(
    () => items.find((item) => item.id === activeId) || items[0] || null,
    [activeId, items]
  );
  const activePreview = getProtectedNotesPreview(activeItem?.notesUrl);

  if (loading) return <LoadingSpinner message="Loading notes library..." />;

  if (!premium) {
    return (
      <UpgradeCard
        title="Premium Plus required"
        message="This separate advanced notes library is available only to Premium Plus students. Buy Premium Plus to continue."
        ctaLabel="Buy Premium Plus"
        planTier="premium_plus"
      />
    );
  }

  if (!premiumPlus) {
    return (
      <UpgradeCard
        title="Upgrade to Premium Plus"
        message="Your current Premium plan includes classes and core access. Upgrade to Premium Plus to unlock this advanced notes library."
        ctaLabel="Upgrade to Premium Plus"
        planTier="premium_plus"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-blue-900 to-slate-800 p-6 text-white">
        <h1 className="text-2xl font-bold">Premium Plus Notes Library</h1>
        <p className="mt-1 text-sm text-slate-200">Advanced notes are previewed inside SucessKart only.</p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <FileText size={32} className="mx-auto text-slate-300" />
          <p className="mt-3 text-slate-600">No Premium Plus notes have been published yet.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-900">Available Notes</h2>
            <div className="space-y-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveId(item.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    activeItem?.id === item.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.title} className="mb-3 h-32 w-full rounded-lg object-cover" />
                  ) : null}
                  <p className="font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-blue-700">{item.category}</p>
                  {item.description ? <p className="mt-2 text-sm text-slate-600">{item.description}</p> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {activeItem?.imageUrl ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <img src={activeItem.imageUrl} alt={activeItem.title} className="h-60 w-full object-cover" />
                <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
                  Preview image only. External source links are not shown here.
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Notes stay inside SucessKart preview. Download links and visible source links are not shown.
            </div>

            {activePreview?.type === 'blocked' ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                <ShieldAlert size={28} className="mx-auto text-amber-600" />
                <p className="mt-3 font-semibold text-amber-900">Preview blocked</p>
                <p className="mt-1 text-sm text-amber-800">{activePreview.message}</p>
              </div>
            ) : activePreview?.src ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm">
                <iframe
                  title={activeItem?.title || 'Protected note preview'}
                  src={activePreview.src}
                  className="h-[72vh] w-full bg-white"
                  sandbox="allow-same-origin allow-scripts"
                  allow="fullscreen"
                  allowFullScreen
                  onContextMenu={(event) => event.preventDefault()}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                <FileText size={32} className="mx-auto text-slate-300" />
                <p className="mt-3 text-slate-600">No preview is available for this note yet.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotesLibrary;
