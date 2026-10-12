// Disponibilitatea mea: a signed-in teacher sets when they can teach. Their
// pairs are filled in from the published timetable and can't be marked.
//  - one particular week: "I can't next Thursday, pair 3" (the timetable stays as it is)
//  - every week: unavailable / preferred hours, used when the next timetable is generated
// The administration sees every change (and gets a notification).
import { useState } from 'react';
import { api } from '../../api';
import { AvailabilityPicker, type AvailabilityValue } from '../../components/AvailabilityPicker';
import { WeekAvailability } from '../../components/WeekAvailability';
import { Empty, PageHeader, Segmented } from '../../components/ui';
import { parseSlotKey } from '../../domain/slots';
import { subjectLabel } from '../../domain/subjects';
import { useI18n } from '../../i18n';
import { useAuth } from '../../state/auth';
import { useDataset } from '../../state/data';
import { useToast } from '../../state/toast';

type Tab = 'week' | 'usual';

export default function MyAvailability() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { dataset, index, published, refresh } = useDataset();
  const toast = useToast();
  const teacher = user?.teacherId ? index.teachers.get(user.teacherId) : undefined;
  const [tab, setTab] = useState<Tab>('week');
  const [usual, setUsual] = useState<AvailabilityValue | null>(null);
  const [dated, setDated] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  if (!teacher) return <Empty>{t('myAvail.noTeacher')}</Empty>;

  const usualValue = usual ?? { unavailable: teacher.unavailable, preferred: teacher.preferred, consultation: teacher.consultation };
  const datedValue = dated ?? teacher.unavailableOn ?? [];
  const dirty = usual !== null || dated !== null;

  // the teacher's weekly pairs (either week): locked in the "every week" grid
  const mine = (published?.lessons ?? []).filter((l) => !l.date && index.assignmentOf(l)?.teacherId === teacher.id);
  const lessonAt = (d: number, s: number) => {
    const here = mine.filter((l) => l.day === d && l.slot === s);
    if (!here.length) return undefined;
    return here.map((l) => {
      const a = index.assignmentOf(l)!;
      return (
        <div key={l.id} className="busy-lesson">
          <strong>
            {subjectLabel(index.subjects.get(a.subjectId))} · {t(`activity.${a.type}`)}
          </strong>
          <span>
            {index.audienceLabel(a.audience)}
            {l.parity !== 'weekly' && ` · ${t(l.parity === 'odd' ? 'tt.weekOdd' : 'tt.weekEven').toLowerCase()}`}
          </span>
        </div>
      );
    });
  };

  async function save() {
    if (!teacher) return;
    setBusy(true);
    try {
      await api.updateAvailability(teacher.id, {
        // not over their own pairs (those were marked before the timetable gave them a class there)
        unavailable: usualValue.unavailable.filter((k) => !lessonAt(...parseSlotKey(k))),
        preferred: usualValue.preferred,
        unavailableOn: datedValue,
      });
      await refresh();
      setUsual(null);
      setDated(null);
      toast(t('myAvail.saved'));
    } catch {
      toast(t('common.error'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title={t('myAvail.title')}
        subtitle={t('myAvail.subtitle')}
        actions={
          <>
            {dirty && (
              <button
                className="btn"
                onClick={() => {
                  setUsual(null);
                  setDated(null);
                }}
                disabled={busy}
              >
                {t('common.cancel')}
              </button>
            )}
            <button className="btn primary" onClick={save} disabled={!dirty || busy}>
              {t('common.save')}
            </button>
          </>
        }
      />
      <div className="stack">
        <div className="row wrap">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'week', label: t('myAvail.tabWeek') },
              { value: 'usual', label: t('myAvail.tabUsual') },
            ]}
          />
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {tab === 'week' ? t('myAvail.weekHint') : t('myAvail.usualHint')}
        </p>
        {tab === 'week' ? (
          <WeekAvailability teacherId={teacher.id} value={datedValue} onChange={setDated} />
        ) : (
          <AvailabilityPicker
            settings={dataset.settings}
            index={index}
            value={usualValue}
            onChange={(v) => setUsual({ ...v, consultation: teacher.consultation })}
            allowConsultation={false}
            locked={lessonAt}
          />
        )}
        {teacher.consultation && (
          <p className="small muted" style={{ margin: 0 }}>
            {t('myAvail.consultationNote', {
              day: t(`day.${parseSlotKey(teacher.consultation)[0]}` as 'day.0'),
              pair: parseSlotKey(teacher.consultation)[1] + 1,
            })}
          </p>
        )}
      </div>
    </div>
  );
}
