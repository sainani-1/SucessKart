import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, CheckCircle, Clock, FileText, Play } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

const getExamName = (exam, course) => {
  const examName = String(exam?.test_name || '').trim();
  const courseName = String(course?.title || '').trim();
  if (examName && courseName) return `${examName} - ${courseName}`;
  if (examName) return examName;
  if (courseName) return `Final Exam - ${courseName}`;
  return 'Live Exam';
};

const getStatusTone = (status, startsAt) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'cancelled') return 'border-red-200 bg-red-50 text-red-700';
  if (startsAt && new Date(startsAt).getTime() <= Date.now()) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-blue-200 bg-blue-50 text-blue-700';
};

const MyRegisteredExams = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timedOutSlots, setTimedOutSlots] = useState(new Set());
  const [bookings, setBookings] = useState([]);
  const [slotsById, setSlotsById] = useState({});
  const [examsById, setExamsById] = useState({});
  const [coursesById, setCoursesById] = useState({});

  useEffect(() => {
    const loadRegisteredExams = async () => {
      if (!profile?.id) return;

      setLoading(true);
      setError('');
      try {
        const { data: bookingRows, error: bookingError } = await supabase
          .from('exam_slot_bookings')
          .select('*')
          .eq('student_id', profile.id)
          .neq('status', 'cancelled')
          .order('booked_at', { ascending: false });
        if (bookingError) throw bookingError;

        const slotIds = Array.from(new Set((bookingRows || []).map((row) => row.slot_id).filter(Boolean)));
        let slotRows = [];
        if (slotIds.length) {
          const { data, error: slotError } = await supabase
            .from('exam_live_slots')
            .select('*')
            .in('id', slotIds);
          if (slotError) throw slotError;
          slotRows = data || [];
        }

        const examIds = Array.from(new Set(slotRows.map((slot) => slot.exam_id).filter(Boolean)));
        let examRows = [];
        if (examIds.length) {
          const { data, error: examError } = await supabase
            .from('exams')
            .select('id, course_id, test_name')
            .in('id', examIds);
          if (examError) throw examError;
          examRows = data || [];
        }

        const courseIds = Array.from(new Set(examRows.map((exam) => exam.course_id).filter(Boolean)));
        let courseRows = [];
        if (courseIds.length) {
          const { data, error: courseError } = await supabase
            .from('courses')
            .select('id, title, category')
            .in('id', courseIds);
          if (courseError) throw courseError;
          courseRows = data || [];
        }

        setBookings(bookingRows || []);
        setSlotsById(Object.fromEntries(slotRows.map((slot) => [slot.id, slot])));
        setExamsById(Object.fromEntries(examRows.map((exam) => [exam.id, exam])));
        setCoursesById(Object.fromEntries(courseRows.map((course) => [course.id, course])));
      } catch (loadError) {
        setError(loadError.message || 'Failed to load your registered exams.');
      } finally {
        setLoading(false);
      }
    };

    loadRegisteredExams();
  }, [profile?.id]);

  const getPrepTimeMinutes = (slot) => {
    const prepTime = slot.prep_time_minutes;
    return (prepTime != null && !isNaN(Number(prepTime))) ? Number(prepTime) : 5;
  };

  const getJoinDeadline = (slot) => {
    if (!slot?.starts_at) return null;
    const prepTime = getPrepTimeMinutes(slot);
    return new Date(new Date(slot.starts_at).getTime() + prepTime * 60000);
  };

  const isJoinTimedOut = (slot) => {
    const deadline = getJoinDeadline(slot);
    if (!deadline) return false;
    const now = Date.now();
    const startsAt = new Date(slot.starts_at).getTime();
    const endsAt = new Date(slot.ends_at).getTime();
    return now >= startsAt && now >= deadline && now <= endsAt;
  };

  const isExamExpired = (slot) => {
    if (!slot?.ends_at) return true;
    return new Date(slot.ends_at).getTime() <= Date.now();
  };

  const canStart = (slot) => {
    if (!slot?.starts_at) return false;
    const now = Date.now();
    const startsAt = new Date(slot.starts_at).getTime();
    const deadline = getJoinDeadline(slot);
    const nowMs = now;
    return nowMs >= startsAt && (!deadline || nowMs < deadline.getTime());
  };

  const upcomingRows = useMemo(() => {
    const now = Date.now();
    return bookings
      .map((booking) => {
        const slot = slotsById[booking.slot_id];
        const exam = examsById[slot?.exam_id];
        const course = coursesById[exam?.course_id];
        return { booking, slot, exam, course };
      })
      .filter((row) => row.slot?.starts_at && new Date(row.slot.starts_at).getTime() >= now)
      .sort((a, b) => new Date(a.slot.starts_at).getTime() - new Date(b.slot.starts_at).getTime());
  }, [bookings, slotsById, examsById, coursesById]);

  const pastRows = useMemo(() => {
    const now = Date.now();
    return bookings
      .map((booking) => {
        const slot = slotsById[booking.slot_id];
        const exam = examsById[slot?.exam_id];
        const course = coursesById[exam?.course_id];
        return { booking, slot, exam, course };
      })
      .filter((row) => row.slot?.starts_at && new Date(row.slot.starts_at).getTime() < now)
      .sort((a, b) => new Date(b.slot.starts_at).getTime() - new Date(a.slot.starts_at).getTime());
  }, [bookings, slotsById, examsById, coursesById]);

  const handleStartExam = (exam, course) => {
    if (exam?.course_id) {
      navigate(`/exam/${exam.course_id}`);
    } else {
      navigate(`/live-test/${exam?.id || ''}`);
    }
  };

  if (loading) return <LoadingSpinner message="Loading your registered exams..." />;

  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-slate-950 p-6 text-white shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-200">Registered Exams</p>
        <h1 className="mt-2 text-3xl font-bold">My Exams</h1>
        <p className="mt-2 max-w-2xl text-slate-300">
          View the live exam slots you have booked and keep track of upcoming exam timings.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Upcoming Exams</h2>
            <p className="mt-1 text-sm text-slate-500">These are the active slots you have registered for.</p>
          </div>
          <Link to="/app/live-exams" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Book Slot
          </Link>
        </div>

        {upcomingRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
            <CalendarClock size={32} className="mx-auto text-slate-300" />
            <p className="mt-3 font-semibold text-slate-700">No upcoming registered exams</p>
            <p className="mt-1 text-sm text-slate-500">Book a slot from Live Exams when your course exam is available.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {upcomingRows.map(({ booking, slot, exam, course }) => {
              const prepTime = getPrepTimeMinutes(slot);
              const deadline = getJoinDeadline(slot);
              const timedOut = isJoinTimedOut(slot);
              const expired = isExamExpired(slot);
              const startable = canStart(slot);

              return (
                <div key={booking.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{getExamName(exam, course)}</h3>
                      <p className="mt-1 text-sm text-slate-500">{slot.title || course?.category || 'Live exam slot'}</p>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                        <span className="inline-flex items-center gap-2"><Clock size={16} /> Starts: {formatDateTime(slot.starts_at)}</span>
                        <span className="inline-flex items-center gap-2"><CheckCircle size={16} /> Ends: {formatDateTime(slot.ends_at)}</span>
                        <span className="inline-flex items-center gap-2 text-amber-600"><Clock size={16} /> Join within {prepTime} min of start</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${getStatusTone(booking.status, slot.starts_at)}`}>
                        {String(booking.status || 'booked').toUpperCase()}
                      </span>
                      {timedOut && !expired ? (
                        <span className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700">
                          Exam join time out — deadline was {formatDateTime(deadline)}
                        </span>
                      ) : null}
                      {startable && !expired ? (
                        <button
                          onClick={() => handleStartExam(exam, course)}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                        >
                          <Play size={16} /> Start Exam
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Previous Registrations</h2>
        <div className="mt-4 grid gap-3">
          {pastRows.length === 0 ? (
            <p className="text-sm text-slate-500">No previous registered exams yet.</p>
          ) : (
            pastRows.slice(0, 8).map(({ booking, slot, exam, course }) => (
              <div key={booking.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm">
                <span className="inline-flex items-center gap-2 font-semibold text-slate-800">
                  <FileText size={16} />
                  {getExamName(exam, course)}
                </span>
                <span className="text-slate-500">{formatDateTime(slot.starts_at)}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default MyRegisteredExams;
