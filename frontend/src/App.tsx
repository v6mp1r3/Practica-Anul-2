import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import type { Role } from './domain/types';
import { I18nProvider } from './i18n';
import Dashboard from './pages/admin/Dashboard';
import Groups from './pages/admin/Groups';
import Rooms from './pages/admin/Rooms';
import Setup from './pages/admin/Setup';
import Teachers from './pages/admin/Teachers';
import Login, { homeFor } from './pages/Login';
import Notifications from './pages/shared/Notifications';
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
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireRole>
            <Layout />
          </RequireRole>
        }
      >
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
