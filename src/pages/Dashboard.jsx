import React from 'react';
import { useAuth } from '../context/AuthContext';
import StudentDashboard from './StudentDashboard';
import AdminDashboard from './AdminDashboard';
import TeacherDashboard from './TeacherDashboard';

const Dashboard = () => {
  const { profile } = useAuth();

  if (!profile) return <StudentDashboard />;

  if (profile.role === 'admin') return <AdminDashboard />;
  if (profile.role === 'teacher') return <TeacherDashboard />;
  return <StudentDashboard />;
};

export default Dashboard;
