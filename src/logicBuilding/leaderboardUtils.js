import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { supabase } from '../supabaseClient';
import { logError } from '../utils/errorLogger';

export const estimateCodeComplexity = (code = '') => {
  const source = String(code || '').toLowerCase();
  const loopMatches = source.match(/\b(for|while)\b/g) || [];
  const hasRecursion =
    /def\s+([a-z_][\w]*)[\s\S]*\b\1\s*\(/i.test(code) ||
    /(?:int|void|long|double|float|string|boolean|public|private|static|\s)+\s+([a-z_][\w]*)\s*\([^)]*\)\s*\{[\s\S]*\b\1\s*\(/i.test(code);
  const hasDivideStep = /\/=\s*2|>>=|mid\s*=|binary\s+search|log/.test(source);
  const hasSort = /\.sort\s*\(|sort\s*\(/.test(source);
  const hasNestedLoop = /\b(for|while)\b[\s\S]{0,500}\b(for|while)\b/.test(source);

  if (hasRecursion && loopMatches.length > 1) return { score: 6, label: 'O(2^n)' };
  if (hasNestedLoop) return { score: 5, label: 'O(n^2)' };
  if (hasSort) return { score: 4, label: 'O(n log n)' };
  if (loopMatches.length > 0) return { score: 3, label: 'O(n)' };
  if (hasDivideStep) return { score: 2, label: 'O(log n)' };
  return { score: 1, label: 'O(1)' };
};

export const normalizeLogicScoreRows = (rows) => {
  const usersByKey = {};

  rows.forEach((row) => {
    const userId = row.user_id || row.userId || '';
    const recordEmail =
      row.email ||
      row.userEmail ||
      (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.id || '') ? row.id : '');
    const recordName =
      row.username ||
      row.name ||
      (recordEmail ? recordEmail.split('@')[0] : (row.id || 'Unknown Member'));
    const key = userId || recordEmail || recordName || row.id;

    if (!usersByKey[key]) {
      usersByKey[key] = {
        id: row.id || key,
        userId,
        username: recordName,
        score: 0,
        solvedCount: 0,
        complexityScore: 0,
        complexityLabel: row.complexity_label || '',
        firstSolvedAt: row.first_solved_at || row.solved_at || row.updated_at || row.created_at || null,
      };
    }

    usersByKey[key].score += Number(row.score) || 0;
    usersByKey[key].solvedCount += row.solved && typeof row.solved === 'object'
      ? Object.keys(row.solved).filter((question) => row.solved[question]).length
      : 0;
    usersByKey[key].complexityScore += Number.isFinite(Number(row.complexity_score))
      ? Number(row.complexity_score)
      : 999999;

    const existingTime = usersByKey[key].firstSolvedAt ? new Date(usersByKey[key].firstSolvedAt).getTime() : Infinity;
    const rowTimeValue = row.first_solved_at || row.solved_at || row.updated_at || row.created_at || null;
    const rowTime = rowTimeValue ? new Date(rowTimeValue).getTime() : Infinity;
    if (rowTime < existingTime) {
      usersByKey[key].firstSolvedAt = rowTimeValue;
    }

    if (!usersByKey[key].complexityLabel && row.complexity_label) {
      usersByKey[key].complexityLabel = row.complexity_label;
    }
  });

  return Object.values(usersByKey).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.complexityScore !== b.complexityScore) return a.complexityScore - b.complexityScore;
    const aTime = a.firstSolvedAt ? new Date(a.firstSolvedAt).getTime() : Infinity;
    const bTime = b.firstSolvedAt ? new Date(b.firstSolvedAt).getTime() : Infinity;
    if (aTime !== bTime) return aTime - bTime;
    return String(a.username || '').localeCompare(String(b.username || ''));
  });
};

export const getLogicLeaderboardScores = async () => {
  const snap = await getDocs(collection(db, 'logicBuildingScores'));
  const rows = [];
  snap.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
  return normalizeLogicScoreRows(rows);
};

export const findCurrentMemberRank = (scores, profile, fallbackUsername = '') => {
  if (!profile?.id && !profile?.email && !fallbackUsername) return null;

  const profileId = String(profile?.id || '');
  const profileEmail = String(profile?.email || '').toLowerCase();
  const username = String(profile?.username || fallbackUsername || '').toLowerCase();

  const index = scores.findIndex((member) => {
    if (profileId && String(member.userId || '') === profileId) return true;
    if (username && String(member.username || '').toLowerCase() === username) return true;
    if (profileEmail && String(member.id || '').toLowerCase() === profileEmail) return true;
    return false;
  });

  return index >= 0 ? { ...scores[index], rank: index + 1 } : null;
};

export const notifyTopFivePlacement = async ({ profile, member, incrementUnreadNotifications, resultKey }) => {
  if (!profile?.id || !member || member.rank > 5) return;
  if (!resultKey) return;

  const storageKey = `logic_leaderboard_result_notified_${profile.id}_${resultKey}`;
  const score = Number(member.score || 0);
  if (localStorage.getItem(storageKey) === 'true') return;

  const payload = {
    title: 'Logic Building Result Published',
    content: `You finished #${member.rank} on the Logic Building leaderboard with ${score} points.`,
    type: 'success',
    target_role: profile.role || 'student',
    target_user_id: profile.id,
  };

  try {
    const { error } = await supabase.from('admin_notifications').insert(payload);
    if (error && String(error.message || '').includes('target_user_id')) {
      const { target_user_id, content, ...fallback } = payload;
      await supabase.from('admin_notifications').insert({
        ...fallback,
        content: `[target_user_id:${target_user_id}] ${content}`,
      });
    } else if (error) {
      throw error;
    }
    localStorage.setItem(storageKey, 'true');
    incrementUnreadNotifications?.(1);
  } catch (error) {
    logError({ message: 'Logic leaderboard notification failed', source: 'leaderboardUtils', details: error?.message || error });
  }
};

export const awardLogicBuildingWinnerCertificate = async ({ profile, member, incrementUnreadNotifications, resultKey }) => {
  if (!profile?.id || !member || member.rank !== 1) return;
  if (!resultKey) return;
  if (member.userId && String(member.userId) !== String(profile.id)) return;

  const storageKey = `logic_weekly_winner_certificate_awarded_${profile.id}`;
  if (localStorage.getItem(storageKey) === 'true') return;

  try {
    const { data: existing, error: existingError } = await supabase
      .from('generated_certificates')
      .select('id')
      .eq('user_id', profile.id)
      .eq('award_type', 'weekly_contest_winner')
      .limit(1);
    if (existingError) throw existingError;
    if (existing?.length) {
      localStorage.setItem(storageKey, 'true');
      return;
    }

    const now = new Date().toISOString();
    const { data: certData, error: certError } = await supabase
      .from('certificates')
      .insert({
        user_id: profile.id,
        course_id: null,
        issued_at: now,
        revoked_at: null,
      })
      .select('id')
      .single();
    if (certError) throw certError;

    const { error: generatedError } = await supabase.from('generated_certificates').insert({
      user_id: profile.id,
      certificate_id: certData?.id || null,
      award_type: 'weekly_contest_winner',
      award_name: 'Winner Of Weekly Logic Building',
      reason: `Rank #1 on the Logic Building leaderboard with ${Number(member.score || 0)} points.`,
      course_name: 'Logic Building Weekly Contest',
      issued_by: null,
      issued_at: now,
    });
    if (generatedError) throw generatedError;

    const notificationPayload = {
      title: 'Weekly Logic Building Winner',
      content: 'Congratulations! Your Winner Of Weekly Logic Building certificate has been added to My Certificates.',
      type: 'success',
      target_role: profile.role || 'student',
      target_user_id: profile.id,
    };

    const { error: notificationError } = await supabase.from('admin_notifications').insert(notificationPayload);
    if (notificationError && String(notificationError.message || '').includes('target_user_id')) {
      const { target_user_id, content, ...fallback } = notificationPayload;
      await supabase.from('admin_notifications').insert({
        ...fallback,
        content: `[target_user_id:${target_user_id}] ${content}`,
      });
    } else if (notificationError) {
      throw notificationError;
    }

    localStorage.setItem(storageKey, 'true');
    incrementUnreadNotifications?.(1);
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('duplicate')) {
      localStorage.setItem(storageKey, 'true');
      return;
    }
    logError({ message: 'Logic winner certificate award failed', source: 'leaderboardUtils', details: error?.message || error });
  }
};
