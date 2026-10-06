import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '../domain/types';
import { useI18n, type MessageKey } from '../i18n';
import { useAuth } from '../state/auth';
import { useData } from '../state/data';
import { Icon, type IconName } from './Icon';
import { Logo } from './Logo';
import { Avatar } from '../pages/shared/Account';
import { LanguageSwitch } from './ui';

interface NavItem {
  to: string;
  label: MessageKey;
  icon: IconName;
  end?: boolean;
}

const NAV: Partial<Record<Role, { section?: MessageKey; items: NavItem[] }[]>> = {
  admin: [
    { section: 'nav.menu', items: [{ to: '/admin', label: 'nav.dashboard', icon: 'dashboard', end: true }] },
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
        { to: '/admin/changes', label: 'nav.changes', icon: 'swap' },
        { to: '/admin/evaluations', label: 'nav.evaluations', icon: 'check' },
        { to: '/browse', label: 'nav.browse', icon: 'search' },
      ],
    },
  ],
};

/** Without signing in: the timetable, free rooms and teachers. */
const PUBLIC_NAV: { section?: MessageKey; items: NavItem[] }[] = [
  {
    section: 'nav.menu',
    items: [
      { to: '/studenti', label: 'nav.studentSchedule', icon: 'layers' },
      { to: '/profesori', label: 'nav.teacherSchedule', icon: 'user' },
      { to: '/rooms', label: 'nav.freeRooms', icon: 'door' },
      { to: '/teachers', label: 'nav.teacherAvailability', icon: 'users' },
    ],
  },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { notifications } = useData();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  // the menu drawer (phones, tablets): Escape closes it, the page behind doesn't scroll
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', esc);
    document.body.classList.add('menu-open');
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.classList.remove('menu-open');
    };
  }, [open]);
  const unread = user ? notifications.filter((n) => !n.read).length : 0;
  const nav = (user && NAV[user.role]) || PUBLIC_NAV;

  return (
    <div className="shell">
      <div className={`sidebar-backdrop ${open ? 'open' : ''}`} onClick={() => setOpen(false)} aria-hidden />
      <aside className={`sidebar ${open ? 'open' : ''}`} id="app-menu">
        <div className="brand">
          <Logo height={26} />
          <button className="btn ghost icon sidebar-close" onClick={() => setOpen(false)} aria-label={t('common.close')}>
            <Icon name="x" />
          </button>
        </div>
        <nav className="nav">
          {nav.map((group, i) => (
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
          {user && (
            <>
              <div className="nav-section" />
              <NavLink to="/notifications">
                <Icon name="bell" />
                {t('nav.notifications')}
                {unread > 0 && <span className="count">{unread}</span>}
              </NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          {user ? (
            <>
              <div className="nav-section">{t('nav.account')}</div>
              <NavLink to="/account" className="user-chip" title={t('account.title')}>
                <Avatar name={user.name} src={user.avatar} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{user.name}</div>
                  <div className="small muted">{t(`role.${user.role}`)}</div>
                </div>
                <Icon name="settings" size={15} />
              </NavLink>
            </>
          ) : (
            // students and teachers don't need an account; only the administration signs in
            <NavLink to="/login" className="user-chip">
              <Icon name="lock" size={16} />
              <span className="small">{t('nav.adminLogin')}</span>
            </NavLink>
          )}
          <div className="row">
            <LanguageSwitch />
            <span className="spacer" />
            {user && (
              <button className="btn ghost sm icon" onClick={logout} title={t('nav.logout')} aria-label={t('nav.logout')}>
                <Icon name="logout" size={15} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            className="btn ghost icon"
            onClick={() => setOpen((o) => !o)}
            aria-label={t('nav.menuButton')}
            aria-expanded={open}
            aria-controls="app-menu"
          >
            <Icon name="menu" />
          </button>
          <Logo height={20} />
          <span className="spacer" />
          {user ? (
            <>
              <NavLink to="/notifications" className="btn ghost icon topbar-bell" aria-label={t('nav.notifications')}>
                <Icon name="bell" />
                {unread > 0 && <span className="count">{unread}</span>}
              </NavLink>
              <NavLink to="/account" className="topbar-avatar" aria-label={t('account.title')}>
                <Avatar name={user.name} src={user.avatar} />
              </NavLink>
            </>
          ) : (
            <LanguageSwitch />
          )}
        </header>
        <div className="panel">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
