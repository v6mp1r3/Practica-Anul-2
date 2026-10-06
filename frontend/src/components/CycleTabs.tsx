// Licență | Master switch shared by the administration's pages (groups,
// subjects, teaching loads, generation, evaluations, institution timetable).
// The choice is remembered, so switching pages keeps the same cycle.
import { useState } from 'react';
import type { DatasetIndex } from '../domain/indexes';
import type { Group, StudyCycle } from '../domain/types';
import { useI18n } from '../i18n';
import { Segmented } from './ui';

const KEY = 'eduschedule:admin:cycle';

export function useCycle(): [StudyCycle, (c: StudyCycle) => void] {
  const [cycle, setState] = useState<StudyCycle>(() => {
    try {
      return localStorage.getItem(KEY) === 'master' ? 'master' : 'licenta';
    } catch {
      return 'licenta';
    }
  });
  const set = (c: StudyCycle) => {
    setState(c);
    try {
      localStorage.setItem(KEY, c);
    } catch {
      /* ignore */
    }
  };
  return [cycle, set];
}

export const groupInCycle = (g: Pick<Group, 'cycle'> | undefined, cycle: StudyCycle) => (g?.cycle ?? 'licenta') === cycle;

/** Does a teaching load / audience belong to the cycle (any of its groups)? */
export const audienceInCycle = (index: DatasetIndex, audience: Parameters<DatasetIndex['cohorts']>[0], cycle: StudyCycle) =>
  index.cohorts(audience).some((c) => groupInCycle(index.groups.get(c.groupId), cycle));

export function CycleTabs({ value, onChange }: { value: StudyCycle; onChange: (c: StudyCycle) => void }) {
  const { t } = useI18n();
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { value: 'licenta', label: t('cycle.licenta') },
        { value: 'master', label: t('cycle.master') },
      ]}
    />
  );
}
