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
import { ScrollText } from './ScrollText';
import { StackingCards } from './StackingCards';
import { Statement } from './Statement';
import './landing.css';

const FEATURE_ICONS: IconName[] = ['layers', 'calendar', 'copy', 'alert', 'edit', 'upload'];
// One brand colour per feature, as on the TAFI Agent site
const FEATURE_COLORS = ['#1b7396', '#e65d31', '#006c50', '#d5002f', '#940144', '#34871d'];

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
  const adminLink = user ? homeFor(user.role) : '/login';

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
          </nav>
          <div className="lp-nav-actions">
            <LanguageSwitch />
            <Link to={adminLink} className="btn ghost lp-admin">
              {user ? c.nav.open : c.nav.login}
            </Link>
            <Link to="/orar" className="btn primary">
              {c.nav.schedule}
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="lp-hero">
          <div className="lp-container">
            <h1 className="lp-display">{c.hero.title}</h1>
            <p className="lp-lead">{c.hero.text}</p>
          </div>
          <div className="lp-container lp-preview">
            <Preview />
            <p className="lp-caption">{c.hero.preview}</p>
          </div>
        </section>

        <Statement key={`statement-${lang}`} {...c.statement} />

        <StackingCards title={c.how.title} cards={c.how.steps} />

        <ScrollText key={`reveal-${lang}`} text={c.reveal} />

        <section id="features" className="lp-section lp-ash">
          <div className="lp-container">
            <h2 className="lp-h2">{c.features.title}</h2>
            <p className="lp-sub">{c.features.text}</p>
            <div className="lp-features">
              {c.features.items.map((f, i) => (
                <article key={f.title} className="lp-feature">
                  <span className="lp-feature-icon" style={{ color: FEATURE_COLORS[i % FEATURE_COLORS.length] }}>
                    <Icon name={FEATURE_ICONS[i]} size={22} />
                  </span>
                  <div>
                    <h3>{f.title}</h3>
                    <p>{f.text}</p>
                  </div>
                </article>
              ))}
            </div>
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
