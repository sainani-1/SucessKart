// Weekly contest model
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
// Stores contest info, questions, and schedule
export const weeklyContest = {
  day: 'Monday',
  startTime: '20:00',
  endTime: '22:00',
  questions: [],
  async load() {
    const docRef = doc(db, 'logicBuilding', 'weeklyContest');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      this.day = data.day;
      this.startTime = data.startTime;
      this.endTime = data.endTime;
      this.questions = data.questions || [];
    }
  },
  async save() {
    const docRef = doc(db, 'logicBuilding', 'weeklyContest');
    await setDoc(docRef, {
      day: this.day,
      startTime: this.startTime,
      endTime: this.endTime,
      questions: this.questions,
    });
  },
  subscribe(callback) {
    const docRef = doc(db, 'logicBuilding', 'weeklyContest');
    return onSnapshot(docRef, snap => {
      if (snap.exists()) {
        const data = snap.data();
        this.day = data.day;
        this.startTime = data.startTime;
        this.endTime = data.endTime;
        this.questions = data.questions || [];
        callback();
      }
    });
  },
  setSchedule(day, startTime, endTime) {
    this.day = day;
    this.startTime = startTime;
    this.endTime = endTime;
  },
  setQuestions(questions) {
    this.questions = questions;
  },
};


export async function isContestActive() {
  const state = await getContestResultState();
  return state.isActive;
}

const getServerDate = async () => {
  const serverTimeDoc = doc(db, 'logicBuilding', 'serverTime');
  try {
    await setDoc(serverTimeDoc, { ts: serverTimestamp() });
    const snap = await getDoc(serverTimeDoc);
    if (snap.exists() && snap.data().ts) {
      return snap.data().ts.toDate();
    }
  } catch (e) {
    // fallback below
  }
  return new Date();
};

const getDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export async function getContestResultState() {
  const date = await getServerDate();
  const day = date.toLocaleString('en-US', { weekday: 'long' });
  const [startHour, startMin] = weeklyContest.startTime.split(':').map(Number);
  const [endHour, endMin] = weeklyContest.endTime.split(':').map(Number);
  const nowHour = date.getHours();
  const nowMin = date.getMinutes();
  const shouldLog = import.meta.env.DEV && import.meta.env.VITE_LOGIC_BUILDING_DEBUG === 'true';

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  const nowMinutes = nowHour * 60 + nowMin;
  const isContestDay = day === weeklyContest.day;
  let inWindow = false;
  let isResultTime = false;

  if (endMinutes > startMinutes) {
    inWindow = isContestDay && nowMinutes >= startMinutes && nowMinutes <= endMinutes;
    isResultTime = isContestDay && nowMinutes > endMinutes;
  } else {
    // For windows crossing midnight, publish results after the end time on the next calendar day.
    inWindow = isContestDay ? nowMinutes >= startMinutes : nowMinutes <= endMinutes;
    isResultTime = !isContestDay && nowMinutes > endMinutes && nowMinutes < startMinutes;
  }



  return {
    checkedAt: date,
    contestKey: `logic-${weeklyContest.day}-${getDateKey(date)}-${weeklyContest.startTime}-${weeklyContest.endTime}`,
    isContestDay,
    isActive: inWindow,
    isResultTime,
  };
}

export function getContestQuestions() {
  return weeklyContest.questions;
}

export function setContestQuestions(questions) {
  weeklyContest.setQuestions(questions);
}
