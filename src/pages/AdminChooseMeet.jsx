import React, { useEffect, useState } from 'react';
import { Video, Save } from 'lucide-react';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';

const SETTING_KEY = 'class_meeting_provider';

export default function AdminChooseMeet() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState('jitsi');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const loadProvider = async () => {
      try {
        setLoading(true);
        const { data, error: loadError } = await supabase
          .from('settings')
          .select('value')
          .eq('key', SETTING_KEY)
          .maybeSingle();

        if (loadError) throw loadError;
        setProvider(data?.value === 'livekit' ? 'livekit' : 'jitsi');
      } catch (err) {
        setError(err.message || 'Failed to load meeting provider.');
      } finally {
        setLoading(false);
      }
    };

    void loadProvider();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setInfo('');
      const nextProvider = provider === 'livekit' ? 'livekit' : 'jitsi';
      const { error: saveError } = await supabase
        .from('settings')
        .upsert({ key: SETTING_KEY, value: nextProvider }, { onConflict: 'key' });

      if (saveError) throw saveError;
      setInfo(`Class meetings will now use ${nextProvider === 'livekit' ? 'LiveKit' : 'Jitsi'} inside SucessKart.`);
    } catch (err) {
      setError(err.message || 'Failed to save meeting provider.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading meeting provider..." />;
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-blue-800 p-6 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-white/10 p-3">
            <Video className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Choose Meet</h1>
            <p className="mt-1 text-sm text-slate-200">Select which meeting engine SucessKart will use for built-in live classes.</p>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {info ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{info}</div> : null}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Class Meeting Provider</h2>
        <p className="mt-1 text-sm text-slate-500">Only admins choose the engine here. Teachers and students will still see the built-in meeting branded as SucessKart.</p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setProvider('jitsi')}
            className={`rounded-3xl border-2 p-5 text-left transition ${
              provider === 'jitsi'
                ? 'border-blue-600 bg-blue-50 shadow-sm'
                : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-white'
            }`}
          >
            <p className="text-sm font-semibold text-slate-900">Jitsi</p>
            <p className="mt-1 text-xs text-slate-500">Uses the built-in SucessKart meeting flow powered by Jitsi.</p>
          </button>

          <button
            type="button"
            onClick={() => setProvider('livekit')}
            className={`rounded-3xl border-2 p-5 text-left transition ${
              provider === 'livekit'
                ? 'border-emerald-600 bg-emerald-50 shadow-sm'
                : 'border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-white'
            }`}
          >
            <p className="text-sm font-semibold text-slate-900">LiveKit</p>
            <p className="mt-1 text-xs text-slate-500">Uses the built-in SucessKart room integration powered by LiveKit.</p>
          </button>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-2xl bg-amber-600 px-5 py-3 font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Saving...' : 'Save Provider'}</span>
          </button>
          <p className="text-xs text-slate-500">The selected engine will be used the next time the class schedule page loads.</p>
        </div>
      </div>
    </div>
  );
}
