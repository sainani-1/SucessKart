import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Mic, Camera, Play, AlertCircle, Clock, BarChart3, Briefcase, MapPin, DollarSign, Building2, CheckCircle } from 'lucide-react';
import usePopup from '../hooks/usePopup.jsx';
import { logError } from '../utils/errorLogger';

const InterviewPrep = () => {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('interview'); // 'interview' or 'placements'
  const [started, setStarted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [streamError, setStreamError] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [interviewCompleted, setInterviewCompleted] = useState(false);
  const [score, setScore] = useState(0);
  const [codeSnippet, setCodeSnippet] = useState(`// Implement solve(nums) that returns the sum of all numbers\nfunction solve(nums) {\n  return nums.reduce((a, b) => a + b, 0);\n}`);
  const [codeResult, setCodeResult] = useState(null);
  const videoRef = useRef(null);
  const previewRef = useRef(null);
  const { popupNode, openPopup } = usePopup();

  // Use top questions only (first 3) for quicker mock
  const questions = [
    "Tell me about yourself and your programming background.",
    "Explain the concept of polymorphism with a real-world example.",
    "How would you design a URL shortener service?"
  ];

  const placements = [
    {
      id: 1,
      company: 'Google',
      role: 'Software Engineer',
      location: 'Bangalore, India',
      salary: '₹60,00,000 - ₹80,00,000',
      requirements: 'Interview Score: 85%+',
      eligible: score >= 85,
      status: 'Interested',
      logo: '🔵'
    },
    {
      id: 2,
      company: 'Amazon',
      role: 'Backend Developer',
      location: 'Hyderabad, India',
      salary: '₹55,00,000 - ₹75,00,000',
      requirements: 'Interview Score: 80%+',
      eligible: score >= 80,
      status: 'Interested',
      logo: '🔶'
    },
    {
      id: 3,
      company: 'Microsoft',
      role: 'Full Stack Developer',
      location: 'Pune, India',
      salary: '₹50,00,000 - ₹70,00,000',
      requirements: 'Interview Score: 75%+',
      eligible: score >= 75,
      status: 'Shortlisted',
      logo: '💚'
    },
    {
      id: 4,
      company: 'Meta',
      role: 'Frontend Engineer',
      location: 'Remote',
      salary: '₹58,00,000 - ₹78,00,000',
      requirements: 'Interview Score: 82%+',
      eligible: score >= 82,
      status: 'Interested',
      logo: '🔵'
    },
    {
      id: 5,
      company: 'LinkedIn',
      role: 'Data Engineer',
      location: 'Bangalore, India',
      salary: '₹52,00,000 - ₹72,00,000',
      requirements: 'Interview Score: 78%+',
      eligible: score >= 78,
      status: 'Interested',
      logo: '🔵'
    }
  ];

  // Start camera+mic stream and attach to the given video ref
  const startStream = async (targetRef) => {
    try {
      setStreamError('');
      if (!navigator?.mediaDevices?.getUserMedia) {
        setStreamError('Camera/microphone not supported in this browser.');
        return null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      if (targetRef.current) targetRef.current.srcObject = stream;
      return stream;
    } catch (err) {
      logError({ message: 'Media access error:', source: 'InterviewPrep', details: err })
      if (err.name === 'NotAllowedError') {
        openPopup('Permission Denied', 'Please allow camera and microphone access. Go to browser settings and grant permissions.', 'warning');
        setStreamError('Permission denied. Please allow camera and microphone.');
      } else if (err.name === 'NotFoundError') {
        openPopup('Device Not Found', 'No camera or microphone found on this device.', 'warning');
        setStreamError('No camera or microphone found.');
      } else {
        openPopup('Error', 'Failed to access camera and microphone. Please try again.', 'warning');
        setStreamError('Failed to start camera. Retry after allowing permissions.');
      }
      return null;
    }
  };

  // Preview stream before starting the interview
  const handlePreview = async () => {
    const stream = await startStream(previewRef);
    if (stream) setPreviewing(true);
  };

  // Start interview stream; stop preview if running
  const handleStartInterview = async () => {
    const stream = await startStream(videoRef);
    if (!stream) return;
    setStarted(true);
    setRecording(true);
    if (previewRef.current && previewRef.current.srcObject) {
      previewRef.current.srcObject.getTracks().forEach(track => track.stop());
      previewRef.current.srcObject = null;
    }
    setPreviewing(false);
  };

  const handleNextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      handleFinishInterview();
    }
  };

  // Finalize mock interview, compute score, stop stream
  const handleFinishInterview = () => {
    // Mock score calculation (in production, AI analyzes the video)
    const mockScore = Math.floor(Math.random() * 20) + 75; // 75-95 score
    setScore(mockScore);
    setInterviewCompleted(true);
    openPopup('Interview completed', `Your score: ${mockScore}%. Based on your performance, you are eligible for ${placements.filter(p => p.eligible).length} placement opportunities.`, 'success');
    setStarted(false);
    setRecording(false);
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const runCode = () => {
    const tests = [
      { input: [1, 2, 3], expected: 6 },
      { input: [5, -2, 7], expected: 10 },
      { input: [], expected: 0 },
    ];
    try {
      const fn = new Function('input', `${codeSnippet}; return solve(input);`);
      const results = tests.map((t) => {
        const output = fn([...t.input]);
        const pass = JSON.stringify(output) === JSON.stringify(t.expected);
        return { ...t, output, pass };
      });
      const passed = results.filter(r => r.pass).length;
      setCodeResult({ passed, total: tests.length, results });
    } catch (err) {
      setCodeResult({ error: err.message });
    }
  };

  const fillWorkingSolution = () => {
    setCodeSnippet(`// Working solution: sums all numbers\nfunction solve(nums) {\n  return nums.reduce((sum, n) => sum + Number(n || 0), 0);\n}`);
  };

  if (!started && !interviewCompleted) {
    return (
      <div className="p-8 space-y-6">
        {popupNode}
        <div className="flex items-center gap-3">
          <Briefcase className="text-blue-600" size={32} />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Interviews & Placements</h1>
            <p className="text-slate-600">Practice interviews and get placed at top companies</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="font-bold text-lg text-slate-900 mb-3">Technical Interview</h3>
            <p className="text-slate-600 text-sm mb-4">
              Answer technical questions covering DSA, system design, and problem-solving.
            </p>
            <ul className="text-sm text-slate-600 space-y-2 mb-6">
              <li>✓ 3 questions (9 minutes)</li>
              <li>✓ AI evaluates clarity and depth</li>
              <li>✓ Detailed feedback provided</li>
              <li>✓ Unlock placement opportunities</li>
            </ul>
            <div className="space-y-3 mb-4">
              <button
                onClick={handlePreview}
                className="w-full border border-slate-300 text-slate-700 py-2 rounded-lg hover:bg-slate-50 font-semibold"
              >
                Preview Camera & Mic
              </button>
              {previewing && (
                <div className="bg-black rounded-lg overflow-hidden relative">
                  <video
                    ref={previewRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: '100%', height: '240px', objectFit: 'cover' }}
                  />
                  {!previewRef.current?.srcObject && streamError && (
                    <div className="absolute inset-0 bg-black/80 text-red-100 flex items-center justify-center text-sm px-4 text-center">
                      {streamError}
                    </div>
                  )}
                  {!previewRef.current?.srcObject && !streamError && (
                    <div className="absolute inset-0 bg-black/60 text-white flex items-center justify-center text-sm px-4 text-center">
                      Waiting for camera preview...
                    </div>
                  )}
                </div>
              )}
              {streamError && (
                <p className="text-xs text-red-600">{streamError}</p>
              )}
            </div>
            <button
              onClick={handleStartInterview}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-semibold"
            >
              Start Technical Interview
            </button>
          </div>

          <div className="bg-gradient-to-br from-gold-50 to-gold-100 border border-gold-300 rounded-xl p-6">
            <h3 className="font-bold text-lg text-slate-900 mb-3">🎯 Placement Guarantee</h3>
            <p className="text-slate-700 text-sm mb-4">
              Score 75%+ and get exclusive placement opportunities from 50+ companies.
            </p>
            <ul className="text-sm text-slate-700 space-y-2 mb-6">
              <li>✓ Jobs ranging from ₹50L - ₹100L+ annually</li>
              <li>✓ Multiple location options (Remote/On-site)</li>
              <li>✓ Direct company partnerships</li>
              <li>✓ Career mentorship included</li>
            </ul>
            <button
              onClick={handleStartInterview}
              className="w-full bg-nani-dark text-white py-2 rounded-lg hover:bg-black font-semibold"
            >
              Start Interview Now
            </button>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-slate-900 mb-2">How Placements Work</h4>
              <ol className="text-sm text-slate-700 space-y-1">
                <li>1. Complete technical interview (3 questions)</li>
                <li>2. AI analyzes your response and generates score</li>
                <li>3. Based on score, get matched with suitable jobs</li>
                <li>4. Companies review your profile and contact directly</li>
                <li>5. Interview round with company HR team</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (started) {
    return (
      <div className="p-8 space-y-6">
        {popupNode}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Live Interview</h1>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Clock size={16} />
            Question {currentQuestion + 1} of {questions.length}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {/* Video Feed */}
            <div className="bg-black rounded-xl overflow-hidden mb-6 relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '400px', objectFit: 'cover' }}
                className="bg-black"
              />
              {!videoRef.current?.srcObject && streamError && (
                <div className="absolute inset-0 bg-black/80 text-red-100 flex items-center justify-center text-sm px-4 text-center">
                  {streamError}
                </div>
              )}
              {!videoRef.current?.srcObject && !streamError && (
                <div className="absolute inset-0 bg-black/60 text-white flex items-center justify-center text-sm px-4 text-center">
                  Starting camera...
                </div>
              )}
              {recording && (
                <div className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span> REC
                </div>
              )}
            </div>

            {/* Question Section */}
            <div className="bg-white p-6 rounded-xl border">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Question {currentQuestion + 1}</h3>
              <p className="text-lg text-slate-700 mb-6">{questions[currentQuestion]}</p>
              
              <div className="space-y-3">
                <button
                  onClick={handleNextQuestion}
                  className="w-full bg-nani-dark text-white py-3 rounded-lg hover:bg-black font-semibold"
                >
                  {currentQuestion === questions.length - 1 ? 'Finish Interview' : 'Next Question'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-slate-700">
              💡 <strong>Tips:</strong> Speak clearly, take your time, and explain your thoughts. Your response is being recorded.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Interview completed - show placements
  return (
    <div className="p-8 space-y-6">
      {popupNode}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Briefcase className="text-green-600" size={32} />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Interview & Placement Results</h1>
            <p className="text-slate-600">Your interview has been analyzed. Check eligible placements below.</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-600">Your Score</p>
          <p className="text-4xl font-bold text-green-600">{score}%</p>
        </div>
      </div>

      <div className="bg-green-50 border border-green-300 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <CheckCircle size={24} className="text-green-600" />
          <div>
            <h3 className="font-bold text-green-900">Great Job!</h3>
             <p className="text-sm text-green-800">You are eligible for {placements.filter(p => score >= parseInt(p.requirements.split(':')[1])).length} placement opportunities based on your score.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {placements.map(job => (
          <div
            key={job.id}
            className={`p-6 rounded-xl border-2 transition-all ${
              score >= parseInt(job.requirements.split(':')[1])
                ? 'bg-white border-green-300 shadow-md'
                : 'bg-slate-50 border-slate-200 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <div className="text-4xl">{job.logo}</div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{job.company}</h3>
                  <p className="text-sm text-slate-600">{job.role}</p>
                </div>
              </div>
              {score >= parseInt(job.requirements.split(':')[1]) && (
                <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded">
                  Eligible ✓
                </span>
              )}
            </div>

            <div className="space-y-2 mb-4 text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-slate-500" />
                {job.location}
              </div>
              <div className="flex items-center gap-2">
                <DollarSign size={16} className="text-slate-500" />
                {job.salary}
              </div>
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-slate-500" />
                {job.requirements}
              </div>
            </div>

            <div className="bg-slate-100 text-slate-700 text-xs px-2 py-1 rounded inline-block mb-4">
              {job.status}
            </div>

            <button
              disabled={!(score >= parseInt(job.requirements.split(':')[1]))}
              className={`w-full py-2 rounded-lg font-semibold transition-all ${
                score >= parseInt(job.requirements.split(':')[1])
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              {score >= parseInt(job.requirements.split(':')[1]) ? 'Apply Now' : `Need ${job.requirements.split(':')[1]}`}
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => {
          setInterviewCompleted(false);
          setCurrentQuestion(0);
          setScore(0);
        }}
        className="w-full py-3 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold"
      >
        Retake Interview
      </button>
    </div>
  );
};

export default InterviewPrep;
