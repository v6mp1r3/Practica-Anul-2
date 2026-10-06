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
import { StudentSchedule, TeacherSchedule } from './pages/public/Schedule';
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

/** Public pages (timetable, free rooms, teachers): no sign-in, only the data. */
function RequireData({ children }: { children: ReactNode }) {
  const { dataset } = useData();
  if (!dataset) return <Loading />;
  return <>{children}</>;
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
      </Route>
      {/* Public, no sign-in: students pick their group, teachers pick themselves */}
      <Route
        element={
          <RequireData>
            <Layout />
          </RequireData>
        }
      >
        <Route path="/studenti" element={<StudentSchedule />} />
        <Route path="/profesori" element={<TeacherSchedule />} />
        <Route path="/rooms" element={<FreeRooms />} />
        <Route path="/teachers" element={<TeacherAvailability />} />
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
      {/* old student/teacher pages and anything unknown */}
      <Route path="/orar" element={<Navigate to="/studenti" replace />} />
      <Route path="/student" element={<Navigate to="/studenti" replace />} />
      <Route path="/teacher/*" element={<Navigate to="/profesori" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
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
