import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import type { Role } from './domain/types';
import { I18nProvider } from './i18n';
import Assignments from './pages/admin/Assignments';
import Changes from './pages/admin/Changes';
import Dashboard from './pages/admin/Dashboard';
import Editor from './pages/admin/Editor';
import Generate from './pages/admin/Generate';
import Groups from './pages/admin/Groups';
import Rooms from './pages/admin/Rooms';
import Setup from './pages/admin/Setup';
import Subjects from './pages/admin/Subjects';
import Teachers from './pages/admin/Teachers';
import Timetables from './pages/admin/Timetables';
import Landing from './pages/landing/Landing';
import Login, { homeFor } from './pages/Login';
import Browse from './pages/shared/Browse';
import FreeRooms from './pages/shared/FreeRooms';
import Account from './pages/shared/Account';
import Notifications from './pages/shared/Notifications';
import TeacherAvailability from './pages/shared/TeacherAvailability';
import StudentHome from './pages/student/StudentHome';
import Availability from './pages/teacher/Availability';
import TeacherHome from './pages/teacher/TeacherHome';
import { AuthProvider, useAuth } from './state/auth';
import { DataProvider, useData } from './state/data';
import { ToastProvider } from './state/toast';
import './styles/index.css';

/** Only render children for signed-in users with one of the given roles. */
function RequireRole({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  const { dataset } = useData();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  if (!dataset) return <Loading />;
  return <>{children}</>;
}

function Home() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireRole>
            <Layout />
          </RequireRole>
        }
      >
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/account" element={<Account />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/teachers" element={<TeacherAvailability />} />
      </Route>
      {/* Free rooms: read-only for students and teachers; only the administration changes rooms and the timetable */}
      <Route
        element={
          <RequireRole roles={['student', 'teacher', 'admin']}>
            <Layout />
          </RequireRole>
        }
      >
        <Route path="/rooms" element={<FreeRooms />} />
      </Route>
      <Route
        path="/admin"
        element={
          <RequireRole roles={['admin']}>
            <Layout />
          </RequireRole>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="setup" element={<Setup />} />
        <Route path="teachers" element={<Teachers />} />
        <Route path="rooms" element={<Rooms />} />
        <Route path="groups" element={<Groups />} />
        <Route path="subjects" element={<Subjects />} />
        <Route path="assignments" element={<Assignments />} />
        <Route path="generate" element={<Generate />} />
        <Route path="timetables" element={<Timetables />} />
        <Route path="timetables/:id" element={<Editor />} />
        <Route path="changes" element={<Changes />} />
      </Route>
      <Route
        path="/teacher"
        element={
          <RequireRole roles={['teacher']}>
            <Layout />
          </RequireRole>
        }
      >
        <Route index element={<TeacherHome />} />
        <Route path="availability" element={<Availability />} />
      </Route>
      <Route
        path="/student"
        element={
          <RequireRole roles={['student']}>
            <Layout />
          </RequireRole>
        }
      >
        <Route index element={<StudentHome />} />
      </Route>
      <Route path="*" element={<Home />} />
    </Routes>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <DataProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </DataProvider>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
