import React from 'react';
import ClassSchedule from './ClassSchedule';

const AdminDemoSessions = () => (
  <ClassSchedule
    sessionKind="demo"
    pageTitle="Demo Sessions"
    pageDescription="Schedule demo sessions, choose SkillPro LiveKit/Jitsi, and assign the teacher who will host."
    scheduleButtonLabel="Schedule Demo"
    formTitle="Schedule New Demo Session"
  />
);

export default AdminDemoSessions;
