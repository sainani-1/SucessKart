import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  CheckCircle,
  Lock,
  Video,
  Award,
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Rewind,
  FastForward,
  ShieldAlert,
  EyeOff,
  Maximize2,
  Minimize2,
  Settings,
  Volume2,
  VolumeX
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import usePopup from '../hooks/usePopup.jsx';
import LoadingSpinner from '../components/LoadingSpinner';
import { fetchCourseProtectedAssets } from '../utils/courseProtectedAssets';
import { readBrowserState, upsertRecentItem, writeBrowserState } from '../utils/browserState';
import { buildPlanCheckoutPath } from '../utils/planCheckout';
import { getVideoCompletionPercent, readVideoProgress, writeVideoProgress } from '../utils/videoProgress';
import { logError } from '../utils/errorLogger';

const APP_ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
const VIDEO_PROGRESS_SAVE_INTERVAL_SECONDS = 5;
const COURSE_TAB_KEY_PREFIX = 'course_detail_active_tab_';
const RECENTLY_VIEWED_COURSES_KEY = 'recently_viewed_courses';

const extractIframeSrc = (value) => {
  const srcMatch = value.match(/src=["']([^"']+)["']/i);
  return srcMatch?.[1] || null;
};

const extractGoogleFileId = (value) => {
  const pathMatch = value.match(/\/d\/([a-zA-Z0-9_-]+)/i);
  if (pathMatch?.[1]) return pathMatch[1];

  try {
    const url = new URL(value);
    return url.searchParams.get('id');
  } catch {
    return null;
  }
};

const appendPdfViewerFlags = (url) => {
  if (!url) return url;
  if (!/\.pdf(\?|#|$)/i.test(url)) return url;
  const [base, hash = ''] = url.split('#');
  const hashParts = hash ? hash.split('&').filter(Boolean) : [];
  const required = ['toolbar=0', 'navpanes=0', 'scrollbar=1', 'view=FitH'];
  required.forEach((part) => {
    if (!hashParts.includes(part)) hashParts.push(part);
  });
  return `${base}#${hashParts.join('&')}`;
};

const normalizeYouTubeEmbed = (value) => {
  try {
    const directValue = value.includes('<iframe') ? extractIframeSrc(value) || value : value;
    let videoId = null;

    if (directValue.includes('youtu.be/')) {
      videoId = directValue.split('youtu.be/')[1]?.split(/[?&]/)[0];
    } else {
      const url = new URL(directValue);
      if (url.pathname.includes('/embed/')) {
        videoId = url.pathname.split('/embed/')[1]?.split('/')[0];
      } else if (url.pathname.includes('/shorts/')) {
        videoId = url.pathname.split('/shorts/')[1]?.split('/')[0];
      } else {
        videoId = url.searchParams.get('v');
      }
    }

    if (!videoId) return null;

    const originParam = APP_ORIGIN ? `&origin=${encodeURIComponent(APP_ORIGIN)}` : '';
    return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1${originParam}`;
  } catch {
    return null;
  }
};

const normalizeGoogleDrivePreview = (value) => {
  const fileId = extractGoogleFileId(value);
  if (!fileId) return null;
  return `https://drive.google.com/file/d/${fileId}/preview`;
};

const normalizeGoogleDriveVideoStream = (value) => {
  const fileId = extractGoogleFileId(value);
  if (!fileId) return null;
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
};

const normalizeGoogleDocsPreview = (value) => {
  const fileId = extractGoogleFileId(value);
  if (!fileId) return null;

  if (value.includes('/document/')) {
    return `https://docs.google.com/document/d/${fileId}/preview`;
  }
  if (value.includes('/presentation/')) {
    return `https://docs.google.com/presentation/d/${fileId}/embed`;
  }
  if (value.includes('/spreadsheets/')) {
    return `https://docs.google.com/spreadsheets/d/${fileId}/preview`;
  }

  return value;
};

const isCloudinaryVideoUrl = (value) => {
  try {
    const url = new URL(value);
    return url.hostname.includes('cloudinary.com') && url.pathname.includes('/video/upload/');
  } catch {
    return false;
  }
};

const isDirectVideoUrl = (value) => {
  try {
    const url = new URL(value);
    return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url.pathname) || isCloudinaryVideoUrl(value);
  } catch {
    return false;
  }
};

const parseVideoSource = (rawValue) => {
  if (!rawValue) return null;

  const value = rawValue.trim();
  if (!value) return null;

  if (value.includes('<iframe')) {
    const src = extractIframeSrc(value);
    if (src) {
      if (src.includes('drive.google.com')) {
        const fileId = extractGoogleFileId(src);
        const streamSrc = normalizeGoogleDriveVideoStream(src);
        if (fileId && streamSrc) {
          return {
            type: 'drive-video',
            src: streamSrc,
            fileId,
            previewSrc: normalizeGoogleDrivePreview(src)
          };
        }
      }
      return { type: 'iframe', src };
    }
  }

  if (value.includes('youtube.com') || value.includes('youtu.be')) {
    const src = normalizeYouTubeEmbed(value);
    if (src) {
      return {
        type: 'youtube',
        src,
        blocked: true,
        message: 'YouTube is blocked in the protected player because it can reveal the source video outside SkillPro. Use Google Drive preview or a direct hosted video URL instead.'
      };
    }
    return {
      type: 'youtube',
      blocked: true,
      message: 'This YouTube link is invalid or not embeddable.'
    };
  }

  if (value.includes('drive.google.com')) {
    const fileId = extractGoogleFileId(value);
    const src = normalizeGoogleDriveVideoStream(value);
    if (!fileId || !src) {
      return {
        type: 'drive',
        blocked: true,
        message: 'This Google Drive video link is not a valid file link. Paste a file URL like /file/d/... or an embed code.'
      };
    }
    return {
      type: 'drive-video',
      src,
      fileId,
      previewSrc: normalizeGoogleDrivePreview(value)
    };
  }

  if (isCloudinaryVideoUrl(value)) {
    return { type: 'cloudinary-video', src: value };
  }

  if (isDirectVideoUrl(value)) {
    return { type: 'direct-video', src: value };
  }

  return { type: 'url', src: value };
};

const parseNotesSource = (rawValue) => {
  if (!rawValue) return null;

  const value = rawValue.trim();
  if (!value) return null;

  if (value.includes('<iframe')) {
    const src = extractIframeSrc(value);
    if (src) {
      if (src.includes('drive.google.com')) {
        const previewSrc = normalizeGoogleDrivePreview(src);
        if (!previewSrc) {
          return {
            type: 'drive',
            blocked: true,
            message: 'This Google Drive notes link is not a valid file link. Paste a file URL like /file/d/... or a valid embed code.'
          };
        }
        return { type: 'drive', src: previewSrc };
      }
      if (src.includes('docs.google.com')) {
        const previewSrc = normalizeGoogleDocsPreview(src);
        if (!previewSrc) {
          return {
            type: 'docs',
            blocked: true,
            message: 'This Google Docs notes link is not a valid document/presentation/sheet link.'
          };
        }
        return { type: 'docs', src: previewSrc };
      }
      return { type: 'iframe', src };
    }
  }

  if (value.includes('drive.google.com')) {
    const src = normalizeGoogleDrivePreview(value);
    if (!src) {
      return {
        type: 'drive',
        blocked: true,
        message: 'This Google Drive notes link is not a valid file link. Paste a file URL like /file/d/... or a valid embed code.'
      };
    }
    return { type: 'drive', src };
  }

  if (value.includes('docs.google.com')) {
    const src = normalizeGoogleDocsPreview(value);
    if (!src) {
      return {
        type: 'docs',
        blocked: true,
        message: 'This Google Docs notes link is not a valid document/presentation/sheet link.'
      };
    }
    return { type: 'docs', src };
  }

  return { type: 'url', src: appendPdfViewerFlags(value) };
};

const ContentProtectionNotice = () => (
  <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
    <div className="flex items-start gap-3">
      <ShieldAlert size={18} className="mt-0.5 flex-shrink-0" />
      <div>
        <p className="font-semibold">Protected premium content</p>
        <p className="mt-1 text-amber-800">
          Viewing is limited to the logged-in premium account inside SkillPro. Right click, print, copy,
          common devtool shortcuts, and direct note downloads are blocked here.
        </p>
      </div>
    </div>
  </div>
);

const NotesUpgradeCard = ({ title, message, ctaLabel, planTier }) => (
  <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
    <Lock size={28} className="mx-auto text-amber-600" />
    <p className="mt-3 font-semibold text-amber-900">{title}</p>
    <p className="mt-1 text-sm text-amber-800">{message}</p>
    <Link
      to={buildPlanCheckoutPath(planTier)}
      className="mt-4 inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-amber-700"
    >
      {ctaLabel}
    </Link>
  </div>
);

const AssetBlockedState = ({ icon: Icon, title, message }) => (
  <div className="text-center text-white px-6">
    <Icon size={44} className="mx-auto mb-4 text-amber-400" />
    <p className="font-semibold">{title}</p>
    <p className="mt-2 text-sm text-slate-300">{message}</p>
  </div>
);

const ProtectedMediaFrame = ({
  title,
  badge = 'Protected player',
  children,
  className = '',
  lockFullscreenSurface = false,
  lockSurfaceAlways = false,
}) => {
  const frameRef = useRef(null);
  const idleTimerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isChromeIdle, setIsChromeIdle] = useState(false);

  useEffect(() => {
    const syncFullscreenState = () => {
      const nextIsFullscreen = document.fullscreenElement === frameRef.current;
      setIsFullscreen(nextIsFullscreen);
      if (!nextIsFullscreen) {
        setIsChromeIdle(false);
      }
    };

    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      setIsChromeIdle(false);
      return undefined;
    }

    const showChromeTemporarily = () => {
      setIsChromeIdle(false);
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = window.setTimeout(() => {
        setIsChromeIdle(true);
      }, 5000);
    };

    showChromeTemporarily();

    document.addEventListener('mousemove', showChromeTemporarily, true);
    document.addEventListener('mousedown', showChromeTemporarily, true);
    document.addEventListener('keydown', showChromeTemporarily, true);
    document.addEventListener('touchstart', showChromeTemporarily, true);

    return () => {
      document.removeEventListener('mousemove', showChromeTemporarily, true);
      document.removeEventListener('mousedown', showChromeTemporarily, true);
      document.removeEventListener('keydown', showChromeTemporarily, true);
      document.removeEventListener('touchstart', showChromeTemporarily, true);
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [isFullscreen]);

  const preventContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await frameRef.current?.requestFullscreen?.();
    } catch {
      // Browsers require fullscreen to be triggered by a user gesture.
    }
  };

  useEffect(() => {
    const handleFullscreenShortcut = (event) => {
      const tagName = String(event.target?.tagName || '').toLowerCase();
      if (['input', 'select', 'textarea'].includes(tagName)) return;
      if (String(event.key || '').toLowerCase() !== 'f') return;
      event.preventDefault();
      void toggleFullscreen();
    };

    document.addEventListener('keydown', handleFullscreenShortcut);
    return () => document.removeEventListener('keydown', handleFullscreenShortcut);
  });

  return (
    <div
      ref={frameRef}
      className={`skillpro-media-frame group relative flex h-full w-full flex-col overflow-hidden bg-slate-950 text-white ${
        isFullscreen && isChromeIdle ? 'skillpro-fullscreen-idle' : ''
      } ${className}`}
      onContextMenuCapture={preventContextMenu}
    >
      <div className="skillpro-player-chrome skillpro-frame-header flex min-h-[48px] items-center justify-between gap-3 border-b border-white/10 bg-slate-950/95 px-4 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="text-xs text-slate-400">{badge}</p>
        </div>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Open fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
        </button>
      </div>
      <div className="skillpro-frame-body relative min-h-0 flex-1">
        {children}
        {(lockSurfaceAlways || (lockFullscreenSurface && isFullscreen)) ? (
          <div
            className="absolute inset-0 z-20 cursor-default bg-transparent"
            onContextMenu={preventContextMenu}
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  );
};

const formatMediaTime = (value) => {
  if (!Number.isFinite(value) || value <= 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const DriveLockedIframe = ({ title, src }) => {
  const wrapperRef = useRef(null);
  const iframeRef = useRef(null);
  const unlockTimerRef = useRef(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [surfaceUnlocked, setSurfaceUnlocked] = useState(false);
  const [isSkillProFullscreen, setIsSkillProFullscreen] = useState(false);
  const [playWindowUsed, setPlayWindowUsed] = useState(false);

  useEffect(() => {
    const clearUnlockTimer = () => {
      if (unlockTimerRef.current) {
        window.clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
    };

    const scheduleSurfaceLock = () => {
      clearUnlockTimer();
      const fullscreenActive = Boolean(document.fullscreenElement);
      setIsSkillProFullscreen(fullscreenActive);

      if (!fullscreenActive) {
        setSurfaceUnlocked(false);
        setPlayWindowUsed(false);
        setIframeKey((key) => key + 1);
        return;
      }

      if (playWindowUsed) {
        setSurfaceUnlocked(false);
        window.setTimeout(() => iframeRef.current?.focus?.(), 0);
        return;
      }

      setSurfaceUnlocked(true);

      unlockTimerRef.current = window.setTimeout(() => {
        setSurfaceUnlocked(false);
        setPlayWindowUsed(true);
        window.setTimeout(() => iframeRef.current?.focus?.(), 0);
        unlockTimerRef.current = null;
      }, 3500);
    };

    document.addEventListener('fullscreenchange', scheduleSurfaceLock);
    scheduleSurfaceLock();

    const lockAfterIframeFocus = () => {
      if (!document.fullscreenElement || !surfaceUnlocked) return;
      window.setTimeout(() => {
        setSurfaceUnlocked(false);
        setPlayWindowUsed(true);
        window.setTimeout(() => iframeRef.current?.focus?.(), 0);
      }, 600);
    };

    window.addEventListener('blur', lockAfterIframeFocus);

    return () => {
      document.removeEventListener('fullscreenchange', scheduleSurfaceLock);
      window.removeEventListener('blur', lockAfterIframeFocus);
      clearUnlockTimer();
    };
  }, [playWindowUsed, surfaceUnlocked]);

  const unlockSurfaceBriefly = () => {
    if (!document.fullscreenElement || playWindowUsed) return;
    setSurfaceUnlocked(true);
    if (unlockTimerRef.current) {
      window.clearTimeout(unlockTimerRef.current);
    }
    unlockTimerRef.current = window.setTimeout(() => {
      setSurfaceUnlocked(false);
      setPlayWindowUsed(true);
      window.setTimeout(() => iframeRef.current?.focus?.(), 0);
      unlockTimerRef.current = null;
    }, 3500);
  };

  useEffect(() => {
    const focusDriveForKeyboard = (event) => {
      if (!document.fullscreenElement || surfaceUnlocked) return;

      const key = String(event.key || '').toLowerCase();
      const code = String(event.code || '').toLowerCase();
      const isDriveShortcut =
        key === 'arrowright' ||
        key === 'arrowleft' ||
        key === ' ' ||
        key === 'spacebar' ||
        code === 'arrowright' ||
        code === 'arrowleft' ||
        code === 'space';

      if (isDriveShortcut) {
        iframeRef.current?.focus?.();
      }
    };

    document.addEventListener('keydown', focusDriveForKeyboard, true);
    return () => document.removeEventListener('keydown', focusDriveForKeyboard, true);
  }, [surfaceUnlocked]);

  const enterSkillProFullscreen = async () => {
    try {
      const frame = wrapperRef.current?.closest?.('.skillpro-media-frame');
      await frame?.requestFullscreen?.();
    } catch {
      // Fullscreen requires a trusted user gesture.
    }
  };

  const preventSurfaceEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full bg-black"
      onContextMenuCapture={preventSurfaceEvent}
    >
      <iframe
        ref={iframeRef}
        key={iframeKey}
        title={title}
        width="100%"
        height="100%"
        src={src}
        frameBorder="0"
        allow="autoplay; encrypted-media"
        className="h-full w-full"
        tabIndex={0}
      />
      {!surfaceUnlocked ? (
        <div
          className="absolute inset-0 z-20 flex items-end justify-center bg-transparent p-4"
          onContextMenu={preventSurfaceEvent}
        >
          <div className="pointer-events-auto rounded-lg bg-slate-950/90 p-3 text-center text-xs font-semibold text-white shadow-xl">
            <p>
              {isSkillProFullscreen
                ? playWindowUsed
                  ? 'Drive surface locked. Return with Esc or F; video access stays protected.'
                  : 'Start the Drive video now. The surface locks immediately after playback starts.'
                : 'Enter SkillPro fullscreen to start this Drive video.'}
            </p>
            {isSkillProFullscreen && playWindowUsed ? null : (
              <button
                type="button"
                onClick={isSkillProFullscreen ? unlockSurfaceBriefly : enterSkillProFullscreen}
                className="mt-2 rounded-lg bg-blue-600 px-3 py-2 font-bold text-white transition hover:bg-blue-700"
              >
                {isSkillProFullscreen ? 'Start video' : 'Open fullscreen'}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const PLAYBACK_RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SLEEP_TIMER_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '60 min', value: 60 },
];
const QUALITY_OPTIONS = [
  { label: 'Auto', value: 'auto', width: null },
  { label: '480p', value: '480', width: 854 },
  { label: '720p', value: '720', width: 1280 },
  { label: '1080p', value: '1080', width: 1920 },
];

const buildCloudinaryQualityUrl = (src, quality) => {
  const option = QUALITY_OPTIONS.find((item) => item.value === quality);
  if (!option?.width || !isCloudinaryVideoUrl(src)) return src;
  try {
    const url = new URL(src);
    url.pathname = url.pathname.replace('/video/upload/', `/video/upload/q_auto,c_limit,w_${option.width}/`);
    return url.toString();
  } catch {
    return src;
  }
};

const CustomProtectedVideo = ({
  videoRef,
  src,
  onLoadedMetadata,
  onTimeUpdate,
  onPause,
  onEnded,
  onError,
}) => {
  const pendingQualityTimeRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [quality, setQuality] = useState('auto');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [watchIn3d, setWatchIn3d] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState(0);
  const displaySrc = useMemo(() => buildCloudinaryQualityUrl(src, quality), [src, quality]);
  const qualityLocked = !isCloudinaryVideoUrl(src);

  const preventContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  };

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return undefined;

    const syncPlayback = () => setIsPlaying(!element.paused);
    const syncTime = () => {
      setCurrentTime(element.currentTime || 0);
      setDuration(Number.isFinite(element.duration) ? element.duration : 0);
    };
    const syncVolume = () => {
      setVolume(element.volume);
      setMuted(element.muted);
    };

    syncTime();
    syncVolume();
    element.addEventListener('play', syncPlayback);
    element.addEventListener('pause', syncPlayback);
    element.addEventListener('timeupdate', syncTime);
    element.addEventListener('durationchange', syncTime);
    element.addEventListener('volumechange', syncVolume);

    return () => {
      element.removeEventListener('play', syncPlayback);
      element.removeEventListener('pause', syncPlayback);
      element.removeEventListener('timeupdate', syncTime);
      element.removeEventListener('durationchange', syncTime);
      element.removeEventListener('volumechange', syncVolume);
    };
  }, [videoRef, displaySrc]);

  const togglePlayback = async () => {
    const element = videoRef.current;
    if (!element) return;

    if (element.paused) {
      await element.play();
    } else {
      element.pause();
    }
  };

  const handleSeek = (event) => {
    const element = videoRef.current;
    if (!element) return;
    element.currentTime = Number(event.target.value);
    setCurrentTime(element.currentTime);
  };

  const seekBy = (seconds) => {
    const element = videoRef.current;
    if (!element) return;
    const nextTime = Math.min(Math.max((element.currentTime || 0) + seconds, 0), element.duration || 0);
    element.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  useEffect(() => {
    const handleKeyboardSeek = (event) => {
      const tagName = String(event.target?.tagName || '').toLowerCase();
      if (['input', 'select', 'textarea'].includes(tagName)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const key = String(event.key || '').toLowerCase();
      const code = String(event.code || '').toLowerCase();

      if (key === 'arrowright' || code === 'arrowright') {
        event.preventDefault();
        event.stopPropagation();
        seekBy(10);
      }
      if (key === 'arrowleft' || code === 'arrowleft') {
        event.preventDefault();
        event.stopPropagation();
        seekBy(-10);
      }
      if (key === ' ' || key === 'spacebar' || code === 'space') {
        event.preventDefault();
        event.stopPropagation();
        void togglePlayback();
      }
    };

    document.addEventListener('keydown', handleKeyboardSeek, true);
    return () => document.removeEventListener('keydown', handleKeyboardSeek, true);
  });

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.loop = loopEnabled;
  }, [loopEnabled, videoRef]);

  useEffect(() => {
    if (!sleepTimerMinutes) return undefined;

    const timerId = window.setTimeout(() => {
      const element = videoRef.current;
      element?.pause();
      setSleepTimerMinutes(0);
    }, sleepTimerMinutes * 60 * 1000);

    return () => window.clearTimeout(timerId);
  }, [sleepTimerMinutes, videoRef]);

  const restartVideo = () => {
    const element = videoRef.current;
    if (!element) return;
    element.currentTime = 0;
    setCurrentTime(0);
  };

  const toggleMuted = () => {
    const element = videoRef.current;
    if (!element) return;
    element.muted = !element.muted;
  };

  const handleVolume = (event) => {
    const element = videoRef.current;
    if (!element) return;
    const nextVolume = Number(event.target.value);
    element.volume = nextVolume;
    element.muted = nextVolume === 0;
  };

  const setPlaybackRateValue = (nextRate) => {
    const element = videoRef.current;
    if (element) {
      element.playbackRate = nextRate;
    }
    setPlaybackRate(nextRate);
  };

  const handleQuality = (nextQuality) => {
    pendingQualityTimeRef.current = videoRef.current?.currentTime || 0;
    setQuality(nextQuality);
  };

  const handleLoadedMetadata = (event) => {
    onLoadedMetadata?.(event);
    const pendingTime = pendingQualityTimeRef.current;
    if (Number.isFinite(pendingTime) && pendingTime > 0) {
      const safeDuration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : pendingTime;
      event.currentTarget.currentTime = Math.min(pendingTime, Math.max(safeDuration - 1, 0));
      pendingQualityTimeRef.current = null;
    }
    event.currentTarget.playbackRate = playbackRate;
    event.currentTarget.loop = loopEnabled;
  };

  return (
    <div className="skillpro-custom-video relative flex h-full w-full flex-col bg-black" onContextMenuCapture={preventContextMenu}>
      <button
        type="button"
        onClick={togglePlayback}
        onContextMenu={preventContextMenu}
        className="skillpro-video-stage group/video relative min-h-0 flex-1 bg-black"
        aria-label={isPlaying ? 'Pause video' : 'Play video'}
      >
        <video
          ref={videoRef}
          className={`h-full w-full bg-black object-contain ${watchIn3d ? 'skillpro-video-3d' : ''}`}
          src={displaySrc}
          controls={false}
          controlsList="nodownload noplaybackrate noremoteplayback"
          disablePictureInPicture
          disableRemotePlayback
          playsInline
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onPause={onPause}
          onEnded={onEnded}
          onError={onError}
          onContextMenu={preventContextMenu}
        >
          Your browser does not support the video tag.
        </video>
        {!isPlaying ? (
          <span className="skillpro-player-chrome absolute inset-0 flex items-center justify-center bg-black/20 text-white">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/15 backdrop-blur">
              <Play size={26} />
            </span>
          </span>
        ) : null}
      </button>

      <div className="skillpro-player-chrome skillpro-video-controls flex min-h-[64px] flex-col gap-2 border-t border-white/10 bg-slate-950/95 px-4 py-3">
        <input
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(currentTime, duration || currentTime || 0)}
          onChange={handleSeek}
          onContextMenu={preventContextMenu}
          className="h-2 w-full accent-blue-500"
          aria-label="Seek video"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={togglePlayback}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/15"
              aria-label={isPlaying ? 'Pause video' : 'Play video'}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              type="button"
              onClick={restartVideo}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/15"
              aria-label="Restart video"
            >
              <RotateCcw size={17} />
            </button>
            <button
              type="button"
              onClick={() => seekBy(-10)}
              className="inline-flex h-9 items-center gap-1 rounded-lg bg-white/10 px-2 text-white transition hover:bg-white/15"
              aria-label="Rewind 10 seconds"
            >
              <Rewind size={16} />
              <span>10</span>
            </button>
            <button
              type="button"
              onClick={() => seekBy(10)}
              className="inline-flex h-9 items-center gap-1 rounded-lg bg-white/10 px-2 text-white transition hover:bg-white/15"
              aria-label="Forward 10 seconds"
            >
              <span>10</span>
              <FastForward size={16} />
            </button>
            <span>{formatMediaTime(currentTime)} / {formatMediaTime(duration)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setSettingsOpen((open) => !open)}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/10 px-3 font-semibold text-white transition hover:bg-white/15"
                aria-expanded={settingsOpen}
                aria-label="Video settings"
              >
                <Settings size={17} />
                <span>{playbackRate}x</span>
              </button>
              {settingsOpen ? (
                <div
                  className="absolute bottom-12 right-0 z-50 w-80 max-w-[calc(100vw-32px)] rounded-lg border border-white/10 bg-slate-950/95 p-4 text-left text-white shadow-2xl backdrop-blur"
                  onContextMenu={preventContextMenu}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">Player settings</p>
                      <p className="mt-1 text-xs text-slate-400">Tune playback without leaving fullscreen.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(false)}
                      className="rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold hover:bg-white/15"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Playback speed</p>
                    <div className="grid grid-cols-3 gap-2">
                      {PLAYBACK_RATE_OPTIONS.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => setPlaybackRateValue(rate)}
                          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                            playbackRate === rate
                              ? 'bg-blue-500 text-white'
                              : 'bg-white/10 text-slate-200 hover:bg-white/15'
                          }`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Quality</p>
                    <div className="grid grid-cols-4 gap-2">
                      {QUALITY_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleQuality(option.value)}
                          disabled={qualityLocked && option.value !== 'auto'}
                          className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                            quality === option.value
                              ? 'bg-blue-500 text-white'
                              : 'bg-white/10 text-slate-200 hover:bg-white/15'
                          } disabled:cursor-not-allowed disabled:opacity-40`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {qualityLocked ? (
                      <p className="mt-2 text-xs text-slate-500">Quality switching is available for Cloudinary video URLs.</p>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-2">
                    <button
                      type="button"
                      onClick={() => setWatchIn3d((enabled) => !enabled)}
                      className={`flex items-center justify-between rounded-lg px-3 py-3 text-sm font-semibold transition ${
                        watchIn3d ? 'bg-blue-500 text-white' : 'bg-white/10 text-slate-200 hover:bg-white/15'
                      }`}
                    >
                      <span>Watch in 3D</span>
                      <span>{watchIn3d ? 'On' : 'Off'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoopEnabled((enabled) => !enabled)}
                      className={`flex items-center justify-between rounded-lg px-3 py-3 text-sm font-semibold transition ${
                        loopEnabled ? 'bg-blue-500 text-white' : 'bg-white/10 text-slate-200 hover:bg-white/15'
                      }`}
                    >
                      <span>Loop video</span>
                      <span>{loopEnabled ? 'On' : 'Off'}</span>
                    </button>
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Sleep timer</p>
                    <div className="grid grid-cols-5 gap-2">
                      {SLEEP_TIMER_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSleepTimerMinutes(option.value)}
                          className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                            sleepTimerMinutes === option.value
                              ? 'bg-blue-500 text-white'
                              : 'bg-white/10 text-slate-200 hover:bg-white/15'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={toggleMuted}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/15"
              aria-label={muted ? 'Unmute video' : 'Mute video'}
            >
              {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={handleVolume}
              onContextMenu={preventContextMenu}
              className="w-20 accent-blue-500"
              aria-label="Video volume"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const CourseDetail = () => {
  const { courseId } = useParams();
  const [activeTab, setActiveTab] = useState(() => readBrowserState(`${COURSE_TAB_KEY_PREFIX}${courseId}`, 'overview'));
  const [activeNoteIndex, setActiveNoteIndex] = useState(0);
  const [course, setCourse] = useState(null);
  const [protectedAssets, setProtectedAssets] = useState(null);
  const [enrolled, setEnrolled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [driveVideoFallback, setDriveVideoFallback] = useState(false);
  const [savedVideoProgress, setSavedVideoProgress] = useState(null);
  const [resumePromptOpen, setResumePromptOpen] = useState(false);
  const [fullscreenReturnRequired, setFullscreenReturnRequired] = useState(false);
  const [demoExamPopupOpen, setDemoExamPopupOpen] = useState(false);
  const { user, profile, isPremium, isPremiumPlus, getPlanTier } = useAuth();
  const { popupNode, openPopup } = usePopup();
  const navigate = useNavigate();
  const premium = isPremium(profile);
  const premiumPlus = isPremiumPlus(profile);
  const planTier = getPlanTier(profile);
  const videoRef = useRef(null);
  const resumeAppliedRef = useRef(false);
  const resumePendingRef = useRef(false);
  const lastSavedTimeRef = useRef(0);
  const videoSource = useMemo(() => parseVideoSource(protectedAssets?.video_url), [protectedAssets?.video_url]);

  useEffect(() => {
    fetchCourseData();
  }, [courseId, profile?.id, premium]);

  useEffect(() => {
    setActiveTab(readBrowserState(`${COURSE_TAB_KEY_PREFIX}${courseId}`, 'overview'));
  }, [courseId]);

  useEffect(() => {
    setDriveVideoFallback(false);
    resumeAppliedRef.current = false;
    resumePendingRef.current = false;
    lastSavedTimeRef.current = 0;
  }, [courseId, protectedAssets?.video_url]);

  useEffect(() => {
    setActiveNoteIndex(0);
  }, [courseId, protectedAssets?.notes_url, protectedAssets?.notes_urls]);

  useEffect(() => {
    const progress = readVideoProgress(profile?.id || user?.id, courseId);
    setSavedVideoProgress(progress);
    setResumePromptOpen(Boolean(progress?.currentTime > 0));
  }, [profile?.id, user?.id, courseId, protectedAssets?.video_url]);

  useEffect(() => {
    const handleFullscreenReturnGate = () => {
      if (videoSource?.type !== 'drive-video') return;

      if (document.fullscreenElement) {
        setFullscreenReturnRequired(false);
        return;
      }

      const element = videoRef.current;
      if (!element || element.paused) return;
      element.pause();
      setFullscreenReturnRequired(true);
    };

    document.addEventListener('fullscreenchange', handleFullscreenReturnGate);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenReturnGate);
  }, [videoSource?.type]);

  useEffect(() => {
    const handleFullscreenVideoKeys = (event) => {
      const element = videoRef.current;
      if (!element || !document.fullscreenElement) return;

      const tagName = String(event.target?.tagName || '').toLowerCase();
      if (['input', 'select', 'textarea'].includes(tagName)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const key = String(event.key || '').toLowerCase();
      const code = String(event.code || '').toLowerCase();
      const stopKey = () => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
      };

      if (key === 'arrowright' || code === 'arrowright') {
        stopKey();
        const duration = Number.isFinite(element.duration) ? element.duration : element.currentTime + 10;
        element.currentTime = Math.min((element.currentTime || 0) + 10, duration);
      } else if (key === 'arrowleft' || code === 'arrowleft') {
        stopKey();
        element.currentTime = Math.max((element.currentTime || 0) - 10, 0);
      } else if (key === ' ' || key === 'spacebar' || code === 'space') {
        stopKey();
        if (element.paused) {
          void element.play();
        } else {
          element.pause();
        }
      }
    };

    document.addEventListener('keydown', handleFullscreenVideoKeys, true);
    window.addEventListener('keydown', handleFullscreenVideoKeys, true);
    return () => {
      document.removeEventListener('keydown', handleFullscreenVideoKeys, true);
      window.removeEventListener('keydown', handleFullscreenVideoKeys, true);
    };
  }, []);

  useEffect(() => {
    if (videoSource?.type !== 'drive-video') {
      setFullscreenReturnRequired(false);
    }
  }, [videoSource?.type]);

  useEffect(() => {
    writeBrowserState(`${COURSE_TAB_KEY_PREFIX}${courseId}`, activeTab);
  }, [courseId, activeTab]);

  useEffect(() => {
    if (!course?.id) return;
    upsertRecentItem(
      RECENTLY_VIEWED_COURSES_KEY,
      {
        id: course.id,
        title: course.title,
        category: course.category || 'General',
        viewedAt: new Date().toISOString(),
      },
      10
    );
  }, [course?.id, course?.title, course?.category]);

  useEffect(() => {
    const shouldProtect = Boolean(user?.id && premium && enrolled && (activeTab === 'notes' || activeTab === 'overview'));
    if (!shouldProtect) return undefined;

    const preventDefault = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    };

    const keyHandler = (event) => {
      const key = String(event.key || '').toLowerCase();
      const code = String(event.code || '').toLowerCase();
      const usesModifier = event.ctrlKey || event.metaKey;
      const blocked =
        key === 'printscreen' ||
        key === 'f12' ||
        (usesModifier && key === 'p') ||
        (usesModifier && key === 's') ||
        (usesModifier && key === 'u') ||
        (usesModifier && key === 'c') ||
        (usesModifier && key === 'x') ||
        (usesModifier && event.shiftKey && ['i', 'j', 'c', 's'].includes(key)) ||
        ((key === 'g' || code === 'keyg') && event.metaKey);

      if (blocked) {
        preventDefault(event);
      }
    };

    const beforePrintHandler = () => {
      document.body.setAttribute('data-skillpro-print-blocked', 'true');
    };

    const afterPrintHandler = () => {
      document.body.removeAttribute('data-skillpro-print-blocked');
    };

    document.addEventListener('copy', preventDefault, true);
    document.addEventListener('cut', preventDefault, true);
    document.addEventListener('paste', preventDefault, true);
    document.addEventListener('dragstart', preventDefault, true);
    document.addEventListener('selectstart', preventDefault, true);
    document.addEventListener('keydown', keyHandler, true);
    window.addEventListener('keydown', keyHandler, true);
    window.addEventListener('beforeprint', beforePrintHandler);
    window.addEventListener('afterprint', afterPrintHandler);

    return () => {
      document.removeEventListener('copy', preventDefault, true);
      document.removeEventListener('cut', preventDefault, true);
      document.removeEventListener('paste', preventDefault, true);
      document.removeEventListener('dragstart', preventDefault, true);
      document.removeEventListener('selectstart', preventDefault, true);
      document.removeEventListener('keydown', keyHandler, true);
      window.removeEventListener('keydown', keyHandler, true);
      window.removeEventListener('beforeprint', beforePrintHandler);
      window.removeEventListener('afterprint', afterPrintHandler);
      document.body.removeAttribute('data-skillpro-print-blocked');
    };
  }, [user?.id, premium, enrolled, activeTab]);

  const fetchCourseData = async () => {
    try {
      setPageLoading(true);
      setProtectedAssets(null);

      const { data: courseData } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (courseData) {
        setCourse(courseData);
      }

      let isEnrolled = false;
      if (profile?.id) {
        const { data, error: enrollmentError } = await supabase
          .from('enrollments')
          .select('id')
          .eq('student_id', profile.id)
          .eq('course_id', courseId)
          .maybeSingle();
        if (enrollmentError) {
          logError({ message: 'Error checking enrollment:', source: 'CourseDetail', details: enrollmentError });
        }
        isEnrolled = !!data;
        setEnrolled(isEnrolled);
      } else {
        setEnrolled(false);
      }

      if (courseData && isEnrolled && premium) {
        setAssetsLoading(true);
        try {
          const assets = await fetchCourseProtectedAssets(courseId);
          setProtectedAssets(assets);
        } catch (assetError) {
          logError({ message: 'Error fetching protected course assets:', source: 'CourseDetail', details: assetError });
          openPopup('Access blocked', 'Protected course files are not available for this account.', 'warning');
        } finally {
          setAssetsLoading(false);
        }
      }
    } catch (error) {
      logError({ message: 'Error fetching course:', source: 'CourseDetail', details: error });
    } finally {
      setPageLoading(false);
    }
  };

  const handleEnroll = async () => {
    if (!premium) {
      openPopup('Premium required', 'Only logged-in premium students can access course videos and notes.', 'warning');
      return;
    }
    if (!profile?.id) {
      openPopup('Sign in required', 'Please sign in with your premium student account.', 'warning');
      return;
    }
    setLoading(true);
    try {
      await supabase.from('enrollments').insert({
        student_id: profile.id,
        course_id: courseId,
        progress: 0,
        completed: false
      });
      setEnrolled(true);
      openPopup('Enrolled', 'You have been enrolled successfully.', 'success');
      const assets = await fetchCourseProtectedAssets(courseId);
      setProtectedAssets(assets);
    } catch (error) {
      openPopup('Enroll failed', `Error enrolling: ${error.message}`, 'error');
    }
    setLoading(false);
  };

  const notesSources = useMemo(() => {
    const rawNotes = Array.isArray(protectedAssets?.notes_urls) && protectedAssets.notes_urls.length > 0
      ? protectedAssets.notes_urls
      : protectedAssets?.notes_url
        ? [protectedAssets.notes_url]
        : [];

    return rawNotes
      .map((rawValue, index) => {
        const parsed = parseNotesSource(rawValue);
        return parsed ? { ...parsed, label: `Note ${index + 1}` } : null;
      })
      .filter(Boolean);
  }, [protectedAssets?.notes_url, protectedAssets?.notes_urls]);
  const activeNote = notesSources[activeNoteIndex] || null;
  const notesPreviewImage = protectedAssets?.notes_image_url || '';
  const canResumeVideo = ['drive-video', 'cloudinary-video', 'direct-video'].includes(videoSource?.type);

  const persistVideoProgress = (currentTime, duration) => {
    const safeCurrentTime = Number.isFinite(currentTime) ? currentTime : 0;
    const safeDuration = Number.isFinite(duration) ? duration : 0;
    const percent = safeDuration > 0 ? getVideoCompletionPercent({ currentTime: safeCurrentTime, duration: safeDuration }) : 0;
    const progress = {
      currentTime: safeCurrentTime,
      duration: safeDuration,
      completed: safeDuration > 0 && safeCurrentTime >= Math.max(safeDuration - 1, 0),
      percent,
      updatedAt: new Date().toISOString(),
    };
    writeVideoProgress(profile?.id || user?.id, courseId, progress);
    setSavedVideoProgress(progress);
    if (
      ['cloudinary-video', 'direct-video'].includes(videoSource?.type) &&
      profile?.id &&
      courseId &&
      percent > Number(enrollment?.progress || 0)
    ) {
      supabase
        .from('enrollments')
        .update({
          progress: percent,
          completed: percent >= 100 || Boolean(enrollment?.completed),
        })
        .eq('student_id', profile.id)
        .eq('course_id', courseId)
        .then(({ error: progressError }) => {
          if (progressError) logError({ message: 'Course video progress sync failed.', source: 'CourseDetail', details: progressError.message || progressError });
        });
    }
  };

  const persistCurrentVideoProgress = () => {
    const element = videoRef.current;
    if (!element) return;
    persistVideoProgress(element.currentTime, element.duration);
  };

  const clearSavedVideoProgress = () => {
    writeVideoProgress(profile?.id || user?.id, courseId, {
      currentTime: 0,
      duration: savedVideoProgress?.duration || 0,
      completed: false,
      percent: 0,
      updatedAt: new Date().toISOString(),
    });
    setSavedVideoProgress((prev) => ({
      currentTime: 0,
      duration: prev?.duration || 0,
      completed: false,
      percent: 0,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleVideoLoadedMetadata = (event) => {
    const element = event.currentTarget;
    if (!Number.isFinite(element.duration)) return;
    if (resumePendingRef.current && savedVideoProgress?.currentTime > 0 && !resumeAppliedRef.current) {
      element.currentTime = Math.min(savedVideoProgress.currentTime, Math.max(element.duration - 2, 0));
      resumeAppliedRef.current = true;
      resumePendingRef.current = false;
      setResumePromptOpen(false);
      return;
    }
    if (!savedVideoProgress?.currentTime || resumeAppliedRef.current) return;
    if (!resumePromptOpen) return;
    element.currentTime = 0;
  };

  const handleResumeAccepted = () => {
    const element = videoRef.current;
    const savedTime = savedVideoProgress?.currentTime || 0;
    const duration = Number.isFinite(element?.duration) ? element.duration : 0;

    if (element && savedTime > 0 && duration > 0) {
      element.currentTime = Math.min(savedTime, Math.max(duration - 2, 0));
      resumeAppliedRef.current = true;
    } else if (savedTime > 0) {
      resumePendingRef.current = true;
    }
    setResumePromptOpen(false);
  };

  const handleResumeDeclined = () => {
    resumeAppliedRef.current = true;
    setResumePromptOpen(false);
    clearSavedVideoProgress();
  };

  const handleVideoTimeUpdate = (event) => {
    const element = event.currentTarget;
    if (!Number.isFinite(element.currentTime)) return;
    if (element.currentTime - lastSavedTimeRef.current < VIDEO_PROGRESS_SAVE_INTERVAL_SECONDS) return;

    lastSavedTimeRef.current = element.currentTime;
    persistVideoProgress(element.currentTime, element.duration);
  };

  const handleVideoPause = (event) => {
    const element = event.currentTarget;
    persistVideoProgress(element.currentTime, element.duration);
  };

  const handleVideoEnded = () => {
    const duration = videoRef.current?.duration || 0;
    persistVideoProgress(duration, duration);
    lastSavedTimeRef.current = 0;
  };

  const handleBackToCourses = () => {
    persistCurrentVideoProgress();
  };

  const handleReturnToFullscreen = async () => {
    try {
      const frame = document.querySelector('.skillpro-media-frame');
      await frame?.requestFullscreen?.();
      setFullscreenReturnRequired(false);
      await videoRef.current?.play?.();
    } catch {
      setFullscreenReturnRequired(false);
    }
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      persistCurrentVideoProgress();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        persistCurrentVideoProgress();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      handleBeforeUnload();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [courseId, profile?.id, user?.id, savedVideoProgress?.duration]);

  if (pageLoading) {
    return <LoadingSpinner message="Loading course..." />;
  }

  if (!course) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 text-center">
        <Video className="mx-auto text-slate-400" size={32} />
        <h1 className="text-2xl font-bold text-slate-900 mt-2">Course not found</h1>
        <p className="text-slate-500 mt-1">The course you're looking for doesn't exist.</p>
        <Link to="/app/courses" className="mt-4 inline-block text-blue-600 font-semibold hover:text-blue-700">
          Back to courses
        </Link>
      </div>
    );
  }

  if (!enrolled) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        {popupNode}
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link to="/app/courses" onClick={handleBackToCourses} className="inline-flex items-center text-blue-600 hover:text-blue-700 font-semibold mb-6">
            <ArrowLeft size={18} className="mr-2" />
            Back to Courses
          </Link>

          <div className="bg-gradient-to-br from-blue-600 to-slate-900 rounded-2xl shadow-lg overflow-hidden text-white">
            <div className="grid md:grid-cols-2 gap-8 p-8">
              <div className="flex items-center justify-center">
                {course.thumbnail_url ? (
                  <img
                    src={course.thumbnail_url}
                    alt={course.title}
                    className="w-full h-64 object-cover rounded-lg shadow-lg"
                  />
                ) : (
                  <div className="w-full h-64 bg-white/20 rounded-lg flex items-center justify-center">
                    <Video size={64} className="text-white/50" />
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-center">
                <div className="flex gap-2 mb-3">
                  <span className="inline-block w-fit px-3 py-1 rounded-full text-sm font-medium bg-white/20">
                    {course.category || 'General'}
                  </span>
                  <span className="inline-block w-fit px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-white">
                    Premium Only
                  </span>
                </div>
                <h1 className="text-4xl font-bold mb-4">{course.title}</h1>
                <p className="text-white/90 mb-6 leading-relaxed">
                  {course.description || 'Start learning this course now!'}
                </p>

                <div className="space-y-3 mb-8">
                  <div className="flex items-center">
                    <CheckCircle size={20} className="mr-3 flex-shrink-0" />
                    <span>Watch protected premium videos</span>
                  </div>
                  <div className="flex items-center">
                    <FileText size={20} className="mr-3 flex-shrink-0" />
                    <span>Read protected notes inside SkillPro</span>
                  </div>
                  <div className="flex items-center">
                    <EyeOff size={20} className="mr-3 flex-shrink-0" />
                    <span>Right click, copy, and print blocked during access</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (!premium) {
                      navigate(buildPlanCheckoutPath('premium'));
                      return;
                    }
                    handleEnroll();
                  }}
                  disabled={loading}
                  className="w-full bg-white text-blue-700 hover:bg-slate-50 disabled:bg-slate-300 font-bold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
                      Enrolling...
                    </>
                  ) : (
                    <>
                      <Play size={20} className="mr-2" />
                      {premium ? 'Enroll With Premium Access' : 'Buy Premium To Enroll'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {popupNode}
      {resumePromptOpen && Boolean(savedVideoProgress?.currentTime > 0) && canResumeVideo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-slate-900">Resume Video?</h2>
            <p className="mt-3 text-slate-600">
              Do you want to continue from {Math.floor(savedVideoProgress?.currentTime || 0)} seconds where you left off?
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleResumeDeclined}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Start Over
              </button>
              <button
                type="button"
                onClick={handleResumeAccepted}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
              >
                Resume
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {fullscreenReturnRequired ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
            <h2 className="text-2xl font-bold text-slate-900">Return To Fullscreen</h2>
            <p className="mt-3 text-slate-600">
              Playback was paused because fullscreen was exited. Return to fullscreen to continue watching.
            </p>
            <button
              type="button"
              onClick={handleReturnToFullscreen}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Return To Fullscreen
            </button>
          </div>
        </div>
      ) : null}
      {demoExamPopupOpen ? (
        <div className="skillpro-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="skillpro-demo-pop relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <span className="skillpro-demo-spark skillpro-demo-spark-1" />
            <span className="skillpro-demo-spark skillpro-demo-spark-2" />
            <span className="skillpro-demo-spark skillpro-demo-spark-3" />
            <span className="skillpro-demo-spark skillpro-demo-spark-4" />
            <span className="skillpro-demo-sweep" />
            <span className="skillpro-card-logo-line skillpro-card-logo-line-1" />
            <span className="skillpro-card-logo-line skillpro-card-logo-line-2" />
            <span className="skillpro-card-logo-line skillpro-card-logo-line-3" />
            <span className="skillpro-card-logo-line skillpro-card-logo-line-4" />
            <span className="skillpro-card-logo-line skillpro-card-logo-line-5" />
            <span className="skillpro-card-logo-line skillpro-card-logo-line-6" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-blue-500 via-amber-400 to-emerald-400" />
            <div className="relative bg-slate-950 px-6 py-7 text-white">
              <div className="skillpro-demo-ring absolute left-1/2 top-5 h-24 w-24 -translate-x-1/2 rounded-full border border-amber-300/40" />
              <div className="skillpro-logo-assemble mx-auto" aria-hidden="true">
                <img src="/skillpro-logo.png" alt="" className="skillpro-assembled-logo" />
              </div>
              <h2 className="skillpro-demo-title mt-5 text-center text-2xl font-bold">Demo Course</h2>
              <p className="skillpro-demo-subtitle mt-2 text-center text-sm text-slate-300">
                This course is for preview and practice only.
              </p>
            </div>
            <div className="px-6 py-6 text-center">
              <p className="skillpro-demo-copy mx-auto max-w-sm text-sm leading-6 text-slate-600">
                This is a demo course. It does not include live exams or certification.
              </p>
              <div className="skillpro-demo-chips mt-5 grid grid-cols-2 gap-3 text-xs font-semibold text-slate-600">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">No live exam</div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">No certificate</div>
              </div>
              <button
                type="button"
                onClick={() => setDemoExamPopupOpen(false)}
                className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link to="/app/courses" onClick={handleBackToCourses} className="inline-flex items-center text-blue-600 hover:text-blue-700 font-semibold mb-6">
          <ArrowLeft size={18} className="mr-2" />
          Back to Courses
        </Link>

        <div className="bg-white rounded-xl shadow-sm p-6 mb-8 border border-slate-100">
          <div className="flex gap-2 mb-2">
            <h1 className="text-4xl font-bold text-slate-900">{course.title}</h1>
            <span className={`inline-block w-fit px-3 py-1 rounded-full text-xs font-bold self-center ${course.is_free ? 'bg-blue-600 text-white' : 'bg-amber-500 text-white'}`}>
              {course.is_free ? 'Demo Course' : 'Premium Content'}
            </span>
          </div>
          <p className="text-slate-600 text-lg">{course.category || 'Course'}</p>
        </div>

        <ContentProtectionNotice />

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100">
              <div className="bg-slate-950 aspect-video flex items-center justify-center">
                {!premium ? (
                  <AssetBlockedState
                    icon={Lock}
                    title="Premium membership required"
                    message="Videos and notes are available only to logged-in premium students."
                  />
                ) : assetsLoading ? (
                  <LoadingSpinner message="Unlocking protected content..." />
                ) : videoSource?.blocked ? (
                  <AssetBlockedState
                    icon={ShieldAlert}
                    title="Protected video blocked"
                    message={videoSource.message}
                  />
                ) : videoSource?.type === 'drive-video' ? (
                  driveVideoFallback && videoSource.previewSrc ? (
                    <ProtectedMediaFrame
                      title={`${course.title} video`}
                      badge="Protected fullscreen preview"
                    >
                      <DriveLockedIframe
                        title={`${course.title} video`}
                        src={videoSource.previewSrc}
                      />
                      <div
                        className="absolute top-0 right-0 z-10 h-16 w-24 bg-slate-950"
                        onContextMenu={(event) => event.preventDefault()}
                      />
                    </ProtectedMediaFrame>
                  ) : (
                    <ProtectedMediaFrame title={`${course.title} video`} badge="SkillPro Drive player">
                      <CustomProtectedVideo
                        videoRef={videoRef}
                        src={videoSource.src}
                        onLoadedMetadata={handleVideoLoadedMetadata}
                        onTimeUpdate={handleVideoTimeUpdate}
                        onPause={handleVideoPause}
                        onEnded={handleVideoEnded}
                        onError={() => setDriveVideoFallback(true)}
                      />
                    </ProtectedMediaFrame>
                  )
                ) : videoSource?.type === 'cloudinary-video' || videoSource?.type === 'direct-video' ? (
                  <ProtectedMediaFrame
                    title={`${course.title} video`}
                    badge={videoSource.type === 'cloudinary-video' ? 'SkillPro video player' : 'Protected video player'}
                  >
                    <CustomProtectedVideo
                      videoRef={videoRef}
                      src={videoSource.src}
                      onLoadedMetadata={handleVideoLoadedMetadata}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onPause={handleVideoPause}
                      onEnded={handleVideoEnded}
                    />
                  </ProtectedMediaFrame>
                ) : videoSource ? (
                  <ProtectedMediaFrame
                    title={`${course.title} video`}
                    badge="Fullscreen embed"
                    lockFullscreenSurface
                  >
                    <iframe
                      title={`${course.title} video`}
                      width="100%"
                      height="100%"
                      src={videoSource.src}
                      frameBorder="0"
                      allow={
                        videoSource.src?.includes('drive.google.com')
                          ? 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture'
                          : 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen'
                      }
                      allowFullScreen={!videoSource.src?.includes('drive.google.com')}
                      className="w-full h-full"
                      onContextMenu={(event) => event.preventDefault()}
                    />
                  </ProtectedMediaFrame>
                ) : (
                  <div className="text-center text-white">
                    <Video size={48} className="mx-auto mb-4 text-slate-400" />
                    <p className="text-slate-400">No protected video available for this course</p>
                  </div>
                )}
              </div>

              <div className="border-b border-slate-200">
                <div className="flex">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`flex-1 px-6 py-4 font-semibold border-b-2 transition-colors ${
                      activeTab === 'overview'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    onClick={() => setActiveTab('notes')}
                    className={`flex-1 px-6 py-4 font-semibold border-b-2 transition-colors ${
                      activeTab === 'notes'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Notes
                  </button>
                  <button
                    onClick={() => setActiveTab('exam')}
                    className={`flex-1 px-6 py-4 font-semibold border-b-2 transition-colors ${
                      activeTab === 'exam'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Exam
                  </button>
                </div>
              </div>

              <div className="p-8">
                {activeTab === 'overview' && (
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-4">About this course</h2>
                    <p className="text-slate-600 leading-relaxed">
                      {course.description || 'No description available'}
                    </p>
                    {canResumeVideo && savedVideoProgress?.currentTime > 0 ? (
                      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between">
                        <span>Resume available from {Math.floor(savedVideoProgress.currentTime)} seconds.</span>
                        <button
                          type="button"
                          onClick={handleResumeAccepted}
                          className="inline-flex w-fit items-center justify-center rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700"
                        >
                          Continue
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

                {activeTab === 'notes' && (
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-6">Protected Course Notes</h2>
                    {!premium ? (
                      <NotesUpgradeCard
                        title="Premium required"
                        message="Course notes inside this course are available with Premium access."
                        ctaLabel="Buy Premium"
                        planTier="premium"
                      />
                    ) : assetsLoading ? (
                      <LoadingSpinner message="Loading protected notes..." />
                    ) : activeNote?.blocked ? (
                      <div className="space-y-4">
                        {notesSources.length > 1 ? (
                          <div className="flex flex-wrap gap-2">
                            {notesSources.map((note, index) => (
                              <button
                                key={note.label}
                                type="button"
                                onClick={() => setActiveNoteIndex(index)}
                                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                                  index === activeNoteIndex
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-slate-300 text-slate-700 hover:border-slate-400 hover:text-slate-900'
                                }`}
                              >
                                {note.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                          <ShieldAlert size={28} className="mx-auto text-amber-600" />
                          <p className="mt-3 font-semibold text-amber-900">Protected notes blocked</p>
                          <p className="mt-1 text-sm text-amber-800">{activeNote.message}</p>
                        </div>
                      </div>
                    ) : activeNote ? (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                          Notes are previewed inside SkillPro only. Direct download and print actions are intentionally removed.
                        </div>
                        {notesPreviewImage ? (
                          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <img
                              src={notesPreviewImage}
                              alt={`${course.title} notes preview`}
                              className="h-56 w-full object-cover sm:h-72"
                            />
                            <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
                              Preview image for protected notes. The original source link is not shown here.
                            </div>
                          </div>
                        ) : null}
                        {notesSources.length > 1 ? (
                          <div className="flex flex-wrap gap-2">
                            {notesSources.map((note, index) => (
                              <button
                                key={note.label}
                                type="button"
                                onClick={() => setActiveNoteIndex(index)}
                                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                                  index === activeNoteIndex
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-slate-300 text-slate-700 hover:border-slate-400 hover:text-slate-900'
                                }`}
                              >
                                <FileText size={16} />
                                {note.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <div className="h-[70vh] overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
                          <ProtectedMediaFrame
                            title={`${course.title} ${activeNote.label}`}
                            badge="Fullscreen notes preview"
                          >
                            <iframe
                              title={`${course.title} ${activeNote.label}`}
                              src={activeNote.src}
                              className="h-full w-full bg-white"
                              sandbox="allow-same-origin allow-scripts"
                              allow="fullscreen"
                              allowFullScreen
                            />
                          </ProtectedMediaFrame>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {notesPreviewImage ? (
                          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <img
                              src={notesPreviewImage}
                              alt={`${course.title} notes preview`}
                              className="h-56 w-full object-cover sm:h-72"
                            />
                            <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
                              Preview image for protected notes. Add a notes URL in admin if you also want an in-site document preview.
                            </div>
                          </div>
                        ) : null}
                        <div className="text-center py-8 text-slate-500">
                          <FileText size={32} className="mx-auto mb-3 text-slate-300" />
                          <p>No protected notes available yet</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'exam' && (
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Exam Slot Booking</h2>
                    <p className="mt-2 text-slate-600">{course.title}</p>
                    <p className="mt-2 mb-6 text-sm text-slate-500">
                      Book your exam slot first. After booking, you can write the exam only on your scheduled slot date and time.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (course.is_free) {
                          setDemoExamPopupOpen(true);
                          return;
                        }
                        navigate(`/app/live-exams?courseId=${courseId}`);
                      }}
                      className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Award size={20} className="mr-2" />
                      Book Exam Slot
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100 sticky top-8">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Course Access</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-500 uppercase font-semibold">Category</p>
                  <p className="text-slate-900 font-semibold">{course.category || 'General'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 uppercase font-semibold">Course type</p>
                  <p className={`font-semibold flex items-center ${course.is_free ? 'text-blue-600' : 'text-amber-600'}`}>
                    {course.is_free ? <CheckCircle size={18} className="mr-2" /> : <Award size={18} className="mr-2" />}
                    {course.is_free ? 'Free demo course' : 'Premium course'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 uppercase font-semibold">Enrollment</p>
                  <p className="text-green-600 font-semibold flex items-center">
                    <CheckCircle size={18} className="mr-2" />
                    Enrolled
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 uppercase font-semibold">Premium status</p>
                  <p className={`font-semibold flex items-center ${course.is_free || premium ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {course.is_free || premium ? <CheckCircle size={18} className="mr-2" /> : <Lock size={18} className="mr-2" />}
                    {course.is_free
                      ? 'Premium is not required for this demo course'
                      : premium
                        ? `Verified ${planTier === 'premium_plus' ? 'Premium Plus' : 'Premium'} access`
                        : 'Upgrade required for video'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 uppercase font-semibold">Notes access</p>
                  <p className={`font-semibold flex items-center ${course.is_free || premium ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {course.is_free || premium ? <CheckCircle size={18} className="mr-2" /> : <Lock size={18} className="mr-2" />}
                    {course.is_free
                      ? 'Demo notes are available when provided'
                      : premiumPlus
                      ? 'Course notes + Premium Plus library unlocked'
                      : premium
                        ? 'Course notes unlocked'
                        : 'Buy Premium for course notes'}
                  </p>
                </div>
                <div className="pt-4 border-t border-slate-200">
                  <p className="text-sm text-slate-600">
                    {course.is_free
                      ? 'Demo courses are for preview and practice. They do not include live exams or certification.'
                      : `Protected materials are bound to this logged-in session inside ${APP_ORIGIN || 'SkillPro'}.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseDetail;
