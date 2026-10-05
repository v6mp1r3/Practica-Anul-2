import { AvailabilityPicker } from '../../components/AvailabilityPicker';
import { Empty, PageHeader } from '../../components/ui';
import { useI18n } from '../../i18n';
import { useAuth } from '../../state/auth';
import { useDataset } from '../../state/data';

/** Teachers see the availability the administration entered for them (read-only). */
export default function Availability() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { dataset, index } = useDataset();
  const teacher = user?.teacherId ? index.teachers.get(user.teacherId) : undefined;
  if (!teacher) return <Empty />;

  return (
    <div className="page">
      <PageHeader title={t('nav.availability')} subtitle={t('availability.readOnly')} />
      <div className="stack">
        <div className="card">
          <div className="card-body">
            <AvailabilityPicker
              settings={dataset.settings}
              index={index}
              value={{ unavailable: teacher.unavailable, preferred: teacher.preferred, consultation: teacher.consultation }}
              onChange={() => {}}
              readOnly
              allowConsultation={dataset.settings.consultationRequired}
            />
          </div>
        </div>
        <p className="small muted">{t('availability.note')}</p>
      </div>
    </div>
  );
}
