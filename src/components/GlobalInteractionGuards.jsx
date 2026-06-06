import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { hasDevToolsSizeSignal } from '../utils/devtoolsDetection';
import Toast from './Toast';

const SETTING_KEYS = [
  'disable_right_click_global',
  'disable_ctrl_u_global',
  'disable_ctrl_shift_i_global',
  'disable_ctrl_shift_j_global',
  'disable_ctrl_shift_c_global',
  'disable_f12_global',
  'disable_windows_g_global',
  'detect_devtools_global',
];

const DEFAULT_SETTINGS = {
  disable_right_click_global: true,
  disable_ctrl_u_global: true,
  disable_ctrl_shift_i_global: true,
  disable_ctrl_shift_j_global: true,
  disable_ctrl_shift_c_global: true,
  disable_f12_global: true,
  disable_windows_g_global: true,
  detect_devtools_global: true,
};

const parseBooleanSetting = (value, fallback) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
};

const GlobalInteractionGuards = () => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [blocked, setBlocked] = useState(false);
  const [shortcutWarning, setShortcutWarning] = useState(false);
  const detectionStrikesRef = useRef(0);
  const lastResizeAtRef = useRef(0);
  const mountedAtRef = useRef(Date.now());
  const maxViewportRef = useRef({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('key, value')
          .in('key', SETTING_KEYS);

        if (error) throw error;

        const nextSettings = { ...DEFAULT_SETTINGS };
        (data || []).forEach((row) => {
          nextSettings[row.key] = parseBooleanSetting(row.value, DEFAULT_SETTINGS[row.key]);
        });

        if (active) {
          setSettings(nextSettings);
        }
      } catch {
        if (active) {
          setSettings(DEFAULT_SETTINGS);
        }
      }
    };

    loadSettings();

    const channel = supabase
      .channel('global-interaction-guards-settings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        (payload) => {
          const key = payload?.new?.key || payload?.old?.key;
          if (SETTING_KEYS.includes(key)) {
            loadSettings();
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const blockContextMenu = (event) => {
      if (!settings.disable_right_click_global) return;
      event.preventDefault();
    };

    const blockRestrictedShortcuts = (event) => {
      const key = String(event.key || '').toLowerCase();
      const code = String(event.code || '').toLowerCase();
      const usesModifier = event.ctrlKey || event.metaKey;
      const isMetaPressed =
        event.metaKey ||
        key === 'meta' ||
        key === 'os' ||
        code === 'metaleft' ||
        code === 'metaright' ||
        code === 'osleft' ||
        code === 'osright';
      const isF12 = settings.disable_f12_global && key === 'f12';
      const isInspectShortcut =
        settings.disable_ctrl_shift_i_global && usesModifier && event.shiftKey && (key === 'i' || code === 'keyi');
      const isConsoleShortcut =
        settings.disable_ctrl_shift_j_global && usesModifier && event.shiftKey && (key === 'j' || code === 'keyj');
      const isElementPickerShortcut =
        settings.disable_ctrl_shift_c_global && usesModifier && event.shiftKey && (key === 'c' || code === 'keyc');
      const isViewSourceShortcut = settings.disable_ctrl_u_global && usesModifier && (key === 'u' || code === 'keyu');
      const isGameBarShortcut =
        settings.disable_windows_g_global && isMetaPressed && (key === 'g' || code === 'keyg');

      if (
        isF12 ||
        isInspectShortcut ||
        isConsoleShortcut ||
        isElementPickerShortcut ||
        isViewSourceShortcut ||
        isGameBarShortcut
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        setShortcutWarning(true);
      }
    };

    const detectDevTools = () => {
      if (!settings.detect_devtools_global) return;
      if (Date.now() - mountedAtRef.current < 2500) return;
      const windowRecentlyResized = Date.now() - lastResizeAtRef.current < 1200;
      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;
      const maxWidth = maxViewportRef.current.width;
      const maxHeight = maxViewportRef.current.height;
      const viewportShrinkDetected =
        (maxWidth - currentWidth > 260 && currentWidth < maxWidth * 0.82) ||
        (maxHeight - currentHeight > 320 && currentHeight < maxHeight * 0.72);
      const detected = !windowRecentlyResized && (hasDevToolsSizeSignal() || viewportShrinkDetected);

      if (detected) {
        detectionStrikesRef.current += 1;
        if (detectionStrikesRef.current >= 2) {
          setBlocked(true);
        }
      } else {
        detectionStrikesRef.current = 0;
        maxViewportRef.current = {
          width: Math.max(maxViewportRef.current.width, currentWidth),
          height: Math.max(maxViewportRef.current.height, currentHeight),
        };
      }
    };
    const handleResize = () => {
      lastResizeAtRef.current = Date.now();
      window.setTimeout(detectDevTools, 1300);
    };

    document.addEventListener('contextmenu', blockContextMenu, true);
    window.addEventListener('contextmenu', blockContextMenu, true);
    document.addEventListener('keydown', blockRestrictedShortcuts, true);
    window.addEventListener('keydown', blockRestrictedShortcuts, true);
    window.addEventListener('resize', handleResize, true);
    window.addEventListener('focus', detectDevTools, true);
    window.addEventListener('mousemove', detectDevTools, true);
    window.addEventListener('keyup', detectDevTools, true);
    detectDevTools();
    const devToolsInterval = window.setInterval(detectDevTools, 500);

    return () => {
      document.removeEventListener('contextmenu', blockContextMenu, true);
      window.removeEventListener('contextmenu', blockContextMenu, true);
      document.removeEventListener('keydown', blockRestrictedShortcuts, true);
      window.removeEventListener('keydown', blockRestrictedShortcuts, true);
      window.removeEventListener('resize', handleResize, true);
      window.removeEventListener('focus', detectDevTools, true);
      window.removeEventListener('mousemove', detectDevTools, true);
      window.removeEventListener('keyup', detectDevTools, true);
      window.clearInterval(devToolsInterval);
    };
  }, [settings]);

  if (!blocked) {
    return (
      <Toast
        show={shortcutWarning}
        message="You are not allowed to use developer tools."
        type="warning"
        duration={3000}
        onClose={() => setShortcutWarning(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center text-white">
      <div>
        <h1 className="text-3xl font-bold">Access blocked</h1>
        <p className="mt-3 text-sm text-slate-200">Close developer tools and refresh the page.</p>
      </div>
    </div>
  );
};

export default GlobalInteractionGuards;
