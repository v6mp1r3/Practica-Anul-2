// Admin dashboard — glass-style widgets: timetable status ring, week timeline,
// today's date and week parity, activity distribution, recent timetables and
// the data check.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Icon } from '../../components/Icon';
import { PrecheckList } from '../../components/PrecheckList';
import { PageHeader } from '../../components/ui';
import { scopeAssignments } from '../../domain/generator';
import { precheck } from '../../domain/precheck';
import { range } from '../../domain/slots';
import type { ActivityType, Lesson, Timetable } from '../../domain/types';
import { filterLessons, weekParityOf } from '../../domain/views';
import { dateLocale, useI18n } from '../../i18n';
import { useData, useDataset } from '../../state/data';
import { useToast } from '../../state/toast';
import './dashboard.css';

export function StatusBadge({ status }: { status: Timetable['status'] }) {
  const { t } = useI18n();
  const cls = status === 'published' ? 'success' : status === 'draft' ? 'primary' : '';
  return <span className={`badge ${cls}`}>{t(`timetables.status.${status}`)}</span>;
}

/** Ring with tick marks, like a timer dial. */
function Ring({ value, total, label }: { value: number; total: number; label: string }) {
  const r = 84;
  const c = 2 * Math.PI * r;
  const pct = total ? Math.min(1, value / total) : 0;
  return (
    <svg viewBox="0 0 220 220" className="dash-ring" role="img" aria-label={`${value}/${total} ${label}`}>
      <circle cx="110" cy="110" r="62" fill="rgba(255,255,255,0.14)" />
      {range(24).map((i) => {
        const a = (i / 24) * 2 * Math.PI;
        return (
          <circle
            key={i}
            cx={110 + Math.sin(a) * 50}
            cy={110 - Math.cos(a) * 50}
            r={i % 6 === 0 ? 1.8 : 1.1}
            fill="rgba(255,255,255,0.7)"
          />
        );
      })}
      <circle cx="110" cy="110" r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="6" />
      <circle
        cx="110"
        cy="110"
        r={r}
        fill="none"
        stroke="#fff"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 110 110)"
      />
      {pct > 0 && <circle cx={110 + Math.sin(pct * 2 * Math.PI) * r} cy={110 - Math.cos(pct * 2 * Math.PI) * r} r="7" fill="#fff" />}
      <text x="110" y="112" textAnchor="middle" className="dash-ring-value">
        {value}/{total}
      </text>
      <text x="110" y="134" textAnchor="middle" className="dash-ring-label">
        {label.toUpperCase()}
      </text>
    </svg>
  );
}

/** Contiguous runs of pairs on one day, so back-to-back pairs read as one bar. */
function runsOfDay(lessons: Lesson[], day: number, typeOf: (l: Lesson) => ActivityType) {
  const byslot = new Map<number, ActivityType>();
  for (const l of lessons.filter((x) => x.day === day)) if (!byslot.has(l.slot)) byslot.set(l.slot, typeOf(l));
  const slots = [...byslot.keys()].sort((a, b) => a - b);
  const runs: { from: number; to: number; type: ActivityType }[] = [];
  for (const s of slots) {
    const last = runs[runs.length - 1];
    if (last && last.to === s - 1 && last.type === byslot.get(s)) last.to = s;
    else runs.push({ from: s, to: s, type: byslot.get(s)! });
  }
  return runs;
}

export default function Dashboard() {
  const { t, lang } = useI18n();
  const { dataset, index, published } = useDataset();
  const { refresh } = useData();
  const toast = useToast();
  const [list, setList] = useState<Timetable[]>([]);
  const [groupId, setGroupId] = useState(dataset.groups[0]?.id ?? '');

  const load = () => api.listTimetables().then(setList);
  useEffect(() => {
    load();
  }, []);

  const issues = useMemo(() => precheck(dataset, index), [dataset, index]);
  const shown = published ?? list.find((x) => x.status === 'draft') ?? list[0] ?? null;
  const required = shown
    ? scopeAssignments(dataset, shown.groupIds, index).reduce((n, a) => n + a.pairsPerWeek, 0)
    : dataset.assignments.reduce((n, a) => n + a.pairsPerWeek, 0);
  const placed = shown?.lessons.length ?? 0;

  const typeOf = (l: Lesson) => index.assignmentOf(l)?.type ?? 'lecture';
  const groupLessons = shown ? filterLessons(index, shown.lessons, { kind: 'group', id: groupId }) : [];
  const slots = dataset.settings.slots;

  const totals = { lecture: 0, seminar: 0, lab: 0 } as Record<ActivityType, number>;
  for (const a of dataset.assignments) totals[a.type] += a.pairsPerWeek;
  const totalPairs = totals.lecture + totals.seminar + totals.lab;

  const now = new Date();
  const week = weekParityOf(now);

  async function publish(tt: Timetable) {
    if (tt.status === 'published') return;
    if (!confirm(`${t('timetables.publish')}: „${tt.name}”?`)) return;
    await api.publishTimetable(tt.id);
    await Promise.all([load(), refresh()]);
    toast(t('timetables.publishedToast', { name: tt.name }));
  }

  return (
    <div className="page dash">
      <PageHeader
        title={t('nav.dashboard')}
        subtitle={t('dashboard.subtitle', { faculty: dataset.settings.faculty, semester: dataset.settings.semester })}
      />
      <div className="dash-grid">
        {/* Timetable status — the glass hero */}
        <section className="dash-hero">
          <div className="dash-hero-head">
            <div>
              <h2>{published ? t('dashboard.published') : t('dash.latest')}</h2>
              <p>{shown ? shown.name : t('dashboard.notPublished')}</p>
            </div>
            <Link to="/admin/timetables" className="dash-glass-pill">
              <Icon name="calendar" size={15} />
              {t('nav.timetables')}
            </Link>
          </div>
          <Ring value={placed} total={required} label={t('dash.pairs')} />
          <div className="dash-hero-foot">
            <div className="dash-hero-chips">
              <span className="dash-chip-light">
                <strong>{shown?.score?.hard ?? '—'}</strong> {t('dash.conflicts')}
              </span>
              <span className="dash-chip-glass">
                <strong>{shown?.score?.soft ?? '—'}</strong> {t('dash.penalty')}
              </span>
            </div>
            <Link to="/admin/generate" className="dash-fab" aria-label={t('dashboard.generate')}>
              <span className="dash-fab-tip">{t('nav.generate')}</span>
              <Icon name="plus" size={22} />
            </Link>
          </div>
        </section>

        {/* Week timeline for one group */}
        <section className="card dash-timeline">
          <div className="card-header">
            <h2>{t('dash.week')}</h2>
            <span className="spacer" />
            <label className="dash-select">
              <Icon name="layers" size={15} />
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label={t('view.group')}>
                {dataset.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="card-body">
            {!shown ? (
              <p className="muted">{t('dash.weekEmpty')}</p>
            ) : (
              <>
                <div className="tl" style={{ ['--cols' as string]: slots.length }}>
                  {range(dataset.settings.workingDays).map((d) => (
                    <div key={d} className="tl-row">
                      <span className="tl-day">{t(`dayShort.${d}` as 'dayShort.0')}</span>
                      <div className="tl-track">
                        {runsOfDay(groupLessons, d, typeOf).map((run) => (
                          <span
                            key={run.from}
                            className={`tl-bar ${run.type}`}
                            style={{ gridColumn: `${run.from + 1} / ${run.to + 2}` }}
                            title={`${slots[run.from]?.start}–${slots[run.to]?.end}`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="tl-row tl-axis">
                    <span className="tl-day" />
                    <div className="tl-track">
                      {slots.map((s, i) => (
                        <span key={i}>{s.start}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="tl-legend">
                  {(['lecture', 'seminar', 'lab'] as ActivityType[]).map((a) => (
                    <span key={a}>
                      <i className={a} />
                      {t(`activity.${a}`)}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        <div className="dash-side">
          {/* Today */}
          <section className="card dash-date">
            <div className="dash-date-day">
              <span className="muted">{now.toLocaleDateString(dateLocale(lang), { month: 'long' })}</span>
              <strong>{String(now.getDate()).padStart(2, '0')}</strong>
            </div>
            <div className="dash-date-info">
              <span className="dash-date-badge">{t(week === 'odd' ? 'tt.weekOdd' : 'tt.weekEven')}</span>
              <strong>{dataset.settings.semester}</strong>
              <span className="muted small">{dataset.settings.faculty}</span>
            </div>
          </section>

          {/* Activity mix */}
          <section className="card dash-mix">
            <div>
              <span className="muted small">{t('dashboard.pairs')}</span>
              <strong>{totalPairs}</strong>
            </div>
            <div className="dash-mix-bars">
              {(['lecture', 'seminar', 'lab'] as ActivityType[]).map((a) => {
                const pct = totalPairs ? Math.round((totals[a] / totalPairs) * 100) : 0;
                return (
                  <div key={a} style={{ flex: Math.max(pct, 8) }}>
                    <span className="small">{pct}%</span>
                    <i className={a} />
                    <span className="muted small">{t(`activity.${a}`)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Recent timetables */}
        <section className="card dash-recent">
          <div className="card-header">
            <h2>{t('dashboard.recent')}</h2>
            <span className="dash-count">{list.length}</span>
            <span className="spacer" />
            <Link to="/admin/generate" className="dash-link">
              <Icon name="plus" size={15} />
              {t('dashboard.generate')}
            </Link>
          </div>
          <div className="card-body dash-recent-list">
            {list.length === 0 && (
              <ol className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
                {(['dashboard.step1', 'dashboard.step2', 'dashboard.step3', 'dashboard.step4', 'dashboard.step5'] as const).map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ol>
            )}
            {list.slice(0, 4).map((tt) => (
              <div key={tt.id} className="dash-recent-row">
                <span className="dash-time">
                  {new Date(tt.updatedAt).toLocaleTimeString(dateLocale(lang), { hour: '2-digit', minute: '2-digit' })}
                </span>
                <Link to={`/admin/timetables/${tt.id}`} className="dash-recent-name">
                  <strong>{tt.name}</strong>
                  <span className="muted small">{tt.algorithm}</span>
                </Link>
                <span className="dash-score">
                  <span className={tt.score?.hard ? 'bad' : 'good'}>{tt.score?.hard ?? 0}</span>
                  {tt.score?.soft ?? '—'}
                </span>
                <label className="dash-switch">
                  <span className="muted small">{t('dash.publishedSwitch')}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={tt.status === 'published'}
                    className="switch"
                    onClick={() => publish(tt)}
                    aria-label={t('dash.publishedSwitch')}
                  />
                </label>
              </div>
            ))}
          </div>
        </section>

        {/* Data check */}
        <section className="card dash-check">
          <div className="card-header">
            <h2>{t('precheck.title')}</h2>
            <span className="spacer" />
            <span className="dash-facts">
              <span>
                <strong>{dataset.teachers.length}</strong> {t('dashboard.teachers').toLowerCase()}
              </span>
              <span>
                <strong>{dataset.rooms.length}</strong> {t('dashboard.rooms').toLowerCase()}
              </span>
              <span>
                <strong>{dataset.groups.length}</strong> {t('dashboard.groups').toLowerCase()}
              </span>
            </span>
          </div>
          <div className="card-body">
            <PrecheckList issues={issues} index={index} limit={6} />
          </div>
        </section>
      </div>
    </div>
  );
}
