import React from 'react';
import { Outlet } from 'react-router-dom';

const ExamLayout = () => (
  <div className="exam-layout min-h-screen bg-slate-950">
    <Outlet />
  </div>
);

export default ExamLayout;
