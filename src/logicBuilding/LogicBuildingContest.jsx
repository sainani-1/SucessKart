
// Contest participation UI for students/teachers
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { db } from './firebase';
import { collection, doc, getDoc, setDoc, getDocs } from 'firebase/firestore';
import { isContestActive, getContestQuestions } from './contestModel';
import { weeklyContest } from './contestModel';
import { runCode } from './codeRunner';
import Toast from '../components/Toast';
import LoadingSpinner from '../components/LoadingSpinner';
import { estimateCodeComplexity } from './leaderboardUtils';
import { logError } from '../utils/errorLogger';

export default function LogicBuildingContest() {
        // State for inline while loop suggestion
        const [showWhileSuggestion, setShowWhileSuggestion] = useState(false);
      // Toast state for error messages
      const [toast, setToast] = useState({ show: false, message: '', type: 'error' });
    // Prevent copy/paste in code editor
    useEffect(() => {
      const blockCopyPaste = e => {
        if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') {
            e.preventDefault();
            setToast({ show: true, message: 'Copy/Paste is not allowed!', type: 'error' });
        }
      };
      document.addEventListener('copy', blockCopyPaste);
      document.addEventListener('paste', blockCopyPaste);
      document.addEventListener('cut', blockCopyPaste);
      return () => {
        document.removeEventListener('copy', blockCopyPaste);
        document.removeEventListener('paste', blockCopyPaste);
        document.removeEventListener('cut', blockCopyPaste);
      };
    }, []);
  const [done, setDone] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const { profile, isPremium, loading } = useAuth();
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [results, setResults] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [contestActive, setContestActive] = useState(false);
  const [contestConfigLoading, setContestConfigLoading] = useState(true);
  const [scoreMsg, setScoreMsg] = useState('');
  const [scoreboard, setScoreboard] = useState([]);
  const [prizeTitle, setPrizeTitle] = useState('');
  const [prizeDescription, setPrizeDescription] = useState('');

  const getLogicUsername = ({ promptIfMissing = false } = {}) => {
    const profileUsername = profile?.username?.trim();
    if (profileUsername) {
      localStorage.setItem('logicbuilding_username', profileUsername);
      return profileUsername;
    }
    let username = localStorage.getItem('logicbuilding_username') || '';
    if (!username.trim() && promptIfMissing) {
      username = prompt('Enter your username for the leaderboard:') || '';
      if (username.trim()) localStorage.setItem('logicbuilding_username', username.trim());
    }
    return username.trim();
  };

  const getLogicScoreDocId = () => profile?.id || getLogicUsername();

  // Check if already solved when question changes
  useEffect(() => {
    async function checkDone() {
      if (!selectedQuestion) return setDone(false);
      const scoreDocId = getLogicScoreDocId();
      if (!scoreDocId) return setDone(false);
      const userRef = doc(db, 'logicBuildingScores', scoreDocId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists() && userSnap.data().solved && userSnap.data().solved[selectedQuestion.title]) {
        setDone(true);
      } else {
        setDone(false);
      }
    }
    checkDone();
  }, [selectedQuestion, profile?.id, profile?.username]);

  React.useEffect(() => {
    async function checkActive() {
      try {
        await weeklyContest.load();
        setQuestions(weeklyContest.questions);
        const active = await isContestActive();
        setContestActive(active);
      } finally {
        setContestConfigLoading(false);
      }
    }
    checkActive();
    const unsubscribe = weeklyContest.subscribe(async () => {
      setQuestions(weeklyContest.questions);
      const active = await isContestActive();
      setContestActive(active);
    });
    return () => unsubscribe && unsubscribe();
  }, []);

  async function handleRun() {
    if (!selectedQuestion || done) return;
    setScoreMsg('');
      setToast({ show: false, message: '', type: 'error' });
      setIsRunning(true); // Show running indicator
      const res = await runCode(language, code, selectedQuestion.testCases);
      setResults(res);
      setIsRunning(false); // Hide running indicator
      // Show error as toast if any test case has status 'Error'
      if (res.some(r => r.status === 'Error')) {
        setToast({ show: true, message: 'Code error detected! Please fix your code.', type: 'error' });
      return;
    }
    // Check if all test cases passed
    const allPassed = res.every(r => r.status && r.status.toLowerCase().includes('accepted'));
    if (allPassed) {
      // Award random points between 16 and 20
      const points = Math.floor(Math.random() * 5) + 16;
      const complexity = estimateCodeComplexity(code);
      const solvedAt = new Date().toISOString();
      setScoreMsg(`Congratulations! All test cases passed. You earned ${points} points for this question.`);
      // Save/update score in Firestore (by user/question)
      const username = getLogicUsername({ promptIfMissing: true });
      if (!username) {
        setToast({ show: true, message: 'Username is required for the leaderboard.', type: 'error' });
        return;
      }
      const userRef = doc(db, 'logicBuildingScores', profile?.id || username);
      const userSnap = await getDoc(userRef);
      let prevScore = 0;
      let solved = {};
      if (userSnap.exists()) {
        prevScore = userSnap.data().score || 0;
        solved = userSnap.data().solved || {};
      }
      solved[selectedQuestion.title] = true;
      const prevComplexityScore = userSnap.exists() ? Number(userSnap.data().complexity_score || 0) : 0;
      const firstSolvedAt = userSnap.exists() && userSnap.data().first_solved_at
        ? userSnap.data().first_solved_at
        : solvedAt;
      await setDoc(userRef, {
        name: username,
        username,
        email: profile?.email || '',
        user_id: profile?.id || '',
        score: prevScore + points,
        complexity_score: prevComplexityScore + complexity.score,
        complexity_label: complexity.label,
        first_solved_at: firstSolvedAt,
        last_solved_at: solvedAt,
        solved,
        code
      }, { merge: true });
      setDone(true);
      fetchScoreboard();

      // Plagiarism check and penalty
      // Fetch all submissions for this question
      const snap = await getDocs(collection(db, 'logicBuildingScores'));
      const submissions = [];
      snap.forEach(doc => {
        const data = doc.data();
        if (data.solved && data.solved[selectedQuestion.title] && data.code) {
          submissions.push({ id: doc.id, user: data.username || data.name, code: data.code, score: data.score });
        }
      });
      // Compare codes for similarity
      for (let i = 0; i < submissions.length; i++) {
        for (let j = i + 1; j < submissions.length; j++) {
          if (submissions[i].user !== submissions[j].user) {
            // Use simple string comparison for now
            const sim = submissions[i].code.trim() === submissions[j].code.trim();
            if (sim) {
              // Penalize both
              let penaltyMsg = 'Copied code detected! Points reduced by 200.';
              let newScoreI = submissions[i].score < 200 ? 0 : submissions[i].score - 200;
              let newScoreJ = submissions[j].score < 200 ? 0 : submissions[j].score - 200;
              const userRefI = doc(db, 'logicBuildingScores', submissions[i].id);
              const userRefJ = doc(db, 'logicBuildingScores', submissions[j].id);
              await setDoc(userRefI, { score: newScoreI }, { merge: true });
              await setDoc(userRefJ, { score: newScoreJ }, { merge: true });
              setScoreMsg(penaltyMsg);
            }
          }
        }
      }
    }
  }

  async function fetchScoreboard() {
    const snap = await getDocs(collection(db, 'logicBuildingScores'));
    const arr = [];
    snap.forEach(doc => arr.push(doc.data()));
    arr.sort((a, b) => b.score - a.score);
    setScoreboard(arr);
  }

  useEffect(() => {
    fetchScoreboard();
  }, []);

  useEffect(() => {
    const loadPrizeConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('key, value')
          .in('key', ['logic_weekly_prize_title', 'logic_weekly_prize_description']);
        if (error) throw error;
        const map = Object.fromEntries((data || []).map((x) => [x.key, x.value || '']));
        setPrizeTitle(map.logic_weekly_prize_title || '');
        setPrizeDescription(map.logic_weekly_prize_description || '');
      } catch (err) {
        logError({ message: 'Unable to load weekly prize config', source: 'LogicBuildingContest', details: err.message });
      }
    };
    loadPrizeConfig();
  }, []);

  // Show loading while auth/profile is loading
  if (loading) {
    return (
      <div style={{ maxWidth: '760px', margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{
          background: 'linear-gradient(135deg, #eef2ff 0%, #e0f2fe 100%)',
          border: '1px solid #c7d2fe',
          borderRadius: '1.25rem',
          padding: '2rem',
          boxShadow: '0 8px 24px rgba(99,102,241,0.12)'
        }}>
          <LoadingSpinner fullPage={false} message="Preparing Logic Building Contest..." />
          <p style={{ textAlign: 'center', marginTop: '1rem', color: '#334155', fontSize: '0.95rem' }}>
            Verifying your profile and premium access.
          </p>
        </div>
      </div>
    );
  }

  if (contestConfigLoading) {
    return (
      <div style={{ maxWidth: '760px', margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{
          background: 'linear-gradient(135deg, #eef2ff 0%, #e0f2fe 100%)',
          border: '1px solid #c7d2fe',
          borderRadius: '1.25rem',
          padding: '2rem',
          boxShadow: '0 8px 24px rgba(99,102,241,0.12)'
        }}>
          <LoadingSpinner fullPage={false} message="Loading contest..." />
          <p style={{ textAlign: 'center', marginTop: '1rem', color: '#334155', fontSize: '0.95rem' }}>
            Loading contest...
          </p>
        </div>
      </div>
    );
  }

  // Restrict to premium users
  if (!isPremium(profile)) {
    return (
      <div style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f0f4ff 0%, #e0e7ff 100%)',
        borderRadius: '2rem',
        boxShadow: '0 8px 32px rgba(99,102,241,0.10)',
        margin: '2rem',
        padding: '3rem',
        border: '2px solid #6366f1',
      }}>
        <h1 style={{ fontSize: '2.7rem', fontWeight: 'bold', color: '#6366f1', marginBottom: '1.2rem', letterSpacing: '1px' }}>Logic Building Contest</h1>
        <p style={{ fontSize: '1.3rem', color: '#334155', marginBottom: '1.5rem', textAlign: 'center' }}>
          <span style={{ color: '#dc2626', fontWeight: 'bold' }}>This contest is only available for premium students.</span><br/>
          <span style={{ color: '#64748b' }}>Upgrade to premium to participate in weekly coding contests and win rewards!</span>
        </p>
      </div>
    );
  }

  if (!contestActive) return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0f4ff 0%, #e0e7ff 100%)',
      borderRadius: '2rem',
      boxShadow: '0 8px 32px rgba(99,102,241,0.10)',
      margin: '2rem',
      padding: '3rem',
      border: '2px solid #6366f1',
    }}>
      <h1 style={{ fontSize: '2.7rem', fontWeight: 'bold', color: '#6366f1', marginBottom: '1.2rem', letterSpacing: '1px' }}>Logic Building Contest</h1>
      <p style={{ fontSize: '1.3rem', color: '#334155', marginBottom: '1.5rem', textAlign: 'center' }}>
        <span style={{ color: '#dc2626', fontWeight: 'bold' }}>Contest is not active right now.</span><br/>
        Next contest: <span style={{ color: '#6366f1', fontWeight: 'bold' }}>{weeklyContest.day}</span> <span style={{ color: '#6366f1', fontWeight: 'bold' }}>{weeklyContest.startTime} - {weeklyContest.endTime}</span>.<br/>
        <span style={{ color: '#64748b' }}>Stay tuned and come back during the contest window!</span>
      </p>
      <div style={{fontSize:'1.1rem',color:'#64748b',marginTop:'1rem',background:'#fff',padding:'1rem 2rem',borderRadius:'1rem',boxShadow:'0 2px 8px rgba(99,102,241,0.08)'}}>Practice your coding skills and get ready for the next challenge!</div>
    </div>
  );

  return (
    <div style={{
      maxWidth: '900px',
      margin: '2rem auto',
      background: 'linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)',
      borderRadius: '2rem',
      boxShadow: '0 8px 32px rgba(99,102,241,0.10)',
      padding: '2.5rem',
      border: '2px solid #6366f1',
    }}>
      <h2 style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#6366f1', marginBottom: '2rem', textAlign: 'center', letterSpacing: '1px' }}>Logic Building Weekly Contest</h2>
      {(prizeTitle || prizeDescription) && (
        <div style={{
          margin: '0 auto 2rem auto',
          background: 'linear-gradient(90deg, #dbeafe 0%, #e0e7ff 100%)',
          border: '2px solid #3b82f6',
          borderRadius: '1.2rem',
          padding: '1.2rem 2rem',
          fontSize: '1.05rem',
          color: '#1e3a8a',
          textAlign: 'center',
          boxShadow: '0 2px 8px rgba(59,130,246,0.12)'
        }}>
          {prizeTitle && <p style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{prizeTitle}</p>}
          {prizeDescription && <p style={{ marginTop: prizeTitle ? '0.35rem' : 0 }}>{prizeDescription}</p>}
        </div>
      )}
      <div style={{ marginBottom: '2rem', display: 'flex', gap: '1.5rem', alignItems: 'center', justifyContent: 'center' }}>
        <label style={{ fontWeight: 'bold', color: '#334155', fontSize: '1.1rem' }}>Select Question:</label>
        <select onChange={e => setSelectedQuestion(questions[e.target.value])} style={{ fontSize: '1.1rem', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', minWidth: '220px' }}>
          <option value="">-- Choose --</option>
          {questions.map((q, idx) => (
            <option value={idx} key={idx}>{q.title}</option>
          ))}
        </select>
      </div>
      {selectedQuestion && (
        <div style={{ background: '#fff', borderRadius: '1.2rem', boxShadow: '0 2px 8px rgba(99,102,241,0.08)', padding: '2rem', marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.5rem', color: '#6366f1', marginBottom: '1rem' }}>{selectedQuestion.title}</h3>
          <p style={{ fontSize: '1.1rem', color: '#334155', marginBottom: '1.5rem' }}>{selectedQuestion.description}</p>
                    {/* Inline suggestion hint below editor */}
                    <div style={{ marginBottom: '0.7rem', color: '#64748b', fontSize: '1rem' }}>
                      Type <b>c!</b> for C structure, <b>cpp!</b> for C++ structure, <b>java!</b> for Java structure, <b>python!</b> for Python structure.<br />
                      Type <b>while</b> to get a while loop suggestion.
                    </div>
                    <div style={{ display: 'flex', width: '100%', marginBottom: '1rem', borderRadius: '0.7rem', border: '1px solid #cbd5e1', background: '#f3f4f6', overflow: 'hidden', minHeight: '120px' }}>
                      <div style={{ background: '#e0e7ff', color: '#6366f1', textAlign: 'right', padding: '1rem 0.5rem', fontSize: '1.1rem', minWidth: '2.5rem', userSelect: 'none', lineHeight: '1.6', borderRight: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        {Array.from({ length: Math.max(1, code.split('\n').length) }, (_, i) => (
                          <span key={i}>{i + 1}</span>
                        ))}
                      </div>
                      <textarea
                        id="code-editor"
                        value={code}
                        onChange={e => {
                          if (done) return;
                          let val = e.target.value;
                          // Auto-insert structure on language trigger
                          let structureInserted = false;
                          if (/^c!$/m.test(val.trim())) {
                            val = '#include <stdio.h>\n#include <string.h>\nint main() {\n// Sample Code Auto Generated By SkillPro\n\nreturn 0;\n}';
                            structureInserted = true;
                          } else if (/^cpp!$/m.test(val.trim())) {
                            val = '#include <iostream>\nusing namespace std;\nint main() {\n// Sample Code Auto Generated By SkillPro\n\nreturn 0;\n}';
                            structureInserted = true;
                          } else if (/^java!$/m.test(val.trim())) {
                            val = 'public class Main {\n    public static void main(String[] args) {\n        // Sample Code Auto Generated By SkillPro\n    }\n}';
                            structureInserted = true;
                          } else if (/^python!$/m.test(val.trim())) {
                            val = '# Sample Code Auto Generated By SkillPro\ndef main():\n    pass\n\nif __name__ == "__main__":\n    main()';
                            structureInserted = true;
                          }
                          setCode(val);
                          // Show while loop suggestion if typing 'while'
                          setShowWhileSuggestion(/\bwhile\b/.test(val));
                        }}
                        placeholder="Write your code here..."
                        style={{ flex: 1, minHeight: '120px', fontSize: '1.1rem', border: 'none', padding: '1rem', background: 'transparent', resize: 'vertical', lineHeight: '1.6', outline: 'none' }}
                        disabled={done}
                      />
                      {/* Inline while loop suggestion */}
                      {showWhileSuggestion && (
                        <div style={{ position: 'absolute', right: '1rem', top: '1rem', background: '#e0e7ff', color: '#6366f1', borderRadius: '0.5rem', padding: '0.5rem 1rem', cursor: 'pointer', zIndex: 2, fontWeight: 'bold', boxShadow: '0 2px 8px rgba(99,102,241,0.08)' }}
                          onClick={() => {
                            let snippet = '';
                            if (language === 'c' || language === 'cpp') snippet = 'int i = 0;\nwhile (i < 10) {\n    // loop body\n    i++;\n}';
                            else if (language === 'java') snippet = 'int i = 0;\nwhile (i < 10) {\n    // loop body\n    i++;\n}';
                            else if (language === 'python') snippet = 'i = 0\nwhile i < 10:\n    # loop body\n    i += 1';
                            setCode(code + (code && !code.endsWith('\n') ? '\n' : '') + snippet);
                            setShowWhileSuggestion(false);
                            setTimeout(() => {
                              const textarea = document.getElementById('code-editor');
                              if (textarea) textarea.focus();
                            }, 0);
                          }}
                        >Insert while loop</div>
                      )}
                    </div>
            {/* Toast for error messages */}
            <Toast show={toast.show} message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, show: false })} />
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
            <label style={{ fontWeight: 'bold', color: '#334155' }}>Language:</label>
            <select value={language} onChange={e => setLanguage(e.target.value)} style={{ fontSize: '1.1rem', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1' }}>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="cpp">C++</option>
              <option value="c">C</option>
            </select>
            {!done ? (
              <button onClick={handleRun} style={{ background: '#10b981', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '0.7rem', padding: '0.7rem 2rem', fontSize: '1.1rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(16,185,129,0.15)' }}>Run & Test</button>
            ) : (
              <div style={{ color: '#10b981', fontWeight: 'bold', fontSize: '1.2rem', marginLeft: '1rem' }}>Done</div>
            )}
          </div>
          {scoreMsg && <div style={{margin:'1rem 0',color:'#10b981',fontWeight:'bold',fontSize:'1.2rem'}}>{scoreMsg}</div>}
          <div style={{ marginTop: '1.5rem' }}>
            <h4 style={{ color: '#6366f1', fontWeight: 'bold', marginBottom: '0.7rem' }}>Test Results</h4>
            {isRunning && <div style={{ color: '#6366f1', fontWeight: 'bold', marginBottom: '1rem' }}>Running...</div>}
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {results.length === 0 && !isRunning && <li style={{ color: '#64748b' }}>No test results yet. Click "Run & Test" to check your code.</li>}
              {results.map((r, idx) => (
                r.hidden ? (
                  <li key={idx} style={{ background: '#fca5a5', borderRadius: '0.5rem', padding: '0.7rem', marginBottom: '0.5rem', color: '#334155', fontWeight: 'bold' }}>
                    Hidden Test: <span style={{ color: r.status && r.status.toLowerCase().includes('accepted') ? '#10b981' : '#dc2626' }}>{r.status}</span>
                  </li>
                ) : (
                  <li key={idx} style={{ background: '#a5b4fc', borderRadius: '0.5rem', padding: '0.7rem', marginBottom: '0.5rem', color: '#334155', fontWeight: 'bold' }}>
                    Shown Test:<br />
                    <span style={{ color: r.status && r.status.toLowerCase().includes('accepted') ? '#10b981' : '#dc2626' }}>{r.status}</span><br />
                    <span>Input: <code>{r.input}</code></span><br />
                    <span>Expected Output: <code>{r.expectedOutput}</code></span><br />
                    <span>Your Output: <code>{r.actualOutput}</code></span>
                  </li>
                )
              ))}
            </ul>
          </div>
        </div>
      )}
      {/* Scoreboard */}
      <div style={{ background: '#fff', borderRadius: '1.2rem', boxShadow: '0 2px 8px rgba(99,102,241,0.08)', padding: '2rem', marginBottom: '2rem' }}>
        <h3 style={{ color: '#6366f1', fontWeight: 'bold', marginBottom: '1rem' }}>Scoreboard</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '1.1rem' }}>
          <thead>
            <tr style={{ background: '#e0e7ff', color: '#334155' }}><th style={{padding:'0.7rem'}}>Name</th><th style={{padding:'0.7rem'}}>Score</th></tr>
          </thead>
          <tbody>
            {scoreboard.map((s, idx) => (
              <tr key={idx} style={{ background: idx % 2 === 0 ? '#f3f4f6' : '#fff' }}><td style={{padding:'0.7rem'}}>{s.name}</td><td style={{padding:'0.7rem'}}>{s.score}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

