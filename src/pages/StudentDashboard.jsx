import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import { PlayCircle, Clock, Award, Zap, Calendar, MessageCircle, CheckCircle, AlertCircle, RotateCcw, FileText, Copy, Share2, ExternalLink, Trophy, User } from 'lucide-react';
import { useChatOverlay } from '../context/ChatOverlayContext';
import { format, addDays } from 'date-fns';
import PremiumGiftCelebration from '../components/PremiumGiftCelebration';
import StudentExperienceHub from '../components/StudentExperienceHub';
import { ensureReferralCode } from '../utils/referrals';
import { copyText, trackPremiumEvent } from '../utils/growth';
import { getPublicAppUrl } from '../utils/appUrl';
import { isLifetimePremium } from '../utils/premium';
import { formatVideoResumeLabel, getVideoCompletionPercent, readVideoProgress } from '../utils/videoProgress';
import { logError } from '../utils/errorLogger';

// Offer congrats widget
const OfferCongrats = ({ offer }) => (
  <div className="bg-gradient-to-r from-pink-500 to-pink-700 p-6 rounded-xl text-white relative mb-6">
    <h2 className="text-2xl font-bold mb-2">🎉 Special Offer!</h2>
    <p className="mb-2">{offer.is_lifetime_free ? 'You have been granted Lifetime Free Access!' : offer.discount_type === 'percent' ? `You have a ${offer.discount_value}% discount!` : `Flat ₹${offer.discount_value} off!`}</p>
    <p className="text-xs">{offer.title} - {offer.description}</p>
  </div>
);

const StudentDashboard = () => {
  const { profile, isPremium } = useAuth();
  const safeProfile = profile || { id: '', full_name: 'Student', premium_until: null };
  const { openChat } = useChatOverlay();
  const [courses, setCourses] = useState([]);
  const [teacher, setTeacher] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showPremiumGift, setShowPremiumGift] = useState(false);
  const [premiumDays, setPremiumDays] = useState(0);
  const [certificates, setCertificates] = useState([]);
  const [examResults, setExamResults] = useState({}); // courseId -> {passed, score, next_retry_date}
  const [offers, setOffers] = useState([]);
  const [showOfferCongrats, setShowOfferCongrats] = useState(false);
  const [classAlerts, setClassAlerts] = useState([]);
  const [premiumCost, setPremiumCost] = useState(null);
  const [redeemedOfferIds, setRedeemedOfferIds] = useState(new Set());
  const [referralCode, setReferralCode] = useState('');
  const [referralStats, setReferralStats] = useState({ registered: 0, paid: 0 });
  const [copyFeedback, setCopyFeedback] = useState('');
  const [videoProgressByCourseId, setVideoProgressByCourseId] = useState({});

  const certificateCourses = new Set(certificates.map(c => c.course_id));
  const getCourseProgress = (course) => {
    if (certificateCourses.has(course.course_id) || examResults[course.course_id]?.passed) return 100;
    const raw = Number(course.progress) || 0;
    const savedVideoProgress = videoProgressByCourseId[String(course.course_id)] || null;
    const videoPercent = getVideoCompletionPercent(savedVideoProgress);
    return Math.min(Math.max(Math.max(raw, videoPercent), 0), 100);
  };

  // Derived aggregates for cards
  const passedExams = Math.max(
    certificates.length,
    courses.reduce((count, c) => count + (examResults[c.course_id]?.passed ? 1 : 0), 0)
  );
  const inProgressExams = Math.max(courses.length - passedExams, 0);
  const completedCourses = courses.filter(c => c.completed || getCourseProgress(c) >= 100).length;
  const inProgressCourses = Math.max(courses.length - completedCourses, 0);

  useEffect(() => {
    if (!profile?.id) return;
    checkFirstLogin();
    checkPremiumGift();
    fetchData();
    fetchOffers();
  }, [profile]);

  useEffect(() => {
    if (!profile?.id || courses.length === 0) {
      setVideoProgressByCourseId({});
      return;
    }

    const next = {};
    courses.forEach((course) => {
      const courseKey = String(course.course_id || course.courses?.id || '');
      if (!courseKey) return;
      const saved = readVideoProgress(profile.id, courseKey);
      if (saved) next[courseKey] = saved;
    });
    setVideoProgressByCourseId(next);
  }, [profile?.id, courses]);

  useEffect(() => {
    if (!profile?.id) return;

    const fetchClassAlerts = async () => {
      try {
        // Source directly from assigned class sessions so teacher/admin schedules always appear.
        const { data, error } = await supabase
          .from('class_sessions')
          .select('id, title, scheduled_for, created_at, meeting_type, meeting_link, status, class_session_participants!inner(student_id)')
          .eq('class_session_participants.student_id', profile.id)
          .gte('scheduled_for', new Date().toISOString())
          .order('scheduled_for', { ascending: true })
          .limit(5);

        if (error) {
          logError({ message: 'Error loading class session alerts:', source: 'StudentDashboard', details: error })
          return;
        }

        const alerts = (data || []).filter((session) => session.status !== 'ended').map((session) => ({
          id: session.id,
          title: `Class Scheduled: ${session.title}`,
          scheduled_for: session.scheduled_for,
          meeting_link: session.meeting_link,
          content: `Your class is scheduled for ${new Date(session.scheduled_for).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata'
          })}.`,
          created_at: session.created_at || session.scheduled_for
        }));
        setClassAlerts(alerts);
      } catch (err) {
        logError({ message: 'Error loading class alerts:', source: 'StudentDashboard', details: err })
      }
    };

    fetchClassAlerts();
    const interval = setInterval(fetchClassAlerts, 60000);
    return () => clearInterval(interval);
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    const loadPremiumCost = async () => {
      try {
        const { data } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'premium_cost')
          .maybeSingle();
        const parsedCost = parseInt(data?.value, 10);
        setPremiumCost(Number.isFinite(parsedCost) ? parsedCost : 199);
      } catch {
        setPremiumCost(199);
      }
    };
    loadPremiumCost();
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    const loadReferralCode = async () => {
      try {
        const code = await ensureReferralCode(profile.id, profile.full_name);
        setReferralCode(code || '');
      } catch (error) {
        logError({ message: 'Error loading referral code:', source: 'StudentDashboard', details: error })
      }
    };
    loadReferralCode();
  }, [profile?.id, profile?.full_name]);

  useEffect(() => {
    if (!profile?.id) return;

    const loadReferralStats = async () => {
      try {
        const { data, error } = await supabase
          .from('referrals')
          .select('status, qualified_payment_id')
          .eq('referrer_user_id', profile.id);

        if (error) throw error;

        const rows = data || [];
        setReferralStats({
          registered: rows.length,
          paid: rows.filter((row) => row.qualified_payment_id || row.status === 'qualified' || row.status === 'rewarded').length
        });
      } catch (error) {
        logError({ message: 'Error loading referral stats:', source: 'StudentDashboard', details: error })
      }
    };

    loadReferralStats();
  }, [profile?.id]);

  const fetchOffers = async () => {
    if (!profile?.id) return;
    // Fetch assigned offers
    const { data: assignments } = await supabase
      .from('offer_assignments')
      .select('*, offers(*)')
      .eq('user_id', profile.id);
    const assignedOffers = (assignments || []).map(a => a.offers);

    // Fetch global offers
    const { data: globalOffers } = await supabase
      .from('offers')
      .select('*')
      .eq('applies_to_all', true);

    const { data: redemptions } = await supabase
      .from('offer_redemptions')
      .select('offer_id, status')
      .eq('user_id', profile.id);

    // Merge and deduplicate offers
    const allOffers = [...assignedOffers, ...(globalOffers || [])];
    const uniqueOffers = allOffers.filter((offer, idx, arr) =>
      offer && offer.is_listed !== false && arr.findIndex(o => o.id === offer.id) === idx
    );
    setOffers(uniqueOffers);
    setRedeemedOfferIds(new Set((redemptions || []).filter(r => r.status === 'redeemed').map(r => r.offer_id)));
    if (uniqueOffers.length > 0) setShowOfferCongrats(true);
  };

  const checkFirstLogin = async () => {
    if (!profile?.id) return;
    const key = `welcomed_${profile.id}`;
    const welcomed = localStorage.getItem(key);
    if (!welcomed && profile.assigned_teacher_id) {
      setShowWelcome(true);
      localStorage.setItem(key, 'true');
    }
  };

  const checkPremiumGift = () => {
    if (!profile?.id) return;
    if (profile.premium_until && isPremium(profile)) {
      const premiumDate = new Date(profile.premium_until);
      const today = new Date();
      const daysRemaining = isLifetimePremium(profile.premium_until)
        ? 0
        : Math.ceil((premiumDate - today) / (1000 * 60 * 60 * 24));
      
      // Check if this is a new premium grant by comparing dates
      const lastPremiumDate = localStorage.getItem(`last_premium_date_${profile.id}`);
      const currentPremiumDate = profile.premium_until;
      
      if (lastPremiumDate !== currentPremiumDate) {
        // New premium granted! Show celebration
        setShowPremiumGift(true);
        setPremiumDays(daysRemaining);
        localStorage.setItem(`last_premium_date_${profile.id}`, currentPremiumDate);
      }
    }
  };

  const fetchData = async () => {
    if (!profile?.id) return;
    // Fetch enrolled courses
    const { data: enrolled } = await supabase
      .from('enrollments')
      .select('*, courses(*)')
      .eq('student_id', profile.id)
      .limit(5);
    setCourses(enrolled || []);
    
    // Fetch certificates
    const { data: certs } = await supabase
      .from('certificates')
      .select('*')
      .eq('user_id', profile.id);
    setCertificates(certs || []);

    // Fetch exam results for all courses
    try {
      const { data: exams } = await supabase
        .from('exams')
        .select('id, course_id');
      
      if (exams && exams.length > 0) {
        const examsByourse = {};
        for (const exam of exams) {
          const { data: submissions } = await supabase
            .from('exam_submissions')
            .select('*')
            .eq('exam_id', exam.id)
            .eq('user_id', profile.id);
          
          if (submissions && submissions.length > 0) {
            examsByourse[exam.course_id] = submissions[0];
          }
        }
        setExamResults(examsByourse);
      }
    } catch (err) {
      logError({ message: 'Error fetching exam results:', source: 'StudentDashboard', details: err })
    }
    
    // Fetch assigned teacher
    if(profile.assigned_teacher_id) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profile.assigned_teacher_id)
        .single();
      setTeacher(data);
    }
  };

  const getDaysUntilRetry = (nextAttemptDate) => {
    if (!nextAttemptDate) return 0;
    const next = new Date(nextAttemptDate);
    const now = new Date();
    const diff = next - now;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const referralLink = referralCode ? `${getPublicAppUrl()}/register?ref=${encodeURIComponent(referralCode)}` : '';

  const copyReferralLink = async () => {
    if (!referralLink) return;
    await copyText(referralLink);
    setCopyFeedback('Referral Link Copied');
    trackPremiumEvent('referral_link_copied', 'student_dashboard', { referralCode }, profile?.id);
    window.setTimeout(() => setCopyFeedback(''), 2000);
  };

  const shareReferralWhatsApp = () => {
    if (!referralLink) return;
    trackPremiumEvent('referral_link_shared_whatsapp', 'student_dashboard', { referralCode }, profile?.id);
    window.open(`https://wa.me/?text=${encodeURIComponent(`Join SucessKart with my link: ${referralLink}. When you buy premium, I get 7 bonus premium days.`)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-8">
      {/* Premium Gift Celebration */}
      {showPremiumGift && (
        <PremiumGiftCelebration 
          premiumDays={premiumDays}
          onClose={() => setShowPremiumGift(false)}
        />
      )}

      {/* Discounts & Offers Section */}
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Discounts & Offers</h2>
        {offers.length === 0 ? (
          <div className="text-slate-500">No active offers or coupons available.</div>
        ) : (
          <div className="space-y-4">
            {offers.map(offer => (
              <div key={offer.id} className="bg-pink-50 border border-pink-200 rounded-lg p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-pink-700">{offer.title}</span>
                  <span className="ml-2 text-xs text-slate-500">{offer.is_lifetime_free ? 'Lifetime Free' : offer.discount_type === 'percent' ? `${offer.discount_value}% Off` : `Flat ₹${offer.discount_value} Off`}</span>
                  {redeemedOfferIds.has(offer.id) && <span className="ml-2 text-xs font-semibold text-green-700">Redeemed</span>}
                </div>
                <div className="text-xs text-slate-500">{offer.description}</div>
                <Link
                  className={`px-4 py-2 rounded font-semibold mt-2 w-max ${redeemedOfferIds.has(offer.id) ? 'bg-slate-300 text-slate-600 pointer-events-none' : 'bg-green-500 text-white'}`}
                  to={redeemedOfferIds.has(offer.id) ? '#' : `/app/payment?offer=${offer.id}`}
                >
                  {redeemedOfferIds.has(offer.id) ? 'Already Used' : 'Claim Offer'}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Congratulations Banner */}
      {showWelcome && teacher && (
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 rounded-xl text-white relative">
          <button 
            onClick={() => setShowWelcome(false)}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-xl"
          >
            ✕
          </button>
          <div className="flex items-center gap-4">
            <Award className="text-gold-300" size={48} />
            <div>
              <h2 className="text-2xl font-bold mb-1">🎉 Congratulations!</h2>
              <p className="text-green-100">
                You've been assigned to <span className="font-semibold">{teacher.full_name}</span> as your teacher! 
                You can now chat with them and attend live classes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Scheduled Class Alerts */}
      {classAlerts.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h2 className="text-lg font-bold text-blue-900 mb-3">Scheduled Class Notifications</h2>
          <div className="space-y-3">
            {classAlerts.map((alert) => (
              <div key={alert.id} className="bg-white border border-blue-100 rounded-lg p-3">
                <p className="font-semibold text-slate-900 text-sm">{alert.title}</p>
                <p className="text-slate-600 text-sm mt-1">{alert.content}</p>
                <p className="text-xs text-slate-400 mt-2">
                  {new Date(alert.created_at).toLocaleString('en-IN')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-nani-dark to-nani-accent rounded-2xl p-8 text-white flex justify-between items-center shadow-lg">
        <div>
          <h1 className="text-3xl font-bold mb-2">Welcome back, {safeProfile.full_name}! 👋</h1>
          <p className="text-slate-200 opacity-90">
            {isPremium(profile)
              ? isLifetimePremium(profile?.premium_until)
                ? 'You have Lifetime Premium Access.'
                : `You have Premium Access valid until ${format(new Date(safeProfile.premium_until || new Date()), 'MMM dd, yyyy')}`
              : "Upgrade to Premium to access all courses, exams, and guidance."}
          </p>
          {!isPremium(profile) && (
            <Link to="/app/payment" className="mt-4 inline-block bg-gold-500 text-white px-6 py-3 rounded-lg hover:bg-gold-600 font-semibold">
              Get Premium {premiumCost !== null ? `(₹${premiumCost})` : ''}
            </Link>
          )}
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold">{certificates.length}</p>
          <p className="text-slate-200">Certificates Earned</p>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-slate-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              <FileText size={14} />
              New career tool
            </p>
            <h2 className="mt-2 text-xl font-bold text-slate-900">Build an attractive resume with live preview.</h2>
            <p className="mt-2 text-sm text-slate-600">
              Open the resume builder, fill in your details, and review a polished resume. Premium Plus unlocks PDF download when you want to export it.
            </p>
          </div>
          <Link to="/app/resume-builder" className="inline-flex items-center justify-center rounded-xl bg-nani-dark px-5 py-3 font-semibold text-white hover:bg-nani-accent">
            Open Resume Builder
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-1">
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            <Share2 size={14} />
            Campus ambassador
          </p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">Invite classmates and earn 7 premium days.</h2>
          <p className="mt-2 text-sm text-slate-600">
            Share your referral link. When a referred user buys premium, your premium validity extends automatically.
          </p>
          <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-3 text-sm font-mono text-slate-700 break-all">
            {referralLink || 'Preparing your referral link...'}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-100 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Registered</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{referralStats.registered}</p>
              <p className="text-xs text-slate-500">Joined through your referral link</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Paid</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{referralStats.paid}</p>
              <p className="text-xs text-slate-500">Bought premium through referral</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={copyReferralLink}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700"
            >
              <Copy size={16} />
              {copyFeedback || 'Copy Invite Link'}
            </button>
            <button
              type="button"
              onClick={shareReferralWhatsApp}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-3 font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              <MessageCircle size={16} />
              Share on WhatsApp
            </button>
          </div>
          {copyFeedback ? <p className="mt-3 text-sm font-medium text-emerald-700">{copyFeedback}</p> : null}
        </div>
      </div>

      {/* Student Project Showcase */}
      <ProjectShowcaseSection userId={safeProfile.id} />

      {isPremium(profile) ? (
        <StudentExperienceHub
          profile={profile}
          courses={courses}
          certificates={certificates}
          examResults={examResults}
          videoProgressByCourseId={videoProgressByCourseId}
        />
      ) : null}

      {isPremium(profile) ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Course Progress with Exam Status */}
            <div>
               <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-slate-800">Your Courses & Exams</h2>
                <span className="text-xs text-slate-500">{completedCourses} completed • {inProgressCourses} in progress</span>
                  <Link to="/app/courses" className="text-nani-light text-sm hover:underline">View All</Link>
               </div>
               <div className="space-y-4">
                   {courses.length > 0 ? courses.map(c => {
                     const result = examResults[c.course_id];
                      const daysLeft = result ? getDaysUntilRetry(result.next_attempt_allowed_at) : null;
                      const savedVideoProgress = videoProgressByCourseId[String(c.course_id)] || null;
                      const progressPercent = getCourseProgress(c);
                      const hasResumePoint = Boolean((savedVideoProgress?.currentTime || 0) > 0) && !savedVideoProgress?.completed;
                     
                     return (
                       <div key={c.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                           <div className="flex items-center justify-between">
                               <div className="flex items-center space-x-4 flex-1">
                                   <div className="w-12 h-12 bg-slate-200 rounded-lg flex-shrink-0"></div>
                                   <div className="flex-1">
                                       <h3 className="font-bold">{c.courses?.title || 'Course'}</h3>
                                       <p className="text-xs text-slate-500">
                                         {result?.passed ? '✓ Exam Passed' : result ? `⚠ Score: ${result.score_percent?.toFixed(1)}%` : 'Exam pending'}
                                       </p>
                                   </div>
                               </div>
                               <div className="flex items-center space-x-3">
                                  <div className="w-24 bg-slate-200 rounded-full h-2">
                                      <div
                                        className="bg-gold-400 h-2 rounded-full"
                                          style={{ width: `${progressPercent}%` }}
                                      ></div>
                                  </div>
                                  <div className="text-right min-w-max">
                                    {result?.passed ? (
                                      <Link to="/app/mycertificates" className="text-green-600 font-semibold text-sm hover:underline flex items-center gap-1">
                                        <CheckCircle size={16} /> View Cert
                                      </Link>
                                    ) : result && daysLeft > 0 ? (
                                      <div className="text-orange-600 font-semibold text-sm flex items-center gap-1">
                                        <Clock size={16} /> {daysLeft}d left
                                      </div>
                                    ) : result && daysLeft === 0 ? (
                                      <Link to={`/exam/${c.courses?.id}`} className="text-blue-600 font-semibold text-sm hover:underline flex items-center gap-1">
                                        <RotateCcw size={16} /> Retry
                                      </Link>
                                    ) : (
                                      <Link to={`/app/course/${c.courses?.id}`} className="text-nani-accent font-semibold text-sm hover:underline">
                                          {hasResumePoint ? 'Resume Video' : 'Open Course'}
                                      </Link>
                                    )}
                                  </div>
                               </div>
                           </div>
                       </div>
                     );
                   }) : <p>No courses started.</p>}
               </div>
            </div>
          </div>

          {/* Sidebar Widgets */}
          <div className="space-y-8">
              {/* Teacher Card */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                      <UserBadge /> Your Mentor
                  </h3>
                  {teacher ? (
                      <div className="text-center">
                          <div
                            onClick={() => openChat(teacher.id, teacher.full_name, teacher.avatar_url)}
                            className="cursor-pointer group"
                          >
                            <img src={teacher.avatar_url || "https://via.placeholder.com/60"} className="w-20 h-20 rounded-full mx-auto mb-2 object-cover group-hover:ring-2 group-hover:ring-blue-400 transition-all" />
                            <p className="font-bold group-hover:text-blue-600 transition-colors">{teacher.full_name}</p>
                            <p className="text-xs text-slate-500 mb-4">Click to chat ✦</p>
                          </div>
                          <button
                              onClick={() => openChat(teacher.id, teacher.full_name, teacher.avatar_url)}
                              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 hover:from-blue-700 hover:to-blue-600 transition-all shadow-md"
                          >
                              <MessageCircle size={16} /> Ask a Doubt
                          </button>
                      </div>
                  ) : (
                      <div className="text-center py-4">
                          <p className="text-sm text-slate-500 mb-2">No teacher assigned yet.</p>
                          <button className="text-xs bg-slate-200 px-3 py-1 rounded">Request Assignment</button>
                      </div>
                  )}
              </div>

              {/* Exam Status Summary */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                      <Award size={18} /> Exam Progress
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                      <span className="text-sm font-medium text-green-900">Passed</span>
                      <span className="text-2xl font-bold text-green-600">{passedExams}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                      <span className="text-sm font-medium text-orange-900">In Progress</span>
                      <span className="text-2xl font-bold text-orange-600">{inProgressExams}</span>
                    </div>
                  </div>
              </div>
              {/* Upcoming Sessions */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                      <Calendar size={18} /> Upcoming Sessions
                  </h3>
                  {classAlerts.length === 0 ? (
                    <p className="text-sm text-slate-500">No upcoming sessions</p>
                  ) : (
                    <div className="space-y-3">
                      {classAlerts.slice(0, 3).map((session) => (
                        <div key={session.id} className="p-3 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                          <p className="font-bold text-sm">{session.title}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(session.scheduled_for).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                              timeZone: 'Asia/Kolkata'
                            })}
                          </p>
                          {session.meeting_link ? (
                            <a
                              href={session.meeting_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 text-xs font-bold mt-1 block"
                            >
                              Join Link
                            </a>
                          ) : (
                            <Link to="/app/class-schedule" className="text-blue-600 text-xs font-bold mt-1 block">
                              Open Schedule
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
              </div>
          </div>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm text-center">
          <p className="text-lg font-semibold text-slate-800">Upgrade to Premium to unlock courses, progress tracking, guidance, and certificates.</p>
          <Link to="/app/courses" className="text-nani-light font-semibold mt-3 inline-block">View course list</Link>
        </div>
      )}
    </div>
  );
};

const UserBadge = () => <div className="w-4 h-4 bg-gold-400 rounded-full inline-block"></div>;

const ProjectShowcaseSection = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      const { data } = await supabase
        .from('project_showcase')
        .select('id, student_name, title, description, project_url, image_url, created_at')
        .order('created_at', { ascending: false })
        .limit(6);
      if (mounted && data) setProjects(data);
      setLoading(false);
    };
    fetch();
    return () => { mounted = false; };
  }, []);

  if (loading || projects.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Trophy size={20} className="text-amber-600" />
          <h2 className="text-lg font-bold text-slate-900">Student Project Showcase</h2>
        </div>
        <Link to="/app/project-showcase" className="text-sm font-semibold text-amber-700 hover:text-amber-800">
          View All
        </Link>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <div key={p.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4 transition hover:shadow-md">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <User size={12} />
              <span className="font-medium text-slate-700">{p.student_name}</span>
            </div>
            <h3 className="mt-1.5 font-bold text-slate-900">{p.title}</h3>
            {p.description && (
              <p className="mt-1 text-xs leading-5 text-slate-500 line-clamp-2">{p.description}</p>
            )}
            {p.project_url && (
              <a
                href={p.project_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                View <ExternalLink size={12} />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StudentDashboard;

