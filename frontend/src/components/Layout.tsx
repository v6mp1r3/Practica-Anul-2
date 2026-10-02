import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '../domain/types';
import { useI18n, type MessageKey } from '../i18n';
import { useAuth } from '../state/auth';
import { useData } from '../state/data';
import { Icon, type IconName } from './Icon';
import { initials } from './ui';

interface NavItem {
  to: string;
  label: MessageKey;
  icon: IconName;
  end?: boolean;
}

const NAV: Record<Role, { section?: MessageKey; items: NavItem[] }[]> = {
  admin: [
    { items: [{ to: '/admin', label: 'nav.dashboard', icon: 'dashboard', end: true }] },
    {
      section: 'nav.setup',
      items: [
        { to: '/admin/setup', label: 'nav.setup', icon: 'settings' },
        { to: '/admin/teachers', label: 'nav.teachers', icon: 'users' },
        { to: '/admin/rooms', label: 'nav.rooms', icon: 'door' },
        { to: '/admin/groups', label: 'nav.groups', icon: 'layers' },
        { to: '/admin/subjects', label: 'nav.subjects', icon: 'book' },
        { to: '/admin/assignments', label: 'nav.assignments', icon: 'link' },
      ],
    },
    {
      section: 'nav.timetables',
      items: [
        { to: '/admin/generate', label: 'nav.generate', icon: 'zap' },
        { to: '/admin/timetables', label: 'nav.timetables', icon: 'calendar' },
        { to: '/browse', label: 'nav.browse', icon: 'search' },
      ],
    },
  ],
  teacher: [
    {
      items: [
        { to: '/teacher', label: 'nav.myTimetable', icon: 'calendar', end: true },
        { to: '/teacher/availability', label: 'nav.availability', icon: 'clock' },
        { to: '/browse', label: 'nav.browse', icon: 'search' },
        { to: '/rooms', label: 'nav.freeRooms', icon: 'door' },
      ],
    },
  ],
  student: [
    {
      items: [
        { to: '/student', label: 'nav.myTimetable', icon: 'calendar', end: true },
        { to: '/browse', label: 'nav.browse', icon: 'search' },
        { to: '/rooms', label: 'nav.freeRooms', icon: 'door' },
        { to: '/teachers', label: 'nav.teacherAvailability', icon: 'users' },
      ],
    },
  ],
};

type Theme = 'auto' | 'light' | 'dark';
const THEME_KEY = 'eduschedule:theme';

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(THEME_KEY) as Theme) || 'auto';
    } catch {
      return 'auto';
    }
  });
  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const cycle = () => setTheme((t) => (t === 'auto' ? 'dark' : t === 'dark' ? 'light' : 'auto'));
  return [theme, cycle];
}

export function Layout() {
  const { user, logout } = useAuth();
  const { notifications } = useData();
  const { t, lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const [theme, cycleTheme] = useTheme();
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  if (!user) return null;

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <img src="/favicon.svg" alt="" />
          {t('app.name')}
        </div>
        <nav className="nav">
          {NAV[user.role].map((group, i) => (
            <div key={i} style={{ display: 'contents' }}>
              {group.section && <div className="nav-section">{t(group.section)}</div>}
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end}>
                  <Icon name={item.icon} />
                  {t(item.label)}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="nav-section" />
          <NavLink to="/notifications">
            <Icon name="bell" />
            {t('nav.notifications')}
            {unread > 0 && <span className="count">{unread}</span>}
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{initials(user.name)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{user.name}</div>
              <div className="small muted">{t(`role.${user.role}`)}</div>
            </div>
          </div>
          <div className="row">
            <button className="btn ghost sm" onClick={() => setLang(lang === 'ro' ? 'en' : 'ro')}>
              <Icon name="globe" size={15} />
              {t('nav.language')}
            </button>
            <button className="btn ghost sm icon" onClick={cycleTheme} title={`${t('nav.theme')}: ${theme}`} aria-label={t('nav.theme')}>
              <Icon name="moon" size={15} />
            </button>
            <span className="spacer" />
            <button className="btn ghost sm icon" onClick={logout} title={t('nav.logout')} aria-label={t('nav.logout')}>
              <Icon name="logout" size={15} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            <Icon name="menu" />
          </button>
          <strong>{t('app.name')}</strong>
          <span className="spacer" />
          <NavLink to="/notifications" className="btn ghost icon" aria-label={t('nav.notifications')}>
            <Icon name="bell" />
          </NavLink>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
