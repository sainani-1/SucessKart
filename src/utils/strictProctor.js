import { logError } from '../utils/errorLogger';

export function startStrictProctor({
  onViolation,
  onAutoSubmit
}) {

  let violations = 0;

  const addViolation = (reason) => {
    violations++;
    logError({ message: 'Violation', source: 'strictProctor', details: reason });

    onViolation?.(violations, reason);

    if (violations >= 4) {
      onAutoSubmit?.();
    }
  };

  /* TAB SWITCH */
  const visibilityHandler = () => {
    if (document.hidden) {
      addViolation("Tab switched");
    }
  };

  /* RIGHT CLICK BLOCK */
  const contextHandler = (e) => {
    e.preventDefault();
    addViolation("Right click");
  };

  /* COPY PASTE BLOCK */
  const copyHandler = (e) => {
    e.preventDefault();
    addViolation("Copy/Paste");
  };

  /* KEYBOARD SHORTCUT BLOCK */
  const keyHandler = (e) => {

    if (
      e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && e.key === "I") ||
      (e.ctrlKey && e.key === "u") ||
      (e.altKey && e.key === "Tab")
    ) {
      e.preventDefault();
      addViolation("DevTools / Shortcut");
    }
  };

  document.addEventListener("visibilitychange", visibilityHandler);
  document.addEventListener("contextmenu", contextHandler);
  document.addEventListener("copy", copyHandler);
  document.addEventListener("paste", copyHandler);
  document.addEventListener("keydown", keyHandler);

  return () => {
    document.removeEventListener("visibilitychange", visibilityHandler);
    document.removeEventListener("contextmenu", contextHandler);
    document.removeEventListener("copy", copyHandler);
    document.removeEventListener("paste", copyHandler);
    document.removeEventListener("keydown", keyHandler);
  };
}