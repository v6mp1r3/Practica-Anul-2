import { api } from '../../api';
import { notificationText } from '../../components/notificationText';
import { Empty, PageHeader } from '../../components/ui';
import { dateLocale, useI18n } from '../../i18n';
import { useData } from '../../state/data';

export default function Notifications() {
  const { t, lang } = useI18n();
  const { notifications, refreshNotifications, index } = useData();
  const unread = notifications.filter((n) => !n.read);

  async function markAll() {
    await api.markNotificationsRead(unread.map((n) => n.id));
    await refreshNotifications();
  }

  return (
    <div className="page">
      <PageHeader
        title={t('notifications.title')}
        subtitle={t('notifications.subtitle')}
        actions={
          unread.length > 0 && (
            <button className="btn" onClick={markAll}>
              {t('notifications.markRead')}
            </button>
          )
        }
      />
      <div className="card">
        {notifications.length === 0 && <Empty />}
        {notifications.map((n, i) => (
          <div key={n.id} className="card-body" style={i > 0 ? { borderTop: '1px solid var(--border)' } : undefined}>
            <div className="row">
              <strong>{notificationText(n, t, index).title}</strong>
              {!n.read && <span className="badge primary">{t('notifications.new')}</span>}
              <span className="spacer" />
              <span className="small muted">
                {new Date(n.createdAt).toLocaleString(dateLocale(lang), { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </div>
            <p className="muted" style={{ marginTop: 4 }}>
              {notificationText(n, t, index).body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
