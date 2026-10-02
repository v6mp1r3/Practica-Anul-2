import { useState } from 'react';
import { api } from '../../api';
import { AvailabilityPicker, type AvailabilityValue } from '../../components/AvailabilityPicker';
import { Icon } from '../../components/Icon';
import { Empty, PageHeader } from '../../components/ui';
import { freeSlotCount } from '../../domain/precheck';
import { useI18n } from '../../i18n';
import { useAuth } from '../../state/auth';
import { useDataset } from '../../state/data';
import { useToast } from '../../state/toast';

/** Teachers submit their availability online instead of on paper forms. */
export default function Availability() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { dataset, index, refresh } = useDataset();
  const toast = useToast();
  const teacher = user?.teacherId ? index.teachers.get(user.teacherId) : undefined;
  const [value, setValue] = useState<AvailabilityValue>({
    unavailable: teacher?.unavailable ?? [],
    preferred: teacher?.preferred ?? [],
    consultation: teacher?.consultation,
  });
  const [dirty, setDirty] = useState(false);

  if (!teacher) return <Empty />;
  const needed = dataset.assignments.filter((a) => a.teacherId === teacher.id).reduce((n, a) => n + a.pairsPerWeek, 0);
  const free = freeSlotCount(dataset, value.unavailable);

  async function save() {
    if (!teacher) return;
    await api.updateAvailability(teacher.id, value);
    await refresh();
    setDirty(false);
    toast(t('availability.sent'));
  }

  return (
    <div className="page">
      <PageHeader
        title={t('nav.availability')}
        subtitle={t('availability.subtitle')}
        actions={
          <button className="btn primary" onClick={save} disabled={!dirty}>
            <Icon name="check" />
            {t('availability.send')}
          </button>
        }
      />
      <div className="stack">
        <div className="row wrap">
          <span className={`badge ${free < needed ? 'danger' : 'success'}`}>{t('availability.freeCount', { free, needed })}</span>
          {dataset.settings.consultationRequired && !value.consultation && (
            <span className="badge warning">{t('availability.needConsultation')}</span>
          )}
        </div>
        <div className="card">
          <div className="card-body">
            <AvailabilityPicker
              settings={dataset.settings}
              index={index}
              value={value}
              onChange={(v) => {
                setValue(v);
                setDirty(true);
              }}
              allowConsultation={dataset.settings.consultationRequired}
            />
          </div>
        </div>
        <p className="small muted">{t('availability.note')}</p>
      </div>
    </div>
  );
}
