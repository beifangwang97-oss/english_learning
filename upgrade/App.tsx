import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TimerProvider } from './context/TimerContext';
import { AuthGuard } from './components/AuthGuard';
import { GlobalLayout } from './components/layouts/GlobalLayout';

import { Login } from './pages/Login';
import { StudentDashboard } from './pages/StudentDashboard';
import { StudentUnit } from './pages/StudentUnit';
import { TeacherDashboard } from './pages/TeacherDashboard';
import { AdminDashboard } from './pages/AdminDashboard';

export default function App() {
  return (
    <AuthProvider>
      <TimerProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route element={<GlobalLayout />}>
              {/* Student Routes */}
              <Route element={<AuthGuard allowedRoles={['student']} />}>
                <Route path="/student/dashboard" element={<StudentDashboard />} />
                <Route path="/student/unit/:id" element={<StudentUnit />} />
              </Route>

              {/* Teacher Routes */}
              <Route element={<AuthGuard allowedRoles={['teacher']} />}>
                <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
              </Route>

              {/* Admin Routes */}
              <Route element={<AuthGuard allowedRoles={['admin']} />}>
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
              </Route>
            </Route>

            {/* Default redirect */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Router>
      </TimerProvider>
    </AuthProvider>
  );
}

