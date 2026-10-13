import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import type { Role } from './domain/types';
import { I18nProvider } from './i18n';
import Login, { homeFor } from './pages/Login';
import FreeRooms from './pages/shared/FreeRooms';
import TeacherAvailability from './pages/shared/TeacherAvailability';
import { StudentSchedule, TeacherSchedule } from './pages/public/Schedule';
import { AuthProvider, useAuth } from './state/auth';
import { DataProvider, useData } from './state/data';
import { ToastProvider } from './state/toast';
import './styles/index.css';

// Only what a page needs is downloaded: the public timetable first, the rest when it is opened
const Assignments = lazy(() => import('./pages/admin/Assignments'));
const Changes = lazy(() => import('./pages/admin/Changes'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Editor = lazy(() => import('./pages/admin/Editor'));
const Evaluations = lazy(() => import('./pages/admin/Evaluations'));
const Holidays = lazy(() => import('./pages/admin/Holidays'));
const Generate = lazy(() => import('./pages/admin/Generate'));
const Groups = lazy(() => import('./pages/admin/Groups'));
const Rooms = lazy(() => import('./pages/admin/Rooms'));
const Setup = lazy(() => import('./pages/admin/Setup'));
const Subjects = lazy(() => import('./pages/admin/Subjects'));
const Teachers = lazy(() => import('./pages/admin/Teachers'));
const Timetables = lazy(() => import('./pages/admin/Timetables'));
const Landing = lazy(() => import('./pages/landing/Landing'));
const Browse = lazy(() => import('./pages/shared/Browse'));
const Account = lazy(() => import('./pages/shared/Account'));
const Notifications = lazy(() => import('./pages/shared/Notifications'));
const MyAvailability = lazy(() => import('./pages/teacher/MyAvailability'));

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
    <Suspense fallback={<Loading />}>
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
          <Route path="/account" element={<Account />} />
          <Route path="/browse" element={<Browse />} />
        </Route>
        <Route
          element={
            <RequireRole roles={['teacher']}>
              <Layout />
            </RequireRole>
          }
        >
          <Route path="/my-availability" element={<MyAvailability />} />
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
          <Route path="/notifications" element={<Notifications />} />
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
          <Route path="evaluations" element={<Evaluations />} />
          <Route path="holidays" element={<Holidays />} />
        </Route>
        {/* old student/teacher pages and anything unknown */}
        <Route path="/orar" element={<Navigate to="/studenti" replace />} />
        <Route path="/student" element={<Navigate to="/studenti" replace />} />
        <Route path="/teacher/*" element={<Navigate to="/profesori" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
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
