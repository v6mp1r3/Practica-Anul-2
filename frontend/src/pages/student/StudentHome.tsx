import { useState } from 'react';
import { MyTimetable } from '../../components/MyTimetable';
import { Empty, PageHeader, Segmented } from '../../components/ui';
import { filterLessons } from '../../domain/views';
import { useI18n } from '../../i18n';
import { useAuth } from '../../state/auth';
import { useDataset } from '../../state/data';
import { downloadFile } from '../../utils/download';
import { timetableToIcs } from '../../utils/export';

const SUBGROUP_KEY = 'eduschool:subgroup';

function savedSubgroup(): number | null {
  try {
    const v = Number(localStorage.getItem(SUBGROUP_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

export default function StudentHome() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { dataset, index, published } = useDataset();
  const group = user?.groupId ? index.groups.get(user.groupId) : undefined;
  const [subgroup, setSubgroupState] = useState<number | null>(savedSubgroup);

  const setSubgroup = (s: number | null) => {
    setSubgroupState(s);
    try {
      if (s) localStorage.setItem(SUBGROUP_KEY, String(s));
      else localStorage.removeItem(SUBGROUP_KEY);
    } catch {
      /* ignore */
    }
  };

  if (!group) return <Empty />;
  const mine = published ? filterLessons(index, published.lessons, { kind: 'group', id: group.id, subgroup }) : [];

  return (
    <div className="page">
      <PageHeader
        title={t('nav.myTimetable')}
        subtitle={`${group.name} · ${group.program} · ${t('groups.year')} ${group.year}`}
        actions={
          <>
            {group.subgroups > 1 && (
              <Segmented
                value={String(subgroup ?? 0)}
                onChange={(v) => setSubgroup(Number(v) || null)}
                options={[
                  { value: '0', label: t('view.allSubgroups') },
                  ...Array.from({ length: group.subgroups }, (_, i) => ({
                    value: String(i + 1),
                    label: `${t('assignments.kind.subgroup')} ${i + 1}`,
                  })),
                ]}
              />
            )}
            {mine.length > 0 && (
              <button
                className="btn"
                onClick={() => downloadFile(`orar-${group.name}.ics`, timetableToIcs(mine, index, dataset.settings), 'text/calendar')}
              >
                {t('my.addToCalendar')}
              </button>
            )}
          </>
        }
      />
      {!published ? (
        <div className="card">
          <Empty>{t('tt.notPublished')}</Empty>
        </div>
      ) : (
        <MyTimetable settings={dataset.settings} index={index} lessons={mine} hide={['audience']} />
      )}
    </div>
  );
}
