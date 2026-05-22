// Admin UI for setting weekly contest questions
import React, { useEffect, useState } from 'react';
import { setContestQuestions } from './contestModel';
import { weeklyContest } from './contestModel';
import LoadingSpinner from '../components/LoadingSpinner';
import { logError } from '../utils/errorLogger';

export default function AdminContestSetup() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newQuestion, setNewQuestion] = useState({
    title: '',
    description: '',
    testCases: [], // {input, output, hidden}
    language: 'python',
  });
  const [testCaseInput, setTestCaseInput] = useState('');
  const [testCaseOutput, setTestCaseOutput] = useState('');
  const [testCaseHidden, setTestCaseHidden] = useState(false);
  const [day, setDay] = useState(weeklyContest.day);
  const [startTime, setStartTime] = useState(weeklyContest.startTime);
  const [endTime, setEndTime] = useState(weeklyContest.endTime);

  useEffect(() => {
    let mounted = true;
    const loadContestConfig = async () => {
      try {
        await weeklyContest.load();
        if (!mounted) return;
        setDay(weeklyContest.day);
        setStartTime(weeklyContest.startTime);
        setEndTime(weeklyContest.endTime);
        setQuestions(weeklyContest.questions || []);
      } catch (e) {
        if (!mounted) return;
        setError((e && e.message) ? e.message : 'Failed to load contest config');
      } finally {
        if (mounted) setInitialLoading(false);
      }
    };
    loadContestConfig();
    return () => { mounted = false; };
  }, []);

  function handleAddQuestion() {
    setQuestions([...questions, newQuestion]);
    setNewQuestion({ title: '', description: '', testCases: [], language: 'python' });
    setTestCaseInput('');
    setTestCaseOutput('');
    setTestCaseHidden(false);
  }

  function handleAddTestCase() {
    setNewQuestion({
      ...newQuestion,
      testCases: [...newQuestion.testCases, {
        input: testCaseInput,
        output: testCaseOutput,
        hidden: testCaseHidden,
      }],
    });
    setTestCaseInput('');
    setTestCaseOutput('');
    setTestCaseHidden(false);
  }

  function handleSave() {
    setLoading(true);
    setError(null);
    setContestQuestions(questions);
    weeklyContest.setSchedule(day, startTime, endTime);
    let didTimeout = false;
    const timeout = setTimeout(() => {
      didTimeout = true;
      setLoading(false);
      setError('Save timed out. Check your network or Firestore rules.');
      logError({ message: 'Firestore save timed out.', source: 'AdminContestSetup', details: null });
    }, 8000);
    weeklyContest.save()
      .then(() => {
        if (didTimeout) return;
        clearTimeout(timeout);
        setLoading(false);
        alert('Questions and schedule saved for weekly contest!');
        weeklyContest.load();
        window.dispatchEvent(new Event('weeklyContestUpdated'));
      })
      .catch(e => {
        if (didTimeout) return;
        clearTimeout(timeout);
        setLoading(false);
        setError((e && e.message) ? e.message : 'Failed to save contest');
        logError({ message: 'Firestore save error', source: 'AdminContestSetup', details: e });
      });
  }

  function handleDeleteQuestion(index) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  if (initialLoading) {
    return (
      <div style={{ maxWidth: '760px', margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{
          background: 'linear-gradient(135deg, #eef2ff 0%, #e0f2fe 100%)',
          border: '1px solid #c7d2fe',
          borderRadius: '1.25rem',
          padding: '2rem',
          boxShadow: '0 8px 24px rgba(99,102,241,0.12)'
        }}>
          <LoadingSpinner fullPage={false} message="Loading contest setup..." />
          <p style={{ textAlign: 'center', marginTop: '1rem', color: '#334155', fontSize: '0.95rem' }}>
            Fetching schedule and questions. This may take a few seconds.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '700px',
      margin: '2rem auto',
      background: 'linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)',
      borderRadius: '2rem',
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      padding: '2.5rem',
    }}>
      <h2 style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#6366f1', marginBottom: '2rem', textAlign: 'center' }}>Logic Building Contest Setup</h2>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', justifyContent: 'center', alignItems: 'center' }}>
        <label style={{ fontWeight: 'bold', color: '#334155' }}>Day:</label>
        <select value={day} onChange={e => setDay(e.target.value)} style={{ fontSize: '1.1rem', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1' }}>
          {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <label style={{ fontWeight: 'bold', color: '#334155' }}>Start Time:</label>
        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ fontSize: '1.1rem', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1' }} />
        <label style={{ fontWeight: 'bold', color: '#334155' }}>End Time:</label>
        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ fontSize: '1.1rem', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1' }} />
      </div>
      <div style={{ marginBottom: '2rem', background: '#fff', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.5rem', color: '#6366f1', marginBottom: '1rem' }}>Add Contest Question</h3>
        <input placeholder="Title" value={newQuestion.title} onChange={e => setNewQuestion({...newQuestion, title: e.target.value})} style={{ width: '100%', marginBottom: '1rem', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', fontSize: '1.1rem' }} />
        <textarea placeholder="Description" value={newQuestion.description} onChange={e => setNewQuestion({...newQuestion, description: e.target.value})} style={{ width: '100%', marginBottom: '1rem', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', fontSize: '1.1rem', minHeight: '80px' }} />
        <div style={{ marginBottom: '1rem', background: '#f3f4f6', borderRadius: '0.5rem', padding: '1rem' }}>
          <h4 style={{ fontSize: '1.1rem', color: '#334155', marginBottom: '0.5rem' }}>Add Test Case</h4>
          <input placeholder="Input" value={testCaseInput} onChange={e => setTestCaseInput(e.target.value)} style={{ width: '100%', marginBottom: '0.5rem', padding: '0.5rem', borderRadius: '0.3rem', border: '1px solid #cbd5e1', fontSize: '1rem' }} />
          <input placeholder="Expected Output" value={testCaseOutput} onChange={e => setTestCaseOutput(e.target.value)} style={{ width: '100%', marginBottom: '0.5rem', padding: '0.5rem', borderRadius: '0.3rem', border: '1px solid #cbd5e1', fontSize: '1rem' }} />
          <label style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
            <input type="checkbox" checked={testCaseHidden} onChange={e => setTestCaseHidden(e.target.checked)} style={{ marginRight: '0.5rem' }} />
            Hidden Test Case
          </label>
          <button onClick={handleAddTestCase} style={{ background: '#6366f1', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '0.3rem', padding: '0.5rem 1rem', fontSize: '1rem', cursor: 'pointer' }}>Add Test Case</button>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.7rem' }}>
            {newQuestion.testCases.map((tc, idx) => (
              <li key={idx} style={{ background: tc.hidden ? '#fca5a5' : '#a5b4fc', borderRadius: '0.3rem', padding: '0.5rem', marginBottom: '0.3rem', color: '#334155', fontWeight: 'bold' }}>
                Input: <span style={{ color: '#6366f1' }}>{tc.input}</span> | Output: <span style={{ color: '#6366f1' }}>{tc.output}</span> | {tc.hidden ? 'Hidden' : 'Shown'}
              </li>
            ))}
          </ul>
        </div>
        <button onClick={handleAddQuestion} style={{ background: '#6366f1', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '0.5rem', padding: '0.7rem 1.5rem', fontSize: '1.1rem', marginTop: '0.5rem', cursor: 'pointer' }}>Add Question</button>
      </div>
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.3rem', color: '#334155', marginBottom: '1rem' }}>Contest Questions</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {questions.map((q, idx) => (
            <li key={idx} style={{ background: '#e0e7ff', borderRadius: '0.5rem', padding: '1rem', marginBottom: '0.7rem', fontWeight: 'bold', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {q.title || `Question ${idx + 1}`}
              </span>
              <button
                type="button"
                onClick={() => handleDeleteQuestion(idx)}
                style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '0.4rem', padding: '0.35rem 0.8rem', fontSize: '0.9rem', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
      <button onClick={handleSave} style={{ display: 'block', margin: '0 auto', background: '#10b981', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '0.7rem', padding: '1rem 2.5rem', fontSize: '1.3rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(16,185,129,0.15)' }} disabled={loading}>
        {loading ? 'Saving...' : 'Save Questions & Schedule'}
      </button>
      {loading && <div style={{textAlign:'center',color:'#6366f1',marginTop:'1rem'}}>Saving...</div>}
      {error && <div style={{textAlign:'center',color:'#dc2626',marginTop:'1rem'}}>{error}</div>}
    </div>
  );
}
