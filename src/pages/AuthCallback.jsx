import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const completeOAuth = async () => {
      if (!window.opener) {
        navigate('/login', { replace: true });
        return;
      }

      const maxWait = 8000;
      const startedAt = Date.now();
      let session = null;
      let lastError = null;

      while (Date.now() - startedAt < maxWait) {
        if (cancelled) return;
        const { data, error } = await supabase.auth.getSession();
        if (data?.session) {
          session = data.session;
          break;
        }
        if (error) lastError = error;
        await new Promise((r) => setTimeout(r, 300));
      }

      if (!cancelled && window.opener) {
        if (session) {
          window.opener.postMessage(
            {
              type: 'SucessKart-oauth-callback',
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              user: {
                id: session.user.id,
                email: session.user.email,
                app_metadata: session.user.app_metadata,
                user_metadata: session.user.user_metadata,
              },
            },
            window.location.origin
          );
        } else {
          window.opener.postMessage(
            {
              type: 'SucessKart-oauth-callback',
              error: lastError?.message || 'OAuth completed but no session was created.',
            },
            window.location.origin
          );
        }
        window.close();
      }
    };

    completeOAuth();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="rounded-2xl bg-white p-8 shadow-xl text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        <p className="text-slate-700 font-medium">Completing sign in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
