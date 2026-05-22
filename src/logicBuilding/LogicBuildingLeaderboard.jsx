import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Award, Medal, RefreshCw, Sparkles, Trophy } from 'lucide-react';
import { db } from './firebase';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import {
  awardLogicBuildingWinnerCertificate,
  findCurrentMemberRank,
  getLogicLeaderboardScores,
  normalizeLogicScoreRows,
  notifyTopFivePlacement
} from './leaderboardUtils';
import { getContestResultState, weeklyContest } from './contestModel';
import { logError } from '../utils/errorLogger';

const rankStyles = [
  'from-amber-400 to-yellow-500 text-slate-950',
  'from-slate-200 to-slate-400 text-slate-950',
  'from-orange-300 to-amber-600 text-white',
];

export default function LogicBuildingLeaderboard() {
  const { profile } = useAuth();
  const { incrementUnreadNotifications } = useNotifications();
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resultState, setResultState] = useState(null);

  const topScores = useMemo(() => scores.slice(0, 5), [scores]);
  const champion = topScores[0] || null;
  const currentMember = useMemo(
    () => findCurrentMemberRank(scores, profile, localStorage.getItem('logicbuilding_username') || ''),
    [scores, profile]
  );

  const fetchScores = async () => {
    setLoading(true);
    setError('');
    try {
      setScores(await getLogicLeaderboardScores());
    } catch (err) {
      setError(err.message || 'Could not load leaderboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, 'logicBuildingScores'),
      (snap) => {
        const rows = [];
        snap.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
        setScores(normalizeLogicScoreRows(rows));
        setError('');
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Could not load leaderboard.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;

    const refreshResultState = async () => {
      try {
        await weeklyContest.load();
        const nextState = await getContestResultState();
        if (active) setResultState(nextState);
      } catch (err) {
        logError({ message: 'Unable to load logic contest result state', source: 'LogicBuildingLeaderboard', details: err?.message || err });
      }
    };

    refreshResultState();
    const interval = window.setInterval(refreshResultState, 60000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!resultState?.isResultTime) return;
    if (!currentMember || currentMember.rank > 5) return;
    notifyTopFivePlacement({
      profile,
      member: currentMember,
      incrementUnreadNotifications,
      resultKey: resultState.contestKey,
    });
  }, [currentMember, profile, incrementUnreadNotifications, resultState?.isResultTime, resultState?.contestKey]);

  useEffect(() => {
    if (!resultState?.isResultTime) return;
    if (!currentMember || currentMember.rank !== 1) return;
    awardLogicBuildingWinnerCertificate({
      profile,
      member: currentMember,
      incrementUnreadNotifications,
      resultKey: resultState.contestKey,
    });
  }, [currentMember, profile, incrementUnreadNotifications, resultState?.isResultTime, resultState?.contestKey]);

  if (loading) {
    return <LoadingSpinner message="Loading logic building leaderboard..." />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-sm">
        <div className="relative p-6 sm:p-8">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-cyan-400 to-emerald-400" />
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">
                <Trophy size={14} />
                Logic Building
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Leaderboard</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Top 5 members ranked by total points earned in logic building contests.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchScores}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-100"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      {champion ? (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 shadow-sm">
                <Trophy size={28} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Current Champion</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">{champion.username}</h2>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-950 px-5 py-4 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Points</p>
              <p className="mt-1 text-3xl font-black">{champion.score}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-950">
            <Award className="text-blue-600" size={22} />
            Top 5 Members
          </h2>
        </div>
        {currentMember ? (
          <div className={`mx-5 mb-5 rounded-xl border p-4 text-sm font-semibold ${
            currentMember.rank <= 5
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-blue-200 bg-blue-50 text-blue-800'
          }`}>
            You are here: rank #{currentMember.rank} with {currentMember.score} points.
          </div>
        ) : null}
        {topScores.length === 0 ? (
          <div className="p-8 text-center">
            <Sparkles className="mx-auto text-slate-300" size={34} />
            <p className="mt-3 font-semibold text-slate-700">No scores yet.</p>
            <p className="mt-1 text-sm text-slate-500">Scores will appear after members solve contest questions.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {topScores.map((member, index) => (
              <div key={`${member.id}-${member.username}-${index}`} className={`flex items-center gap-4 p-5 ${
                currentMember?.rank === index + 1 ? 'bg-emerald-50/80' : ''
              }`}>
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br font-black ${rankStyles[index] || 'from-blue-50 to-cyan-100 text-blue-700'}`}>
                  {index < 3 ? <Medal size={22} /> : index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-bold text-slate-950">{member.username}</p>
                    {currentMember?.rank === index + 1 ? (
                      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-white">
                        You are here
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {member.solvedCount} solved challenge{member.solvedCount === 1 ? '' : 's'}
                    {member.complexityLabel ? ` • ${member.complexityLabel}` : ''}
                    {member.firstSolvedAt ? ` • ${new Date(member.firstSolvedAt).toLocaleTimeString()}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-slate-950">{member.score}</p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">points</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
