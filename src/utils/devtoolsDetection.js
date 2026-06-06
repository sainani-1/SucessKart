const DEVTOOLS_WIDTH_THRESHOLD = 260;
const DEVTOOLS_HEIGHT_THRESHOLD = 320;
const ZOOM_TOLERANCE = 0.08;

const getViewportZoom = () => {
  if (typeof window === 'undefined') return 1;
  const viewportScale = Number(window.visualViewport?.scale);
  if (Number.isFinite(viewportScale) && viewportScale > 0) {
    return viewportScale;
  }
  return 1;
};

const checkSizeSignal = () => {
  if (typeof window === 'undefined') return false;

  const zoom = getViewportZoom();
  if (Math.abs(zoom - 1) > ZOOM_TOLERANCE) {
    return false;
  }

  const widthGap = window.outerWidth - window.innerWidth;
  const heightGap = window.outerHeight - window.innerHeight;
  const widthLooksLikeDockedDevTools =
    widthGap > DEVTOOLS_WIDTH_THRESHOLD && window.innerWidth < window.outerWidth * 0.85;
  const heightLooksLikeDockedDevTools =
    heightGap > DEVTOOLS_HEIGHT_THRESHOLD && window.innerHeight < window.outerHeight * 0.75;

  return widthLooksLikeDockedDevTools || heightLooksLikeDockedDevTools;
};

// Detect DevTools via debugger statement timing
const checkDebuggerSignal = () => {
  const start = performance.now();
  debugger;
  const elapsed = performance.now() - start;
  return elapsed > 100;
};

// Detect DevTools via console.log timing (DevTools slows console operations)
const checkConsoleSignal = () => {
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    console.log(i);
    console.clear();
  }
  const elapsed = performance.now() - start;
  return elapsed > 200;
};

let cachedResult = null;
let cacheTime = 0;
const CACHE_TTL = 2000;

export const hasDevToolsSizeSignal = () => {
  if (cachedResult !== null && Date.now() - cacheTime < CACHE_TTL) {
    return cachedResult;
  }
  cachedResult = checkSizeSignal();
  cacheTime = Date.now();
  return cachedResult;
};

export const isLikelyDevToolsOpen = () => {
  if (cachedResult !== null && Date.now() - cacheTime < CACHE_TTL) {
    return cachedResult;
  }
  const sizeSignal = checkSizeSignal();
  const debuggerSignal = checkDebuggerSignal();
  const consoleSignal = checkConsoleSignal();
  const result = sizeSignal || debuggerSignal || consoleSignal;
  cachedResult = result;
  cacheTime = Date.now();
  return result;
};

export const isDeveloperToolsDetected = isLikelyDevToolsOpen;
