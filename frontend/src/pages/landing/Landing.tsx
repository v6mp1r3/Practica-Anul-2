// Public one-page site at "/". Same visual language as the app (TAFI web
// style, blue accent); the hero preview is a real timetable generated from the
// demo data, so what visitors see is what the app does.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../../components/Icon';
import { Logo } from '../../components/Logo';
import { Legend, TimetableGrid } from '../../components/TimetableGrid';
import { LanguageSwitch } from '../../components/ui';
import { seedDataset } from '../../data/seed';
import { generateTimetable } from '../../domain/generator';
import { DatasetIndex } from '../../domain/indexes';
import type { Lesson } from '../../domain/types';
import { filterLessons } from '../../domain/views';
import { useI18n } from '../../i18n';
import { useAuth } from '../../state/auth';
import { homeFor } from '../Login';
import { copy } from './copy';
import { Statement } from './Statement';
import './landing.css';

const FEATURE_ICONS: IconName[] = ['layers', 'calendar', 'copy', 'alert', 'edit', 'upload'];
const ROLE_ICONS: IconName[] = ['settings', 'user', 'users'];
const TOOLS = ['FET', 'aSc', 'Untis', 'UniTime', 'EduSchedule'];

function Preview() {
  const { t } = useI18n();
  const index = useMemo(() => new DatasetIndex(seedDataset), []);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);

  useEffect(() => {
    let alive = true;
    generateTimetable(seedDataset, { groupIds: seedDataset.groups.map((g) => g.id), seed: 2026, iterations: 150 }).then((r) => {
      if (alive) setLessons(filterLessons(index, r.lessons, { kind: 'group', id: 'g1' }));
    });
    return () => {
      alive = false;
    };
  }, [index]);

  return (
    <div className="lp-window">
      <div className="lp-window-bar">
        <span />
        <span />
        <span />
        <div className="lp-window-title">FAF-251 · {t('nav.myTimetable')}</div>
      </div>
      <div className="lp-window-body">
        {lessons ? (
          <>
            <TimetableGrid settings={seedDataset.settings} index={index} lessons={lessons} hide={['audience']} />
            <div style={{ marginTop: 12 }}>
              <Legend />
            </div>
          </>
        ) : (
          <div className="lp-window-loading" />
        )}
      </div>
    </div>
  );
}

export default function Landing() {
  const { lang } = useI18n();
  const { user } = useAuth();
  const c = copy[lang];
  const appLink = user ? homeFor(user.role) : '/login';

  useEffect(() => {
    document.title = `EduSchedule — ${c.hero.title}`;
    return () => {
      document.title = 'EduSchedule';
    };
  }, [c]);

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-container lp-nav-inner">
          <a href="#top" aria-label="EduSchedule">
            <Logo height={24} />
          </a>
          <nav className="lp-links">
            <a href="#how">{c.nav.how}</a>
            <a href="#features">{c.nav.features}</a>
            <a href="#roles">{c.nav.roles}</a>
            <a href="#compare">{c.nav.compare}</a>
          </nav>
          <div className="lp-nav-actions">
            <LanguageSwitch />
            <Link to={appLink} className="btn primary">
              {user ? c.nav.open : c.nav.login}
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="lp-hero">
          <div className="lp-container">
            <h1 className="lp-display">{c.hero.title}</h1>
            <p className="lp-lead">{c.hero.text}</p>
            <div className="lp-actions">
              <Link to={appLink} className="btn primary lp-btn-lg">
                {c.hero.cta}
              </Link>
              <a href="#how" className="btn lp-btn-lg">
                {c.hero.secondary}
              </a>
            </div>
          </div>
          <div className="lp-container lp-preview">
            <Preview />
            <p className="lp-caption">{c.hero.preview}</p>
          </div>
        </section>

        <Statement key={lang} {...c.statement} />

        <section className="lp-stats">
          <div className="lp-container">
            <div className="lp-stats-grid">
              {c.stats.map((s) => (
                <div key={s.label}>
                  <div className="lp-stat-value">{s.value}</div>
                  <div className="lp-stat-label">{s.label}</div>
                </div>
              ))}
            </div>
            <p className="lp-stats-note">{c.statsNote}</p>
          </div>
        </section>

        <section id="how" className="lp-section">
          <div className="lp-container">
            <h2 className="lp-h2">{c.how.title}</h2>
            <p className="lp-sub">{c.how.text}</p>
            <ol className="lp-steps">
              {c.how.steps.map((s, i) => (
                <li key={s.title}>
                  <span className="lp-step-num">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className="lp-section lp-ash">
          <div className="lp-container">
            <h2 className="lp-h2">{c.features.title}</h2>
            <p className="lp-sub">{c.features.text}</p>
            <div className="lp-cards">
              {c.features.items.map((f, i) => (
                <article key={f.title} className="lp-card">
                  <span className="lp-icon">
                    <Icon name={FEATURE_ICONS[i]} size={20} />
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="roles" className="lp-section">
          <div className="lp-container">
            <h2 className="lp-h2">{c.roles.title}</h2>
            <p className="lp-sub">{c.roles.text}</p>
            <div className="lp-roles">
              {c.roles.items.map((r, i) => (
                <article key={r.role} className="lp-role">
                  <span className="lp-role-tag">
                    <Icon name={ROLE_ICONS[i]} size={15} />
                    {r.role}
                  </span>
                  <h3>{r.title}</h3>
                  <p>{r.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="compare" className="lp-section lp-ash">
          <div className="lp-container">
            <h2 className="lp-h2">{c.compare.title}</h2>
            <p className="lp-sub">{c.compare.text}</p>
            <div className="lp-table-wrap">
              <table className="lp-table">
                <thead>
                  <tr>
                    <th />
                    {TOOLS.map((tool) => (
                      <th key={tool} className={tool === 'EduSchedule' ? 'lp-us' : undefined}>
                        {tool}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {c.compare.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      {row.values.map((v, i) => (
                        <td key={i} className={i === 4 ? 'lp-us' : undefined}>
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="lp-section lp-tint">
          <div className="lp-container">
            <h2 className="lp-h2">{c.engine.title}</h2>
            <p className="lp-sub">{c.engine.text}</p>
            <div className="lp-engine">
              {c.engine.points.map((p) => (
                <div key={p.title}>
                  <h3>{p.title}</h3>
                  <p>{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section lp-cta">
          <div className="lp-container">
            <h2 className="lp-display lp-cta-title">{c.cta.title}</h2>
            <p className="lp-sub">{c.cta.text}</p>
            <Link to={appLink} className="btn primary lp-btn-lg">
              {c.cta.button}
            </Link>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <Logo height={20} />
          <span>{c.footer.project}</span>
          <span>
            {c.footer.team} · {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  );
}
