import { supabase } from '../supabaseClient';

const queue = [];
let flushing = false;

const flush = async () => {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.splice(0);
  try {
    await supabase.from('error_logs').insert(batch);
  } catch {
  } finally {
    flushing = false;
  }
};

const scheduleFlush = () => {
  setTimeout(flush, 2000);
};

export const logWarn = ({ message, source, details, userId, context }) => {
  logError({ message: `[WARN] ${message}`, source, details, userId, context });
};

export const logError = ({ message, source, details, userId, context }) => {
  try {
    const entry = {
      message: String(message || '').slice(0, 1000),
      source: String(source || 'app').slice(0, 200),
      details: details || null,
      user_id: userId || null,
      context: context || null,
      created_at: new Date().toISOString(),
    };
    queue.push(entry);
    if (queue.length >= 10) {
      flush();
    } else {
      scheduleFlush();
    }
  } catch {
  }
};
